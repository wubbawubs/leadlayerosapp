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
      qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSettled: () => setPendingId(null),
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
      qc.invalidateQueries({ queryKey: ["execution-board", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
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
            <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">
              Masterplan
            </Link>
            <span className="font-medium text-foreground">Execution</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 pb-24 pt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Sprint C · Execution Board V1
        </p>
        <h1 className="font-display text-4xl text-foreground">Execution board</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          One cockpit. Masterplan items, linked proposals, QA review status —
          all in one place. No publishing yet.
        </p>

        {!tenantId && (
          <p className="mt-6 text-sm text-muted-foreground">Select a tenant first.</p>
        )}

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
                <div
                  key={col.key}
                  className="rounded-lg border border-border bg-card/40 p-4"
                >
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className={`font-semibold ${col.tone}`}>{col.label}</h2>
                    <span className="text-xs text-muted-foreground">
                      {grouped[col.key].length}
                    </span>
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
                        busy={pendingId === it.masterplanItemId || generate.isPending}
                        onGenerate={() => generate.mutate(it.masterplanItemId)}
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
      </main>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-card/50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-xl text-foreground">{value}</div>
    </div>
  );
}

function BoardCard({
  item,
  busy,
  onGenerate,
  onMarkDone,
  onMarkInProgress,
  onSkip,
}: {
  item: ExecutionBoardItem;
  busy: boolean;
  onGenerate: () => void;
  onMarkDone: () => void;
  onMarkInProgress: () => void;
  onSkip: () => void;
}) {
  return (
    <article className="rounded border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
          {itemTypeLabel(item.type)}
        </span>
        {isManualType(item.type) && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Manual task for now
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
      {item.proposalStatus && (
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
        {item.executionStatus === "planned" && item.supportedForProposalGeneration && (
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
        {item.proposalId && (
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
