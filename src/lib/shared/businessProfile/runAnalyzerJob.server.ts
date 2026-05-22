/**
 * Background runner orchestration for Business Profile Analyzer jobs.
 *
 * Extracted so it can be invoked two ways:
 *  1. Directly (in-process fire-and-forget) from `startAnalyzerJob` — used in
 *     dev and any Node-style runtime where unawaited promises keep ticking.
 *  2. Via HMAC-signed HTTP POST to `/api/public/run-analyzer-job` — used in
 *     Cloudflare Worker production where in-process background work is killed
 *     once the parent request returns.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  analyzeBusinessProfileFromWebsite,
  type AnalyzerStage,
} from "./analyzer.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

function normalizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Stage A/i.test(msg)) return "Analyse mislukt tijdens feiten-extractie. Probeer opnieuw.";
  if (/Stage B/i.test(msg)) return "Analyse mislukt tijdens strategie-analyse. Probeer opnieuw.";
  if (/audit-pagina|sitemap/i.test(msg))
    return "Geen pagina's gevonden om te analyseren. Voer eerst een audit uit.";
  if (/leesbare content/i.test(msg)) return "Pagina's konden niet worden opgehaald.";
  if (/timeout|upstream/i.test(msg))
    return "De analyse duurde te lang. Probeer opnieuw met een kleinere selectie.";
  return msg.slice(0, 240);
}

/**
 * Claim a queued job and run the full analyzer pipeline, writing stage/result
 * updates to `business_profile_analyzer_jobs`. Safe to call concurrently —
 * only the first caller that flips `queued` -> `running` proceeds.
 */
export async function runAnalyzerJob(input: {
  jobId: string;
  tenantId: string;
}): Promise<{ ok: boolean; skipped?: string }> {
  const { jobId, tenantId } = input;

  const { data: job } = await admin
    .from("business_profile_analyzer_jobs")
    .select("id, status, tenant_id")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!job) return { ok: false, skipped: "not_found" };
  if (job.status !== "queued") return { ok: true, skipped: "not_queued" };

  await admin
    .from("business_profile_analyzer_jobs")
    .update({
      status: "running",
      stage: "crawl",
      started_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  try {
    const result = await analyzeBusinessProfileFromWebsite({
      tenantId,
      jobId,
      onStageChange: async (stage: AnalyzerStage) => {
        await admin
          .from("business_profile_analyzer_jobs")
          .update({ stage })
          .eq("id", jobId);
      },
    });

    await admin
      .from("business_profile_analyzer_jobs")
      .update({
        status: "succeeded",
        stage: "done",
        finished_at: new Date().toISOString(),
        result: {
          suggestionsCreated: result.suggestionsCreated,
          observedPages: result.observedPages,
          overallConfidence: result.overallConfidence,
          durationMs: result.durationMs,
        },
      })
      .eq("id", jobId);

    return { ok: true };
  } catch (error) {
    console.error("[analyzer-job] run failed", error);
    await admin
      .from("business_profile_analyzer_jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: normalizeError(error),
      })
      .eq("id", jobId);
    return { ok: false };
  }
}
