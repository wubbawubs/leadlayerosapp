import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  getExecutionBoard,
  type ExecutionBoardItem,
} from "@/lib/shared/execution/board.functions";
import { generatePageBriefArtifactFn, updateExecutionArtifactStatus } from "@/lib/shared/executionArtifacts/artifacts.functions";
import {
  createWordpressDraftFromArtifact,
  publishWordpressDraftFromLeadLayer,
  markWordpressDraftPublished,
} from "@/lib/shared/wordpressDrafts/wordpressDrafts.functions";
import {
  fetchAndSnapshotExistingWordpressPage,
  generateExistingPageOptimizationBrief,
  applyExistingPageOptimization,
} from "@/lib/shared/existingPageOptimization/existingPageOptimization.functions";
import { itemTypeLabel } from "@/lib/shared/masterplan/labels";

import { StatusPill, type StatusTone } from "./StatusPill";
import { PageBriefReviewPanel } from "./PageBriefReviewPanel";
import { OptimizationReviewPanel } from "./OptimizationReviewPanel";
import { SkeletonBoardRow } from "@/components/ui/Skeletons";

// ---------------------------------------------------------------------------
// Status → display tone + label mapping (operator-facing)
// ---------------------------------------------------------------------------

function statusDisplay(item: ExecutionBoardItem): {
  tone: StatusTone;
  label: string;
} {
  if (item.optimizationDeliveryStatus === "optimized" || item.optimizationUpdateStatus === "applied") {
    return { tone: "green", label: "Optimization applied" };
  }
  if (item.wpDraftStatus === "published") return { tone: "green", label: "Published" };
  if (item.wpDraftStatus === "failed") return { tone: "red", label: "Draft failed" };
  if (item.wpDraftStatus === "created") return { tone: "info", label: "Draft created" };
  if (item.optimizationDeliveryStatus === "delivery_failed") return { tone: "red", label: "Apply failed" };
  if (item.optimizationArtifactStatus === "approved") return { tone: "info", label: "Optimization approved" };
  if (item.optimizationArtifactStatus === "needs_review" || item.optimizationArtifactStatus === "draft")
    return { tone: "amber", label: "Optimization brief ready" };
  if (item.artifactStatus === "approved") return { tone: "info", label: "Brief approved" };
  if (item.artifactStatus === "needs_review" || item.artifactStatus === "draft")
    return { tone: "amber", label: "In review" };
  if (item.executionStatus === "blocked") return { tone: "red", label: "Blocked" };
  if (item.executionStatus === "done") return { tone: "green", label: "Done" };
  if (item.executionStatus === "manual_task") return { tone: "neutral", label: "Manual task" };
  return { tone: "neutral", label: "Planned" };
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

type Filter = "all" | "review" | "delivery" | "done";

function matchesFilter(item: ExecutionBoardItem, f: Filter): boolean {
  if (f === "all") return true;
  const d = statusDisplay(item);
  if (f === "review") return d.tone === "amber" || d.tone === "red";
  if (f === "delivery") return d.tone === "info";
  if (f === "done") return d.tone === "green";
  return true;
}

// ---------------------------------------------------------------------------
// ExecutionBoard
// ---------------------------------------------------------------------------

export function ExecutionBoard({ tenantId }: { tenantId: string }) {
  const fetchBoard = useServerFn(getExecutionBoard);
  const boardQuery = useQuery({
    queryKey: ["execution-board", tenantId],
    queryFn: () => fetchBoard({ data: { tenantId } }),
  });

  const [filter, setFilter] = useState<Filter>("all");

  if (boardQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl animate-fade-up-in px-6 py-8">
        <div className="mb-6 space-y-2">
          <div className="h-2.5 w-16 rounded skeleton-shimmer" />
          <div className="h-7 w-48 rounded skeleton-shimmer" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card">
              <SkeletonBoardRow />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!boardQuery.data?.plan) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">No active masterplan yet for this client.</p>
      </div>
    );
  }

  const items = (boardQuery.data.items ?? []).filter((i) => matchesFilter(i, filter));
  const summary = boardQuery.data.summary;

  return (
    <div className="mx-auto max-w-7xl animate-fade-up-in px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--status-info)]">
            § Execution
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            {summary.total} item{summary.total === 1 ? "" : "s"} in the masterplan
          </h2>
        </div>
        <FilterChips value={filter} onChange={setFilter} summary={summary} />
      </div>

      <div className="mt-6 space-y-3">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No items match this filter.
          </p>
        )}
        {items.map((item) => (
          <ExecutionItemCard key={item.masterplanItemId} item={item} tenantId={tenantId} />
        ))}
      </div>
    </div>
  );
}

function FilterChips({
  value,
  onChange,
  summary,
}: {
  value: Filter;
  onChange: (f: Filter) => void;
  summary: { total: number };
}) {
  const opts: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${summary.total})` },
    { key: "review", label: "Needs review" },
    { key: "delivery", label: "In delivery" },
    { key: "done", label: "Done" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            value === o.key
              ? "border-[color:var(--status-info)] bg-[color:var(--status-info-soft)] text-[color:var(--status-info)]"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExecutionItemCard — review panel + action buttons
// ---------------------------------------------------------------------------

function ExecutionItemCard({
  item,
  tenantId,
}: {
  item: ExecutionBoardItem;
  tenantId: string;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const display = statusDisplay(item);

  // Lifted server functions (same as growth/execution.tsx)
  const genBrief = useServerFn(generatePageBriefArtifactFn);
  const updateArtifact = useServerFn(updateExecutionArtifactStatus);
  const createDraft = useServerFn(createWordpressDraftFromArtifact);
  const llPublish = useServerFn(publishWordpressDraftFromLeadLayer);
  const markPub = useServerFn(markWordpressDraftPublished);
  const doSnap = useServerFn(fetchAndSnapshotExistingWordpressPage);
  const doOptBrief = useServerFn(generateExistingPageOptimizationBrief);
  const doApplyOpt = useServerFn(applyExistingPageOptimization);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });

  const briefMut = useMutation({
    mutationFn: () => genBrief({ data: { tenantId, masterplanItemId: item.masterplanItemId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Page brief generated");
      else toast.error("message" in r ? r.message : "Failed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const approveMut = useMutation({
    mutationFn: (args: { artifactId: string; status: "approved" | "rejected" }) =>
      updateArtifact({ data: { tenantId, ...args } }),
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Brief approved" : "Brief rejected");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const draftMut = useMutation({
    mutationFn: (artifactId: string) => createDraft({ data: { tenantId, artifactId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("WordPress draft created");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const llPublishMut = useMutation({
    mutationFn: (draftId: string) => llPublish({ data: { tenantId, draftId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Page published");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const markPubMut = useMutation({
    mutationFn: (draftId: string) => markPub({ data: { tenantId, draftId } }),
    onSuccess: () => {
      toast.success("Marked as published");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const snapMut = useMutation({
    mutationFn: () => {
      if (!item.optimizationConnectionId || !item.optimizationWpPostId)
        throw new Error("No WP mapping for this item");
      return doSnap({
        data: {
          tenantId,
          wordpressConnectionId: item.optimizationConnectionId,
          wpPostId: item.optimizationWpPostId,
        },
      });
    },
    onSuccess: (r) => {
      if (r.ok) toast.success(`Snapshot captured — ${r.eligibilityStatus}`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const optBriefMut = useMutation({
    mutationFn: () => {
      if (!item.optimizationSnapshotId) throw new Error("Fetch snapshot first");
      return doOptBrief({
        data: {
          tenantId,
          snapshotId: item.optimizationSnapshotId,
          masterplanItemId: item.masterplanItemId,
        },
      });
    },
    onSuccess: (r) => {
      if (r.ok) toast.success("Optimization brief generated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const applyOptMut = useMutation({
    mutationFn: (artifactId: string) =>
      doApplyOpt({ data: { tenantId, artifactId, confirmLivePage: true } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Optimization applied to live page");
      else if ("error" in r) toast.error(r.error ?? "Apply failed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Confirm-on-risk for brief approval
  function handleApprove() {
    if (!item.artifactId) return;
    const risky = (item.artifactRiskFlags?.length ?? 0) > 0;
    if (risky && typeof window !== "undefined") {
      const ok = window.confirm(
        `This brief has ${item.artifactRiskFlags.length} risk flag${item.artifactRiskFlags.length === 1 ? "" : "s"}. Approve anyway?`,
      );
      if (!ok) return;
    }
    approveMut.mutate({ artifactId: item.artifactId, status: "approved" });
  }

  function handleApproveOpt() {
    if (!item.optimizationArtifactId) return;
    const risky = (item.optimizationArtifactRiskFlags?.length ?? 0) > 0;
    if (risky && typeof window !== "undefined") {
      const ok = window.confirm(
        `This optimization has ${item.optimizationArtifactRiskFlags.length} risk flag${item.optimizationArtifactRiskFlags.length === 1 ? "" : "s"}. Approve anyway?`,
      );
      if (!ok) return;
    }
    approveMut.mutate({
      artifactId: item.optimizationArtifactId,
      status: "approved",
    });
  }

  const canReview = item.isPageBriefTarget || item.isOptimizationTarget;

  return (
    <article className="rounded-xl border border-border bg-card transition hover:border-border/80">
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={display.tone}>{display.label}</StatusPill>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {itemTypeLabel(item.type)}
            </span>
            {item.isPageBriefTarget && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--status-info)]">
                · page brief
              </span>
            )}
            {item.isOptimizationTarget && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--status-amber)]">
                · optimize existing
              </span>
            )}
          </div>
          <h3 className="mt-1.5 truncate font-medium text-foreground">{item.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Next: <span className="text-foreground">{item.nextAction}</span>
          </p>
          {item.blockingReason && (
            <p className="mt-1 text-xs text-[color:var(--status-red)]">{item.blockingReason}</p>
          )}
        </div>

        {canReview && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Hide review
              </>
            ) : (
              <>
                <ChevronRight className="h-3.5 w-3.5" /> Review {item.isOptimizationTarget ? "optimization" : "brief"}
              </>
            )}
          </button>
        )}
      </div>

      {/* Review panel — directly above actions */}
      {open && canReview && (
        <div className="border-t border-border bg-muted/40 p-4">
          {item.isOptimizationTarget ? (
            <OptimizationReviewPanel item={item} />
          ) : (
            <PageBriefReviewPanel item={item} />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background/50 px-4 py-3">
        {/* Page brief actions */}
        {item.isPageBriefTarget && !item.artifactId && (
          <PrimaryButton onClick={() => briefMut.mutate()} disabled={briefMut.isPending}>
            {briefMut.isPending ? "Generating…" : "Generate brief"}
          </PrimaryButton>
        )}
        {item.isPageBriefTarget &&
          item.artifactId &&
          (item.artifactStatus === "needs_review" || item.artifactStatus === "draft") && (
            <>
              <PrimaryButton onClick={handleApprove} disabled={approveMut.isPending}>
                Approve brief
              </PrimaryButton>
              <SecondaryButton
                onClick={() =>
                  item.artifactId &&
                  approveMut.mutate({ artifactId: item.artifactId, status: "rejected" })
                }
                disabled={approveMut.isPending}
              >
                Reject
              </SecondaryButton>
              <SecondaryButton onClick={() => briefMut.mutate()} disabled={briefMut.isPending}>
                Regenerate
              </SecondaryButton>
            </>
          )}
        {item.isPageBriefTarget && item.artifactStatus === "approved" && !item.wpDraftId && (
          <PrimaryButton
            onClick={() => item.artifactId && draftMut.mutate(item.artifactId)}
            disabled={draftMut.isPending}
          >
            {draftMut.isPending ? "Creating draft…" : "Create WordPress draft"}
          </PrimaryButton>
        )}
        {item.wpDraftStatus === "created" && item.wpDraftId && (
          <>
            {item.wpEditLink && (
              <LinkButton href={item.wpEditLink}>Edit in WP ↗</LinkButton>
            )}
            {item.wpPreviewLink && (
              <LinkButton href={item.wpPreviewLink}>Preview ↗</LinkButton>
            )}
            <PrimaryButton
              onClick={() => item.wpDraftId && llPublishMut.mutate(item.wpDraftId)}
              disabled={llPublishMut.isPending}
            >
              {llPublishMut.isPending ? "Publishing…" : "Publish from LeadLayer"}
            </PrimaryButton>
            <SecondaryButton
              onClick={() => item.wpDraftId && markPubMut.mutate(item.wpDraftId)}
              disabled={markPubMut.isPending}
            >
              Mark published
            </SecondaryButton>
          </>
        )}
        {item.wpDraftStatus === "published" && item.wpPublishedUrl && (
          <LinkButton href={item.wpPublishedUrl}>Open live URL ↗</LinkButton>
        )}
        {item.wpDraftStatus === "failed" && (
          <PrimaryButton
            onClick={() => item.artifactId && draftMut.mutate(item.artifactId)}
            disabled={draftMut.isPending}
            tone="red"
          >
            Retry draft creation
          </PrimaryButton>
        )}

        {/* Optimization actions */}
        {item.isOptimizationTarget &&
          item.optimizationDeliveryStatus !== "optimized" &&
          item.optimizationUpdateStatus !== "applied" && (
            <>
              {!item.optimizationSnapshotId && (
                <PrimaryButton onClick={() => snapMut.mutate()} disabled={snapMut.isPending}>
                  {snapMut.isPending ? "Fetching…" : "Fetch page snapshot"}
                </PrimaryButton>
              )}
              {item.optimizationSnapshotId && !item.optimizationArtifactId && (
                <PrimaryButton onClick={() => optBriefMut.mutate()} disabled={optBriefMut.isPending}>
                  {optBriefMut.isPending ? "Generating…" : "Generate optimization brief"}
                </PrimaryButton>
              )}
              {item.optimizationArtifactId &&
                (item.optimizationArtifactStatus === "needs_review" ||
                  item.optimizationArtifactStatus === "draft") && (
                  <>
                    <PrimaryButton onClick={handleApproveOpt}>Approve optimization</PrimaryButton>
                    <SecondaryButton onClick={() => optBriefMut.mutate()}>Regenerate</SecondaryButton>
                  </>
                )}
              {item.optimizationArtifactStatus === "approved" && item.optimizationArtifactId && (
                <PrimaryButton
                  onClick={() =>
                    item.optimizationArtifactId &&
                    applyOptMut.mutate(item.optimizationArtifactId)
                  }
                  disabled={applyOptMut.isPending}
                  tone={item.optimizationDeliveryStatus === "delivery_failed" ? "red" : "info"}
                >
                  {applyOptMut.isPending
                    ? "Applying…"
                    : item.optimizationDeliveryStatus === "delivery_failed"
                      ? "Retry apply"
                      : "Apply optimization"}
                </PrimaryButton>
              )}
            </>
          )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Tiny button atoms — all token-driven, no raw hex
// ---------------------------------------------------------------------------

function PrimaryButton({
  children,
  onClick,
  disabled,
  tone = "info",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "info" | "red";
}) {
  const cls =
    tone === "red"
      ? "border-[color:var(--status-red)]/30 bg-[color:var(--status-red-soft)] text-[color:var(--status-red)] hover:bg-[color:var(--status-red)]/15"
      : "border-[color:var(--status-info)]/30 bg-[color:var(--status-info-soft)] text-[color:var(--status-info)] hover:bg-[color:var(--status-info)]/15";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
    >
      {children}
    </a>
  );
}
