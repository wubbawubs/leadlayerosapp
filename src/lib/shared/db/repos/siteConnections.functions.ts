/**
 * Site connections repo — WordPress for now.
 * Credentials are stored in tenant_secrets (AES-GCM) under key
 * `site:{site_connection_id}:app_password`. Never returned to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encrypt, decrypt } from "@/lib/shared/secrets/crypto.server";
import {
  CreateSiteConnectionSchema,
  ProbeSiteConnectionSchema,
} from "./siteConnections.schemas";

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

function normalizeBaseUrl(u: string): string {
  const trimmed = u.trim().replace(/\/+$/, "");
  return trimmed;
}

export const listSiteConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("site_connections")
      .select(
        "id, type, base_url, username, status, last_probe_at, probe_result, created_at",
      )
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { connections: rows ?? [] };
  });

export const createSiteConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSiteConnectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const baseUrl = normalizeBaseUrl(data.baseUrl);

    // Insert row via RLS-scoped client (operator policy permits this).
    const { data: created, error: insErr } = await supabase
      .from("site_connections")
      .insert({
        tenant_id: data.tenantId,
        type: "wordpress",
        base_url: baseUrl,
        username: data.username,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // Encrypt + store credential via service-role (tenant_secrets has no RLS policies).
    const { ciphertext, version } = encrypt(data.appPassword);
    const key = `site:${created.id}:app_password`;
    const { error: secErr } = await supabaseAdmin.from("tenant_secrets").upsert(
      {
        tenant_id: data.tenantId,
        key,
        value_encrypted: ciphertext,
        encryption_version: version,
      },
      { onConflict: "tenant_id,key" },
    );
    if (secErr) throw secErr;

    await supabaseAdmin.from("secret_audit_log").insert({
      tenant_id: data.tenantId,
      actor_id: userId,
      actor_type: "user",
      action: "create",
      secret_key: key,
    });

    return { siteConnectionId: created.id as string };
  });

export const probeSiteConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ProbeSiteConnectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conn, error: cErr } = await supabase
      .from("site_connections")
      .select("id, tenant_id, base_url, username, type")
      .eq("id", data.siteConnectionId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conn) throw new Error("Site connection not found");
    await assertOperator(supabase, userId, conn.tenant_id);

    if (conn.type !== "wordpress") {
      throw new Error(`Probe not implemented for type=${conn.type}`);
    }
    if (!conn.base_url || !conn.username) {
      throw new Error("Connection missing base_url or username");
    }

    // Load credential
    const key = `site:${conn.id}:app_password`;
    const { data: secret, error: sErr } = await supabaseAdmin
      .from("tenant_secrets")
      .select("value_encrypted, encryption_version")
      .eq("tenant_id", conn.tenant_id)
      .eq("key", key)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!secret) throw new Error("Credential not found — re-add the connection");

    const password = decrypt(secret.value_encrypted, secret.encryption_version);
    const authHeader =
      "Basic " + btoa(`${conn.username}:${password}`);

    const probeUrl = `${conn.base_url.replace(/\/+$/, "")}/wp-json/wp/v2/users/me?context=edit`;
    const startedAt = Date.now();

    let status: "connected" | "error" = "error";
    let probeResult: Record<string, unknown> = {};

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(probeUrl, {
        method: "GET",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
        signal: ctrl.signal,
      });
      clearTimeout(t);

      const elapsedMs = Date.now() - startedAt;

      if (res.ok) {
        const body = (await res.json()) as {
          id?: number;
          name?: string;
          slug?: string;
          roles?: string[];
        };
        status = "connected";
        probeResult = {
          ok: true,
          httpStatus: res.status,
          elapsedMs,
          user: {
            id: body.id,
            name: body.name,
            slug: body.slug,
            roles: body.roles ?? [],
          },
        };
      } else {
        const text = await res.text().catch(() => "");
        status = "error";
        probeResult = {
          ok: false,
          httpStatus: res.status,
          elapsedMs,
          error:
            res.status === 401 || res.status === 403
              ? "Invalid credentials (HTTP " + res.status + ")"
              : res.status === 404
                ? "REST API not found at " + probeUrl
                : `Unexpected status ${res.status}`,
          body: text.slice(0, 500),
        };
      }
    } catch (e) {
      status = "error";
      probeResult = {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error:
          (e as Error).name === "AbortError"
            ? "Timeout after 10s"
            : (e as Error).message,
      };
    }

    const { error: uErr } = await supabaseAdmin
      .from("site_connections")
      .update({
        status,
        probe_result: probeResult,
        last_probe_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    if (uErr) throw uErr;

    return { status, probeResult };
  });
