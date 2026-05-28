/**
 * Intelligence Pipeline Orchestrator V1 — operator panel.
 *
 * Wires the shared server functions (start / advance / latest) into a
 * single component so operators can run and inspect a pipeline run from
 * /growth/flow. See docs/INTELLIGENCE_PIPELINE_ORCHESTRATOR_V1.md.
 */
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  advanceIntelligenceRunFn,
  getLatestIntelligenceRunFn,
  startIntelligenceRunFn,
} from "@/lib/intelligencePipeline/intelligencePipeline.functions";
import { listSiteConnections } from "@/lib/shared/db/repos/siteConnections.functions";
import { getActiveGrowthGoal } from "@/lib/shared/growthGoals/repo.functions";
import {
  INTELLIGENCE_STAGE_KEYS,
  STAGE_LABELS,
  type IntelligenceRun,
  type IntelligenceRunStatus,
  type IntelligenceStageKey,
  type IntelligenceStageState,
  type IntelligenceStageStatus,
} from "@/lib/shared/intelligencePipeline/schemas";

export function IntelligencePipelinePanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const fetchLatest = useServerFn(getLatestIntelligenceRunFn);
  const fetchSites = useServerFn(listSiteConnections);
  const fetchGoal = useServerFn(getActiveGrowthGoal);
  const startFn = useServerFn(startIntelligenceRunFn);
  const advanceFn = useServerFn(advanceIntelligenceRunFn);

  const runQuery = useQuery({
    queryKey: ["intelligence-run", tenantId],
    queryFn: () => fetchLatest({ data: { tenantId } }),
  });
  const sitesQuery = useQuery({
    queryKey: ["site-connections", tenantId],
    queryFn: () => fetchSites({ data: { tenantId } }),
  });
  const goalQuery = useQuery({
    queryKey: ["active-growth-goal", tenantId],
    queryFn: () => fetchGoal({ data: { tenantId } }),
  });

  const run = runQuery.data?.run ?? null;
  const hasConnectedSite =
    (sitesQuery.data?.connections ?? []).some((c) => c.status === "connected") ?? false;
  const hasGoal = !!goalQuery.data?.goal;

  const start = useMutation({
    mutationFn: () => startFn({ data: { tenantId, autoAdvance: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intelligence-run", tenantId] }),
  });
  const advance = useMutation({
    mutationFn: () =>
      run
        ? advanceFn({ data: { tenantId, intelligenceRunId: run.id } })
        : Promise.reject(new Error("No run to advance")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intelligence-run", tenantId] }),
  });

  const isRunning = start.isPending || advance.isPending;
  const isTerminal =
    run?.status === "completed" || run?.status === "failed" || run?.status === "cancelled";

  const blockers: string[] = [];
  if (!hasGoal) blockers.push("growth goal");
  if (!hasConnectedSite) blockers.push("connected site");

  const progress = useMemo(() => (run ? computeProgress(run) : 0), [run]);

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Intelligence Pipeline V1
          </p>
          <h2 className="mt-1 font-display text-2xl text-foreground">
            {run ? STAGE_LABELS[run.currentStage ?? "site_audit"] : "No run yet"}
          </h2>
          {run ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Status <RunStatusBadge status={run.status} /> · triggered by{" "}
              <span className="text-foreground">{run.triggeredBy}</span>
              {run.triggerReason ? ` · ${run.triggerReason}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              No intelligence run yet. Start one to build the Growth Intelligence Snapshot,
              Blueprint and Masterplan.
            </p>
          )}
          {run && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {run.startedAt ? `Started ${fmt(run.startedAt)}` : "Not started"}
              {run.completedAt ? ` · finished ${fmt(run.completedAt)}` : ""}
              {run.failedAt ? ` · failed ${fmt(run.failedAt)}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => start.mutate()}
            disabled={isRunning || blockers.length > 0}
            className="rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              blockers.length > 0 ? `Missing: ${blockers.join(", ")}` : "Start a new run"
            }
          >
            {start.isPending ? "Starting…" : "Start intelligence run"}
          </button>
          <button
            onClick={() => advance.mutate()}
            disabled={!run || isTerminal || isRunning}
            className="rounded border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {advance.isPending ? "Advancing…" : "Continue / advance"}
          </button>
          <button
            onClick={() => runQuery.refetch()}
            className="rounded border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>

      {blockers.length > 0 && (
        <p className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-400">
          Missing: {blockers.join(", ")}. Resolve before starting a run.
          {!hasGoal && (
            <>
              {" "}
              <Link to="/settings/growth-goal" className="underline">
                Set a goal
              </Link>
              .
            </>
          )}
          {!hasConnectedSite && (
            <>
              {" "}
              <Link to="/sites" className="underline">
                Connect a site
              </Link>
              .
            </>
          )}
        </p>
      )}

      {start.error && (
        <p className="mt-3 text-xs text-destructive">
          Start failed: {(start.error as Error).message}
        </p>
      )}
      {advance.error && (
        <p className="mt-3 text-xs text-destructive">
          Advance failed: {(advance.error as Error).message}
        </p>
      )}

      {run && (
        <>
          <div className="mt-5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pipeline progress</span>
              <span className="font-mono text-foreground">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/40">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ul className="mt-5 divide-y divide-border rounded-lg border border-border bg-background/30">
            {INTELLIGENCE_STAGE_KEYS.map((key) => (
              <StageRow key={key} stageKey={key} stage={run.stages[key]} />
            ))}
          </ul>

          {run.errorMessage && (
            <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              Run error: {run.errorMessage}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function StageRow({
  stageKey,
  stage,
}: {
  stageKey: IntelligenceStageKey;
  stage: IntelligenceStageState;
}) {
  const outputs = stage.outputs ?? {};
  const outputKeys = Object.keys(outputs);
  return (
    <li className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{STAGE_LABELS[stageKey]}</span>
          <StageStatusBadge status={stage.status} />
        </div>
        {stage.message && (
          <p className="mt-1 text-xs text-muted-foreground">{stage.message}</p>
        )}
        {stage.error && (
          <p className="mt-1 text-xs text-destructive">Error: {stage.error}</p>
        )}
        {stage.nextAction && (
          <p className="mt-1 text-xs text-primary">→ {stage.nextAction}</p>
        )}
        {outputKeys.length > 0 && (
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
            {outputKeys
              .slice(0, 4)
              .map((k) => `${k}=${formatOutput(outputs[k])}`)
              .join(" · ")}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right text-[10px] text-muted-foreground">
        {stage.startedAt && <div>start {fmt(stage.startedAt)}</div>}
        {stage.finishedAt && <div>end {fmt(stage.finishedAt)}</div>}
      </div>
    </li>
  );
}

export function IntelligencePipelineSummary({ tenantId }: { tenantId: string }) {
  const fetchLatest = useServerFn(getLatestIntelligenceRunFn);
  const runQuery = useQuery({
    queryKey: ["intelligence-run", tenantId],
    queryFn: () => fetchLatest({ data: { tenantId } }),
  });
  const run = runQuery.data?.run ?? null;

  return (
    <section className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Latest intelligence run
          </p>
          {run ? (
            <p className="mt-1 text-sm text-foreground">
              <RunStatusBadge status={run.status} /> ·{" "}
              <span className="text-muted-foreground">
                stage:{" "}
                <span className="text-foreground">
                  {STAGE_LABELS[run.currentStage ?? "operator_review_ready"]}
                </span>
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No run yet. Start one to build the snapshot, blueprint and masterplan.
            </p>
          )}
        </div>
        <Link
          to="/growth/flow"
          className="rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/20"
        >
          Open pipeline →
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeProgress(run: IntelligenceRun): number {
  const total = INTELLIGENCE_STAGE_KEYS.length;
  let done = 0;
  for (const key of INTELLIGENCE_STAGE_KEYS) {
    const s = run.stages[key].status;
    if (
      s === "complete" ||
      s === "partial" ||
      s === "failed" ||
      s === "skipped_needs_context" ||
      s === "blocked_dependency"
    ) {
      done += 1;
    }
  }
  return Math.round((done / total) * 100);
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatOutput(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 24 ? `${v.slice(0, 22)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "{…}";
}

function RunStatusBadge({ status }: { status: IntelligenceRunStatus }) {
  const map: Record<IntelligenceRunStatus, string> = {
    queued: "border-border bg-background/40 text-muted-foreground",
    running: "border-primary/40 bg-primary/10 text-primary",
    partial: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
    cancelled: "border-border bg-background/40 text-muted-foreground",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status]}`}
    >
      {status}
    </span>
  );
}

function StageStatusBadge({ status }: { status: IntelligenceStageStatus }) {
  const map: Record<IntelligenceStageStatus, { label: string; cls: string }> = {
    not_started: { label: "Not started", cls: "border-border bg-background/40 text-muted-foreground" },
    running: { label: "Running", cls: "border-primary/40 bg-primary/10 text-primary" },
    complete: { label: "Complete", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
    partial: { label: "Partial", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
    failed: { label: "Failed", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
    skipped_needs_context: {
      label: "Needs context",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    },
    blocked_dependency: {
      label: "Blocked",
      cls: "border-destructive/40 bg-destructive/10 text-destructive",
    },
    stale: { label: "Stale", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  };
  const cfg = map[status];
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
