/**
 * Tenants repository — reference implementation of the repo-pattern.
 * Every query runs through the auth-middleware supabase client (RLS scopes it
 * to tenants the user is a member of). The repo never accepts a tenantId
 * filter from arbitrary input without going through RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, geo, vertical, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { tenants: data ?? [] };
  });
