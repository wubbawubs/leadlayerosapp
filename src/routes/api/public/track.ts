/**
 * Public analytics tracking endpoint — LeadLayer pixel (ll.js).
 *
 * POST /api/public/track
 *
 * Receives batched visitor/CTA events from the pixel via sendBeacon as a
 * text/plain body (CORS-simple, no preflight). Protected by the same
 * `publicKey` as lead ingestion — one key per client site. Tenant id is
 * never in the URL or response.
 *
 * Always returns 204 fast (beacons ignore the response body); an invalid
 * key is a silent no-op so the endpoint never leaks tenant existence and
 * never errors on the host page.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const EVENT_TYPES = new Set(["pageview", "cta_impression", "cta_click"]);
const MAX_EVENTS = 50;

function noContent(origin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: { ...(origin ? { "Access-Control-Allow-Origin": origin } : {}), ...CORS_HEADERS },
  });
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string" || !v) return null;
  return v.slice(0, max);
}

export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        return new Response(null, {
          status: 204,
          headers: {
            ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
            ...CORS_HEADERS,
          },
        });
      },

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");

        // Beacon sends text/plain; parse defensively. Bad input = silent 204.
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(await request.text());
        } catch {
          return noContent(origin);
        }

        const key = typeof body.key === "string" ? body.key : "";
        const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
        if (!key || events.length === 0) return noContent(origin);

        // Resolve tenant from the site key (active sources only).
        const { data: source } = await admin
          .from("lead_ingestion_sources")
          .select("tenant_id, status, allowed_origins")
          .eq("public_key", key)
          .eq("status", "active")
          .maybeSingle();
        if (!source) return noContent(origin);

        // Optional origin allowlist (same model as lead ingestion).
        const allowed = (source.allowed_origins as string[]) ?? [];
        if (allowed.length > 0 && origin && !allowed.includes(origin)) {
          return noContent(origin);
        }

        const sessionId = str(body.sid, 64);
        const pagePath = str(body.path, 200);
        const referrerHost = str(body.ref, 200);
        const utm =
          body.utm && typeof body.utm === "object" && Object.keys(body.utm).length > 0
            ? body.utm
            : null;

        const rows = events
          .filter(
            (e: unknown): e is Record<string, unknown> =>
              !!e && typeof e === "object" && EVENT_TYPES.has((e as { t?: string }).t ?? ""),
          )
          .map((e: Record<string, unknown>) => ({
            tenant_id: source.tenant_id,
            event_type: e.t,
            cta_id: str(e.cta, 80),
            page_path: pagePath,
            session_id: sessionId,
            referrer_host: referrerHost,
            utm,
          }));

        if (rows.length > 0) {
          const { error } = await admin.from("tracking_events").insert(rows);
          if (error) console.error("[track] insert error:", error.message);
        }

        return noContent(origin);
      },
    },
  },
});
