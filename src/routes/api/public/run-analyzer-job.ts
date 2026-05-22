/**
 * Background runner for Business Profile Analyzer jobs.
 *
 * Called fire-and-forget by `startAnalyzerJob` (see repo.functions.ts) so the
 * heavy analyzer pipeline (Stage A + Stage B + crawl + persist) can run
 * outside the proxy's ~100s HTTP request limit. Authenticated via HMAC
 * shared secret `ANALYZER_JOB_SECRET`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  analyzeBusinessProfileFromWebsite,
  type AnalyzerStage,
} from "@/lib/shared/businessProfile/analyzer.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

function signatureFor(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function normalizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Mappen naar operator-vriendelijke teksten
  if (/Stage A/i.test(msg)) return "Analyse mislukt tijdens feiten-extractie. Probeer opnieuw.";
  if (/Stage B/i.test(msg)) return "Analyse mislukt tijdens strategie-analyse. Probeer opnieuw.";
  if (/audit-pagina|sitemap/i.test(msg))
    return "Geen pagina's gevonden om te analyseren. Voer eerst een audit uit.";
  if (/leesbare content/i.test(msg))
    return "Pagina's konden niet worden opgehaald.";
  if (/timeout|upstream/i.test(msg))
    return "De analyse duurde te lang. Probeer opnieuw met een kleinere selectie.";
  return msg.slice(0, 240);
}

export const Route = createFileRoute("/api/public/run-analyzer-job")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.ANALYZER_JOB_SECRET;
        if (!secret) {
          console.error("[analyzer-job] ANALYZER_JOB_SECRET not configured");
          return new Response("Not configured", { status: 500 });
        }

        const signature = request.headers.get("x-analyzer-signature") ?? "";
        const body = await request.text();
        const expected = signatureFor(body, secret);
        if (!signature || !safeEqualHex(signature, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: { jobId?: string; tenantId?: string };
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const { jobId, tenantId } = payload;
        if (!jobId || !tenantId) {
          return new Response("Missing jobId/tenantId", { status: 400 });
        }

        // Load + claim job
        const { data: job } = await admin
          .from("business_profile_analyzer_jobs")
          .select("id, status, tenant_id")
          .eq("id", jobId)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (!job) {
          return new Response("Job not found", { status: 404 });
        }
        if (job.status !== "queued") {
          return new Response("Job not queued", { status: 200 });
        }

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

          return new Response("ok", { status: 200 });
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
          return new Response("failed", { status: 200 });
        }
      },
    },
  },
});
