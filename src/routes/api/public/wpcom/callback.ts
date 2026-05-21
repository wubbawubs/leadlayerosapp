/**
 * WordPress.com OAuth callback.
 * - Verifies HMAC-signed state -> (tenantId, userId)
 * - Exchanges code -> access_token via WPCOM
 * - Stores access_token encrypted in tenant_secrets
 * - Creates a site_connections row (type=wordpress_com) using the primary site
 *   the user picked during the WordPress.com consent screen.
 * - Redirects back to /app/sites with a status query param.
 */
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encrypt } from "@/lib/shared/secrets/crypto.server";
import {
  exchangeCode,
  getPublicOrigin,
  getRedirectUri,
  verifyState,
  wpcomFetch,
} from "@/lib/shared/wpcom/oauth.server";

function redirectTo(origin: string, params: Record<string, string>): Response {
  const qs = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/sites?${qs}` },
  });
}

export const Route = createFileRoute("/api/public/wpcom/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = getPublicOrigin(request);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          return redirectTo(origin, {
            wpcom: "error",
            reason: errorParam.slice(0, 80),
          });
        }
        if (!code || !state) {
          return redirectTo(origin, { wpcom: "error", reason: "missing_code" });
        }

        let payload;
        try {
          payload = verifyState(state);
        } catch (e) {
          return redirectTo(origin, {
            wpcom: "error",
            reason: `bad_state:${(e as Error).message.slice(0, 40)}`,
          });
        }

        const clientId = process.env.WPCOM_CLIENT_ID;
        const clientSecret = process.env.WPCOM_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return redirectTo(origin, { wpcom: "error", reason: "not_configured" });
        }

        try {
          const tokenRes = await exchangeCode({
            clientId,
            clientSecret,
            redirectUri: getRedirectUri(request),
            code,
          });

          // Pick the site the user authorized. WPCOM returns blog_id/blog_url
          // when the consent was scoped to a single site. For scope=global it
          // returns blog_id "0" — fall back to /me/sites in that case.
          let blogId = tokenRes.blog_id;
          let blogUrl = tokenRes.blog_url;
          const blogIdMissing =
            !blogId || String(blogId) === "0" || String(blogId).trim() === "";
          if (blogIdMissing) {
            const sites = await wpcomFetch<{
              sites: { ID: number; URL: string; name?: string }[];
            }>("/me/sites?fields=ID,URL,name", tokenRes.access_token);
            const first = sites.sites?.[0];
            if (!first) throw new Error("No WordPress.com sites available");
            blogId = String(first.ID);
            blogUrl = first.URL;
          }
          const baseUrl = (blogUrl ?? "").replace(/\/+$/, "");

          // Upsert the site_connection. Unique index is on (tenant_id, type, base_url).
          const { data: existing } = await supabaseAdmin
            .from("site_connections")
            .select("id")
            .eq("tenant_id", payload.t)
            .eq("type", "wordpress_com")
            .eq("base_url", baseUrl)
            .maybeSingle();

          let connectionId: string;
          if (existing) {
            const { error: uErr } = await supabaseAdmin
              .from("site_connections")
              .update({
                status: "connected",
                external_account_id: blogId,
                last_probe_at: new Date().toISOString(),
                probe_result: { ok: true, via: "oauth_callback" },
              })
              .eq("id", existing.id);
            if (uErr) throw uErr;
            connectionId = existing.id as string;
          } else {
            const { data: ins, error: iErr } = await supabaseAdmin
              .from("site_connections")
              .insert({
                tenant_id: payload.t,
                type: "wordpress_com",
                base_url: baseUrl,
                external_account_id: blogId,
                status: "connected",
                last_probe_at: new Date().toISOString(),
                probe_result: { ok: true, via: "oauth_callback" },
              })
              .select("id")
              .single();
            if (iErr) throw iErr;
            connectionId = ins.id as string;
          }

          // Encrypt + store the access token.
          const { ciphertext, version } = encrypt(tokenRes.access_token);
          const key = `site:${connectionId}:wpcom_access_token`;
          const { error: sErr } = await supabaseAdmin
            .from("tenant_secrets")
            .upsert(
              {
                tenant_id: payload.t,
                key,
                value_encrypted: ciphertext,
                encryption_version: version,
              },
              { onConflict: "tenant_id,key" },
            );
          if (sErr) throw sErr;

          await supabaseAdmin.from("secret_audit_log").insert({
            tenant_id: payload.t,
            actor_id: payload.u,
            actor_type: "user",
            action: "create",
            secret_key: key,
          });

          return redirectTo(origin, {
            wpcom: "connected",
            site: baseUrl,
          });
        } catch (e) {
          console.error("WPCOM callback error", e);
          return redirectTo(origin, {
            wpcom: "error",
            reason: (e as Error).message.slice(0, 120),
          });
        }
      },
    },
  },
});
