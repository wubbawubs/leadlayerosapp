/**
 * Presentation-only mapping of pipeline stage technical status → operator-friendly
 * display label + tone. Does NOT mutate orchestrator state.
 *
 * See: docs/INTELLIGENCE_PIPELINE_ORCHESTRATOR_V1.md (UI semantics section).
 */
import {
  INTELLIGENCE_STAGE_KEYS,
  STAGE_LABELS,
  type IntelligenceRun,
  type IntelligenceStageKey,
  type IntelligenceStageState,
} from "@/lib/shared/intelligencePipeline/schemas";

export type DisplayTone = "green" | "yellow" | "blue" | "gray" | "red";

export interface StageDisplay {
  label: string;
  tone: DisplayTone;
}

const TONE_CLASSES: Record<DisplayTone, string> = {
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  yellow: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  blue: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  gray: "border-border bg-background/40 text-muted-foreground",
  red: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function toneClass(tone: DisplayTone): string {
  return TONE_CLASSES[tone];
}

export function mapPipelineStageDisplay(
  key: IntelligenceStageKey,
  stage: IntelligenceStageState,
): StageDisplay {
  // Use `string` to prevent TS from over-narrowing `s` across switch cases
  // (cases share function scope; early `if (s === "complete") return` in one
  // case would otherwise exclude "complete" from later cases).
  const s: string = stage.status;
  const o = (stage.outputs ?? {}) as Record<string, unknown>;

  // Universal terminal states
  if (s === "failed") return { label: "Failed", tone: "red" };
  if (s === "running") return { label: "Running", tone: "blue" };
  if (s === "not_started") return { label: "Not started", tone: "gray" };
  if (s === "stale") return { label: "Stale — refresh", tone: "yellow" };

  switch (key) {
    case "site_audit":
      if (s === "complete") return { label: "Complete", tone: "green" };
      if (s === "partial") return { label: "Partial coverage", tone: "yellow" };
      break;

    case "page_intelligence": {
      const classified = numberOf(o.pagesClassified);
      const total = numberOf(o.auditPagesCount);
      if (s === "complete") return { label: "Complete", tone: "green" };
      if (s === "partial") {
        if (classified > 0 && total > 0 && classified < total) {
          return { label: "Partial coverage", tone: "yellow" };
        }
        if (classified === 0) return { label: "No pages classified", tone: "red" };
        return { label: "Complete with warnings", tone: "yellow" };
      }
      if (s === "blocked_dependency") return { label: "Waiting on site audit", tone: "red" };
      break;
    }

    case "business_profile_draft":
      if (s === "complete") {
        return o.profileStatus === "approved"
          ? { label: "Approved", tone: "green" }
          : { label: "Complete", tone: "green" };
      }
      if (s === "partial") return { label: "Draft ready · Review required", tone: "yellow" };
      break;

    case "tone_profile_draft":
      if (s === "complete") {
        return o.profileStatus === "approved"
          ? { label: "Approved", tone: "green" }
          : { label: "Complete", tone: "green" };
      }
      if (s === "partial") return { label: "Draft ready · Review required", tone: "yellow" };
      break;

    case "gbp_intelligence":
      if (s === "complete") return { label: "Reviewed", tone: "green" };
      if (s === "partial") return { label: "Needs review", tone: "yellow" };
      if (s === "skipped_needs_context")
        return { label: "Missing input · Add GBP details", tone: "yellow" };
      break;

    case "market_scan":
      if (s === "complete") return { label: "Complete", tone: "green" };
      if (s === "partial") return { label: "Complete with warnings", tone: "yellow" };
      if (s === "skipped_needs_context")
        return { label: "Not run · Run market scan", tone: "yellow" };
      break;

    case "competitor_scan":
      if (s === "complete") return { label: "Complete", tone: "green" };
      if (s === "partial") return { label: "Complete with warnings", tone: "yellow" };
      if (s === "blocked_dependency")
        return { label: "Waiting on market scan", tone: "gray" };
      if (s === "skipped_needs_context")
        return { label: "Waiting on market scan", tone: "gray" };
      break;

    case "tracking_baseline":
      if (s === "complete") return { label: "Detected", tone: "green" };
      if (s === "partial") return { label: "Planned · Tracking V1.1", tone: "blue" };
      if (s === "skipped_needs_context")
        return { label: "Planned · Tracking V1.1", tone: "blue" };
      break;

    case "ranking_baseline_placeholder":
      if (s === "complete") return { label: "Detected", tone: "green" };
      return { label: "Planned · Ranking V1.1", tone: "blue" };

    case "growth_snapshot":
      if (s === "complete") return { label: "Complete", tone: "green" };
      if (s === "partial") return { label: "Complete with warnings", tone: "yellow" };
      if (s === "blocked_dependency") return { label: "Blocked", tone: "red" };
      break;

    case "blueprint_draft":
      if (s === "complete") return { label: "Approved", tone: "green" };
      if (s === "partial") return { label: "Draft ready · Review required", tone: "yellow" };
      if (s === "blocked_dependency") return { label: "Waiting on snapshot", tone: "red" };
      break;

    case "masterplan_draft":
      if (s === "complete") return { label: "Generated", tone: "green" };
      if (s === "partial") return { label: "Draft ready · Review required", tone: "yellow" };
      if (s === "skipped_needs_context") return { label: "Not generated", tone: "gray" };
      break;

    case "operator_review_ready":
      if (s === "complete") return { label: "Ready", tone: "green" };
      if (s === "partial") return { label: "Review required", tone: "yellow" };
      break;
  }

  // Fallbacks for any unmapped state
  if (s === "complete") return { label: "Complete", tone: "green" };
  if (s === "partial") return { label: "Partial", tone: "yellow" };
  if (s === "skipped_needs_context") return { label: "Needs context", tone: "yellow" };
  if (s === "blocked_dependency") return { label: "Blocked", tone: "red" };
  return { label: s, tone: "gray" };
}

function numberOf(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// ---------------------------------------------------------------------------
// Run-level summary
// ---------------------------------------------------------------------------

const TERMINAL_STAGE_STATUSES = new Set([
  "complete",
  "partial",
  "failed",
  "skipped_needs_context",
  "blocked_dependency",
]);

export interface RunSummary {
  title: string;
  subtitle: string;
  processed: number;
  total: number;
  readinessScore: number | null;
  nextAction: string | null;
  blockingStages: IntelligenceStageKey[];
}

export function getRunSummary(run: IntelligenceRun): RunSummary {
  const total = INTELLIGENCE_STAGE_KEYS.length;
  let processed = 0;
  const blocking: IntelligenceStageKey[] = [];
  const needsReview: IntelligenceStageKey[] = [];
  const needsContext: IntelligenceStageKey[] = [];

  for (const key of INTELLIGENCE_STAGE_KEYS) {
    const st = run.stages[key];
    if (TERMINAL_STAGE_STATUSES.has(st.status)) processed += 1;
    if (st.status === "failed" || st.status === "blocked_dependency") blocking.push(key);
    else if (st.status === "skipped_needs_context") needsContext.push(key);
    else if (st.status === "partial") needsReview.push(key);
  }

  const snap = run.stages.growth_snapshot.outputs ?? {};
  const readinessScore =
    typeof snap.readinessScore === "number" ? snap.readinessScore : null;

  // Title — run-level
  let title: string;
  switch (run.status) {
    case "running":
    case "queued":
      title = "Intelligence run running";
      break;
    case "failed":
      title = "Intelligence run failed";
      break;
    case "cancelled":
      title = "Intelligence run cancelled";
      break;
    case "completed":
      title = "Intelligence run complete";
      break;
    case "partial":
    default:
      title = "Intelligence run partial";
  }

  // Subtitle — primary action
  let subtitle: string;
  let nextAction: string | null = null;
  if (run.status === "running" || run.status === "queued") {
    const current = run.currentStage ? STAGE_LABELS[run.currentStage] : "Working…";
    subtitle = `In progress: ${current}`;
  } else if (blocking.length > 0) {
    const first = blocking[0];
    subtitle = `Blocked by: ${STAGE_LABELS[first]}`;
    nextAction = run.stages[first].nextAction ?? null;
  } else if (needsContext.length > 0) {
    const first = needsContext[0];
    nextAction = run.stages[first].nextAction ?? `Add inputs for ${STAGE_LABELS[first]}`;
    subtitle = `Next: ${nextAction}`;
  } else if (needsReview.length > 0) {
    subtitle = "Operator review needed";
    const reviewStage =
      run.stages.operator_review_ready.nextAction ??
      run.stages[needsReview[0]].nextAction ??
      null;
    nextAction = reviewStage;
  } else if (run.status === "completed") {
    subtitle = "Ready for operator review";
  } else {
    subtitle = "Pipeline reviewed";
  }

  return {
    title,
    subtitle,
    processed,
    total,
    readinessScore,
    nextAction,
    blockingStages: blocking,
  };
}
