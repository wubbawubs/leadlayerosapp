/**
 * Authenticated client dashboard functions.
 *
 * Operators invite clients by email → Supabase sends magic link → client logs in → /client
 * All mutations go through service_role to bypass RLS (leads write requires operator+).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, buildClientInviteEmail } from "@/lib/shared/notifications/email.server";
import { assembleClientData } from "./clientPortal.functions";
import type { ClientPortalData } from "./clientPortal.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

const APP_BASE_URL =
  typeof process !== "undefined"
    ? (process.env.APP_BASE_URL ?? "http://localhost:8080")
    : "http://localhost:8080";

// ------------------------------------------------------------------
// Guards
// ------------------------------------------------------------------

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

async function getClientTenantId(userId: string): Promise<string | null> {
  const { data } = await admin
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .in("role", ["client_viewer", "client_approver"])
    .limit(1)
    .maybeSingle();
  return (data?.tenant_id as string | null) ?? null;
}

// ------------------------------------------------------------------
// 1. inviteClientToTenant (operator only)
// ------------------------------------------------------------------

export const inviteClientToTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["client_viewer", "client_approver"]).default("client_viewer"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // 1. Find or create the auth user (confirmed, random password —
    //    they set their own via the invite link).
    let invitedUserId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { display_name: data.email.split("@")[0] },
    });
    if (createErr) {
      // Already registered → look the user up so re-inviting just resends the link
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = (list?.users ?? []).find(
        (u: { email?: string }) => u.email?.toLowerCase() === data.email.toLowerCase(),
      );
      if (!existing) throw new Error(createErr.message);
      invitedUserId = existing.id as string;
    } else {
      invitedUserId = created.user.id as string;
    }

    // 2. Membership — client can log in as soon as they set a password
    const { error: memErr } = await admin
      .from("memberships")
      .upsert(
        { user_id: invitedUserId, tenant_id: data.tenantId, role: data.role },
        { onConflict: "user_id,tenant_id" },
      );
    if (memErr) throw new Error(memErr.message);

    // 3. Set-password link (recovery flow → /reset-password handles it)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
      options: { redirectTo: `${APP_BASE_URL}/reset-password` },
    });
    if (linkErr) throw new Error(linkErr.message);
    const inviteUrl = linkData.properties?.action_link as string;

    // 4. Branded invite email in the tenant's language via Resend.
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("name, geo")
      .eq("id", data.tenantId)
      .maybeSingle();
    const businessName = (tenantRow?.name as string | null) ?? "your business";
    const locale = tenantRow?.geo === "NL" ? ("nl" as const) : ("en" as const);

    const emailContent = buildClientInviteEmail({ businessName, inviteUrl, locale });
    const sendResult = await sendEmail({
      to: data.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    // Resend not configured (e.g. fresh env) → fall back to Supabase's built-in invite mail
    if (!sendResult.ok) {
      const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo: `${APP_BASE_URL}/reset-password`,
      });
      if (inviteErr) {
        throw new Error(`Invite email failed: ${sendResult.error ?? inviteErr.message}`);
      }
    }

    return { ok: true, email: data.email, userId: invitedUserId };
  });

// ------------------------------------------------------------------
// 2. listClientMembers (operator only)
// ------------------------------------------------------------------

export interface ClientMember {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: "client_viewer" | "client_approver";
  createdAt: string;
}

export const listClientMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Two queries — memberships has no FK to profiles, so PostgREST can't embed it.
    const { data: rows, error } = await admin
      .from("memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", data.tenantId)
      .in("role", ["client_viewer", "client_approver"])
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id);
    const { data: profileRows } = userIds.length
      ? await admin.from("profiles").select("id, email, display_name").in("id", userIds)
      : { data: [] };
    const profileById = new Map(
      (
        (profileRows ?? []) as Array<{
          id: string;
          email: string | null;
          display_name: string | null;
        }>
      ).map((pr) => [pr.id, pr]),
    );

    const members: ClientMember[] = (rows ?? []).map(
      (r: { user_id: string; role: string; created_at: string }) => ({
        userId: r.user_id,
        email: profileById.get(r.user_id)?.email ?? null,
        displayName: profileById.get(r.user_id)?.display_name ?? null,
        role: r.role as "client_viewer" | "client_approver",
        createdAt: r.created_at,
      }),
    );

    return { members };
  });

// ------------------------------------------------------------------
// 3. revokeClientAccess (operator only)
// ------------------------------------------------------------------

export const revokeClientAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tenantId: z.string().uuid(), userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Safety: never revoke an owner/operator via this path
    const { data: target } = await admin
      .from("memberships")
      .select("role")
      .eq("user_id", data.userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();

    if (!target) throw new Error("Member not found");
    if (target.role === "owner" || target.role === "operator") {
      throw new Error("Cannot revoke operator access via this function");
    }

    const { error } = await admin
      .from("memberships")
      .delete()
      .eq("user_id", data.userId)
      .eq("tenant_id", data.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------
// 4. getMyClientDashboard (authenticated — client role only)
// ------------------------------------------------------------------

export const getMyClientDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const tenantId = await getClientTenantId(userId);
    if (!tenantId) throw new Error("No client access found for this account");

    const data = await assembleClientData(tenantId);
    if (!data) throw new Error("Could not load dashboard data");

    return { data, tenantId };
  });

// ------------------------------------------------------------------
// 4b. getMyClientAnalytics — pixel-powered traffic + CTA analytics
// ------------------------------------------------------------------

export interface ClientAnalytics {
  rangeDays: number;
  trend: { date: string; pageviews: number; conversions: number }[];
  ctas: {
    cta: string;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    conversionRate: number;
  }[];
  sources: { source: string; conversions: number }[];
  totals: { pageviews: number; sessions: number; conversions: number; conversionRate: number };
}

export const getMyClientAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(1).max(365).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const tenantId = await getClientTenantId(userId);
    if (!tenantId) throw new Error("No client access");

    const { data: analytics, error } = await admin.rpc("get_tenant_analytics", {
      _tenant_id: tenantId,
      _days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);

    return { analytics: analytics as ClientAnalytics };
  });

// ------------------------------------------------------------------
// 4c. getMyClientStrategy — SEO & Strategy proof-of-work
// ------------------------------------------------------------------

export interface ClientStrategy {
  summary: string | null;
  roadmap: {
    title: string;
    description: string | null;
    status: "planned" | "in_progress" | "done";
  }[];
  coverage: { name: string; volume: number | null; priority: string | null }[];
}

const ROADMAP_STATUS: Record<string, "planned" | "in_progress" | "done"> = {
  proposed: "planned",
  approved: "planned",
  in_progress: "in_progress",
  done: "done",
};

export const getMyClientStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const tenantId = await getClientTenantId(userId);
    if (!tenantId) throw new Error("No client access");

    const [planRes, itemRes, clusterRes] = await Promise.all([
      admin
        .from("master_plans")
        .select("strategy_summary, summary")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("masterplan_items")
        .select("title, description, status")
        .eq("tenant_id", tenantId)
        .neq("status", "skipped")
        .limit(20),
      admin
        .from("market_demand_clusters")
        .select("cluster_name, total_volume, priority")
        .eq("tenant_id", tenantId)
        .order("total_volume", { ascending: false })
        .limit(6),
    ]);

    const summary =
      (planRes.data?.strategy_summary as string | null) ??
      (planRes.data?.summary as string | null) ??
      null;

    // Order: in progress → planned → done (active work first)
    const order = { in_progress: 0, planned: 1, done: 2 } as const;
    const roadmap = ((itemRes.data ?? []) as Array<Record<string, unknown>>)
      .map((r) => ({
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        status: ROADMAP_STATUS[r.status as string] ?? "planned",
      }))
      .sort((a, b) => order[a.status] - order[b.status])
      .slice(0, 12);

    const coverage = ((clusterRes.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
      name: c.cluster_name as string,
      volume: (c.total_volume as number | null) ?? null,
      priority: (c.priority as string | null) ?? null,
    }));

    return { strategy: { summary, roadmap, coverage } as ClientStrategy };
  });

// ------------------------------------------------------------------
// 5. markLeadWonAsClient (authenticated — client role)
// ------------------------------------------------------------------

export const markLeadWonAsClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        closedAmount: z.number().nonnegative(),
        wonNotes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const tenantId = await getClientTenantId(userId);
    if (!tenantId) throw new Error("No client access");

    // Verify lead belongs to this tenant
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, status, tenant_id")
      .eq("id", data.leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) throw new Error("Lead not found");

    // Update via admin (RLS requires operator+ for lead writes)
    const { error } = await admin
      .from("leads")
      .update({
        status: "won",
        closed_amount: data.closedAmount,
        closed_at: new Date().toISOString(),
        won_notes: data.wonNotes ?? null,
      })
      .eq("id", data.leadId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);

    await admin.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: data.leadId,
      event_type: "marked_won_by_client",
      payload: {
        via: "client_dashboard",
        closed_amount: data.closedAmount,
        won_notes: data.wonNotes ?? null,
      },
    });

    return { ok: true };
  });

// ------------------------------------------------------------------
// 6. dismissLeadAsClient (authenticated — client marks own lead as lost)
// ------------------------------------------------------------------

export const dismissLeadAsClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const tenantId = await getClientTenantId(userId);
    if (!tenantId) throw new Error("No client access");

    const { data: lead } = await admin
      .from("leads")
      .select("id, status, tenant_id")
      .eq("id", data.leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!lead) throw new Error("Lead not found");

    const { error } = await admin
      .from("leads")
      .update({ status: "lost" })
      .eq("id", data.leadId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

// Re-export types needed by client routes
export type { ClientPortalData };
