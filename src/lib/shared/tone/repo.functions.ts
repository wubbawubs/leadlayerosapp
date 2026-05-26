/**
 * Tone Profile repo — serverFns for the operator UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ToneProfileSchema,
  type ToneProfile,
} from "./schemas";
import { analyzeToneProfileForTenant } from "./analyzer.server";
import { evaluateText } from "./evaluator.server";
import { llmComplete } from "@/lib/shared/llm/router.server";
import { loadBusinessLocale } from "./businessContext.server";

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

export const getToneProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("tone_profiles")
      .select(
        "id, tenant_id, status, language, locale, profile, locked_fields, confidence_score, source_summary, job_status, job_error, analyzed_at, updated_at",
      )
      .eq("tenant_id", data.tenantId)
      .maybeSingle();

    if (!row) return { profile: null as null };

    // Serialize JSON columns so they survive the RPC boundary cleanly
    return {
      profile: {
        ...row,
        profile: JSON.stringify(row.profile ?? {}),
        locked_fields: JSON.stringify(row.locked_fields ?? []),
        source_summary: JSON.stringify(row.source_summary ?? {}),
      },
    };
  });

export const analyzeToneProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    try {
      const profile = await analyzeToneProfileForTenant(data.tenantId);
      return { ok: true as const, summary: profile.voiceIdentity.summary };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const saveToneProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; profile: unknown; status?: "draft" | "approved" | "locked" }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        profile: z.unknown(),
        status: z.enum(["draft", "approved", "locked"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const parsed: ToneProfile = ToneProfileSchema.parse(data.profile);
    const patch: Record<string, unknown> = { profile: parsed };
    if (data.status) patch.status = data.status;
    await supabaseAdmin
      .from("tone_profiles")
      .upsert(
        { tenant_id: data.tenantId, ...patch },
        { onConflict: "tenant_id" },
      );
    return { ok: true };
  });

export const setToneStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; status: "draft" | "approved" | "locked" }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        status: z.enum(["draft", "approved", "locked"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    await supabaseAdmin
      .from("tone_profiles")
      .update({ status: data.status })
      .eq("tenant_id", data.tenantId);
    return { ok: true };
  });

export const testToneOutput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; kind: "meta" | "h1" | "cta" }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        kind: z.enum(["meta", "h1", "cta"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: row } = await supabaseAdmin
      .from("tone_profiles")
      .select("profile")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!row) return { ok: false as const, error: "Geen tone profile gevonden. Analyseer eerst." };
    const profile = ToneProfileSchema.parse(row.profile);

    const kindLabel =
      data.kind === "meta"
        ? "een meta-description van 120-160 tekens"
        : data.kind === "h1"
        ? "een H1 van max 60 tekens"
        : "een primaire CTA-knoptekst (max 5 woorden)";

    const prompt = [
      `Genereer ${kindLabel} die past bij dit merkstem-profiel.`,
      "Output: alleen de tekst zelf, geen quotes, geen uitleg.",
      "",
      "PROFIEL:",
      JSON.stringify({
        persona: profile.voiceIdentity.persona,
        summary: profile.voiceIdentity.summary,
        preferred: profile.vocabulary.preferred.slice(0, 10),
        avoid: profile.vocabulary.avoid.slice(0, 10),
        forbidden: profile.vocabulary.forbidden.slice(0, 10),
        ctaStyle: profile.ctaStyle.style,
        good: profile.examples.good.slice(0, 3),
        bad: profile.examples.bad.slice(0, 3),
      }),
    ].join("\n");

    const result = await llmComplete({
      task: "cheap",
      system: "Je schrijft conform een meegegeven merkstem. Antwoord alleen met de gevraagde tekst.",
      prompt,
      temperature: 0.6,
      maxTokens: 200,
    });

    const text = result.text.trim().replace(/^"|"$/g, "");
    const evaluation = await evaluateText(text, profile);
    return {
      ok: true as const,
      text,
      score: evaluation.score,
      weighted: evaluation.weighted,
      verdict: evaluation.verdict,
      riskFlags: evaluation.riskFlags,
    };
  });

export const listToneFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("tone_feedback_examples")
      .select("id, example_type, before_text, after_text, reason, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    return { feedback: rows ?? [] };
  });

// -------------------- Manual samples (V2) --------------------

async function ensureToneProfileId(tenantId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("tone_profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabaseAdmin
    .from("tone_profiles")
    .upsert({ tenant_id: tenantId, job_status: "queued" }, { onConflict: "tenant_id" })
    .select("id")
    .single();
  if (error) throw error;
  return created!.id as string;
}

export const addManualSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; text: string; sourceUrl?: string; label?: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        text: z.string().trim().min(40).max(20000),
        sourceUrl: z.string().trim().max(500).optional(),
        label: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const toneProfileId = await ensureToneProfileId(data.tenantId);
    const { error } = await supabaseAdmin.from("tone_profile_samples").insert({
      tenant_id: data.tenantId,
      tone_profile_id: toneProfileId,
      source_type: "manual_paste",
      source_url: data.sourceUrl ?? null,
      text: data.text,
      quality_score: 8,
      weight: 1,
      analysis: { manual: true, label: data.label ?? null } as never,
    });
    if (error) throw error;
    return { ok: true };
  });

export const listToneSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("tone_profiles")
      .select("id")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!existing?.id) return { samples: [] };
    const { data: rows } = await supabase
      .from("tone_profile_samples")
      .select("id, source_type, source_url, text, quality_score, weight, created_at")
      .eq("tone_profile_id", existing.id)
      .order("created_at", { ascending: false })
      .limit(80);
    return { samples: rows ?? [] };
  });

export const deleteToneSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; sampleId: string }) =>
    z
      .object({ tenantId: z.string().uuid(), sampleId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    await supabaseAdmin
      .from("tone_profile_samples")
      .delete()
      .eq("id", data.sampleId)
      .eq("tenant_id", data.tenantId);
    return { ok: true };
  });

