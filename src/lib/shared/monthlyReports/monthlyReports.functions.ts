/**
 * Monthly Reports V1 — server functions.
 *
 * generateMonthlyReport   — builds + inserts a new monthly_report row
 * getLatestMonthlyReport  — fetches the most recent report for a tenant
 * listMonthlyReports      — lists reports (newest first)
 * updateMonthlyReportStatus — operator review: draft → ready_for_review → approved
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "crypto";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  GenerateMonthlyReportInputSchema,
  GenerateShareLinkInputSchema,
  GetLatestMonthlyReportInputSchema,
  ListMonthlyReportsInputSchema,
  RevokeShareLinkInputSchema,
  UpdateMonthlyReportStatusInputSchema,
  type MonthlyReport,
  type MonthlyReportStatus,
} from "./schemas";
import { buildMonthlyReport } from "./monthlyReportBuilder.server";
import { sendEmail, buildReportEmail } from "@/lib/shared/notifications/email.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ------------------------------------------------------------------
// Auth helpers
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
  if (data.role !== "owner" && data.role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
}

function rowToReport(r: Record<string, unknown>): MonthlyReport {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    growthGoalId: (r.growth_goal_id as string | null) ?? null,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    status: (r.status as MonthlyReportStatus) ?? "draft",
    leadSummary: (r.lead_summary ?? {}) as MonthlyReport["leadSummary"],
    goalProgressSummary: (r.goal_progress_summary ?? {}) as MonthlyReport["goalProgressSummary"],
    executionSummary: (r.execution_summary ?? {}) as MonthlyReport["executionSummary"],
    wordpressSummary: (r.wordpress_summary ?? { draftsCreated: 0, draftsPublished: 0, drafts: [] }) as MonthlyReport["wordpressSummary"],
    nextActions: Array.isArray(r.next_actions) ? r.next_actions as MonthlyReport["nextActions"] : [],
    risks: Array.isArray(r.risks) ? r.risks as MonthlyReport["risks"] : [],
    narrative: (r.narrative as string | null) ?? null,
    shareToken: (r.share_token as string | null) ?? null,
    shareTokenCreatedAt: (r.share_token_created_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ------------------------------------------------------------------
// 1. generateMonthlyReport
// ------------------------------------------------------------------

export const generateMonthlyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateMonthlyReportInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const built = await buildMonthlyReport({
      tenantId: data.tenantId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });

    const { data: row, error } = await admin
      .from("monthly_reports")
      .insert({
        tenant_id: built.tenantId,
        growth_goal_id: built.growthGoalId,
        period_start: built.periodStart,
        period_end: built.periodEnd,
        status: built.status,
        lead_summary: built.leadSummary,
        goal_progress_summary: built.goalProgressSummary,
        execution_summary: built.executionSummary,
        wordpress_summary: built.wordpressSummary,
        next_actions: built.nextActions,
        risks: built.risks,
        narrative: built.narrative,
      })
      .select("*")
      .single();
    if (error) throw error;

    return { ok: true, report: rowToReport(row as Record<string, unknown>) };
  });

// ------------------------------------------------------------------
// 2. getLatestMonthlyReport
// ------------------------------------------------------------------

export const getLatestMonthlyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetLatestMonthlyReportInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: row, error } = await admin
      .from("monthly_reports")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return { report: row ? rowToReport(row as Record<string, unknown>) : null };
  });

// ------------------------------------------------------------------
// 3. listMonthlyReports
// ------------------------------------------------------------------

export const listMonthlyReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListMonthlyReportsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await admin
      .from("monthly_reports")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("period_start", { ascending: false })
      .limit(data.limit ?? 12);
    if (error) throw error;

    return {
      reports: (rows ?? []).map((r: Record<string, unknown>) => rowToReport(r)),
    };
  });

// ------------------------------------------------------------------
// 4. updateMonthlyReportStatus
// ------------------------------------------------------------------

export const updateMonthlyReportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateMonthlyReportStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: row, error } = await admin
      .from("monthly_reports")
      .update({ status: data.status })
      .eq("id", data.reportId)
      .eq("tenant_id", data.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    return { ok: true, report: rowToReport(row as Record<string, unknown>) };
  });

// ------------------------------------------------------------------
// 5. generateMonthlyReportShareLink
// ------------------------------------------------------------------

export const generateMonthlyReportShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateShareLinkInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const token = randomBytes(16).toString("hex"); // 32-char hex

    const { data: row, error } = await admin
      .from("monthly_reports")
      .update({ share_token: token, share_token_created_at: new Date().toISOString() })
      .eq("id", data.reportId)
      .eq("tenant_id", data.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    return {
      ok: true,
      shareToken: token,
      sharePath: `/r/${token}`,
      report: rowToReport(row as Record<string, unknown>),
    };
  });

// ------------------------------------------------------------------
// 6. revokeMonthlyReportShareLink
// ------------------------------------------------------------------

export const revokeMonthlyReportShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RevokeShareLinkInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: row, error } = await admin
      .from("monthly_reports")
      .update({ share_token: null, share_token_created_at: null })
      .eq("id", data.reportId)
      .eq("tenant_id", data.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    return { ok: true, report: rowToReport(row as Record<string, unknown>) };
  });

// ------------------------------------------------------------------
// 7. getReportByShareToken  (no auth — uses service_role via supabaseAdmin)
// ------------------------------------------------------------------

export async function getReportByShareToken(
  token: string,
): Promise<MonthlyReport | null> {
  if (!token || token.length !== 32 || !/^[a-f0-9]+$/.test(token)) return null;

  const { data: row, error } = await admin
    .from("monthly_reports")
    .select(
      "id, period_start, period_end, status, lead_summary, goal_progress_summary, execution_summary, wordpress_summary, next_actions, risks, narrative, share_token, share_token_created_at, created_at, updated_at",
    )
    .eq("share_token", token)
    .maybeSingle();

  if (error || !row) return null;

  // Deliberately omit tenant_id from the returned object — never expose it on the public page.
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    tenantId: "",                                          // not exposed on public page
    growthGoalId: null,                                    // not exposed on public page
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    status: (r.status as MonthlyReportStatus) ?? "draft",
    leadSummary: (r.lead_summary ?? {}) as MonthlyReport["leadSummary"],
    goalProgressSummary: (r.goal_progress_summary ?? {}) as MonthlyReport["goalProgressSummary"],
    executionSummary: (r.execution_summary ?? {}) as MonthlyReport["executionSummary"],
    wordpressSummary: (r.wordpress_summary ?? { draftsCreated: 0, draftsPublished: 0, drafts: [] }) as MonthlyReport["wordpressSummary"],
    nextActions: Array.isArray(r.next_actions) ? r.next_actions as MonthlyReport["nextActions"] : [],
    risks: Array.isArray(r.risks) ? r.risks as MonthlyReport["risks"] : [],
    narrative: (r.narrative as string | null) ?? null,
    shareToken: r.share_token as string,
    shareTokenCreatedAt: (r.share_token_created_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ------------------------------------------------------------------
// 8. sendMonthlyReport — email the report share link to a recipient
// ------------------------------------------------------------------

export const sendMonthlyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        reportId: z.string().uuid(),
        toEmail: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Load report
    const { data: reportRow, error: rErr } = await admin
      .from("monthly_reports")
      .select("*")
      .eq("id", data.reportId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!reportRow) throw new Error("Report not found");

    // Ensure share token exists — generate if needed
    let shareToken = (reportRow.share_token as string | null) ?? null;
    if (!shareToken) {
      shareToken = randomBytes(16).toString("hex");
      await admin
        .from("monthly_reports")
        .update({ share_token: shareToken, share_token_created_at: new Date().toISOString() })
        .eq("id", data.reportId);
    }

    // Load tenant name
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("name")
      .eq("id", data.tenantId)
      .maybeSingle();
    const businessName = (tenantRow?.name as string | null) ?? "Your business";

    // Build period label
    const ps = reportRow.period_start as string;
    const pe = reportRow.period_end as string;
    const periodLabel = formatPeriodLabel(ps, pe);

    // Extract key stats from report
    const ws = (reportRow.wordpress_summary ?? {}) as Record<string, unknown>;
    const gp = (reportRow.goal_progress_summary ?? {}) as Record<string, unknown>;

    const appBaseUrl = process.env.APP_BASE_URL ?? "https://app.leadlayer.app";
    const shareUrl = `${appBaseUrl}/r/${shareToken}`;

    const emailContent = buildReportEmail({
      businessName,
      periodLabel,
      leadCount: typeof gp.actualLeads === "number" ? gp.actualLeads : 0,
      revenue: typeof gp.provenRevenue === "number" ? gp.provenRevenue : 0,
      pagesLive: typeof ws.draftsPublished === "number" ? ws.draftsPublished : 0,
      pagesOptimized: typeof ws.pagesOptimized === "number" ? ws.pagesOptimized : 0,
      shareUrl,
    });

    const result = await sendEmail({
      to: data.toEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    return {
      ok: result.ok,
      shareToken,
      shareUrl,
      error: result.error ?? null,
    };
  });

function formatPeriodLabel(start: string, end: string): string {
  try {
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    return `${s.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`;
  } catch {
    return `${start} – ${end}`;
  }
}
