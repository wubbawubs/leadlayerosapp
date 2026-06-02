/**
 * Client Portal — operator management + public data + client mutations.
 *
 * Security model: token-in-URL, same as monthly_reports.share_token.
 *   - generateClientPortalToken / revokeClientPortalToken: operator-only
 *   - getClientPortalData: public, service_role lookup by token
 *   - markLeadWonFromPortal: public mutation — client enters their own revenue
 *
 * Never expose: tenant_id, internal IDs, risk flags, WP credentials,
 * execution artifact states, operator notes, or pipeline internals.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "crypto";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ------------------------------------------------------------------
// Auth helpers (operator-side functions)
// ------------------------------------------------------------------

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
  if (data.role !== "owner" && data.role !== "operator") throw new Error("Forbidden");
}

/** Resolves tenantId from a portal token. Used by all public portal endpoints. */
async function resolveTenantFromToken(token: string): Promise<string | null> {
  if (!token || token.length !== 40 || !/^[a-f0-9]+$/.test(token)) return null;
  const { data } = await admin
    .from("tenants")
    .select("id")
    .eq("portal_token", token)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

// ------------------------------------------------------------------
// Client-safe types — no internal IDs, no flags, no operator fields
// ------------------------------------------------------------------

export interface ClientPortalLead {
  id: string; // needed for markLeadWon target, never shown in UI as UUID
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: "new" | "qualified" | "won" | "lost" | "junk";
  closedAmount: number | null;
  wonNotes: string | null;
  createdAt: string;
}

export interface ClientPortalPage {
  title: string;
  url: string;
  publishedAt: string;
  type: "new_page" | "optimized";
}

export interface ClientPortalReport {
  periodLabel: string;
  leadCount: number;
  revenue: number;
  pagesPublished: number;
  pagesOptimized: number;
  shareToken: string | null;
}

export interface ClientPortalActivity {
  type: "page_published" | "lead_received" | "report_ready" | "page_optimized";
  label: string;
  detail: string | null;
  date: string;
}

export interface ClientPortalData {
  businessName: string;

  goal: {
    title: string | null;
    targetCount: number | null;
    actualLeads: number;
    progressPercent: number;
    status: "on_track" | "behind" | "ahead" | "complete" | "no_goal" | "no_data";
    daysRemaining: number | null;
  } | null;

  stats: {
    leadsThisMonth: number;
    leadsWon: number;
    provenRevenue: number;
    pagesLive: number;
    pagesOptimized: number;
  };

  /** Recent activity feed — what happened, newest first, max 15 */
  recentActivity: ClientPortalActivity[];

  /** Full leads list — named, client's own data */
  leads: ClientPortalLead[];

  /** All delivered pages with live URLs */
  pages: ClientPortalPage[];

  /** All approved monthly reports */
  reports: ClientPortalReport[];

  /** Selected actions from the latest approved execution plan */
  nextMonthFocus: string[];

  portalCreatedAt: string | null;
}

// ------------------------------------------------------------------
// 1. generateClientPortalToken (operator only)
// ------------------------------------------------------------------

export const generateClientPortalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const token = randomBytes(20).toString("hex"); // 40-char hex

    const { error } = await admin
      .from("tenants")
      .update({
        portal_token: token,
        portal_token_created_at: new Date().toISOString(),
      })
      .eq("id", data.tenantId);
    if (error) throw error;

    return { ok: true, portalToken: token, portalPath: `/portal/${token}` };
  });

// ------------------------------------------------------------------
// 2. revokeClientPortalToken (operator only)
// ------------------------------------------------------------------

export const revokeClientPortalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { error } = await admin
      .from("tenants")
      .update({ portal_token: null, portal_token_created_at: null })
      .eq("id", data.tenantId);
    if (error) throw error;

    return { ok: true };
  });

// ------------------------------------------------------------------
// 3. getClientPortalInfo (operator — reads token status for Settings UI)
// ------------------------------------------------------------------

export const getClientPortalInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden");

    const { data: row } = await admin
      .from("tenants")
      .select("portal_token, portal_token_created_at")
      .eq("id", data.tenantId)
      .maybeSingle();

    return {
      portalToken: (row?.portal_token as string | null) ?? null,
      portalCreatedAt: (row?.portal_token_created_at as string | null) ?? null,
    };
  });

// ------------------------------------------------------------------
// 4. markLeadWonFromPortal (PUBLIC — client marks their own lead as won)
// ------------------------------------------------------------------

export const markLeadWonFromPortal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        portalToken: z.string().min(1).max(64),
        leadId: z.string().uuid(),
        closedAmount: z.number().nonnegative(),
        wonNotes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const tenantId = await resolveTenantFromToken(data.portalToken);
    if (!tenantId) throw new Error("Invalid portal link");

    // Verify lead belongs to this tenant
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, status")
      .eq("id", data.leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) throw new Error("Lead not found");

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
    if (error) throw error;

    // Audit trail — distinguishes client-entered from operator-entered revenue
    await admin.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: data.leadId,
      event_type: "marked_won_by_client",
      payload: {
        via: "client_portal",
        closed_amount: data.closedAmount,
        won_notes: data.wonNotes ?? null,
      },
    });

    return { ok: true };
  });

// ------------------------------------------------------------------
// 5. getClientPortalData (PUBLIC — no auth, service_role lookup by token)
// ------------------------------------------------------------------

export async function getClientPortalData(
  token: string,
): Promise<ClientPortalData | null> {
  const tenantId = await resolveTenantFromToken(token);
  if (!tenantId) return null;

  // Load business name + portal created_at
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("name, portal_token_created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenantRow) return null;

  const businessName = (tenantRow.name as string) || "Your business";
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  // All data in parallel
  const [
    goalRes,
    allLeadRes,
    monthLeadRes,
    draftRes,
    updateRes,
    reportRes,
    planRes,
  ] = await Promise.all([
    admin
      .from("growth_goals")
      .select("id, title, target_count, timeframe_months, required_leads, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("leads")
      .select("id, name, phone, email, source, status, closed_amount, won_notes, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("leads")
      .select("status, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", periodStart),
    admin
      .from("wordpress_drafts")
      .select("title, published_url, published_at, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .not("published_url", "is", null)
      .order("published_at", { ascending: false }),
    admin
      .from("wordpress_page_updates")
      .select("wp_post_id, applied_at, raw_response")
      .eq("tenant_id", tenantId)
      .eq("status", "applied")
      .order("applied_at", { ascending: false }),
    admin
      .from("monthly_reports")
      .select("period_start, period_end, status, lead_summary, goal_progress_summary, wordpress_summary, share_token, updated_at")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .order("period_start", { ascending: false })
      .limit(24),
    admin
      .from("monthly_execution_plans")
      .select("selected_actions, status")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .order("period_start", { ascending: false })
      .limit(1),
  ]);

  // ------------------------------------------------------------------
  // Leads
  // ------------------------------------------------------------------
  type LeadRow = { id: string; name: string | null; phone: string | null; email: string | null; source: string | null; status: string; closed_amount: number | null; won_notes: string | null; created_at: string };
  const allLeads = (allLeadRes.data ?? []) as LeadRow[];
  const monthLeads = (monthLeadRes.data ?? []) as Array<{ status: string; created_at: string }>;

  const leads: ClientPortalLead[] = allLeads.map((l) => ({
    id: l.id,
    name: l.name ?? null,
    phone: l.phone ?? null,
    email: l.email ?? null,
    source: l.source ?? null,
    status: (l.status ?? "new") as ClientPortalLead["status"],
    closedAmount: l.closed_amount ?? null,
    wonNotes: l.won_notes ?? null,
    createdAt: l.created_at,
  }));

  const leadsWon = allLeads.filter((l) => l.status === "won").length;
  const provenRevenue = allLeads
    .filter((l) => l.status === "won")
    .reduce((s, l) => s + (l.closed_amount ?? 0), 0);
  const leadsThisMonth = monthLeads.filter((l) =>
    ["new", "qualified", "won"].includes(l.status),
  ).length;

  // ------------------------------------------------------------------
  // Pages
  // ------------------------------------------------------------------
  type DraftRow = { title: string | null; published_url: string | null; published_at: string | null; created_at: string };
  type UpdateRow = { wp_post_id: number; applied_at: string | null; raw_response: Record<string, unknown> | null };
  const drafts = (draftRes.data ?? []) as DraftRow[];
  const updates = (updateRes.data ?? []) as UpdateRow[];

  const pages: ClientPortalPage[] = [
    ...drafts.map((d) => ({
      title: d.title ?? "Untitled page",
      url: d.published_url!,
      publishedAt: d.published_at ?? d.created_at,
      type: "new_page" as const,
    })),
    ...updates.map((u) => {
      const raw = u.raw_response ?? {};
      const titleRaw = raw.title as Record<string, unknown> | string | null | undefined;
      const title =
        typeof titleRaw === "object" && titleRaw !== null
          ? String((titleRaw as Record<string, unknown>).rendered ?? "Optimized page")
          : typeof titleRaw === "string"
            ? titleRaw
            : "Optimized page";
      return {
        title,
        url: typeof raw.link === "string" ? raw.link : "",
        publishedAt: u.applied_at ?? "",
        type: "optimized" as const,
      };
    }),
  ]
    .filter((p) => p.url)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // ------------------------------------------------------------------
  // Reports
  // ------------------------------------------------------------------
  type ReportRow = { period_start: string; period_end: string; lead_summary: Record<string, unknown> | null; goal_progress_summary: Record<string, unknown> | null; wordpress_summary: Record<string, unknown> | null; share_token: string | null; updated_at: string };
  const reportRows = (reportRes.data ?? []) as ReportRow[];

  const reports: ClientPortalReport[] = reportRows.map((r) => {
    const ls = r.lead_summary ?? {};
    const gs = r.goal_progress_summary ?? {};
    const ws = r.wordpress_summary ?? {};
    return {
      periodLabel: formatPeriodLabel(r.period_start, r.period_end),
      leadCount: Number(ls.total ?? 0),
      revenue: Number(gs.provenRevenue ?? 0),
      pagesPublished: Number(ws.draftsPublished ?? 0),
      pagesOptimized: Number(ws.pagesOptimized ?? 0),
      shareToken: (r.share_token as string | null) ?? null,
    };
  });

  // ------------------------------------------------------------------
  // Goal progress
  // ------------------------------------------------------------------
  const goal = (goalRes.data ?? [])[0] ?? null;
  let goalData: ClientPortalData["goal"] = null;

  if (goal) {
    const requiredLeads = (goal.required_leads as number | null) ?? 0;
    const startMs = new Date(goal.created_at as string).getTime();
    const totalDays = goal.timeframe_months ? Math.round((goal.timeframe_months as number) * 30.4) : 0;
    const deadline = totalDays ? new Date(startMs + totalDays * 86_400_000) : null;
    const daysRemaining = deadline ? Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 86_400_000)) : null;
    const daysElapsed = Math.max(0, Math.floor((Date.now() - startMs) / 86_400_000));

    const actualLeads = allLeads.filter((l) => {
      const t = new Date(l.created_at).getTime();
      return t >= startMs && ["new", "qualified", "won"].includes(l.status);
    }).length;

    const progressPercent = requiredLeads > 0 ? Math.min(100, Math.round((actualLeads / requiredLeads) * 100)) : 0;
    const paceRequired = totalDays > 0 && requiredLeads > 0 ? Math.round((requiredLeads * daysElapsed) / totalDays) : 0;
    const gap = paceRequired - actualLeads;

    let status: "on_track" | "behind" | "ahead" | "complete" | "no_goal" | "no_data" = "no_data";
    if (actualLeads > 0 || daysElapsed > 0) {
      if (requiredLeads > 0 && actualLeads >= requiredLeads) status = "complete";
      else if (gap <= -1) status = "ahead";
      else if (gap >= 1) status = "behind";
      else status = "on_track";
    }

    goalData = {
      title: (goal.title as string | null) ?? null,
      targetCount: (goal.target_count as number | null) ?? null,
      actualLeads,
      progressPercent,
      status,
      daysRemaining,
    };
  }

  // ------------------------------------------------------------------
  // Recent activity feed (newest first, max 15)
  // ------------------------------------------------------------------
  const activity: ClientPortalActivity[] = [];

  for (const d of drafts.slice(0, 5)) {
    activity.push({
      type: "page_published",
      label: `New page published`,
      detail: d.title ?? null,
      date: d.published_at ?? d.created_at,
    });
  }
  for (const u of updates.slice(0, 3)) {
    const raw = u.raw_response ?? {};
    const titleRaw = raw.title as Record<string, unknown> | string | null | undefined;
    const title =
      typeof titleRaw === "object" && titleRaw !== null
        ? String((titleRaw as Record<string, unknown>).rendered ?? null)
        : typeof titleRaw === "string" ? titleRaw : null;
    activity.push({
      type: "page_optimized",
      label: "Page optimized",
      detail: title,
      date: u.applied_at ?? "",
    });
  }
  // Recent leads (last 30 days)
  const recentLeads = allLeads.filter((l) => new Date(l.created_at) >= new Date(thirtyDaysAgo));
  for (const l of recentLeads.slice(0, 5)) {
    activity.push({
      type: "lead_received",
      label: l.name ? `Lead: ${l.name}` : "New lead received",
      detail: l.source ?? null,
      date: l.created_at,
    });
  }
  for (const r of reportRows.slice(0, 2)) {
    activity.push({
      type: "report_ready",
      label: `Monthly report ready`,
      detail: formatPeriodLabel(r.period_start, r.period_end),
      date: r.updated_at,
    });
  }

  const recentActivity = activity
    .filter((a) => a.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 15);

  // ------------------------------------------------------------------
  // Next month focus
  // ------------------------------------------------------------------
  const plan = (planRes.data ?? [])[0] ?? null;
  const nextMonthFocus: string[] = [];
  if (plan) {
    const actions = Array.isArray(plan.selected_actions) ? plan.selected_actions : [];
    for (const a of actions as Array<Record<string, unknown>>) {
      if (typeof a.label === "string") nextMonthFocus.push(a.label);
    }
  }

  return {
    businessName,
    goal: goalData,
    stats: {
      leadsThisMonth,
      leadsWon,
      provenRevenue,
      pagesLive: drafts.length,
      pagesOptimized: updates.length,
    },
    recentActivity,
    leads,
    pages,
    reports,
    nextMonthFocus: nextMonthFocus.slice(0, 5),
    portalCreatedAt: (tenantRow.portal_token_created_at as string | null) ?? null,
  };
}

function formatPeriodLabel(start: string, end: string): string {
  try {
    const s = new Date(`${start}T00:00:00Z`);
    return s.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  } catch {
    return `${start} – ${end}`;
  }
}
