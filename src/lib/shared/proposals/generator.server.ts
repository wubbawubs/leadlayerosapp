/**
 * SEO Proposal generator — server-only.
 * One LLM call per audit page so each request fits inside the worker budget.
 */
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { llmComplete } from "@/lib/shared/llm/router.server";
import {
  getProposalContext,
  renderContextForPrompt,
} from "@/lib/shared/proposals/context.server";


const ProposalSchema = z.object({
  proposal_type: z.enum(["meta_description", "alt_text", "schema", "title", "h1", "other"]),
  issue_code: z.string().min(1).max(64),
  before: z.record(z.string(), z.unknown()).default({}),
  after: z.record(z.string(), z.unknown()).default({}),
  rationale: z.string().min(10).max(800),
  confidence: z.number().min(0).max(1),
});

const ResponseSchema = z.object({
  proposals: z.array(ProposalSchema).min(0).max(10),
});

type AuditPageRow = {
  id: string;
  url: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  images_without_alt: number;
  word_count: number;
  issues: Array<{ code: string; message?: string; count?: number }> | null;
  schema: unknown;
};

function buildPrompt(p: AuditPageRow, contextBlock: string): string {
  const issues = (p.issues ?? [])
    .map((i) => `- ${i.code}${i.message ? `: ${i.message}` : ""}`)
    .join("\n");
  const ctx = contextBlock
    ? [
        "",
        "=== CONTEXT (gebruik dit om voorstellen te personaliseren) ===",
        contextBlock,
        "=== EINDE CONTEXT ===",
        "",
      ].join("\n")
    : "";
  // TODO(S4c): Full prompt rewrite — produce structured output with
  // qualityScore, riskFlags, brandFitScore, etc. and gate via
  // proposal_quality_checks before showing as draft.
  return [
    `URL: ${p.url}`,
    `Title: ${p.title ?? "(none)"}`,
    `Meta description (${(p.meta_description ?? "").length} chars): ${p.meta_description ?? "(none)"}`,
    `H1: ${p.h1 ?? "(none)"}`,
    `Word count: ${p.word_count}`,
    `Images without alt: ${p.images_without_alt}`,
    `Has JSON-LD schema: ${p.schema ? "yes" : "no"}`,
    ctx,
    "Issues detected:",
    issues || "(none)",
    "",
    "Generate up to 5 concrete, actionable SEO fix proposals for this page.",
    "Each proposal must include: proposal_type, issue_code (matches issue), before, after, rationale, confidence (0-1).",
    "For meta_description, before={text:current} after={text:new 120-160 chars}.",
    "For alt_text, before={count:N} after={alts:[\"alt 1\",...]} with suggested generic alts.",
    "For schema, before={present:false} after={jsonld:{...}} with a minimal JSON-LD object.",
    "For title/h1, before={text:current} after={text:new}.",
    'Respond ONLY with valid JSON: {"proposals":[{...}]}. No prose, no markdown.',
  ].join("\n");
}


function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(cleaned.slice(first, last + 1));
}

export async function generateProposalsForAuditPage(
  auditId: string,
  auditPageId: string,
): Promise<{ proposalsCreated: number; pageUrl: string }> {
  const { data: audit, error: aErr } = await supabaseAdmin
    .from("audits")
    .select("id, tenant_id")
    .eq("id", auditId)
    .single();
  if (aErr || !audit) throw aErr ?? new Error("Audit not found");

  const { data: page, error: pErr } = await supabaseAdmin
    .from("audit_pages")
    .select(
      "id, url, title, meta_description, h1, images_without_alt, word_count, issues, schema",
    )
    .eq("id", auditPageId)
    .eq("audit_id", auditId)
    .single();
  if (pErr || !page) throw pErr ?? new Error("Audit page not found");

  const pageRow = page as AuditPageRow;
  if (!pageRow.issues || pageRow.issues.length === 0) {
    return { proposalsCreated: 0, pageUrl: pageRow.url };
  }

  // Delete any existing draft group for this page so re-running is idempotent.
  await supabaseAdmin
    .from("fix_proposal_groups")
    .delete()
    .eq("audit_id", auditId)
    .eq("audit_page_id", auditPageId)
    .eq("status", "draft");

  const ctx = await getProposalContext(audit.tenant_id, pageRow.id);
  const contextBlock = renderContextForPrompt(ctx);
  const hasToneProfile = !!ctx.toneProfile;

  const result = await llmComplete({
    task: "cheap",
    system:
      "You are an expert SEO consultant. Output ONLY valid JSON matching the requested schema. Never include explanatory text.",
    prompt: buildPrompt(pageRow, contextBlock),
    temperature: 0.3,
    maxTokens: 1200,
  });

  const parsed = ResponseSchema.parse(extractJson(result.text));
  console.log(`[proposals] page=${pageRow.url} got=${parsed.proposals.length} tone=${hasToneProfile}`);

  if (parsed.proposals.length === 0) {
    return { proposalsCreated: 0, pageUrl: pageRow.url };
  }

  const { data: group, error: gErr } = await supabaseAdmin
    .from("fix_proposal_groups")
    .insert({
      tenant_id: audit.tenant_id,
      audit_id: auditId,
      audit_page_id: pageRow.id,
      theme: `Page: ${pageRow.url}`,
      status: "draft",
    })
    .select("id")
    .single();
  if (gErr || !group) throw gErr ?? new Error("Group insert failed");

  // Evaluate each proposal against the tone profile (if any) and apply gate.
  const { evaluateText } = await import("@/lib/shared/tone/evaluator.server");
  const rows: Array<Record<string, unknown>> = [];
  const qualityChecks: Array<Record<string, unknown>> = [];

  for (const pr of parsed.proposals) {
    let status: "draft" | "needs_review" | "rejected" | "needs_context" = "draft";
    let weighted: number | null = null;
    const riskFlags: string[] = [];
    let evalScore: Record<string, number> | null = null;

    if (!hasToneProfile) {
      status = "needs_context";
    } else if (ctx.toneProfile) {
      // Evaluate the "after" text — meta-description / h1 / title text.
      const afterText =
        typeof (pr.after as { text?: string }).text === "string"
          ? ((pr.after as { text: string }).text)
          : JSON.stringify(pr.after).slice(0, 400);
      try {
        const ev = await evaluateText(afterText, ctx.toneProfile);
        weighted = ev.weighted;
        riskFlags.push(...ev.riskFlags);
        evalScore = ev.score as unknown as Record<string, number>;
        if (ev.verdict === "rejected") status = "rejected";
        else if (ev.verdict === "publishable") status = "draft";
        else status = "needs_review";
      } catch (e) {
        console.error("[proposals] eval failed", (e as Error).message);
      }
    }

    rows.push({
      tenant_id: audit.tenant_id,
      group_id: group.id,
      audit_page_id: pageRow.id,
      issue_code: pr.issue_code,
      proposal_type: pr.proposal_type,
      before: pr.before as never,
      after: pr.after as never,
      rationale: pr.rationale,
      confidence: pr.confidence,
      status,
    });

    if (evalScore) {
      qualityChecks.push({
        tenant_id: audit.tenant_id,
        // proposal_id filled in after insert
        brand_fit_score: evalScore.voiceFit,
        seo_fit_score: evalScore.vocabularyFit,
        commercial_fit_score: evalScore.ctaFit,
        clarity_score: evalScore.sentenceRhythmFit,
        quality_score: weighted,
        risk_flags: riskFlags,
        verdict:
          status === "draft" ? "publishable" : status === "rejected" ? "rejected" : "needs_review",
        publishable: status === "draft",
        _idx: rows.length - 1,
      });
    }
  }

  const { data: inserted, error: iErr } = await supabaseAdmin
    .from("fix_proposals")
    .insert(rows as never)
    .select("id");
  if (iErr) throw iErr;

  if (qualityChecks.length > 0 && inserted) {
    const checkRows = qualityChecks.map((c) => {
      const idx = c._idx as number;
      const { _idx, ...rest } = c;
      void _idx;
      return { ...rest, proposal_id: inserted[idx].id };
    });
    await supabaseAdmin.from("proposal_quality_checks").insert(checkRows as never);
  }

  return { proposalsCreated: rows.length, pageUrl: pageRow.url };
}
