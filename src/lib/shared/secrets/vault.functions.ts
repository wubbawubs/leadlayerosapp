/**
 * Tenant secrets vault — server functions.
 * Encrypts values with AES-GCM and writes ciphertext to tenant_secrets via
 * the service-role client (the table has no policies for authenticated users).
 *
 * IMPORTANT: This file must contain ONLY createServerFn declarations and their
 * imports so Vite's splitter can keep `client.server` off the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encrypt, decrypt } from "./crypto.server";

const setInput = z.object({
  tenantId: z.string().uuid(),
  key: z.string().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/),
  value: z.string().min(1).max(8192),
});

const getInput = z.object({
  tenantId: z.string().uuid(),
  key: z.string().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(supabase: any, userId: string, tenantId: string): Promise<string> {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  return data.role as string;
}

export const setTenantSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => setInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertMember(supabase, userId, data.tenantId);
    if (role !== "owner" && role !== "operator") {
      throw new Error("Forbidden: requires operator or owner role");
    }

    const { ciphertext, version } = encrypt(data.value);

    const { error } = await supabaseAdmin
      .from("tenant_secrets")
      .upsert(
        {
          tenant_id: data.tenantId,
          key: data.key,
          value_encrypted: ciphertext,
          encryption_version: version,
        },
        { onConflict: "tenant_id,key" },
      );
    if (error) throw error;

    await supabaseAdmin.from("secret_audit_log").insert({
      tenant_id: data.tenantId,
      actor_id: userId,
      actor_type: "user",
      action: "update",
      secret_key: data.key,
    });

    return { ok: true };
  });

export const getTenantSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => getInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertMember(supabase, userId, data.tenantId);
    if (role !== "owner" && role !== "operator") {
      throw new Error("Forbidden: requires operator or owner role");
    }

    const { data: row, error } = await supabaseAdmin
      .from("tenant_secrets")
      .select("value_encrypted, encryption_version")
      .eq("tenant_id", data.tenantId)
      .eq("key", data.key)
      .maybeSingle();
    if (error) throw error;
    if (!row) return { value: null };

    await supabaseAdmin.from("secret_audit_log").insert({
      tenant_id: data.tenantId,
      actor_id: userId,
      actor_type: "user",
      action: "read",
      secret_key: data.key,
    });

    return { value: decrypt(row.value_encrypted, row.encryption_version) };
  });
