import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  decideProposal,
  generateProposals,
  listProposals,
} from "@/lib/shared/db/repos/proposals.functions";

export const Route = createFileRoute("/_authenticated/audits/$auditId/proposals")({
  component: ProposalsPage,
});

type ProposalRow = {
  id: string;
  group_id: string;
  audit_page_id: string | null;
  issue_code: string;
  proposal_type: string;
  before: string;
  after: string;
  rationale: string;
  confidence: number;
  status: string;
};

type GroupRow = {
  id: string;
  theme: string;
  status: string;
  audit_page_id: string | null;
  created_at: string;
};

function parseJsonSafe(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function ProposalsPage() {
  const { auditId } = Route.useParams();
  const qc = useQueryClient();
  const fetchList = useServerFn(listProposals);
  const runGenerate = useServerFn(generateProposals);
  const runDecide = useServerFn(decideProposal);
  const [filter, setFilter] = useState<"all" | "draft" | "approved" | "rejected">("all");

  const q = useQuery({
    queryKey: ["proposals", auditId],
    queryFn: () => fetchList({ data: { auditId } }),
  });

  const generateMut = useMutation({
    mutationFn: () => runGenerate({ data: { auditId } }),
    onSuccess: (r) => {
      toast.success(
        `Generated ${r.proposalsCreated} proposals across ${r.groupsCreated} groups${r.errors ? ` (${r.errors} errors)` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["proposals", auditId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to generate proposals"),
  });

  const decideMut = useMutation({
    mutationFn: (v: { proposalId: string; decision: "approved" | "rejected" }) =>
      runDecide({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposals", auditId] }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const groups = (q.data?.groups ?? []) as GroupRow[];
  const proposals = (q.data?.proposals ?? []) as ProposalRow[];
  const pageMap = (q.data?.pageMap ?? {}) as Record<string, string>;

  const filtered = useMemo(
    () => (filter === "all" ? proposals : proposals.filter((p) => p.status === filter)),
    [proposals, filter],
  );

  const byGroup = useMemo(() => {
    const m = new Map<string, ProposalRow[]>();
    for (const p of filtered) {
      const arr = m.get(p.group_id) ?? [];
      arr.push(p);
      m.set(p.group_id, arr);
    }
    return m;
  }, [filtered]);

  const counts = useMemo(
    () => ({
      total: proposals.length,
      draft: proposals.filter((p) => p.status === "draft").length,
      approved: proposals.filter((p) => p.status === "approved").length,
      rejected: proposals.filter((p) => p.status === "rejected").length,
    }),
    [proposals],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <Link
          to="/audits/$auditId"
          params={{ auditId }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to audit
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            SEO Proposals
          </p>
          <h1 className="font-display text-4xl text-foreground">Fix proposals</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {counts.total} total · {counts.draft} draft · {counts.approved} approved ·{" "}
            {counts.rejected} rejected
          </p>
        </div>
        <button
          onClick={() => generateMut.mutate()}
          disabled={generateMut.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {generateMut.isPending
            ? "Generating…"
            : proposals.length > 0
              ? "Re-generate proposals"
              : "Generate proposals"}
        </button>
      </div>

      <div className="mb-6 flex gap-2">
        {(["all", "draft", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              filter === f
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No proposals yet. Click "Generate proposals" to call the LLM on this audit.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const items = byGroup.get(g.id) ?? [];
            if (items.length === 0 && filter !== "all") return null;
            const url = g.audit_page_id ? pageMap[g.audit_page_id] : null;
            return (
              <section key={g.id} className="rounded-lg border border-border bg-card/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-foreground">
                      {url ?? g.theme}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {items.length} proposal{items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {items.map((p) => (
                    <ProposalCard
                      key={p.id}
                      p={p}
                      onDecide={(decision) =>
                        decideMut.mutate({ proposalId: p.id, decision })
                      }
                      disabled={decideMut.isPending}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  p,
  onDecide,
  disabled,
}: {
  p: ProposalRow;
  onDecide: (d: "approved" | "rejected") => void;
  disabled: boolean;
}) {
  const before = parseJsonSafe(p.before);
  const after = parseJsonSafe(p.after);
  const badgeColor =
    p.status === "approved"
      ? "bg-emerald-500/15 text-emerald-400"
      : p.status === "rejected"
        ? "bg-destructive/15 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-primary">
            {p.proposal_type}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{p.issue_code}</span>
          <span className="text-xs text-muted-foreground">
            confidence {(p.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badgeColor}`}>
          {p.status}
        </span>
      </div>
      <p className="mb-3 text-sm text-foreground">{p.rationale}</p>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-destructive/30 bg-destructive/5 p-2">
          <p className="mb-1 text-[10px] font-semibold uppercase text-destructive">Before</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
            {JSON.stringify(before, null, 2)}
          </pre>
        </div>
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
          <p className="mb-1 text-[10px] font-semibold uppercase text-emerald-400">After</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-foreground">
            {JSON.stringify(after, null, 2)}
          </pre>
        </div>
      </div>
      {p.status === "draft" && (
        <div className="flex gap-2">
          <button
            disabled={disabled}
            onClick={() => onDecide("approved")}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={disabled}
            onClick={() => onDecide("rejected")}
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
