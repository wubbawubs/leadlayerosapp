/**
 * Sprint B — generate Proposal V2 from a masterplan item.
 *
 * V1 design notes:
 *  - We do NOT reuse the audit-issue orchestrator because masterplan items
 *    have no audit_page / issue_code. Forcing them through that pipeline
 *    would invent fake audit metadata.
 *  - We DO reuse Business Profile v2 + Tone Profile + active growth goal
 *    as the grounding context.
 *  - Single deterministic LLM call. No publishing, no WordPress writes.
 *  - Unsupported item types return a structured `unsupported_for_proposal_generation`
 *    result — never a fake proposal.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { llmComplete } from "@/lib/shared/llm/router.server";
import {
  mapMasterplanItemToAction,
  type MasterplanActionMapping,
} from "./proposalMapping";
import { rowToMasterplanItem, type MasterplanItem } from "./schemas";

// masterplan_items / growth_goals not in generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  if (data.role !== "owner" && data.role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(cleaned.slice(first, last + 1));
}

// Recommendation may come back as a string OR as an array of bullets/steps.
// We accept both and normalize to a string. We also allow long output —
// truncation happens after normalization so we never lose the recommendation
// to a strict Zod failure.
const FlexibleTextSchema = z.union([
  z.string(),
  z.array(z.union([z.string(), z.record(z.string(), z.unknown())])),
  z.record(z.string(), z.unknown()),
]);

function normalizeText(value: unknown, maxLen: number): string {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (Array.isArray(value)) {
    text = value
      .map((v) => {
        if (typeof v === "string") return `- ${v}`;
        if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          const title = typeof o.title === "string" ? o.title : typeof o.step === "string" ? o.step : "";
          const body = typeof o.body === "string" ? o.body : typeof o.description === "string" ? o.description : "";
          return [title && `- ${title}`, body].filter(Boolean).join("\n  ");
        }
        return `- ${JSON.stringify(v)}`;
      })
      .join("\n");
  } else if (value && typeof value === "object") {
    text = JSON.stringify(value, null, 2);
  } else {
    text = "";
  }
  text = text.trim();
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

const FALLBACK_RECOMMENDATION = "Concrete actie wordt gegenereerd.";

function isPlaceholderRecommendation(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "" || value.trim() === FALLBACK_RECOMMENDATION;
}

function buildDeterministicRecommendation(args: {
  itemTitle: string;
  itemDescription?: string | null;
  itemReason?: string | null;
  itemType?: string | null;
  actionType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goal?: any;
}): string {
  const title = args.itemTitle.replace(/^Voorstel:\s*/i, "").trim() || "dit masterplan item";
  const description = args.itemDescription?.trim();
  const reason = args.itemReason?.trim();
  const target = args.goal?.target_count
    ? `${args.goal.target_count} ${args.goal.target_type ?? "clients"}/maand`
    : "het actieve groeidoel";

  const shared = [
    `Scope: werk het masterplan item “${title}” uit tot een reviewbaar voorstel.`,
    description ? `Gebruik deze inhoudelijke richting: ${description}` : null,
    reason ? `Bewaar de strategische reden: ${reason}` : null,
    `Koppel de aanbeveling expliciet aan ${target}; maak duidelijk hoe dit extra relevante vraag, leads of conversies ondersteunt.`,
  ].filter(Boolean) as string[];

  if (args.itemType === "service_page" || args.itemType === "location_page") {
    return [
      ...shared,
      "Maak een pagina-brief met: H1, intro-belofte, doelgroep/probleem, aanbodsecties, bewijs, FAQ, interne links en primaire CTA.",
      "Schrijf geen definitieve publicatiecopy; lever eerst de structuur en copy-richting voor menselijke QA.",
      "Controleer vóór goedkeuring: claim-risico’s, lokale/service-relevantie, CTA-match en of er genoeg bewijs is voor de belofte.",
    ].map((line) => `- ${line}`).join("\n");
  }

  if (args.itemType === "content") {
    return [
      ...shared,
      "Plan 3–5 ondersteunende contentstukken rond de hoofdservice: FAQ, how-to, comparison, case of probleemgerichte uitleg.",
      "Geef per stuk aan: zoekintentie, beoogde lezer, interne link naar servicepagina en verwachte bijdrage aan leadkwaliteit.",
      "Laat het cluster pas door naar uitvoering nadat de prioriteit, linkdoelen en meetbare CTA’s zijn bevestigd.",
    ].map((line) => `- ${line}`).join("\n");
  }

  if (args.itemType === "conversion" || args.actionType === "write_cta") {
    return [
      ...shared,
      "Werk één concreet conversiepad uit: huidige frictie, gewenste actie, CTA-tekst, plaatsing en meetpunt.",
      "Maak de wijziging klein genoeg voor QA: één pagina/sectie, één primaire CTA, één meetbare hypothese.",
      "Blokkeer publishing totdat tracking en risico-checks bevestigd zijn.",
    ].map((line) => `- ${line}`).join("\n");
  }

  return [
    ...shared,
    "Vertaal dit naar één uitvoerbare websiteverbetering met before/after-context, eigenaar, acceptatiecriteria en QA-check.",
    "Laat publishing geblokkeerd totdat het voorstel is goedgekeurd en er een recente page snapshot bestaat.",
  ].map((line) => `- ${line}`).join("\n");
}

const GenOutputSchema = z.object({
  title: FlexibleTextSchema,
  summary: FlexibleTextSchema,
  reasoning: FlexibleTextSchema,
  recommendation: FlexibleTextSchema,
  keywordsUsed: z.array(z.string()).max(50).default([]).optional(),
  riskFlags: z.array(z.string()).max(50).default([]).optional(),
});

function buildPrompt(args: {
  item: MasterplanItem;
  mapping: MasterplanActionMapping;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goal: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bp: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tone: any;
}): string {
  const { item, mapping, goal, bp, tone } = args;
  const lines: string[] = [];
  lines.push(`ACTION: ${mapping.actionType}`);
  lines.push(`INTENT: ${mapping.intent}`);
  lines.push("");
  lines.push("MASTERPLAN ITEM:");
  lines.push(`- Type: ${item.type}`);
  lines.push(`- Title: ${item.title}`);
  if (item.description) lines.push(`- Description: ${item.description}`);
  if (item.reason) lines.push(`- Why this matters: ${item.reason}`);
  lines.push(`- Priority: ${item.priority}  Effort: ${item.effort ?? "?"}  Impact: ${item.expectedImpact ?? "?"}`);
  lines.push("");

  if (goal) {
    lines.push("GROWTH GOAL:");
    lines.push(`- Target: ${goal.target_count ?? "?"} ${goal.target_type ?? "clients"} per maand`);
    if (goal.timeframe_months) lines.push(`- Timeframe: ${goal.timeframe_months} maanden`);
    if (goal.required_leads != null) lines.push(`- Required leads/maand: ${goal.required_leads}`);
    if (Array.isArray(goal.service_focus) && goal.service_focus.length > 0) {
      lines.push(`- Service focus: ${goal.service_focus.slice(0, 6).join(", ")}`);
    }
    if (Array.isArray(goal.locations) && goal.locations.length > 0) {
      lines.push(`- Regio: ${goal.locations.slice(0, 6).join(", ")}`);
    }
    lines.push("");
  }

  if (bp) {
    const offer = (bp.offer_profile ?? {}) as Record<string, unknown>;
    const id = (bp.business_identity ?? {}) as Record<string, unknown>;
    const conv = (bp.conversion_profile ?? {}) as Record<string, unknown>;
    lines.push("BUSINESS:");
    if (id.brandName || id.businessName) lines.push(`- Brand: ${id.brandName ?? id.businessName}`);
    if (offer.primaryOffer) lines.push(`- Primary offer: ${offer.primaryOffer}`);
    if (offer.mainPromise) lines.push(`- Main promise: ${offer.mainPromise}`);
    if (offer.uniqueValueProposition) lines.push(`- UVP: ${offer.uniqueValueProposition}`);
    if (conv.primaryCta) lines.push(`- Preferred CTA: ${conv.primaryCta}`);
    lines.push("");
  }

  if (tone) {
    const voice = (tone.voiceIdentity ?? {}) as Record<string, unknown>;
    const vocab = (tone.vocabulary ?? {}) as Record<string, unknown>;
    lines.push("TONE:");
    if (voice.summary) lines.push(`- Voice: ${voice.summary}`);
    const avoid = Array.isArray(vocab.avoid) ? (vocab.avoid as string[]).slice(0, 8) : [];
    if (avoid.length) lines.push(`- Avoid: ${avoid.join(", ")}`);
    lines.push("");
  }

  lines.push("OUTPUT RULES:");
  lines.push("- Write in Dutch (nl-NL) unless business identity language is English.");
  lines.push("- Be concrete and operator-actionable. No hype, no fake guarantees.");
  lines.push("- Tie the recommendation directly to the masterplan item and the growth goal.");
  lines.push("- No publishing, no auto-execution — this is a proposal for human review.");
  lines.push("");
  lines.push("OUTPUT (strict JSON, no markdown):");
  lines.push(
    `{ "title": "...", "summary": "one sentence", "reasoning": "max 800 chars", "recommendation": "concrete step-by-step action plan", "keywordsUsed": [], "riskFlags": [] }`,
  );
  return lines.join("\n");
}

export const generateProposalV2ForMasterplanItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; masterplanItemId: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        masterplanItemId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // 1. Load masterplan item
    const { data: itemRow, error: iErr } = await admin
      .from("masterplan_items")
      .select("*")
      .eq("id", data.masterplanItemId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (iErr) throw iErr;
    if (!itemRow) throw new Error("Masterplan item not found");
    const item = rowToMasterplanItem(itemRow);

    const mapping = mapMasterplanItemToAction(item);
    if (!mapping.supported) {
      return {
        ok: false as const,
        reason: mapping.reason,
        message: mapping.message,
        itemType: item.type,
      };
    }

    // 2. Load active growth goal (linked, else active)
    const goalId = item.linkedGoalId;
    const goalQuery = goalId
      ? admin.from("growth_goals").select("*").eq("id", goalId).eq("tenant_id", data.tenantId)
      : admin
          .from("growth_goals")
          .select("*")
          .eq("tenant_id", data.tenantId)
          .eq("status", "active");
    const { data: goalRow } = await goalQuery.maybeSingle();

    // 3. Load BP v2 + tone profile (best-effort, both optional)
    const { data: bpRow } = await admin
      .from("business_profiles_v2")
      .select(
        "business_identity, offer_profile, icp_profile, location_profile, conversion_profile, proof_profile, claim_guardrails",
      )
      .eq("tenant_id", data.tenantId)
      .maybeSingle();

    const { data: toneRow } = await admin
      .from("tone_profiles")
      .select("profile")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const tone = (toneRow?.profile as Record<string, unknown> | null) ?? null;

    // 4. Generate
    let title = `Voorstel: ${item.title}`;
    let summary = item.description ?? item.title;
    let reasoning = item.reason ?? "Afgeleid van masterplan item.";
    let recommendation = FALLBACK_RECOMMENDATION;
    let modelUsed = "n/a";
    const riskFlags: string[] = [];
    const keywordsUsed: string[] = [];

    try {
      const prompt = buildPrompt({ item, mapping, goal: goalRow, bp: bpRow, tone });
      const result = await llmComplete({
        task: "cheap",
        system:
          "You are a senior growth + SEO strategist. Output ONLY valid JSON. Be concrete and human-reviewable. No hype.",
        prompt,
        temperature: 0.4,
        maxTokens: 1400,
        jsonMode: true,
      });
      const parsed = GenOutputSchema.parse(extractJson(result.text));
      title = normalizeText(parsed.title, 200) || title;
      summary = normalizeText(parsed.summary, 400) || summary;
      reasoning = normalizeText(parsed.reasoning, 1500) || reasoning;
      recommendation = normalizeText(parsed.recommendation, 4000) || recommendation;
      modelUsed = result.model;
      if (parsed.riskFlags) riskFlags.push(...parsed.riskFlags);
      if (parsed.keywordsUsed) keywordsUsed.push(...parsed.keywordsUsed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[masterplan->proposal] llm fail", msg);
      riskFlags.push("generator:llm_fallback");
    }

    if (isPlaceholderRecommendation(recommendation)) {
      recommendation = buildDeterministicRecommendation({
        itemTitle: item.title,
        itemDescription: item.description,
        itemReason: item.reason,
        itemType: item.type,
        actionType: mapping.actionType,
        goal: goalRow,
      });
    }

    // 5. Persist proposal_v2 with origin=masterplan_item
    const insertRow: Record<string, unknown> = {
      tenant_id: data.tenantId,
      audit_id: null,
      page_id: null,
      issue_id: null,
      proposal_run_id: null,
      action_type: mapping.actionType,
      status: "needs_review",
      origin: "masterplan_item",
      masterplan_item_id: item.id,
      growth_goal_id: goalRow?.id ?? null,
      title,
      summary,
      reasoning,
      before: { masterplanItem: { id: item.id, title: item.title, type: item.type } },
      after: { recommendation },
      scores: {},
      context_used: {
        toneProfile: !!tone,
        businessProfile: !!bpRow,
        pageIntelligence: false,
        primaryAngle: undefined,
        claimGuardrails: !!bpRow?.claim_guardrails,
      },
      keywords_used: keywordsUsed,
      risk_flags: riskFlags,
      context_snapshot: {
        origin: "masterplan_item",
        masterplanItem: item,
        goalId: goalRow?.id ?? null,
      },
      publishable: false,
      model_used: modelUsed,
      block_reason: null,
    };

    const { data: row, error } = await admin
      .from("proposal_v2")
      .insert(insertRow)
      .select("id, status, action_type, origin, masterplan_item_id")
      .single();
    if (error) throw error;

    return {
      ok: true as const,
      proposal: {
        id: row.id as string,
        status: row.status as string,
        actionType: row.action_type as string,
        origin: row.origin as string,
        masterplanItemId: row.masterplan_item_id as string,
      },
    };
  });

// ---------------------------------------------------------------------------
// List proposals linked to a masterplan item (any origin where
// masterplan_item_id matches).
// ---------------------------------------------------------------------------

export const listProposalsForMasterplanItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; masterplanItemId: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        masterplanItemId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Read via authed client to respect RLS as a backstop.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: member } = await sb
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden: not a member of this tenant");

    const { data: rows, error } = await admin
      .from("proposal_v2")
      .select(
        "id, status, action_type, title, summary, reasoning, before, after, origin, created_at, model_used, risk_flags",
      )
      .eq("tenant_id", data.tenantId)
      .eq("masterplan_item_id", data.masterplanItemId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return {
      proposals: (rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        status: r.status as string,
        actionType: r.action_type as string,
        title: r.title as string,
        summary: r.summary as string,
        reasoning: (r.reasoning as string) ?? "",
        before: (r.before as Record<string, unknown>) ?? {},
        after: (r.after as Record<string, unknown>) ?? {},
        origin: r.origin as string,
        createdAt: r.created_at as string,
        modelUsed: (r.model_used as string) ?? "",
        riskFlags: (r.risk_flags as string[]) ?? [],
      })),
    };
  });

// ---------------------------------------------------------------------------
// Bulk: counts per masterplan item for a plan (one round-trip for UI).
// ---------------------------------------------------------------------------

export const listProposalCountsForMasterplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; masterPlanId: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        masterPlanId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: member } = await sb
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden: not a member of this tenant");

    const { data: items } = await admin
      .from("masterplan_items")
      .select("id")
      .eq("master_plan_id", data.masterPlanId)
      .eq("tenant_id", data.tenantId);
    const ids = ((items ?? []) as Array<{ id: string }>).map((i) => i.id);
    if (ids.length === 0) return { counts: {} as Record<string, { total: number; latestStatus: string | null }> };

    const { data: rows, error } = await admin
      .from("proposal_v2")
      .select("id, status, masterplan_item_id, created_at")
      .eq("tenant_id", data.tenantId)
      .in("masterplan_item_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const counts: Record<string, { total: number; latestStatus: string | null }> = {};
    for (const id of ids) counts[id] = { total: 0, latestStatus: null };
    for (const r of (rows ?? []) as Array<{
      masterplan_item_id: string;
      status: string;
    }>) {
      const c = counts[r.masterplan_item_id];
      if (!c) continue;
      c.total += 1;
      if (c.latestStatus === null) c.latestStatus = r.status;
    }
    return { counts };
  });
