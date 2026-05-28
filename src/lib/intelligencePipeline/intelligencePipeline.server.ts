/**
 * Intelligence Pipeline Orchestrator V1 — server-only engine.
 *
 * Server-only. Callers MUST verify operator/owner role before invoking.
 * Uses supabaseAdmin to read/write across modules.
 *
 * V1 strategy:
 *   - For each stage, detect existing artifacts and mark complete/partial.
 *   - For cheap/local stages (audit, page intel, BP, tone, snapshot,
 *     masterplan), trigger them if missing.
 *   - For expensive external-API stages (market scan, competitor scan),
 *     mark `skipped_needs_context` if missing — operator runs the module
 *     button. Run still continues fail-soft.
 *
 * See: docs/INTELLIGENCE_PIPELINE_ORCHESTRATOR_V1.md
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  emptyStagesMap,
  INTELLIGENCE_STAGE_KEYS,
  STALE_DEPENDENCY_MAP,
  type IntelligenceRun,
  type IntelligenceRunStatus,
  type IntelligenceStageKey,
  type IntelligenceStageState,
  type IntelligenceStageStatus,
  type IntelligenceStagesMap,
  type IntelligenceTriggeredBy,
  type StartIntelligenceRunInput,
} from "@/lib/shared/intelligencePipeline/schemas";
import { runAudit } from "@/lib/shared/audits/runner.server";
import { analyzePageIntelligenceForAudit } from "@/lib/shared/pageIntelligence/analyzer.server";
import { runAnalyzerJob } from "@/lib/shared/businessProfile/runAnalyzerJob.server";
import { analyzeToneProfileForTenant } from "@/lib/shared/tone/analyzer.server";
import { buildGrowthIntelligenceSnapshot } from "@/lib/growthIntelligence/buildGrowthIntelligenceSnapshot.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRun(row: any): IntelligenceRun {
  const stages = (row.stages ?? {}) as Partial<IntelligenceStagesMap>;
  const fullStages = emptyStagesMap();
  for (const key of INTELLIGENCE_STAGE_KEYS) {
    if (stages[key]) fullStages[key] = stages[key] as IntelligenceStageState;
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id ?? null,
    growthGoalId: row.growth_goal_id ?? null,
    status: row.status as IntelligenceRunStatus,
    currentStage: (row.current_stage ?? null) as IntelligenceStageKey | null,
    triggeredBy: (row.triggered_by ?? "operator") as IntelligenceTriggeredBy,
    triggerReason: row.trigger_reason ?? null,
    stages: fullStages,
    inputHash: (row.input_hash ?? {}) as { [key: string]: import("@/lib/shared/intelligencePipeline/schemas").JsonValue },
    outputRefs: (row.output_refs ?? {}) as { [key: string]: import("@/lib/shared/intelligencePipeline/schemas").JsonValue },
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    failedAt: row.failed_at ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function persistStage(
  runId: string,
  key: IntelligenceStageKey,
  patch: Partial<IntelligenceStageState>,
): Promise<void> {
  const { data: row } = await admin
    .from("intelligence_runs")
    .select("stages")
    .eq("id", runId)
    .maybeSingle();
  const stages = (row?.stages ?? {}) as IntelligenceStagesMap;
  const prev = stages[key] ?? { key, status: "not_started" as IntelligenceStageStatus };
  const next: IntelligenceStageState = { ...prev, ...patch, key };
  await admin
    .from("intelligence_runs")
    .update({ stages: { ...stages, [key]: next }, current_stage: key })
    .eq("id", runId);
}

const TERMINAL_STAGE_STATUSES = new Set<IntelligenceStageStatus>([
  "complete",
  "partial",
  "failed",
  "skipped_needs_context",
  "blocked_dependency",
]);

function asPositiveNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function completeStageMeetsMinimum(
  key: IntelligenceStageKey,
  stage: IntelligenceStageState,
): boolean {
  if (stage.status !== "complete") return true;
  const outputs = stage.outputs ?? {};
  switch (key) {
    case "site_audit":
      return typeof outputs.auditId === "string" && asPositiveNumber(outputs.pagesCount) > 0;
    case "page_intelligence":
      return asPositiveNumber(outputs.pagesClassified) > 0;
    case "business_profile_draft":
      return typeof outputs.businessProfileId === "string" && outputs.profileStatus === "approved";
    case "tone_profile_draft":
      return typeof outputs.toneProfileId === "string" && asPositiveNumber(outputs.confidenceScore) > 0;
    case "gbp_intelligence":
      return typeof outputs.gbpProfileId === "string" && typeof outputs.lastReviewedAt === "string";
    case "market_scan":
      return typeof outputs.marketScanId === "string" && asPositiveNumber(outputs.clustersCount) > 0;
    case "competitor_scan":
      return typeof outputs.competitorScanId === "string";
    case "growth_snapshot":
      return typeof outputs.readinessScore === "number" && Number.isFinite(outputs.readinessScore);
    case "blueprint_draft":
      return outputs.blueprintAvailable === true;
    case "masterplan_draft":
      return typeof outputs.masterplanId === "string" || asPositiveNumber(outputs.itemCount) > 0;
    default:
      return true;
  }
}

function isAcceptedTerminalStage(
  key: IntelligenceStageKey,
  stage: IntelligenceStageState,
): boolean {
  if (!TERMINAL_STAGE_STATUSES.has(stage.status)) return false;
  return completeStageMeetsMinimum(key, stage);
}

function deriveCurrentStage(stages: IntelligenceStagesMap): IntelligenceStageKey | null {
  const runningOrNext = INTELLIGENCE_STAGE_KEYS.find((key) => {
    const status = stages[key].status;
    return status === "running" || status === "not_started" || status === "stale";
  });
  if (runningOrNext) return runningOrNext;

  const blocker = INTELLIGENCE_STAGE_KEYS.find((key) => {
    const status = stages[key].status;
    return status === "failed" || status === "blocked_dependency";
  });
  if (blocker) return blocker;

  return (
    INTELLIGENCE_STAGE_KEYS.find((key) => {
      const status = stages[key].status;
      return status === "partial" || status === "skipped_needs_context";
    }) ?? null
  );
}

function deriveRunStatus(stages: IntelligenceStagesMap): IntelligenceRunStatus {
  const vals = Object.values(stages);
  if (vals.some((s) => s.status === "running")) return "running";
  const foundationalFailed =
    stages.site_audit.status === "failed" || stages.growth_snapshot.status === "failed";
  if (foundationalFailed) return "failed";
  const anyFailed = vals.some((s) => s.status === "failed");
  const anyPartial = vals.some(
    (s) =>
      s.status === "partial" ||
      s.status === "skipped_needs_context" ||
      s.status === "blocked_dependency",
  );
  const allTerminal = INTELLIGENCE_STAGE_KEYS.every((key) =>
    isAcceptedTerminalStage(key, stages[key]),
  );
  if (!allTerminal) return "running";
  if (anyFailed || anyPartial) return "partial";
  return "completed";
}

// ---------------------------------------------------------------------------
// Stage handlers
// ---------------------------------------------------------------------------

type StageContext = {
  tenantId: string;
  siteId: string | null;
  growthGoalId: string | null;
  runId: string;
  outputs: Record<string, unknown>;
  stages: IntelligenceStagesMap;
};

type StageResult = Partial<IntelligenceStageState> & {
  status: IntelligenceStageStatus;
  outputs?: Record<string, unknown>;
};

async function countAuditPageIntelligenceCoverage(
  tenantId: string,
  auditId: string,
): Promise<{ auditPagesCount: number; pagesClassified: number }> {
  const { data: auditPages, error: auditPagesError } = await admin
    .from("audit_pages")
    .select("id, page_id, url")
    .eq("tenant_id", tenantId)
    .eq("audit_id", auditId);
  if (auditPagesError) throw auditPagesError;

  const pages = (auditPages ?? []) as Array<{ id: string; page_id: string | null; url: string | null }>;
  if (pages.length === 0) return { auditPagesCount: 0, pagesClassified: 0 };

  const auditPageIds = pages.map((p) => p.id);
  const pageIds = pages.map((p) => p.page_id).filter((id): id is string => !!id);
  const clauses = [
    `audit_id.eq.${auditId}`,
    auditPageIds.length > 0 ? `audit_page_id.in.(${auditPageIds.join(",")})` : null,
    pageIds.length > 0 ? `page_id.in.(${pageIds.join(",")})` : null,
  ].filter((clause): clause is string => !!clause);

  const { data: intelRows, error: intelError } = await admin
    .from("page_intelligence")
    .select("id, page_id, audit_page_id, audit_id, page_url")
    .eq("tenant_id", tenantId)
    .or(clauses.join(","));
  if (intelError) throw intelError;

  const rows = (intelRows ?? []) as Array<{
    page_id: string | null;
    audit_page_id: string | null;
    audit_id: string | null;
    page_url: string | null;
  }>;
  const classified = pages.filter((page) =>
    rows.some(
      (row) =>
        row.audit_page_id === page.id ||
        (!!page.page_id && row.page_id === page.page_id) ||
        (row.audit_id === auditId && !!page.url && row.page_url === page.url),
    ),
  ).length;

  return { auditPagesCount: pages.length, pagesClassified: classified };
}

async function stageSiteAudit(ctx: StageContext): Promise<StageResult> {
  // Find site connection
  const { data: site } = await admin
    .from("site_connections")
    .select("id, status, type")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!site) {
    return { status: "blocked_dependency", message: "No connected site", nextAction: "Connect a site under /sites" };
  }

  // Existing completed audit in last 24h?
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("audits")
    .select("id, status, pages_count, created_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("site_connection_id", site.id)
    .in("status", ["succeeded", "completed"])
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    ctx.outputs.auditId = recent.id;
    const pagesCount = asPositiveNumber(recent.pages_count);
    if (pagesCount === 0) {
      return {
        status: "failed",
        error: "Recent audit has no pages",
        outputs: { auditId: recent.id, pagesCount: 0 },
      };
    }
    return {
      status: "complete",
      message: `Recent audit reused (${pagesCount} pages)`,
      outputs: { auditId: recent.id, pagesCount },
    };
  }

  // Trigger a fresh audit
  const { data: audit, error } = await admin
    .from("audits")
    .insert({
      tenant_id: ctx.tenantId,
      site_connection_id: site.id,
      status: "queued",
    })
    .select("id")
    .single();
  if (error || !audit) {
    return { status: "failed", error: error?.message ?? "Could not create audit" };
  }
  try {
    await runAudit(audit.id);
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e), outputs: { auditId: audit.id } };
  }
  const { data: done } = await admin
    .from("audits")
    .select("status, pages_count, error")
    .eq("id", audit.id)
    .maybeSingle();
  if (done?.status !== "succeeded" && done?.status !== "completed") {
    return {
      status: "failed",
      error: done?.error ?? `Audit ended in status ${done?.status}`,
      outputs: { auditId: audit.id },
    };
  }
  ctx.outputs.auditId = audit.id;
  const pagesCount = asPositiveNumber(done.pages_count);
  if (pagesCount === 0) {
    return {
      status: "failed",
      error: "Audit completed but found 0 pages",
      outputs: { auditId: audit.id, pagesCount: 0 },
    };
  }
  return {
    status: "complete",
    message: `Audit completed (${pagesCount} pages)`,
    outputs: { auditId: audit.id, pagesCount },
  };
}

async function stagePageIntelligence(ctx: StageContext): Promise<StageResult> {
  const auditId =
    (ctx.outputs.auditId as string | undefined) ??
    (ctx.stages.site_audit.outputs?.auditId as string | undefined);
  if (!auditId) {
    return { status: "blocked_dependency", message: "Site audit not available" };
  }
  const before = await countAuditPageIntelligenceCoverage(ctx.tenantId, auditId);
  if (before.auditPagesCount === 0) {
    return {
      status: "blocked_dependency",
      message: "Page Intelligence needs audit pages, but the audit has 0 pages.",
      outputs: { auditId, auditPagesCount: 0, pagesClassified: 0 },
    };
  }
  if (before.pagesClassified > 0) {
    return {
      status: "complete",
      message: `${before.pagesClassified} of ${before.auditPagesCount} audit pages classified`,
      outputs: { auditId, auditPagesCount: before.auditPagesCount, pagesClassified: before.pagesClassified },
    };
  }

  try {
    await analyzePageIntelligenceForAudit({
      tenantId: ctx.tenantId,
      auditId,
    });
    const after = await countAuditPageIntelligenceCoverage(ctx.tenantId, auditId);
    if (after.auditPagesCount > 0 && after.pagesClassified === 0) {
      return {
        status: "partial",
        message: `Audit found ${after.auditPagesCount} pages, but Page Intelligence classified 0 pages.`,
        outputs: { auditId, auditPagesCount: after.auditPagesCount, pagesClassified: 0 },
        nextAction: "Retry Page Intelligence from /growth/intelligence",
      };
    }
    return {
      status: "complete",
      message: `${after.pagesClassified} of ${after.auditPagesCount} audit pages classified`,
      outputs: { auditId, auditPagesCount: after.auditPagesCount, pagesClassified: after.pagesClassified },
    };
  } catch (e) {
    return {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
      outputs: { auditId, auditPagesCount: before.auditPagesCount, pagesClassified: before.pagesClassified },
      nextAction: "Retry Page Intelligence from /growth/intelligence",
    };
  }
}

async function stageBusinessProfile(ctx: StageContext): Promise<StageResult> {
  const { data: existing } = await admin
    .from("business_profiles_v2")
    .select("id, status, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  // If a recent (24h) draft/approved exists, reuse it.
  if (existing) {
    const ageHours = (Date.now() - new Date(existing.updated_at).getTime()) / 3600000;
    if (ageHours < 24 || existing.status === "approved") {
      return {
        status: existing.status === "approved" ? "complete" : "partial",
        message: `Business profile ${existing.status} (${ageHours.toFixed(0)}h old)`,
        outputs: { businessProfileId: existing.id, profileStatus: existing.status },
        nextAction: existing.status === "approved" ? null : "Review at /settings/business-profile",
      };
    }
  }

  // Trigger analyzer job (runs synchronously via runAnalyzerJob)
  const { data: jobRow, error } = await admin
    .from("business_profile_analyzer_jobs")
    .insert({ tenant_id: ctx.tenantId, status: "queued", stage: "queued" })
    .select("id")
    .single();
  if (error || !jobRow) {
    return { status: "failed", error: error?.message ?? "Could not create analyzer job" };
  }
  try {
    await runAnalyzerJob({ jobId: jobRow.id, tenantId: ctx.tenantId });
  } catch (e) {
    return {
      status: "partial",
      error: e instanceof Error ? e.message : String(e),
      outputs: { analyzerJobId: jobRow.id },
      nextAction: "Review business profile suggestions",
    };
  }
  const { data: after } = await admin
    .from("business_profiles_v2")
    .select("id, status")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  return {
    status: after ? "partial" : "partial",
    message: "Business profile draft generated — review pending",
    outputs: { businessProfileId: after?.id, profileStatus: after?.status, analyzerJobId: jobRow.id },
    nextAction: "Review at /settings/business-profile",
  };
}

async function stageToneProfile(ctx: StageContext): Promise<StageResult> {
  const { data: existing } = await admin
    .from("brand_voice_profiles")
    .select("id, job_status, analyzed_at")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (existing?.analyzed_at) {
    const ageHours = (Date.now() - new Date(existing.analyzed_at).getTime()) / 3600000;
    if (ageHours < 24) {
      return {
        status: "complete",
        message: `Tone profile reused (${ageHours.toFixed(0)}h old)`,
        outputs: { toneProfileId: existing.id, jobStatus: existing.job_status },
        nextAction: "Approve at /settings/tone-profile",
      };
    }
  }
  try {
    const profile = await analyzeToneProfileForTenant(ctx.tenantId);
    return {
      status: "partial",
      message: "Tone profile draft generated — approval pending",
      outputs: { toneProfileId: (profile as { id?: string } | null)?.id ?? existing?.id ?? null },
      nextAction: "Approve at /settings/tone-profile",
    };
  } catch (e) {
    return {
      status: "partial",
      error: e instanceof Error ? e.message : String(e),
      nextAction: "Retry tone analysis from /settings/tone-profile",
    };
  }
}

async function stageGbpIntelligence(ctx: StageContext): Promise<StageResult> {
  const { data: gbp } = await admin
    .from("gbp_profiles")
    .select("id, status, last_reviewed_at, completeness_score")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!gbp || gbp.status === "not_connected") {
    return {
      status: "skipped_needs_context",
      message: "No GBP profile connected",
      nextAction: "Add GBP details at /growth/gbp",
    };
  }
  return {
    status: gbp.last_reviewed_at ? "complete" : "partial",
    message: `GBP profile available (completeness ${gbp.completeness_score ?? "n/a"})`,
    outputs: { gbpProfileId: gbp.id, gbpStatus: gbp.status },
    nextAction: gbp.last_reviewed_at ? null : "Review at /growth/gbp",
  };
}

async function stageMarketScan(ctx: StageContext): Promise<StageResult> {
  // Require services/locations
  const { data: goal } = await admin
    .from("growth_goals")
    .select("id, service_focus, locations")
    .eq("tenant_id", ctx.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const services: string[] = Array.isArray(goal?.service_focus) ? goal.service_focus : [];
  const locations: string[] = Array.isArray(goal?.locations) ? goal.locations : [];

  // Existing recent scan?
  const { data: existing } = await admin
    .from("market_scans")
    .select("id, status, scan_completed_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && existing.status === "completed") {
    return {
      status: "complete",
      message: "Market scan available",
      outputs: { marketScanId: existing.id },
    };
  }
  if (services.length === 0 || locations.length === 0) {
    return {
      status: "skipped_needs_context",
      message: "Market scan needs services + locations on growth goal",
      nextAction: "Complete services/locations on /settings/growth-goal",
    };
  }
  return {
    status: "skipped_needs_context",
    message: "Market scan not yet run",
    nextAction: "Run market scan from /growth/intelligence",
  };
}

async function stageCompetitorScan(ctx: StageContext): Promise<StageResult> {
  const market = ctx.stages.market_scan;
  if (market.status === "blocked_dependency" || market.status === "skipped_needs_context") {
    // Still try to detect existing
  }
  const { data: existing } = await admin
    .from("competitor_scans")
    .select("id, status, partial")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.status === "completed" && !existing.partial) {
      return {
        status: "complete",
        message: "Competitor scan available",
        outputs: { competitorScanId: existing.id },
      };
    }
    return {
      status: "partial",
      message: `Competitor scan ${existing.status}${existing.partial ? " (partial)" : ""}`,
      outputs: { competitorScanId: existing.id },
      nextAction: "Review at /growth/intelligence",
    };
  }
  if (market.status !== "complete") {
    return {
      status: "blocked_dependency",
      message: "Competitor scan needs a completed market scan",
      nextAction: "Run market scan first",
    };
  }
  return {
    status: "skipped_needs_context",
    message: "Competitor scan not yet run",
    nextAction: "Run competitor scan from /growth/intelligence",
  };
}

async function stageTrackingBaseline(ctx: StageContext): Promise<StageResult> {
  // V1 placeholder — detect call/form via audit pages if available.
  const auditId =
    (ctx.outputs.auditId as string | undefined) ??
    (ctx.stages.site_audit.outputs?.auditId as string | undefined);
  if (!auditId) {
    return {
      status: "skipped_needs_context",
      message: "Tracking baseline placeholder — no audit data",
      nextAction: "Tracking integration is V1.1",
    };
  }
  return {
    status: "partial",
    message: "Tracking baseline placeholder — manual setup pending",
    nextAction: "Connect call/form tracking (planned V1.1)",
  };
}

async function stageRankingPlaceholder(_ctx: StageContext): Promise<StageResult> {
  return {
    status: "skipped_needs_context",
    message: "Ranking baseline placeholder",
    nextAction: "Ranking ingestion planned V1.1",
  };
}

async function stageGrowthSnapshot(ctx: StageContext): Promise<StageResult> {
  try {
    const snap = await buildGrowthIntelligenceSnapshot({
      tenantId: ctx.tenantId,
      growthGoalId: ctx.growthGoalId ?? undefined,
      siteId: ctx.siteId ?? undefined,
    });
    return {
      status: "complete",
      message: `Snapshot built — readiness ${snap.status.readinessScore}/100 (${snap.status.overall})`,
      outputs: {
        readinessScore: snap.status.readinessScore,
        overall: snap.status.overall,
        nextBestAction: snap.status.nextBestAction?.type,
      },
    };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

async function stageBlueprintDraft(ctx: StageContext): Promise<StageResult> {
  // Blueprint is view-generated from snapshot. Mark draft-ready when snapshot ok.
  if (ctx.stages.growth_snapshot.status !== "complete") {
    return {
      status: "blocked_dependency",
      message: "Blueprint needs a completed snapshot",
    };
  }
  return {
    status: "partial",
    message: "Blueprint draft available — operator review pending",
    nextAction: "Open /growth/blueprint to review and approve",
  };
}

async function stageMasterplanDraft(ctx: StageContext): Promise<StageResult> {
  // If a recent active masterplan exists, treat as complete.
  const { data: plan } = await admin
    .from("master_plans")
    .select("id, status, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (plan) {
    const { data: items } = await admin
      .from("masterplan_items")
      .select("id", { count: "exact" })
      .eq("master_plan_id", plan.id)
      .limit(1);
    return {
      status: "complete",
      message: "Active masterplan present",
      outputs: { masterplanId: plan.id, itemCount: items?.length ?? 0 },
      nextAction: "Open /growth/masterplan",
    };
  }
  return {
    status: "skipped_needs_context",
    message: "No active masterplan",
    nextAction: "Generate a masterplan from /growth/masterplan",
  };
}

async function stageOperatorReviewReady(ctx: StageContext): Promise<StageResult> {
  const gates = {
    business_profile: ctx.stages.business_profile_draft.status,
    tone_profile: ctx.stages.tone_profile_draft.status,
    gbp: ctx.stages.gbp_intelligence.status,
    blueprint: ctx.stages.blueprint_draft.status,
    masterplan: ctx.stages.masterplan_draft.status,
  };
  const blocking = Object.entries(gates).filter(
    ([, s]) => s === "failed" || s === "blocked_dependency",
  );
  if (blocking.length > 0) {
    return {
      status: "partial",
      message: `Review blocked by: ${blocking.map(([k]) => k).join(", ")}`,
      outputs: { gates },
    };
  }
  const needsApproval = Object.entries(gates).filter(([, s]) => s !== "complete");
  if (needsApproval.length > 0) {
    return {
      status: "partial",
      message: `Awaiting review on: ${needsApproval.map(([k]) => k).join(", ")}`,
      outputs: { gates },
      nextAction: "Open /growth/flow",
    };
  }
  return { status: "complete", message: "All gates reviewed", outputs: { gates } };
}

const STAGE_HANDLERS: Record<
  IntelligenceStageKey,
  (ctx: StageContext) => Promise<StageResult>
> = {
  site_audit: stageSiteAudit,
  page_intelligence: stagePageIntelligence,
  business_profile_draft: stageBusinessProfile,
  tone_profile_draft: stageToneProfile,
  gbp_intelligence: stageGbpIntelligence,
  market_scan: stageMarketScan,
  competitor_scan: stageCompetitorScan,
  tracking_baseline: stageTrackingBaseline,
  ranking_baseline_placeholder: stageRankingPlaceholder,
  growth_snapshot: stageGrowthSnapshot,
  blueprint_draft: stageBlueprintDraft,
  masterplan_draft: stageMasterplanDraft,
  operator_review_ready: stageOperatorReviewReady,
};

// ---------------------------------------------------------------------------
// Public orchestrator API
// ---------------------------------------------------------------------------

export async function startIntelligenceRun(
  input: StartIntelligenceRunInput,
): Promise<IntelligenceRun> {
  const stages = emptyStagesMap();
  const { data, error } = await admin
    .from("intelligence_runs")
    .insert({
      tenant_id: input.tenantId,
      site_id: input.siteId ?? null,
      growth_goal_id: input.growthGoalId ?? null,
      status: "queued",
      triggered_by: input.triggeredBy ?? "operator",
      trigger_reason: input.triggerReason ?? null,
      stages,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create intelligence run");
  return rowToRun(data);
}

export async function advanceIntelligenceRun(input: {
  tenantId: string;
  intelligenceRunId: string;
}): Promise<IntelligenceRun> {
  const { data: row, error } = await admin
    .from("intelligence_runs")
    .select("*")
    .eq("id", input.intelligenceRunId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error || !row) throw new Error("Intelligence run not found");
  const run = rowToRun(row);

  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return run;
  }

  // Mark started
  if (!run.startedAt) {
    await admin
      .from("intelligence_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", run.id);
  }

  const ctx: StageContext = {
    tenantId: run.tenantId,
    siteId: run.siteId,
    growthGoalId: run.growthGoalId,
    runId: run.id,
    outputs: { ...run.outputRefs },
    stages: { ...run.stages },
  };

  // V1: process ONE stage per advance call to stay inside worker timeout.
  // UI auto-loops until the run reaches a terminal state.
  let processedOne = false;
  for (const key of INTELLIGENCE_STAGE_KEYS) {
    const current = ctx.stages[key];
    // Skip stages already in a terminal state from a prior pass — except stale.
    if (
      current.status === "complete" ||
      current.status === "partial" ||
      current.status === "failed" ||
      current.status === "skipped_needs_context" ||
      current.status === "blocked_dependency"
    ) {
      continue;
    }
    if (processedOne) break;
    processedOne = true;
    await persistStage(run.id, key, {
      status: "running",
      startedAt: new Date().toISOString(),
      error: null,
    });
    let result: StageResult;
    try {
      result = await STAGE_HANDLERS[key](ctx);
    } catch (e) {
      result = { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
    const stageState: IntelligenceStageState = {
      key,
      status: result.status,
      finishedAt: new Date().toISOString(),
      message: result.message ?? null,
      error: result.error ?? null,
      nextAction: result.nextAction ?? null,
      outputs: result.outputs ?? {},
    };
    ctx.stages[key] = stageState;
    if (result.outputs) ctx.outputs = { ...ctx.outputs, ...result.outputs };
    const nextCurrentStage = deriveCurrentStage(ctx.stages);
    await persistStage(run.id, key, stageState);
    await admin
      .from("intelligence_runs")
      .update({
        status: "running",
        output_refs: ctx.outputs,
        current_stage: nextCurrentStage,
      })
      .eq("id", run.id);

    // Hard-stop on foundational failures
    if (
      result.status === "failed" &&
      (key === "site_audit" || key === "growth_snapshot")
    ) {
      await admin
        .from("intelligence_runs")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: result.error ?? `${key} failed`,
          output_refs: ctx.outputs,
        })
        .eq("id", run.id);
      const { data: final } = await admin
        .from("intelligence_runs")
        .select("*")
        .eq("id", run.id)
        .single();
      return rowToRun(final);
    }
  }

  const finalStatus = deriveRunStatus(ctx.stages);
  const finalCurrentStage = deriveCurrentStage(ctx.stages);
  await admin
    .from("intelligence_runs")
    .update({
      status: finalStatus,
      completed_at:
        finalStatus === "completed" || finalStatus === "partial"
          ? new Date().toISOString()
          : null,
      output_refs: ctx.outputs,
      current_stage: finalCurrentStage,
    })
    .eq("id", run.id);

  const { data: final } = await admin
    .from("intelligence_runs")
    .select("*")
    .eq("id", run.id)
    .single();
  return rowToRun(final);
}

export async function getLatestIntelligenceRun(input: {
  tenantId: string;
  siteId?: string | null;
  growthGoalId?: string | null;
}): Promise<IntelligenceRun | null> {
  let q = admin
    .from("intelligence_runs")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (input.siteId) q = q.eq("site_id", input.siteId);
  if (input.growthGoalId) q = q.eq("growth_goal_id", input.growthGoalId);
  const { data } = await q.maybeSingle();
  return data ? rowToRun(data) : null;
}

export async function listIntelligenceRunsAdmin(
  tenantId: string,
  limit = 10,
): Promise<IntelligenceRun[]> {
  const { data } = await admin
    .from("intelligence_runs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(rowToRun);
}

/**
 * Mark downstream stages on the latest run as `stale` when an upstream
 * module changes. V1: detection only — does not re-run anything.
 */
export async function markDownstreamStagesStale(input: {
  tenantId: string;
  sourceModule: keyof typeof STALE_DEPENDENCY_MAP;
}): Promise<void> {
  const downstream = STALE_DEPENDENCY_MAP[input.sourceModule] ?? [];
  if (downstream.length === 0) return;
  const latest = await getLatestIntelligenceRun({ tenantId: input.tenantId });
  if (!latest) return;
  const stages = { ...latest.stages };
  for (const key of downstream) {
    if (stages[key].status === "complete" || stages[key].status === "partial") {
      stages[key] = { ...stages[key], status: "stale" };
    }
  }
  await admin
    .from("intelligence_runs")
    .update({ stages })
    .eq("id", latest.id);
}
