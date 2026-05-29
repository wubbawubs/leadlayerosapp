/**
 * Monthly Report Builder — server-only.
 *
 * Assembles a MonthlyReport from existing data: leads, execution artifacts,
 * WordPress drafts, masterplan items, and the active growth goal.
 *
 * No LLM, no scheduling. Narrative is template-based.
 * Operator reviews and approves before client sees it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  ExecutionSummary,
  GoalProgressSummary,
  LeadSummary,
  MonthlyReport,
  MonthlyReportStatus,
  ReportNextAction,
  ReportRisk,
  WordpressSummary,
} from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

export interface BuildMonthlyReportInput {
  tenantId: string;
  growthGoalId?: string | null;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
}

export async function buildMonthlyReport(
  input: BuildMonthlyReportInput,
): Promise<Omit<MonthlyReport, "id" | "createdAt" | "updatedAt">> {
  const { tenantId, periodStart, periodEnd } = input;

  // Period timestamps for filtering (inclusive)
  const periodStartTs = `${periodStart}T00:00:00.000Z`;
  const periodEndTs = `${periodEnd}T23:59:59.999Z`;

  const [goalRow, leadRows, artifactRows, approvedArtifactRows, draftRows, publishedDraftRows, itemRows] = await Promise.all([
    // Active growth goal
    admin
      .from("growth_goals")
      .select("id, target_type, target_count, close_rate, lead_value, required_leads, timeframe_months, service_focus, locations")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: { data: unknown }) => r.data),

    // All leads in the period — include revenue fields
    admin
      .from("leads")
      .select("status, source, created_at, closed_amount, close_probability, closed_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", periodStartTs)
      .lte("created_at", periodEndTs)
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // Artifacts created in period (for artifactsCreated count)
    admin
      .from("execution_artifacts")
      .select("id, artifact_type, status, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", periodStartTs)
      .lte("created_at", periodEndTs)
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // Artifacts approved in period: status=approved AND updated_at in period
    admin
      .from("execution_artifacts")
      .select("id, artifact_type, updated_at")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .gte("updated_at", periodStartTs)
      .lte("updated_at", periodEndTs)
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // WordPress drafts created in the period
    admin
      .from("wordpress_drafts")
      .select("id, title, target_slug, wp_edit_link, published_url, status, published_at, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", periodStartTs)
      .lte("created_at", periodEndTs)
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // WordPress drafts published in the period (published_at in period, regardless of when created)
    admin
      .from("wordpress_drafts")
      .select("id, title, target_slug, published_url, published_at")
      .eq("tenant_id", tenantId)
      .not("published_at", "is", null)
      .gte("published_at", periodStartTs)
      .lte("published_at", periodEndTs)
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // Masterplan items updated in the period
    admin
      .from("masterplan_items")
      .select("id, status, updated_at")
      .eq("tenant_id", tenantId)
      .gte("updated_at", periodStartTs)
      .lte("updated_at", periodEndTs)
      .then((r: { data: unknown[] | null }) => r.data ?? []),
  ]);

  // ------------------------------------------------------------------
  // Lead summary
  // ------------------------------------------------------------------

  const leads = leadRows as Array<{
    status: string;
    source: string | null;
    created_at: string;
    closed_amount: number | null;
    close_probability: number | null;
    closed_at: string | null;
  }>;
  const statusCount: Record<string, number> = {};
  const sourceCount: Record<string, number> = {};
  let provenRevenue = 0;
  let pipelineRevenue = 0;
  let wonLeadCount = 0;
  for (const l of leads) {
    statusCount[l.status] = (statusCount[l.status] ?? 0) + 1;
    const src = l.source ?? "unknown";
    sourceCount[src] = (sourceCount[src] ?? 0) + 1;
    if (l.status === "won" && l.closed_amount != null) {
      provenRevenue += l.closed_amount;
      wonLeadCount++;
    }
    if (l.close_probability != null && l.closed_amount != null && l.status !== "won" && l.status !== "lost") {
      pipelineRevenue += l.close_probability * l.closed_amount;
    }
  }
  const leadSummary: LeadSummary = {
    total: leads.length,
    qualified: statusCount.qualified ?? 0,
    won: statusCount.won ?? 0,
    lost: statusCount.lost ?? 0,
    new: statusCount.new ?? 0,
    unqualified: statusCount.unqualified ?? 0,
    sources: sourceCount,
  };

  // ------------------------------------------------------------------
  // Goal progress summary
  // ------------------------------------------------------------------

  const goal = goalRow as Record<string, unknown> | null;
  let requiredLeadsPerMonth: number | null = null;
  if (goal?.required_leads != null && goal?.timeframe_months != null) {
    requiredLeadsPerMonth = Math.ceil(
      Number(goal.required_leads) / Number(goal.timeframe_months),
    );
  }
  const actualLeads = leads.length;
  const gap = requiredLeadsPerMonth != null ? requiredLeadsPerMonth - actualLeads : null;
  const onTrack = gap != null ? gap <= 0 : false;
  const paceNote = buildPaceNote(actualLeads, requiredLeadsPerMonth, periodStart, periodEnd);

  const goalProgressSummary: GoalProgressSummary = {
    requiredLeadsPerMonth,
    actualLeads,
    gap,
    onTrack,
    paceNote,
    wonLeadCount,
    provenRevenue,
    pipelineRevenue: pipelineRevenue > 0 ? pipelineRevenue : null,
  };

  // ------------------------------------------------------------------
  // Execution summary
  // ------------------------------------------------------------------

  // artifactRows = created in period (clean created_at BETWEEN filter)
  const artifactsGenerated = (artifactRows as Array<{ id: string }>).length;
  // approvedArtifactRows = status=approved AND updated_at in period (approved this period)
  const artifactsApproved = (approvedArtifactRows as Array<{ id: string }>).length;

  const items = itemRows as Array<{ id: string; status: string; updated_at: string }>;
  const masterplanItemsDone = items.filter((i) => i.status === "done").length;
  const masterplanItemsInProgress = items.filter((i) => i.status === "in_progress").length;

  const executionSummary: ExecutionSummary = {
    artifactsGenerated,
    artifactsApproved,
    masterplanItemsDone,
    masterplanItemsInProgress,
  };

  // ------------------------------------------------------------------
  // WordPress summary
  // ------------------------------------------------------------------

  const drafts = draftRows as Array<{
    id: string;
    title: string | null;
    target_slug: string | null;
    wp_edit_link: string | null;
    published_url: string | null;
    status: string;
    published_at: string | null;
    created_at: string;
  }>;
  const publishedDrafts = publishedDraftRows as Array<{ id: string; title: string | null }>;
  const wordpressSummary: WordpressSummary = {
    draftsCreated: drafts.length,
    draftsPublished: publishedDrafts.length,
    drafts: drafts.map((d) => ({
      title: d.title,
      targetSlug: d.target_slug,
      wpEditLink: d.wp_edit_link,
      publishedUrl: d.published_url,
      status: d.status,
      publishedAt: d.published_at,
    })),
  };

  // ------------------------------------------------------------------
  // Next actions (deterministic from data)
  // ------------------------------------------------------------------

  const nextActions: ReportNextAction[] = [];

  if (actualLeads === 0) {
    nextActions.push({
      label: "Log your first lead",
      reason: "No leads were recorded this period. Start tracking manually in the Lead Inbox.",
      href: "/growth/leads",
      priority: "high",
    });
  } else if (gap != null && gap > 0) {
    nextActions.push({
      label: `Close the lead gap (${gap} leads behind target)`,
      reason: `${actualLeads} leads logged vs ${requiredLeadsPerMonth ?? "?"} required. Increase outreach or improve conversion.`,
      href: "/growth/leads",
      priority: "high",
    });
  }

  if (artifactsApproved > 0 && drafts.length === 0) {
    nextActions.push({
      label: "Create WordPress drafts for approved page briefs",
      reason: `${artifactsApproved} artifact(s) approved this period but no WordPress drafts created yet.`,
      href: "/growth/execution",
      priority: "high",
    });
  }

  const unpublishedDraftCount = drafts.filter((d) => d.status !== "published").length;
  if (unpublishedDraftCount > 0) {
    nextActions.push({
      label: "Publish pending WordPress drafts",
      reason: `${unpublishedDraftCount} draft${unpublishedDraftCount !== 1 ? "s" : ""} created this period but not yet marked published — review in WordPress admin, then mark as published in LeadLayer.`,
      href: "/growth/execution",
      priority: "medium",
    });
  }

  if (artifactsApproved === 0) {
    nextActions.push({
      label: "Approve page briefs for delivery",
      reason: "No page briefs were approved this period. Review generated briefs in the execution board.",
      href: "/growth/execution",
      priority: "medium",
    });
  }

  nextActions.push({
    label: "Plan next month execution items",
    reason: "Review the masterplan and approve the highest-priority items for next month.",
    href: "/growth/masterplan",
    priority: "low",
  });

  // ------------------------------------------------------------------
  // Risks
  // ------------------------------------------------------------------

  const risks: ReportRisk[] = [];

  if (actualLeads === 0) {
    risks.push({
      key: "no_leads",
      label: "No leads tracked",
      severity: "high",
      description: "No leads were logged this period. Without lead data there is no proof of progress to show the client.",
    });
  } else if (gap != null && gap > 2) {
    risks.push({
      key: "lead_gap",
      label: "Lead gap is growing",
      severity: "medium",
      description: `Currently ${gap} lead(s) behind the monthly target. If this continues the goal will not be met.`,
    });
  }

  if (drafts.length === 0 && artifactsApproved === 0) {
    risks.push({
      key: "no_delivery",
      label: "No pages delivered this period",
      severity: "medium",
      description: "No WordPress drafts or approved page briefs this period — the client has nothing tangible to review.",
    });
  }

  // ------------------------------------------------------------------
  // Narrative (template-based, operator editable)
  // ------------------------------------------------------------------

  const narrative = buildNarrative({
    periodStart,
    periodEnd,
    leadSummary,
    goalProgressSummary,
    executionSummary,
    wordpressSummary,
    goal,
  });

  return {
    tenantId,
    growthGoalId: (goal?.id as string | null) ?? input.growthGoalId ?? null,
    periodStart,
    periodEnd,
    status: "draft" as MonthlyReportStatus,
    leadSummary,
    goalProgressSummary,
    executionSummary,
    wordpressSummary,
    nextActions,
    risks,
    narrative,
    shareToken: null,
    shareTokenCreatedAt: null,
  };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function buildPaceNote(
  actual: number,
  required: number | null,
  periodStart: string,
  periodEnd: string,
): string {
  if (required == null) return "No lead target set — configure the growth goal to enable pacing.";
  if (actual === 0) return `0 of ${required} leads required this month. Start logging leads from the Lead Inbox.`;
  const pct = Math.round((actual / required) * 100);
  if (pct >= 100) return `On track — ${actual} leads logged (${pct}% of ${required} monthly target).`;
  if (pct >= 70) return `Near target — ${actual} of ${required} leads (${pct}%). Keep going.`;
  return `Behind — ${actual} of ${required} leads (${pct}%). ${required - actual} more needed by ${periodEnd}.`;
}

function buildNarrative(args: {
  periodStart: string;
  periodEnd: string;
  leadSummary: LeadSummary;
  goalProgressSummary: GoalProgressSummary;
  executionSummary: ExecutionSummary;
  wordpressSummary: WordpressSummary;
  goal: Record<string, unknown> | null;
}): string {
  const { periodStart, periodEnd, leadSummary, goalProgressSummary, executionSummary, wordpressSummary } = args;
  const startLabel = formatDate(periodStart);
  const endLabel = formatDate(periodEnd);

  const lines: string[] = [];
  lines.push(`## Monthly Progress Report: ${startLabel} – ${endLabel}`);
  lines.push("");
  lines.push("### Lead Activity");

  if (leadSummary.total === 0) {
    lines.push("No leads were logged this period. If leads came in via phone or form, log them manually in the Lead Inbox so we can track progress accurately.");
  } else {
    lines.push(
      `${leadSummary.total} lead${leadSummary.total !== 1 ? "s" : ""} recorded this period` +
      (leadSummary.qualified > 0 ? `, of which ${leadSummary.qualified} qualified` : "") +
      (leadSummary.won > 0 ? ` and ${leadSummary.won} won` : "") + ".",
    );
  }

  lines.push("");
  lines.push("### Goal Progress");
  lines.push(goalProgressSummary.paceNote);

  if (executionSummary.artifactsApproved > 0 || wordpressSummary.draftsCreated > 0 || wordpressSummary.draftsPublished > 0) {
    lines.push("");
    lines.push("### Delivery");
    if (executionSummary.artifactsApproved > 0) {
      lines.push(`${executionSummary.artifactsApproved} page brief${executionSummary.artifactsApproved !== 1 ? "s" : ""} approved.`);
    }
    if (wordpressSummary.draftsPublished > 0) {
      lines.push(`${wordpressSummary.draftsPublished} page${wordpressSummary.draftsPublished !== 1 ? "s" : ""} published live.`);
    }
    if (wordpressSummary.draftsCreated > 0) {
      const pending = wordpressSummary.drafts.filter((d) => d.status !== "published").length;
      if (pending > 0) {
        const titles = wordpressSummary.drafts
          .filter((d) => d.status !== "published")
          .map((d) => d.title ?? d.targetSlug ?? "Untitled")
          .slice(0, 3)
          .join(", ");
        lines.push(`${pending} WordPress draft${pending !== 1 ? "s" : ""} awaiting publish: ${titles}.`);
      }
    }
  }

  if (goalProgressSummary.provenRevenue > 0) {
    lines.push("");
    lines.push("### Recorded Revenue");
    lines.push(
      `€${goalProgressSummary.provenRevenue.toLocaleString()} recorded closed revenue from ${goalProgressSummary.wonLeadCount} won lead${goalProgressSummary.wonLeadCount !== 1 ? "s" : ""} this period.`,
    );
  }

  lines.push("");
  lines.push("### Next Steps");
  lines.push(
    "See the Next Actions section below for priorities. " +
    "This report is a draft — review and update the narrative before sharing with the client.",
  );

  return lines.join("\n");
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "long", year: "numeric", day: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
}
