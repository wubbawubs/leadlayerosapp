/**
 * Onboarding repository — wizard state lives in `onboarding_sessions`,
 * scoped to the authenticated user (RLS: user_id = auth.uid()).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BusinessStepSchema,
  SiteStepSchema,
  type BusinessStepInput,
  type SiteStepInput,
} from "./onboarding.schemas";

export const getActiveOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("onboarding_sessions")
      .select("id, site_url, geo, vertical, status, tenant_id, created_at")
      .eq("user_id", userId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { session: data };
  });

async function ensureSession(
  supabase: ReturnType<typeof Object>,
  userId: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: existing } = await sb
    .from("onboarding_sessions")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await sb
    .from("onboarding_sessions")
    .insert({ user_id: userId, status: "started" })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

export const saveBusinessStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: BusinessStepInput) => BusinessStepSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const sessionId = await ensureSession(supabase, userId);
    const { error } = await supabase
      .from("onboarding_sessions")
      .update({ geo: data.geo, vertical: data.vertical, status: "business" })
      .eq("id", sessionId);
    if (error) throw error;
    return { sessionId, name: data.name };
  });

export const saveSiteStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SiteStepInput & { name: string }) =>
    SiteStepSchema.extend({ name: BusinessStepSchema.shape.name }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: session, error: sErr } = await supabase
      .from("onboarding_sessions")
      .select("id, geo, vertical")
      .eq("user_id", userId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session?.geo || !session?.vertical) {
      throw new Error("Complete the business step first");
    }

    const { data: tenantId, error: rpcErr } = await supabase.rpc(
      "create_tenant_with_owner",
      { p_name: data.name, p_geo: session.geo, p_vertical: session.vertical },
    );
    if (rpcErr) throw rpcErr;

    const { error: uErr } = await supabase
      .from("onboarding_sessions")
      .update({
        site_url: data.site_url,
        tenant_id: tenantId as string,
        status: "completed",
      })
      .eq("id", session.id);
    if (uErr) throw uErr;

    return { tenantId: tenantId as string };
  });
