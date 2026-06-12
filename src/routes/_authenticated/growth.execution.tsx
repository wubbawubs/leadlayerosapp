import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getExecutionBoard,
  type ExecutionBoardItem,
  type ExecutionStatus,
} from "@/lib/shared/execution/board.functions";
import { generateProposalV2ForMasterplanItem } from "@/lib/shared/masterplan/proposalGen.functions";
import { updateMasterplanItem } from "@/lib/shared/masterplan/repo.functions";
import {
  generatePageBriefArtifactFn,
  updateExecutionArtifactStatus,
} from "@/lib/shared/executionArtifacts/artifacts.functions";
import {
  approveWordpressDraftForPublish,
  createWordpressDraftFromArtifact,
  markWordpressDraftPublished,
  publishWordpressDraftFromLeadLayer,
  requestWordpressDraftChanges,
} from "@/lib/shared/wordpressDrafts/wordpressDrafts.functions";
import {
  fetchAndSnapshotExistingWordpressPage,
  generateExistingPageOptimizationBrief,
  applyExistingPageOptimization,
} from "@/lib/shared/existingPageOptimization/existingPageOptimization.functions";
import {
  itemTypeLabel,
  qaWinnerLabel,
  proposalStatusLabel,
  isManualType,
  EXECUTION_STATUS_HINT,
} from "@/lib/shared/masterplan/labels";

export const Route = createFileRoute("/_authenticated/growth/execution")({
  component: ExecutionBoardPage,
  head: () => ({
    meta: [{ title: "Execution board — LeadLayer" }],
  }),
});

const COLUMNS: { key: ExecutionStatus; label: string; tone: string }[] = [
  { key: "planned", label: "Planned", tone: "text-foreground" },
  { key: "in_qa", label: "In QA", tone: "text-primary" },
  { key: "needs_edit", label: "Needs edit", tone: "text-amber-500" },
  { key: "approved", label: "Approved", tone: "text-emerald-500" },
  { key: "manual_task", label: "Manual task", tone: "text-muted-foreground" },
  { key: "blocked", label: "Blocked", tone: "text-rose-500" },
  { key: "done", label: "Done", tone: "text-muted-foreground" },
];

function ExecutionBoardPage() {
  const fetchTenants = useServerFn(listMyTenants);
  const fetchBoard = useServerFn(getExecutionBoard);
  const genProposal = useServerFn(generateProposalV2ForMasterplanItem);
  const updateItem = useServerFn(updateMasterplanItem);
  const genPageBrief = useServerFn(generatePageBriefArtifactFn);
  const updateArtifact = useServerFn(updateExecutionArtifactStatus);
  const createDraft = useServerFn(createWordpressDraftFromArtifact);
  const doMarkPublished = useServerFn(markWordpressDraftPublished);
  const doPublishFromLeadLayer = useServerFn(publishWordpressDraftFromLeadLayer);
  const doApproveDraft = useServerFn(approveWordpressDraftForPublish);
  const doRequestDraftChanges = useServerFn(requestWordpressDraftChanges);
  const qc = useQueryClient();

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const boardQuery = useQuery({
    queryKey: ["execution-board", tenantId],
    queryFn: () => fetchBoard({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const [pendingId, setPendingId] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async (itemId: string) => {
      if (!tenantId) throw new Error("No tenant");
      setPendingId(itemId);
      return genProposal({ data: { tenantId, masterplanItemId: itemId } });
    },
    onSuccess: (res) => {
      if ("ok" in res && res.ok) toast.success("Proposal generated");
      else toast.error("message" in res ? res.message : "Could not generate");
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSettled: () => setPendingId(null),
  });

  const generateBrief = useMutation({
    mutationFn: async (itemId: string) => {
      if (!tenantId) throw new Error("No tenant");
      setPendingId(itemId);
      return genPageBrief({ data: { tenantId, masterplanItemId: itemId } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(
          res.usedFallback ? "Page brief generated (fallback)" : "Page brief generated",
        );
      } else {
        toast.error("message" in res ? res.message : "Page brief generation failed");
      }
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSettled: () => setPendingId(null),
  });

  const approveArtifact = useMutation({
    mutationFn: async ({
      artifactId,
      status,
    }: {
      artifactId: string;
      status: "approved" | "rejected" | "needs_review";
    }) => {
      if (!tenantId) throw new Error("No tenant");
      return updateArtifact({ data: { tenantId, artifactId, status } });
    },
    onSuccess: (_, vars) => {
      toast.success(vars.status === "approved" ? "Page brief approved" : "Page brief updated");
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [draftPendingId, setDraftPendingId] = useState<string | null>(null);
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null);
  // Publishing Gate — approval modal state (formal operator approval + checklist)
  const [approveConfirm, setApproveConfirm] = useState<{
    draftId: string;
    seoMetaStatus: string | null;
    title: string | null;
  } | null>(null);
  const EMPTY_APPROVE_CHECKS = {
    reviewed: false,
    images: false,
    links: false,
    seo: false,
    schema: false,
    ready: false,
  };
  const [approveChecks, setApproveChecks] = useState(EMPTY_APPROVE_CHECKS);
  const [approveNotes, setApproveNotes] = useState("");
  const [approvingDraftId, setApprovingDraftId] = useState<string | null>(null);
  const [changesPendingId, setChangesPendingId] = useState<string | null>(null);
  // Publish-from-LeadLayer confirmation state (post-approval final confirm)
  const [publishConfirm, setPublishConfirm] = useState<{
    draftId: string;
    title: string | null;
    approvedAt: string | null;
  } | null>(null);
  const [publishReadyCheck, setPublishReadyCheck] = useState(false);
  const [llPublishingId, setLlPublishingId] = useState<string | null>(null);

  const approveDraft = useMutation({
    mutationFn: async ({ draftId, notes }: { draftId: string; notes?: string }) => {
      if (!tenantId) throw new Error("No tenant");
      setApprovingDraftId(draftId);
      return doApproveDraft({
        data: { tenantId, draftId, checklistConfirmed: true as const, notes: notes || undefined },
      });
    },
    onSuccess: (res) => {
      if (res.ok) toast.success("Draft approved for publish");
      setApproveConfirm(null);
      setApproveChecks(EMPTY_APPROVE_CHECKS);
      setApproveNotes("");
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approval failed"),
    onSettled: () => setApprovingDraftId(null),
  });

  const requestDraftChanges = useMutation({
    mutationFn: async ({ draftId, reason }: { draftId: string; reason: string }) => {
      if (!tenantId) throw new Error("No tenant");
      setChangesPendingId(draftId);
      return doRequestDraftChanges({ data: { tenantId, draftId, reason } });
    },
    onSuccess: () => {
      toast.success("Draft sent back for changes");
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to request changes"),
    onSettled: () => setChangesPendingId(null),
  });

  const createWpDraft = useMutation({
    mutationFn: async (artifactId: string) => {
      if (!tenantId) throw new Error("No tenant");
      setDraftPendingId(artifactId);
      return createDraft({ data: { tenantId, artifactId } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("WordPress draft created");
      }
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Draft creation failed"),
    onSettled: () => setDraftPendingId(null),
  });

  const publishFromLeadLayer = useMutation({
    mutationFn: async ({ draftId }: { draftId: string }) => {
      if (!tenantId) throw new Error("No tenant");
      setLlPublishingId(draftId);
      return doPublishFromLeadLayer({ data: { tenantId, draftId } });
    },
    onSuccess: (res) => {
      if (res.ok) toast.success("Page published via LeadLayer");
      setPublishConfirm(null);
      setPublishReadyCheck(false);
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Publish failed"),
    onSettled: () => setLlPublishingId(null),
  });

  const markPublished = useMutation({
    mutationFn: async ({ draftId, publishedUrl }: { draftId: string; publishedUrl?: string }) => {
      if (!tenantId) throw new Error("No tenant");
      setPublishingDraftId(draftId);
      return doMarkPublished({
        data: { tenantId, draftId, publishedUrl: publishedUrl || undefined },
      });
    },
    onSuccess: (res) => {
      if (res.ok) toast.success("Draft marked as published");
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to mark as published"),
    onSettled: () => setPublishingDraftId(null),
  });

  const markStatus = useMutation({
    mutationFn: async (args: { itemId: string; status: "in_progress" | "done" | "skipped" }) => {
      if (!tenantId) throw new Error("No tenant");
      return updateItem({
        data: { tenantId, itemId: args.itemId, patch: { status: args.status } },
      });
    },
    onSuccess: () => {
      toast.success("Item updated");
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doFetchSnapshot = useServerFn(fetchAndSnapshotExistingWordpressPage);
  const doGenOptBrief = useServerFn(generateExistingPageOptimizationBrief);
  const doApplyOptimization = useServerFn(applyExistingPageOptimization);

  const [snapPendingId, setSnapPendingId] = useState<string | null>(null);
  const [optBriefPendingId, setOptBriefPendingId] = useState<string | null>(null);
  const [optApplyPendingId, setOptApplyPendingId] = useState<string | null>(null);
  const [optApplyConfirm, setOptApplyConfirm] = useState<{
    artifactId: string;
    title: string;
    isLive: boolean;
  } | null>(null);
  const [optApplyChecks, setOptApplyChecks] = useState({
    reviewed: false,
    backup: false,
    liveConfirm: false,
    accurate: false,
  });

  const fetchSnapshot = useMutation({
    mutationFn: async (item: ExecutionBoardItem) => {
      if (!tenantId) throw new Error("No tenant");
      if (!item.optimizationConnectionId)
        throw new Error("No WordPress connection mapped to this item");
      if (!item.optimizationWpPostId) throw new Error("No WP post ID mapped to this item");
      setSnapPendingId(item.masterplanItemId);
      return doFetchSnapshot({
        data: {
          tenantId,
          wordpressConnectionId: item.optimizationConnectionId,
          wpPostId: item.optimizationWpPostId,
        },
      });
    },
    onSuccess: (res) => {
      if (res.ok) toast.success(`Snapshot taken — eligibility: ${res.eligibilityStatus}`);
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Snapshot failed"),
    onSettled: () => setSnapPendingId(null),
  });

  const generateOptBrief = useMutation({
    mutationFn: async (item: ExecutionBoardItem) => {
      if (!tenantId) throw new Error("No tenant");
      if (!item.optimizationSnapshotId) throw new Error("No snapshot — fetch the page first");
      setOptBriefPendingId(item.masterplanItemId);
      return doGenOptBrief({
        data: {
          tenantId,
          snapshotId: item.optimizationSnapshotId,
          masterplanItemId: item.masterplanItemId,
        },
      });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(
          res.usedFallback
            ? "Optimization brief generated (fallback)"
            : "Optimization brief generated",
        );
      }
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Brief generation failed"),
    onSettled: () => setOptBriefPendingId(null),
  });

  const applyOptimization = useMutation({
    mutationFn: async ({
      artifactId,
      confirmLivePage,
    }: {
      artifactId: string;
      confirmLivePage: boolean;
    }) => {
      if (!tenantId) throw new Error("No tenant");
      setOptApplyPendingId(artifactId);
      return doApplyOptimization({ data: { tenantId, artifactId, confirmLivePage } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(
          `Optimization applied — ${(res.fieldsUpdated as string[] | undefined)?.join(", ") ?? "fields updated"}`,
        );
        setOptApplyConfirm(null);
        setOptApplyChecks({ reviewed: false, backup: false, liveConfirm: false, accurate: false });
      } else if ("errorCode" in res) {
        if (res.errorCode === "stale_content") {
          toast.error("Page changed since snapshot — re-fetch before applying");
        } else if (res.errorCode === "manual_mode") {
          toast.error("Manual mode — apply changes in WordPress Admin");
        } else {
          toast.error(("error" in res ? res.error : null) ?? "Apply failed");
        }
      }
      void qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Apply failed"),
    onSettled: () => setOptApplyPendingId(null),
  });

  const items = boardQuery.data?.items ?? [];
  const summary = boardQuery.data?.summary ?? {
    total: 0,
    planned: 0,
    in_qa: 0,
    needs_edit: 0,
    approved: 0,
    manual_task: 0,
    blocked: 0,
    done: 0,
  };
  const nextAction = boardQuery.data?.nextAction ?? "";

  const grouped: Record<ExecutionStatus, ExecutionBoardItem[]> = {
    planned: [],
    in_qa: [],
    needs_edit: [],
    approved: [],
    manual_task: [],
    blocked: [],
    done: [],
  };
  for (const it of items) grouped[it.executionStatus as ExecutionStatus].push(it);

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link
              to="/settings/growth-goal"
              className="text-muted-foreground hover:text-foreground"
            >
              Goal
            </Link>
            <Link to="/growth/intelligence" className="text-muted-foreground hover:text-foreground">
              Intelligence
            </Link>
            <Link to="/growth/blueprint" className="text-muted-foreground hover:text-foreground">
              Blueprint
            </Link>
            <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">
              Masterplan
            </Link>
            <span className="font-medium text-foreground">Execution</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 pb-24 pt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Execution preview
        </p>
        <h1 className="font-display text-4xl text-foreground">Execution board</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Board view of Masterplan items: planned, in QA, approved, done. Approved page briefs can
          be pushed directly to WordPress as drafts for operator review.
        </p>

        {!tenantId && <p className="mt-6 text-sm text-muted-foreground">Select a tenant first.</p>}

        {tenantId && !boardQuery.data?.plan && !boardQuery.isLoading && (
          <div className="mt-8 rounded-lg border border-border bg-card/70 p-6 text-sm">
            <p className="text-foreground">No active masterplan yet.</p>
            <Link
              to="/growth/masterplan"
              className="mt-3 inline-block rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
            >
              Go to masterplan →
            </Link>
          </div>
        )}

        {tenantId && boardQuery.data?.plan && (
          <>
            <section className="mt-6 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <SummaryTile label="Total" value={summary.total} />
              <SummaryTile label="Planned" value={summary.planned} />
              <SummaryTile label="In QA" value={summary.in_qa} />
              <SummaryTile label="Needs edit" value={summary.needs_edit} />
              <SummaryTile label="Approved" value={summary.approved} />
              <SummaryTile label="Manual" value={summary.manual_task} />
              <SummaryTile label="Blocked" value={summary.blocked} />
              <SummaryTile label="Done" value={summary.done} />
            </section>

            {nextAction && (
              <div className="mt-4 rounded border border-border bg-card/50 px-4 py-2 text-sm text-muted-foreground">
                Next: <span className="text-foreground">{nextAction}</span>
              </div>
            )}

            <section className="mt-8 grid gap-4 xl:grid-cols-2">
              {COLUMNS.map((col) => (
                <div key={col.key} className="rounded-lg border border-border bg-card/40 p-4">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className={`font-semibold ${col.tone}`}>{col.label}</h2>
                    <span className="text-xs text-muted-foreground">{grouped[col.key].length}</span>
                  </div>
                  <div className="space-y-2">
                    {grouped[col.key].length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        {EXECUTION_STATUS_HINT[col.key]}
                      </p>
                    )}
                    {grouped[col.key].map((it) => (
                      <BoardCard
                        key={it.masterplanItemId}
                        item={it}
                        busy={pendingId === it.masterplanItemId}
                        draftBusy={draftPendingId === it.artifactId}
                        onGenerate={() => generate.mutate(it.masterplanItemId)}
                        onGeneratePageBrief={() => generateBrief.mutate(it.masterplanItemId)}
                        onApproveArtifact={() =>
                          it.artifactId &&
                          approveArtifact.mutate({ artifactId: it.artifactId, status: "approved" })
                        }
                        onRejectArtifact={() =>
                          it.artifactId &&
                          approveArtifact.mutate({ artifactId: it.artifactId, status: "rejected" })
                        }
                        onApproveOptArtifact={() =>
                          it.optimizationArtifactId &&
                          approveArtifact.mutate({
                            artifactId: it.optimizationArtifactId,
                            status: "approved",
                          })
                        }
                        onCreateDraft={() => it.artifactId && createWpDraft.mutate(it.artifactId)}
                        onMarkPublished={(publishedUrl) =>
                          it.wpDraftId &&
                          markPublished.mutate({ draftId: it.wpDraftId, publishedUrl })
                        }
                        publishBusy={publishingDraftId === it.wpDraftId}
                        onRequestApproveForPublish={() =>
                          it.wpDraftId &&
                          setApproveConfirm({
                            draftId: it.wpDraftId,
                            seoMetaStatus: it.wpSeoMetaStatus,
                            title: it.title,
                          })
                        }
                        approveBusy={approvingDraftId === it.wpDraftId}
                        onRequestChanges={(reason) =>
                          it.wpDraftId &&
                          requestDraftChanges.mutate({ draftId: it.wpDraftId, reason })
                        }
                        changesBusy={changesPendingId === it.wpDraftId}
                        onRequestLeadLayerPublish={() =>
                          it.wpDraftId &&
                          setPublishConfirm({
                            draftId: it.wpDraftId,
                            title: it.title,
                            approvedAt: it.wpApprovedAt,
                          })
                        }
                        llPublishBusy={llPublishingId === it.wpDraftId}
                        onFetchSnapshot={() => fetchSnapshot.mutate(it)}
                        snapBusy={snapPendingId === it.masterplanItemId}
                        onGenerateOptBrief={() => generateOptBrief.mutate(it)}
                        optBriefBusy={optBriefPendingId === it.masterplanItemId}
                        onRequestApplyOptimization={() =>
                          it.optimizationArtifactId &&
                          setOptApplyConfirm({
                            artifactId: it.optimizationArtifactId,
                            title: it.title,
                            isLive: true,
                          })
                        }
                        optApplyBusy={optApplyPendingId === it.optimizationArtifactId}
                        onMarkDone={() =>
                          markStatus.mutate({ itemId: it.masterplanItemId, status: "done" })
                        }
                        onMarkInProgress={() =>
                          markStatus.mutate({
                            itemId: it.masterplanItemId,
                            status: "in_progress",
                          })
                        }
                        onSkip={() =>
                          markStatus.mutate({
                            itemId: it.masterplanItemId,
                            status: "skipped",
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
        {/* Apply page optimization — confirmation modal */}
        {optApplyConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="font-display text-lg text-foreground">Apply page optimization</h2>
              <p className="mt-1 text-sm text-muted-foreground">{optApplyConfirm.title}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                LeadLayer will PATCH the existing page in WordPress. This is reversible via WP
                Revisions.
              </p>
              <ul className="mt-4 space-y-2.5">
                {(
                  [
                    { key: "reviewed", label: "I have reviewed the before and after content" },
                    {
                      key: "accurate",
                      label: "The content changes are accurate and safe to apply",
                    },
                    {
                      key: "backup",
                      label: "I have confirmed a WP Revision or backup exists for this page",
                    },
                    {
                      key: "liveConfirm",
                      label: "I understand this updates the live page immediately",
                    },
                  ] as Array<{ key: keyof typeof optApplyChecks; label: string }>
                ).map(({ key, label }) => (
                  <li key={key} className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id={`opt-check-${key}`}
                      checked={optApplyChecks[key]}
                      onChange={(e) =>
                        setOptApplyChecks((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                    <label
                      htmlFor={`opt-check-${key}`}
                      className="cursor-pointer text-xs text-foreground"
                    >
                      {label}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex gap-2">
                <button
                  disabled={
                    !Object.values(optApplyChecks).every(Boolean) || applyOptimization.isPending
                  }
                  onClick={() =>
                    applyOptimization.mutate({
                      artifactId: optApplyConfirm.artifactId,
                      confirmLivePage: true,
                    })
                  }
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {applyOptimization.isPending ? "Applying…" : "Apply optimization"}
                </button>
                <button
                  onClick={() => {
                    setOptApplyConfirm(null);
                    setOptApplyChecks({
                      reviewed: false,
                      backup: false,
                      liveConfirm: false,
                      accurate: false,
                    });
                  }}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              {applyOptimization.isError && (
                <p className="mt-2 text-xs text-destructive">
                  {(applyOptimization.error as Error).message}
                </p>
              )}
            </div>
          </div>
        )}
        {/* Publishing Gate — formal approval modal with operator checklist */}
        {approveConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="font-display text-lg text-foreground">Approve for publish</h2>
              {approveConfirm.title && (
                <p className="mt-1 text-sm text-muted-foreground">{approveConfirm.title}</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                This is the formal approval gate. Once approved, the draft can be published — by
                LeadLayer or manually in WP Admin. Confirm all items below.
              </p>

              {approveConfirm.seoMetaStatus === "manual_required" && (
                <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  SEO meta was not pushed automatically — confirm you have entered it manually in
                  your SEO plugin before approving.
                </div>
              )}

              <ul className="mt-4 space-y-2.5">
                {(
                  [
                    { key: "reviewed", label: "I have reviewed the draft in WP Admin" },
                    { key: "images", label: "Images have been added or are not required" },
                    { key: "links", label: "Internal links have been wired or noted as follow-up" },
                    { key: "seo", label: "SEO title and description are confirmed" },
                    {
                      key: "schema",
                      label:
                        "Schema data is verified: business name, phone, address, and area served are correct",
                    },
                    { key: "ready", label: "This page is ready to go live" },
                  ] as Array<{ key: keyof typeof approveChecks; label: string }>
                ).map(({ key, label }) => (
                  <li key={key} className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id={`approve-check-${key}`}
                      checked={approveChecks[key]}
                      onChange={(e) =>
                        setApproveChecks((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                    <label
                      htmlFor={`approve-check-${key}`}
                      className="cursor-pointer text-xs text-foreground"
                    >
                      {label}
                    </label>
                  </li>
                ))}
              </ul>

              <input
                type="text"
                placeholder="Approval notes (optional)"
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                maxLength={1000}
                className="mt-4 w-full rounded border border-border bg-background/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />

              <div className="mt-6 flex gap-2">
                <button
                  disabled={!Object.values(approveChecks).every(Boolean) || approveDraft.isPending}
                  onClick={() =>
                    approveDraft.mutate({ draftId: approveConfirm.draftId, notes: approveNotes })
                  }
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {approveDraft.isPending ? "Approving…" : "Approve for publish"}
                </button>
                <button
                  onClick={() => {
                    setApproveConfirm(null);
                    setApproveChecks(EMPTY_APPROVE_CHECKS);
                    setApproveNotes("");
                  }}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              {approveDraft.isError && (
                <p className="mt-2 text-xs text-destructive">
                  {(approveDraft.error as Error).message}
                </p>
              )}
            </div>
          </div>
        )}
        {/* Publish from LeadLayer — final confirmation (draft already passed the gate) */}
        {publishConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="font-display text-lg text-foreground">Publish from LeadLayer</h2>
              {publishConfirm.title && (
                <p className="mt-1 text-sm text-muted-foreground">{publishConfirm.title}</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                LeadLayer will set this page to{" "}
                <span className="font-medium text-foreground">Published</span> in WordPress.
              </p>
              <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                Approved for publish
                {publishConfirm.approvedAt &&
                  ` on ${new Date(publishConfirm.approvedAt).toLocaleDateString()}`}{" "}
                — operator checklist confirmed.
              </div>

              <div className="mt-4 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="publish-final-confirm"
                  checked={publishReadyCheck}
                  onChange={(e) => setPublishReadyCheck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                />
                <label
                  htmlFor="publish-final-confirm"
                  className="cursor-pointer text-xs text-foreground"
                >
                  Publish this page live now
                </label>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  disabled={!publishReadyCheck || publishFromLeadLayer.isPending}
                  onClick={() => publishFromLeadLayer.mutate({ draftId: publishConfirm.draftId })}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {publishFromLeadLayer.isPending ? "Publishing…" : "Publish now"}
                </button>
                <button
                  onClick={() => {
                    setPublishConfirm(null);
                    setPublishReadyCheck(false);
                  }}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              {publishFromLeadLayer.isError && (
                <p className="mt-2 text-xs text-destructive">
                  {(publishFromLeadLayer.error as Error).message}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-card/50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xl text-foreground">{value}</div>
    </div>
  );
}

const ARTIFACT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
};

const DELIVERY_LABEL: Record<string, string> = {
  missing: "WP not connected",
  connected: "WP connected — sync inventory",
  inventory_synced: "WP inventory synced",
};

function BoardCard({
  item,
  busy,
  draftBusy,
  publishBusy,
  onGenerate,
  onGeneratePageBrief,
  onApproveArtifact,
  onRejectArtifact,
  onApproveOptArtifact,
  onCreateDraft,
  onMarkPublished,
  onRequestApproveForPublish,
  approveBusy,
  onRequestChanges,
  changesBusy,
  onRequestLeadLayerPublish,
  llPublishBusy,
  onFetchSnapshot,
  snapBusy,
  onGenerateOptBrief,
  optBriefBusy,
  onRequestApplyOptimization,
  optApplyBusy,
  onMarkDone,
  onMarkInProgress,
  onSkip,
}: {
  item: ExecutionBoardItem;
  busy: boolean;
  draftBusy: boolean;
  publishBusy: boolean;
  llPublishBusy: boolean;
  onGenerate: () => void;
  onGeneratePageBrief: () => void;
  onApproveArtifact: () => void;
  onRejectArtifact: () => void;
  onApproveOptArtifact: () => void;
  onCreateDraft: () => void;
  onMarkPublished: (publishedUrl?: string) => void;
  onRequestApproveForPublish: () => void;
  approveBusy: boolean;
  onRequestChanges: (reason: string) => void;
  changesBusy: boolean;
  onRequestLeadLayerPublish: () => void;
  onFetchSnapshot: () => void;
  snapBusy: boolean;
  onGenerateOptBrief: () => void;
  optBriefBusy: boolean;
  onRequestApplyOptimization: () => void;
  optApplyBusy: boolean;
  onMarkDone: () => void;
  onMarkInProgress: () => void;
  onSkip: () => void;
}) {
  const [publishUrlInput, setPublishUrlInput] = useState("");
  const [changesReasonInput, setChangesReasonInput] = useState("");
  return (
    <article className="rounded border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
          {itemTypeLabel(item.type)}
        </span>
        {item.isPageBriefTarget && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
            Page brief
          </span>
        )}
        {isManualType(item.type) && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Manual task
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.priority}
        </span>
        {item.effort && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            effort: {item.effort}
          </span>
        )}
        {item.expectedImpact && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            impact: {item.expectedImpact}
          </span>
        )}
      </div>
      <h3 className="mt-1.5 text-sm font-medium text-foreground">{item.title}</h3>

      {/* Page brief status */}
      {item.isPageBriefTarget && item.artifactStatus && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Page brief:{" "}
          <span className="text-foreground">
            {ARTIFACT_STATUS_LABEL[item.artifactStatus] ?? item.artifactStatus}
          </span>
          {item.artifactDeliveryReadiness && (
            <>
              {" · "}
              <span className="text-muted-foreground">
                {DELIVERY_LABEL[item.artifactDeliveryReadiness] ?? item.artifactDeliveryReadiness}
              </span>
            </>
          )}
        </p>
      )}

      {/* Existing page optimization badges + status */}
      {item.isOptimizationTarget && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-400">
            Optimize existing page
          </span>
          {item.optimizationSnapshotEligibility === "meta_only" && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
              Meta-only mode
            </span>
          )}
          {item.optimizationSnapshotEligibility === "manual_mode" && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
              Manual mode
            </span>
          )}
          {item.optimizationSnapshotBuilder &&
            item.optimizationSnapshotBuilder !== "none" &&
            item.optimizationSnapshotBuilder !== "gutenberg" &&
            item.optimizationSnapshotBuilder !== "classic" && (
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                {item.optimizationSnapshotBuilder}
              </span>
            )}
          {item.optimizationDeliveryStatus === "optimized" && (
            <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
              Optimized ✓
            </span>
          )}
          {item.optimizationDeliveryStatus === "delivery_failed" && (
            <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400">
              Apply failed
            </span>
          )}
          {item.optimizationArtifactStatus && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Brief:{" "}
              {ARTIFACT_STATUS_LABEL[item.optimizationArtifactStatus] ??
                item.optimizationArtifactStatus}
            </span>
          )}
        </div>
      )}

      {/* Legacy proposal status */}
      {!item.isPageBriefTarget && item.proposalStatus && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Proposal:{" "}
          <span className="text-foreground">{proposalStatusLabel(item.proposalStatus)}</span>
          {item.qaStatus && (
            <>
              {" · "}QA: <span className="text-foreground">{qaWinnerLabel(item.qaStatus)}</span>
            </>
          )}
        </p>
      )}

      {item.blockingReason && (
        <p className="mt-1 text-[11px] text-rose-400">{item.blockingReason}</p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Next: <span className="text-foreground">{item.nextAction}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {/* Page brief target: generate / review / approve */}
        {item.isPageBriefTarget && item.executionStatus === "planned" && (
          <button
            disabled={busy}
            onClick={onGeneratePageBrief}
            className="rounded border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate page brief"}
          </button>
        )}
        {item.isPageBriefTarget && item.executionStatus === "in_qa" && item.artifactId && (
          <>
            <button
              disabled={busy}
              onClick={onGeneratePageBrief}
              className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {busy ? "Regenerating…" : "Regenerate"}
            </button>
            <button
              onClick={onApproveArtifact}
              className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/25"
            >
              Approve brief
            </button>
            <button
              onClick={onRejectArtifact}
              className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/25"
            >
              Reject
            </button>
          </>
        )}
        {item.isPageBriefTarget &&
          item.executionStatus === "approved" &&
          (() => {
            const dr = item.artifactDeliveryReadiness;
            const wpOk = dr === "connected" || dr === "inventory_synced";
            const wpReason =
              dr === "missing"
                ? "Connect a WordPress site from the Sites page first"
                : dr == null
                  ? "WordPress readiness unknown — re-generate the page brief to check"
                  : null;

            if (!item.wpDraftId) {
              return wpOk ? (
                <button
                  disabled={draftBusy || !item.artifactId}
                  onClick={onCreateDraft}
                  className="rounded border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                >
                  {draftBusy ? "Creating draft…" : "Create WordPress draft"}
                </button>
              ) : (
                <span
                  title={wpReason ?? undefined}
                  className="cursor-not-allowed rounded border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {dr === "missing" ? "Connect WordPress first" : "WordPress not ready"}
                </span>
              );
            }

            if (item.wpDraftStatus === "published") {
              const sourceLabel =
                item.wpPublishSource === "leadlayer_publish"
                  ? "via LeadLayer"
                  : item.wpPublishSource === "operator_manual"
                    ? "via WP Admin"
                    : null;
              return (
                <div className="flex flex-wrap gap-1">
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-400">
                    Published
                  </span>
                  {sourceLabel && (
                    <span className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] text-muted-foreground">
                      {sourceLabel}
                    </span>
                  )}
                  {item.wpPublishedAt && (
                    <span className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] text-muted-foreground">
                      {new Date(item.wpPublishedAt).toLocaleDateString()}
                    </span>
                  )}
                  {item.wpPublishedUrl && (
                    <a
                      href={item.wpPublishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
                    >
                      View live ↗
                    </a>
                  )}
                  {item.wpEditLink && (
                    <a
                      href={item.wpEditLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      Edit in WP ↗
                    </a>
                  )}
                </div>
              );
            }

            if (
              item.wpDraftStatus === "created" ||
              item.wpDraftStatus === "needs_review" ||
              item.wpDraftStatus === "approved_for_publish"
            ) {
              const seoStatus = item.wpSeoMetaStatus;
              const seoOk = seoStatus === "pushed_yoast" || seoStatus === "pushed_rankmath";
              const seoManual = seoStatus === "manual_required";
              const seoLabel =
                seoStatus === "pushed_yoast"
                  ? "SEO meta: Yoast ✓"
                  : seoStatus === "pushed_rankmath"
                    ? "SEO meta: Rank Math ✓"
                    : seoStatus === "manual_required"
                      ? "SEO meta: enter manually"
                      : null;
              const isApproved = item.wpDraftStatus === "approved_for_publish";
              const needsChanges = item.wpDraftStatus === "needs_review";

              return (
                <div className="flex flex-wrap gap-1">
                  {isApproved ? (
                    <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-400">
                      Approved for publish
                      {item.wpApprovedAt &&
                        ` · ${new Date(item.wpApprovedAt).toLocaleDateString()}`}
                    </span>
                  ) : needsChanges ? (
                    <span className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-400">
                      Changes requested
                    </span>
                  ) : (
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-400">
                      Draft created
                    </span>
                  )}
                  {item.wpEditLink && (
                    <a
                      href={item.wpEditLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
                    >
                      Edit in WP ↗
                    </a>
                  )}
                  {item.wpPreviewLink && (
                    <a
                      href={item.wpPreviewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      Preview ↗
                    </a>
                  )}

                  {/* SEO meta status badge */}
                  {seoLabel && (
                    <span
                      className={`rounded border px-2 py-1 text-[11px] ${
                        seoOk
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {seoLabel}
                    </span>
                  )}

                  {/* Manual SEO checklist — shown when plugin not detected or push failed */}
                  {seoManual && (item.wpMetaTitle || item.wpMetaDescription) && (
                    <div className="mt-1 w-full rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[11px]">
                      <p className="mb-1 font-medium text-amber-400">
                        Enter SEO meta manually in your SEO plugin:
                      </p>
                      {item.wpMetaTitle && (
                        <p className="text-muted-foreground">
                          <span className="text-foreground">Title:</span> {item.wpMetaTitle}
                        </p>
                      )}
                      {item.wpMetaDescription && (
                        <p className="text-muted-foreground">
                          <span className="text-foreground">Description:</span>{" "}
                          {item.wpMetaDescription}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Review notes when the draft was sent back */}
                  {needsChanges && item.wpReviewNotes && (
                    <div className="mt-1 w-full rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-amber-400">Requested changes:</span>{" "}
                      {item.wpReviewNotes}
                    </div>
                  )}

                  {/* Publishing Gate: approval comes before any publish action */}
                  {!isApproved && (
                    <button
                      disabled={approveBusy}
                      onClick={onRequestApproveForPublish}
                      className="mt-1 w-full rounded border border-primary/40 bg-primary/15 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                    >
                      {approveBusy
                        ? "Approving…"
                        : needsChanges
                          ? "Re-approve for publish →"
                          : "Approve for publish →"}
                    </button>
                  )}

                  {/* Send back for changes (from created or approved state) */}
                  {!needsChanges && (
                    <div className="mt-1 flex w-full items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Send back: what needs to change?"
                        value={changesReasonInput}
                        onChange={(e) => setChangesReasonInput(e.target.value)}
                        className="flex-1 rounded border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button
                        disabled={changesBusy || changesReasonInput.trim().length === 0}
                        onClick={() => {
                          onRequestChanges(changesReasonInput.trim());
                          setChangesReasonInput("");
                        }}
                        className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {changesBusy ? "Sending…" : "Send back"}
                      </button>
                    </div>
                  )}

                  {isApproved && (
                    <>
                      {/* Publish from LeadLayer — final confirmation modal */}
                      <button
                        disabled={llPublishBusy}
                        onClick={onRequestLeadLayerPublish}
                        className="mt-1 w-full rounded border border-primary/40 bg-primary/15 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                      >
                        {llPublishBusy ? "Publishing…" : "Publish from LeadLayer →"}
                      </button>

                      {/* Manual path: operator publishes in WP admin, then marks here */}
                      <div className="mt-1 flex w-full items-center gap-1.5">
                        <input
                          type="url"
                          placeholder="Already published? Enter URL"
                          value={publishUrlInput}
                          onChange={(e) => setPublishUrlInput(e.target.value)}
                          className="flex-1 rounded border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <button
                          disabled={publishBusy}
                          onClick={() => onMarkPublished(publishUrlInput || undefined)}
                          className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {publishBusy ? "Saving…" : "Mark manual"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            }

            if (item.wpDraftStatus === "failed") {
              return wpOk ? (
                <button
                  disabled={draftBusy}
                  onClick={onCreateDraft}
                  className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {draftBusy ? "Retrying…" : "Retry draft creation"}
                </button>
              ) : (
                <span
                  title={wpReason ?? undefined}
                  className="cursor-not-allowed rounded border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {dr === "missing" ? "Connect WordPress first" : "WordPress not ready"}
                </span>
              );
            }

            return null;
          })()}

        {/* Existing page optimization actions */}
        {item.isOptimizationTarget &&
          item.optimizationDeliveryStatus !== "optimized" &&
          item.optimizationUpdateStatus !== "applied" &&
          (() => {
            if (!item.optimizationSnapshotId) {
              return (
                <button
                  disabled={
                    snapBusy || !item.optimizationConnectionId || !item.optimizationWpPostId
                  }
                  onClick={onFetchSnapshot}
                  className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
                >
                  {snapBusy ? "Fetching…" : "Fetch current page snapshot"}
                </button>
              );
            }
            if (!item.optimizationArtifactId) {
              return (
                <button
                  disabled={optBriefBusy}
                  onClick={onGenerateOptBrief}
                  className="rounded border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                >
                  {optBriefBusy ? "Generating…" : "Generate optimization brief"}
                </button>
              );
            }
            if (
              item.optimizationArtifactStatus === "needs_review" ||
              item.optimizationArtifactStatus === "draft"
            ) {
              return (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={onApproveOptArtifact}
                    className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/25"
                  >
                    Approve brief
                  </button>
                  <button
                    disabled={optBriefBusy}
                    onClick={onGenerateOptBrief}
                    className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {optBriefBusy ? "Regenerating…" : "Regenerate"}
                  </button>
                </div>
              );
            }
            if (item.optimizationArtifactStatus === "approved") {
              if (item.optimizationDeliveryStatus === "delivery_failed") {
                return (
                  <button
                    disabled={optApplyBusy}
                    onClick={onRequestApplyOptimization}
                    className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    {optApplyBusy ? "Retrying…" : "Retry optimization"}
                  </button>
                );
              }
              return (
                <button
                  disabled={optApplyBusy}
                  onClick={onRequestApplyOptimization}
                  className="rounded border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                >
                  {optApplyBusy ? "Applying…" : "Apply optimization →"}
                </button>
              );
            }
            return null;
          })()}

        {/* Legacy proposal path */}
        {!item.isPageBriefTarget &&
          item.executionStatus === "planned" &&
          item.supportedForProposalGeneration && (
            <button
              disabled={busy}
              onClick={onGenerate}
              className="rounded border border-border bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate proposal"}
            </button>
          )}

        {item.executionStatus === "manual_task" && (
          <span className="rounded border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground">
            Handle outside LeadLayer for now
          </span>
        )}

        {!item.isPageBriefTarget && item.proposalId && (
          <Link
            to="/growth/masterplan/$itemId/proposals"
            params={{ itemId: item.masterplanItemId }}
            className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
          >
            Open proposals
          </Link>
        )}

        {item.executionStatus !== "done" && (
          <>
            {item.itemStatus !== "in_progress" && (
              <button
                onClick={onMarkInProgress}
                className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Start
              </button>
            )}
            <button
              onClick={onMarkDone}
              className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Mark done
            </button>
            <button
              onClick={onSkip}
              className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
          </>
        )}
      </div>
    </article>
  );
}
