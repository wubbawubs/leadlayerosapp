/**
 * Public lead ingestion endpoint — Basic Lead Ingestion Webhook V1.
 *
 * POST /api/public/lead-ingest
 *
 * No user auth required. Protected by `publicKey` which maps to an active
 * lead_ingestion_sources row. The tenant_id is NEVER in the URL or response.
 *
 * Security model:
 *   - publicKey is 48 hex chars (randomBytes(24)) — unguessable
 *   - Origin checked against allowed_origins if configured
 *   - At least one contact field required (name, phone, email, or message)
 *   - Generic error messages — never reveals whether a tenant exists
 *   - Credentials and tenant IDs never logged or returned
 *
 * V1 limitations (documented):
 *   - No rate limiting per key (document and revisit in V2)
 *   - No deduplication (allow duplicates; operator reviews)
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { WebhookLeadPayloadSchema } from "@/lib/shared/leadIngestion/schemas";
import { sendEmail, buildLeadNotificationEmail } from "@/lib/shared/notifications/email.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonOk(body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      ...CORS_HEADERS,
    },
  });
}

function jsonErr(message: string, status: number, origin: string | null): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: {
      "content-type": "application/json",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      ...CORS_HEADERS,
    },
  });
}

export const Route = createFileRoute("/api/public/lead-ingest")({
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

        // Parse body
        let raw: unknown;
        try {
          const ct = request.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            raw = await request.json();
          } else if (
            ct.includes("application/x-www-form-urlencoded") ||
            ct.includes("multipart/form-data")
          ) {
            const form = await request.formData();
            const obj: Record<string, string> = {};
            for (const [k, v] of form.entries()) {
              obj[k] = String(v);
            }
            raw = obj;
          } else {
            // Attempt JSON fallback
            const text = await request.text();
            raw = text ? JSON.parse(text) : {};
          }
        } catch {
          return jsonErr("Invalid request body", 400, origin);
        }

        // Validate payload
        const parsed = WebhookLeadPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          return jsonErr("Invalid payload", 400, origin);
        }
        const payload = parsed.data;

        // Require at least one contact field
        if (!payload.name && !payload.phone && !payload.email && !payload.message) {
          return jsonErr(
            "At least one contact field required: name, phone, email, or message",
            400,
            origin,
          );
        }

        // Look up ingestion source by publicKey (active only)
        const { data: sourceRow, error: srcErr } = await admin
          .from("lead_ingestion_sources")
          .select("id, tenant_id, status, allowed_origins, default_source, default_status")
          .eq("public_key", payload.publicKey)
          .eq("status", "active")
          .maybeSingle();

        if (srcErr) {
          console.error("[lead-ingest] source lookup error:", srcErr.message);
          return jsonErr("Service error", 500, origin);
        }
        // Use identical error for not found and revoked — never leak existence
        if (!sourceRow) {
          return jsonErr("Invalid key", 401, origin);
        }

        // Origin check (if configured)
        const allowedOrigins = (sourceRow.allowed_origins as string[]) ?? [];
        if (allowedOrigins.length > 0 && origin) {
          if (!allowedOrigins.some((o: string) => o === origin)) {
            return jsonErr("Origin not allowed", 403, origin);
          }
        }

        const tenantId = sourceRow.tenant_id as string;
        const ingestionSourceId = sourceRow.id as string;
        const effectiveSource = payload.source ?? (sourceRow.default_source as string) ?? "form";
        const effectiveStatus = (sourceRow.default_status as string) ?? "new";

        // Build attribution JSONB
        const attribution: Record<string, unknown> = {
          ingestionSourceId,
          pageUrl: payload.pageUrl ?? null,
          referrer: payload.referrer ?? null,
          service: payload.service ?? null,
          location: payload.location ?? null,
          utm: {
            source: payload.utm_source ?? null,
            medium: payload.utm_medium ?? null,
            campaign: payload.utm_campaign ?? null,
            term: payload.utm_term ?? null,
            content: payload.utm_content ?? null,
          },
          ...(payload.metadata ? { metadata: payload.metadata } : {}),
        };

        // Insert lead — service_role bypasses RLS
        const { error: leadErr } = await admin.from("leads").insert({
          tenant_id: tenantId,
          source: effectiveSource,
          status: effectiveStatus,
          name: payload.name ?? null,
          email: payload.email ?? null,
          phone: payload.phone ?? null,
          payload: {
            logged_via: "webhook",
            ingestion_source_id: ingestionSourceId,
            message: payload.message ?? null,
          },
          attribution,
        });

        if (leadErr) {
          console.error("[lead-ingest] insert error:", leadErr.message);
          return jsonErr("Service error", 500, origin);
        }

        // Best-effort lead notification — never blocks the response
        void (async () => {
          try {
            const { data: goalRow } = await admin
              .from("growth_goals")
              .select("notification_email, notify_on_lead, title")
              .eq("tenant_id", tenantId)
              .eq("status", "active")
              .maybeSingle();

            if (goalRow?.notify_on_lead && goalRow?.notification_email) {
              const { data: tenantRow } = await admin
                .from("tenants")
                .select("name, geo")
                .eq("id", tenantId)
                .maybeSingle();
              const businessName = (tenantRow?.name as string | null) ?? "your business";
              const locale = tenantRow?.geo === "NL" ? ("nl" as const) : ("en" as const);
              const appBaseUrl = process.env.APP_BASE_URL ?? "https://app.leadlayer.app";
              const emailContent = buildLeadNotificationEmail({
                businessName,
                source: effectiveSource,
                name: payload.name ?? null,
                phone: payload.phone ?? null,
                email: payload.email ?? null,
                message: payload.message ?? null,
                receivedAt: new Date().toISOString(),
                // Notification goes to the client — link them to the client portal
                appUrl: `${appBaseUrl}/client/leads`,
                locale,
              });
              await sendEmail({
                to: goalRow.notification_email as string,
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text,
              });
            }
          } catch (notifyErr) {
            console.error("[lead-ingest] notification error:", (notifyErr as Error).message);
          }
        })();

        return jsonOk({ ok: true }, origin);
      },
    },
  },
});
