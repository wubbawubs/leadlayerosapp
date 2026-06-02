import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

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

// ------------------------------------------------------------------
// getTenantSummary — aggregated status for command center header +
// settings hub. One round-trip per surface instead of N separate calls.
// ------------------------------------------------------------------

export interface TenantSummary {
  growthGoal: {
    id: string;
    title: string | null;
    tier: string | null;
    status: string;
  } | null;
  businessProfile: {
    filled: boolean;
    status: string | null;
  };
  toneProfile: {
    filled: boolean;
    status: string | null;
  };
  wordpressConnection: {
    siteUrl: string;
    status: string;
    lastProbeAt: string | null;
  } | null;
  leadIngestion: {
    active: boolean;
    hasSource: boolean;
    webhookKey: string | null;
  };
  intelligencePipeline: {
    lastRunAt: string | null;
    lastRunStatus: string | null;
  };
  gbp: {
    connected: boolean;
  };
  pageInventory: {
    count: number;
  };
  health: "green" | "amber" | "red";
}

export const getTenantSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<TenantSummary> => {
    const { supabase, userId } = context;

    // Verify membership
    const { data: member } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden");

    const [
      goalRes,
      bpRes,
      toneRes,
      siteConnRes,
      leadIngRes,
      intelRes,
      gbpRes,
      invRes,
    ] = await Promise.all([
      admin
        .from("growth_goals")
        .select("id, title, tier, status")
        .eq("tenant_id", data.tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("business_profiles_v2")
        .select("status")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      admin
        .from("tone_profiles")
        .select("id, status")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("site_connections")
        .select("id, base_url, status, last_probe_at")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("lead_ingestion_sources")
        .select("id, status, public_key")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("intelligence_runs")
        .select("id, status, created_at")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("gbp_profiles")
        .select("id")
        .eq("tenant_id", data.tenantId)
        .limit(1),
      admin
        .from("wordpress_site_inventory")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId),
    ]);

    const goal = (goalRes.data ?? [])[0] ?? null;
    const bp = bpRes.data ?? null;
    const tone = (toneRes.data ?? [])[0] ?? null;
    const siteConn = (siteConnRes.data ?? [])[0] ?? null;
    const leadIng = (leadIngRes.data ?? [])[0] ?? null;
    const intel = (intelRes.data ?? [])[0] ?? null;
    const gbp = (gbpRes.data ?? [])[0] ?? null;
    const pageCount = (invRes.count as number | null) ?? 0;

    // Simple health derivation
    let health: "green" | "amber" | "red" = "green";
    if (!goal || !siteConn || siteConn.status !== "connected") health = "amber";
    if (!goal && !siteConn) health = "red";

    return {
      growthGoal: goal
        ? {
            id: goal.id as string,
            title: (goal.title as string | null) ?? null,
            tier: (goal.tier as string | null) ?? null,
            status: goal.status as string,
          }
        : null,
      businessProfile: {
        filled: !!bp && bp.status !== "draft" && bp.status !== null,
        status: (bp?.status as string | null) ?? null,
      },
      toneProfile: {
        filled: !!tone,
        status: (tone?.status as string | null) ?? null,
      },
      wordpressConnection: siteConn
        ? {
            siteUrl: siteConn.base_url as string,
            status: siteConn.status as string,
            lastProbeAt: (siteConn.last_probe_at as string | null) ?? null,
          }
        : null,
      leadIngestion: {
        active: !!leadIng && leadIng.status === "active",
        hasSource: !!leadIng,
        webhookKey: (leadIng?.public_key as string | null) ?? null,
      },
      intelligencePipeline: {
        lastRunAt: (intel?.created_at as string | null) ?? null,
        lastRunStatus: (intel?.status as string | null) ?? null,
      },
      gbp: {
        connected: !!gbp,
      },
      pageInventory: {
        count: pageCount,
      },
      health,
    };
  });
