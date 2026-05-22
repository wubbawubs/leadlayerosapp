/**
 * Business Profile (Growth Intelligence Profile) — repo serverFns.
 * BP-1: CRUD + suggestion accept/reject + field lock.
 * BP-2: analyze-from-website + apply-on-accept.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHmac } from "crypto";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BusinessProfileSchema,
  type BusinessProfile,
} from "./schemas";
import {
  analyzeBusinessProfileFromWebsite,
  applySuggestionValue,
} from "./analyzer.server";

// types.ts hasn't regenerated for business_profiles_v2 yet; cast where needed.
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

const EMPTY: BusinessProfile = BusinessProfileSchema.parse({});

export const getBusinessProfileV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase as any)
      .from("business_profiles_v2")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    return { profile: row ?? null };
  });

export const upsertBusinessProfileV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tenantId: string;
      patch: unknown;
      status?: "draft" | "review_ready" | "approved" | "locked";
    }) =>
      z
        .object({
          tenantId: z.string().uuid(),
          patch: z.unknown(),
          status: z
            .enum(["draft", "review_ready", "approved", "locked"])
            .optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    // Validate patch against schema (partial-friendly because each section has defaults)
    const parsed = BusinessProfileSchema.parse({
      ...EMPTY,
      ...(typeof data.patch === "object" && data.patch !== null ? data.patch : {}),
    });

    const row: Record<string, unknown> = {
      tenant_id: data.tenantId,
      business_identity: parsed.business_identity,
      offer_profile: parsed.offer_profile,
      icp_profile: parsed.icp_profile,
      location_profile: parsed.location_profile,
      conversion_profile: parsed.conversion_profile,
      proof_profile: parsed.proof_profile,
      claim_guardrails: parsed.claim_guardrails,
      strategy_angles: parsed.strategy_angles,
      missing_context: parsed.missing_context,
      locked_fields: parsed.locked_fields,
    };
    if (data.status) row.status = data.status;

    const { error } = await admin
      .from("business_profiles_v2")
      .upsert(row, { onConflict: "tenant_id" });
    if (error) throw error;
    return { ok: true };
  });

export const setBusinessProfileStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tenantId: string;
      status: "draft" | "review_ready" | "approved" | "locked";
    }) =>
      z
        .object({
          tenantId: z.string().uuid(),
          status: z.enum(["draft", "review_ready", "approved", "locked"]),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const { error } = await admin
      .from("business_profiles_v2")
      .update({ status: data.status })
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

export const lockBusinessProfileField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; fieldPath: string; lock: boolean }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        fieldPath: z.string().min(1).max(120),
        lock: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const { data: row } = await admin
      .from("business_profiles_v2")
      .select("locked_fields")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const current: string[] = Array.isArray(row?.locked_fields)
      ? (row!.locked_fields as string[])
      : [];
    const next = data.lock
      ? Array.from(new Set([...current, data.fieldPath]))
      : current.filter((f) => f !== data.fieldPath);
    const { error } = await admin
      .from("business_profiles_v2")
      .upsert(
        { tenant_id: data.tenantId, locked_fields: next },
        { onConflict: "tenant_id" },
      );
    if (error) throw error;
    return { ok: true, locked_fields: next };
  });

export const listBusinessProfileSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; status?: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        status: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("business_profile_suggestions")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows } = await q;
    return { suggestions: rows ?? [] };
  });

export const acceptBusinessProfileSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; suggestionId: string; lockAfter?: boolean }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        suggestionId: z.string().uuid(),
        lockAfter: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Load suggestion
    const { data: sug, error: sErr } = await admin
      .from("business_profile_suggestions")
      .select("*")
      .eq("id", data.suggestionId)
      .eq("tenant_id", data.tenantId)
      .single();
    if (sErr || !sug) throw new Error("Suggestie niet gevonden.");

    // Apply value into profile (throws if locked)
    await applySuggestionValue({
      tenantId: data.tenantId,
      fieldPath: sug.field_path as string,
      value: sug.suggested_value,
    });

    // Optionally lock the field
    if (data.lockAfter) {
      const { data: row } = await admin
        .from("business_profiles_v2")
        .select("locked_fields")
        .eq("tenant_id", data.tenantId)
        .maybeSingle();
      const current: string[] = Array.isArray(row?.locked_fields)
        ? (row!.locked_fields as string[])
        : [];
      const next = Array.from(new Set([...current, sug.field_path as string]));
      await admin
        .from("business_profiles_v2")
        .update({ locked_fields: next })
        .eq("tenant_id", data.tenantId);
    }

    await admin
      .from("business_profile_suggestions")
      .update({ status: "accepted", decided_at: new Date().toISOString(), decided_by: userId })
      .eq("id", data.suggestionId)
      .eq("tenant_id", data.tenantId);
    await admin.from("business_profile_feedback").insert({
      tenant_id: data.tenantId,
      suggestion_id: data.suggestionId,
      feedback_type: "accepted",
      field_path: sug.field_path,
      before_value: sug.current_value,
      after_value: sug.suggested_value,
      created_by: userId,
    });
    return { ok: true };
  });

export const editAndAcceptBusinessProfileSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tenantId: string; suggestionId: string; editedValue: unknown }) =>
      z
        .object({
          tenantId: z.string().uuid(),
          suggestionId: z.string().uuid(),
          editedValue: z.unknown(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const { data: sug, error: sErr } = await admin
      .from("business_profile_suggestions")
      .select("*")
      .eq("id", data.suggestionId)
      .eq("tenant_id", data.tenantId)
      .single();
    if (sErr || !sug) throw new Error("Suggestie niet gevonden.");

    await applySuggestionValue({
      tenantId: data.tenantId,
      fieldPath: sug.field_path as string,
      value: data.editedValue,
    });

    await admin
      .from("business_profile_suggestions")
      .update({ status: "edited", decided_at: new Date().toISOString(), decided_by: userId })
      .eq("id", data.suggestionId)
      .eq("tenant_id", data.tenantId);
    await admin.from("business_profile_feedback").insert({
      tenant_id: data.tenantId,
      suggestion_id: data.suggestionId,
      feedback_type: "edited",
      field_path: sug.field_path,
      before_value: sug.current_value,
      after_value: data.editedValue,
      created_by: userId,
    });
    return { ok: true };
  });

export const rejectBusinessProfileSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tenantId: string; suggestionId: string; reason?: string }) =>
      z
        .object({
          tenantId: z.string().uuid(),
          suggestionId: z.string().uuid(),
          reason: z.string().max(800).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const { data: sug } = await admin
      .from("business_profile_suggestions")
      .select("field_path, current_value, suggested_value")
      .eq("id", data.suggestionId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const { error } = await admin
      .from("business_profile_suggestions")
      .update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: userId })
      .eq("id", data.suggestionId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await admin.from("business_profile_feedback").insert({
      tenant_id: data.tenantId,
      suggestion_id: data.suggestionId,
      feedback_type: "rejected",
      field_path: sug?.field_path ?? null,
      before_value: sug?.current_value ?? null,
      after_value: sug?.suggested_value ?? null,
      reason: data.reason ?? null,
      created_by: userId,
    });
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// Async analyzer job pattern — kicks off background work and polls for status.
// Replaces the old synchronous analyzeBusinessProfileFromWebsiteFn which hit
// the ~100s proxy HTTP timeout because the full analyzer pipeline can take
// 2-3 minutes (Stage A + Stage B + crawl + persist).
// ----------------------------------------------------------------------------

function getPublicOrigin(): string {
  // Read request via TanStack runtime, fall back to env.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRequest } = require("@tanstack/react-start/server") as {
      getRequest: () => Request;
    };
    const req = getRequest();
    const h = req.headers;
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
    return new URL(req.url).origin;
  } catch {
    return process.env.SITE_URL ?? "";
  }
}

export const startAnalyzerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Reuse an existing recent queued/running job to avoid double-runs
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("business_profile_analyzer_jobs")
      .select("id, status, created_at")
      .eq("tenant_id", data.tenantId)
      .in("status", ["queued", "running"])
      .gte("created_at", tenMinAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return { jobId: existing.id as string, reused: true };
    }

    // Insert new job
    const { data: row, error: insErr } = await admin
      .from("business_profile_analyzer_jobs")
      .insert({
        tenant_id: data.tenantId,
        created_by: userId,
        status: "queued",
        stage: "queued",
      })
      .select("id")
      .single();
    if (insErr || !row) {
      throw new Error(`Kon analyse-job niet aanmaken: ${insErr?.message ?? "unknown"}`);
    }
    const jobId = row.id as string;

    // Fire-and-forget background invocation. HMAC-signed body.
    const secret = process.env.ANALYZER_JOB_SECRET;
    if (!secret) {
      await admin
        .from("business_profile_analyzer_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: "Server is niet geconfigureerd (ANALYZER_JOB_SECRET ontbreekt).",
        })
        .eq("id", jobId);
      throw new Error("ANALYZER_JOB_SECRET ontbreekt op de server.");
    }

    const origin = getPublicOrigin();
    if (!origin) {
      await admin
        .from("business_profile_analyzer_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: "Kon publieke URL niet bepalen.",
        })
        .eq("id", jobId);
      throw new Error("Kon publieke origin niet bepalen.");
    }

    const body = JSON.stringify({ jobId, tenantId: data.tenantId });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHmac } = require("crypto") as typeof import("crypto");
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    // Fire-and-forget — do NOT await. Drop network errors silently; the job
    // row stays 'queued' and the UI surfaces a stuck-job warning after 5min.
    void fetch(`${origin}/api/public/run-analyzer-job`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-analyzer-signature": signature,
      },
      body,
    }).catch((e) => {
      console.error("[startAnalyzerJob] fire-and-forget failed", e);
    });

    return { jobId, reused: false };
  });

export const getAnalyzerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) =>
    z.object({ jobId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job, error } = await admin
      .from("business_profile_analyzer_jobs")
      .select(
        "id, tenant_id, status, stage, result, error_message, started_at, finished_at, created_at",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw error;
    if (!job) throw new Error("Job niet gevonden");
    // Verify membership of the job's tenant
    const { data: m } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", job.tenant_id)
      .maybeSingle();
    if (!m) throw new Error("Forbidden");
    const r = (job.result ?? {}) as {
      suggestionsCreated?: number;
      observedPages?: number;
      overallConfidence?: number;
      durationMs?: number;
    };
    return {
      id: job.id as string,
      status: job.status as "queued" | "running" | "succeeded" | "failed",
      stage: job.stage as string,
      result: {
        suggestionsCreated: Number(r.suggestionsCreated ?? 0),
        observedPages: Number(r.observedPages ?? 0),
        overallConfidence: Number(r.overallConfidence ?? 0),
        durationMs: Number(r.durationMs ?? 0),
      },
      errorMessage: (job.error_message as string | null) ?? null,
      startedAt: (job.started_at as string | null) ?? null,
      finishedAt: (job.finished_at as string | null) ?? null,
      createdAt: job.created_at as string,
    };


  });



// ----------------------------------------------------------------------------
// Strategy angles — mark a single angle as primary (or clear)
// ----------------------------------------------------------------------------

export const setPrimaryStrategyAngle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; angleIndex: number | null }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        angleIndex: z.number().int().min(0).max(40).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const { data: row } = await admin
      .from("business_profiles_v2")
      .select("strategy_angles")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const angles: Array<Record<string, unknown>> = Array.isArray(row?.strategy_angles)
      ? (row!.strategy_angles as Array<Record<string, unknown>>)
      : [];
    const next = angles.map((a, i) => ({ ...a, isPrimary: i === data.angleIndex }));
    const { error } = await admin
      .from("business_profiles_v2")
      .update({ strategy_angles: next })
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// Missing context — answer a gap, optionally map answer to a profile field
// ----------------------------------------------------------------------------

export const answerMissingContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tenantId: string;
      index: number;
      answer: string;
      mapToField?: string;
      resolve?: boolean;
    }) =>
      z
        .object({
          tenantId: z.string().uuid(),
          index: z.number().int().min(0).max(40),
          answer: z.string().max(2000),
          mapToField: z.string().max(160).optional(),
          resolve: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const { data: row } = await admin
      .from("business_profiles_v2")
      .select("missing_context")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const items: Array<Record<string, unknown>> = Array.isArray(row?.missing_context)
      ? (row!.missing_context as Array<Record<string, unknown>>)
      : [];
    if (data.index >= items.length) throw new Error("Missing-context item niet gevonden.");
    const updatedItem = {
      ...items[data.index],
      answer: data.answer,
      mapToField: data.mapToField ?? (items[data.index].mapToField as string) ?? "",
      resolvedAt: data.resolve ? new Date().toISOString() : ((items[data.index].resolvedAt as string) ?? ""),
    };
    const nextItems = items.map((it, i) => (i === data.index ? updatedItem : it));

    // Optionally apply the answer to a profile field
    if (data.mapToField && data.answer.trim()) {
      try {
        await applySuggestionValue({
          tenantId: data.tenantId,
          fieldPath: data.mapToField,
          value: data.answer.trim(),
        });
      } catch (e) {
        console.warn("[bp-2] could not map missing-context answer to field", data.mapToField, e);
      }
    }

    const { error } = await admin
      .from("business_profiles_v2")
      .update({ missing_context: nextItems })
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteMissingContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; index: number }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        index: z.number().int().min(0).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const { data: row } = await admin
      .from("business_profiles_v2")
      .select("missing_context")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const items: Array<Record<string, unknown>> = Array.isArray(row?.missing_context)
      ? (row!.missing_context as Array<Record<string, unknown>>)
      : [];
    const nextItems = items.filter((_, i) => i !== data.index);
    const { error } = await admin
      .from("business_profiles_v2")
      .update({ missing_context: nextItems })
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

