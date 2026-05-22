/**
 * External trigger for Business Profile Analyzer jobs.
 *
 * The happy path is in-process invocation from `startAnalyzerJob`. This route
 * exists as an HMAC-authenticated entry point for environments where
 * in-process background work isn't viable (e.g. Cloudflare Workers killing
 * unawaited promises) or for manual re-runs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

import { runAnalyzerJob } from "@/lib/shared/businessProfile/runAnalyzerJob.server";

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

        const result = await runAnalyzerJob({ jobId, tenantId });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
