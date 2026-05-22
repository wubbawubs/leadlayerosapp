import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  buildComparisonSetForAudit,
  listProposalComparisons,
  updateProposalComparison,
  REASON_TAGS,
} from "@/lib/shared/qaCompare/repo.functions";

export const Route = createFileRoute("/_authenticated/audits/$auditId_/compare")({
  component: ComparePage,
});

type Winner = "unreviewed" | "v1" | "v2" | "both_bad" | "both_good" | "needs_edit";

const WINNER_BUTTONS: { value: Winner; label: string; tone: string }[] = [
  { value: "v1", label: "V1 better", tone: "border-blue-400/40 bg-blue-500/10 text-blue-600" },
  { value: "v2", label: "V2 better", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" },
  { value: "both_good", label: "Both good", tone: "border-violet-500/40 bg-violet-500/10 text-violet-600" },
  { value: "both_bad", label: "Both bad", tone: "border-red-500/40 bg-red-500/10 text-red-600" },
  { value: "needs_edit", label: "Needs edit", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
];

function tryFormat(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function ComparePage() {
  const { auditId } = Route.useParams();
  const qc = useQueryClient();
  const build = useServerFn(buildComparisonSetForAudit);
  const list = useServerFn(listProposalComparisons);
  const update = useServerFn(updateProposalComparison);

  const q = useQuery({
    queryKey: ["qa-compare", auditId],
    queryFn: () => list({ data: { auditId } }),
  });

  const buildMut = useMutation({
    mutationFn: (forceRefresh: boolean) =>
      build({ data: { auditId, forceRefresh } }),
    onSuccess: (r) => {
      toast.success(
        `Built: ${r.created} new · ${r.updated} updated · ${r.skipped} skipped`,
      );
      qc.invalidateQueries({ queryKey: ["qa-compare", auditId] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to build comparison set"),
  });

  const updateMut = useMutation({
    mutationFn: (v: Parameters<typeof update>[0]["data"]) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qa-compare", auditId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const items = q.data?.items ?? [];
  const summary = q.data?.summary;
  const [filter, setFilter] = useState<"all" | "unreviewed" | "reviewed">("all");
  const filtered = useMemo(
    () =>
      filter === "all"
        ? items
        : filter === "unreviewed"
          ? items.filter((i) => i.winner === "unreviewed")
          : items.filter((i) => i.winner !== "unreviewed"),
    [items, filter],
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
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
            QA Compare V1
          </p>
          <h1 className="font-display text-4xl text-foreground">V1 vs V2 proposals</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Compare each issue side by side and capture operator feedback.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => buildMut.mutate(false)}
            disabled={buildMut.isPending}
            className="rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {buildMut.isPending ? "Building…" : "Build comparison set"}
          </button>
          <button
            type="button"
            onClick={() => buildMut.mutate(true)}
            disabled={buildMut.isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            title="Re-pair all rows, including ones already reviewed"
          >
            Force refresh
          </button>
        </div>
      </div>

      {summary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Total" value={summary.total} />
          <Stat label="Reviewed" value={summary.reviewed} />
          <Stat label="V1 wins" value={summary.v1Wins} />
          <Stat label="V2 wins" value={summary.v2Wins} />
          <Stat label="Both good" value={summary.bothGood} />
          <Stat label="Both bad" value={summary.bothBad} />
          <Stat label="Score mismatch" value={summary.scoreMismatches} />
          <Stat
            label="V2 win rate"
            value={
              summary.reviewed > 0
                ? `${Math.round(summary.v2WinRate * 100)}%`
                : "—"
            }
          />
        </div>
      )}

      {summary && summary.v2AverageWeighted !== null && (
        <p className="mb-4 text-xs text-muted-foreground">
          V2 avg weighted score:{" "}
          <span className="text-foreground">{summary.v2AverageWeighted.toFixed(2)}</span>{" "}
          · Per-action V2 win rate:{" "}
          {Object.entries(summary.winRateByAction).map(([k, v]) => (
            <span key={k} className="mr-3">
              {k}: {v.reviewed > 0 ? `${Math.round((v.wins / v.reviewed) * 100)}%` : "—"} (
              {v.reviewed})
            </span>
          ))}
        </p>
      )}

      <div className="mb-4 flex gap-2 text-sm">
        {(["all", "unreviewed", "reviewed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md border px-3 py-1 ${
              filter === f
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {q.isLoading && (
        <p className="text-sm text-muted-foreground">Loading comparisons…</p>
      )}
      {!q.isLoading && items.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No comparisons yet. Click "Build comparison set" to pair V1 and V2 proposals.
        </div>
      )}

      <div className="space-y-6">
        {filtered.map((it) => (
          <ComparisonCard
            key={it.id}
            item={it}
            onUpdate={(payload) => updateMut.mutate({ ...payload, comparisonId: it.id })}
            isPending={updateMut.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-card/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-xl text-foreground">{value}</div>
    </div>
  );
}

type Item = NonNullable<
  Awaited<ReturnType<typeof listProposalComparisons>>
>["items"][number];

function ComparisonCard({
  item,
  onUpdate,
  isPending,
}: {
  item: Item;
  onUpdate: (v: {
    winner: Winner;
    reasonTags?: string[];
    notes?: string;
    scoreMismatch?: boolean;
  }) => void;
  isPending: boolean;
}) {
  const [tags, setTags] = useState<string[]>(item.reasonTags);
  const [notes, setNotes] = useState(item.notes);
  const [scoreMismatch, setScoreMismatch] = useState(item.scoreMismatch);

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const v2Scores = useMemo(() => {
    if (!item.v2) return null;
    try {
      return JSON.parse(item.v2.scoresJson) as Record<string, number>;
    } catch {
      return null;
    }
  }, [item.v2]);

  return (
    <div className="rounded-lg border border-border bg-card/70 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {item.actionType || item.issueCode}
          </div>
          <div className="mt-1 font-medium text-foreground">
            {item.pageUrl ?? item.pageId}
          </div>
          {item.issueMessage && (
            <div className="mt-1 text-xs text-muted-foreground">{item.issueMessage}</div>
          )}
        </div>
        <div
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            item.winner === "unreviewed"
              ? "border border-border text-muted-foreground"
              : "border border-primary/40 bg-primary/10 text-primary"
          }`}
        >
          {item.winner}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* V1 */}
        <div className="rounded-md border border-blue-400/30 bg-blue-500/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              V1
            </span>
            {item.v1 && (
              <span className="text-xs text-muted-foreground">
                conf {(item.v1.confidence * 100).toFixed(0)}% · {item.v1.status}
              </span>
            )}
          </div>
          {item.v1 ? (
            <>
              <div className="mb-2 text-xs text-muted-foreground">{item.v1.proposalType}</div>
              <pre className="mb-2 max-h-40 overflow-auto rounded bg-background/60 p-2 text-xs">
                {tryFormat(item.v1.afterJson)}
              </pre>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Before / rationale</summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-background/60 p-2">
                  {tryFormat(item.v1.beforeJson)}
                </pre>
                <p className="mt-2 whitespace-pre-wrap">{item.v1.rationale}</p>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No matching V1 proposal.</p>
          )}
        </div>

        {/* V2 */}
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              V2
            </span>
            {item.v2 && (
              <span className="text-xs text-muted-foreground">
                {item.v2.status} · {item.v2.modelUsed}
              </span>
            )}
          </div>
          {item.v2 ? (
            <>
              <div className="mb-2 text-sm font-medium text-foreground">{item.v2.title}</div>
              {item.v2.blockReason && (
                <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600">
                  {item.v2.blockReason}
                </div>
              )}
              <pre className="mb-2 max-h-40 overflow-auto rounded bg-background/60 p-2 text-xs">
                {tryFormat(item.v2.afterJson)}
              </pre>
              {v2Scores && (
                <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                  {Object.entries(v2Scores).map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded border border-border bg-background/60 px-1.5 py-0.5"
                    >
                      {k}: {typeof v === "number" ? v.toFixed(1) : String(v)}
                    </span>
                  ))}
                </div>
              )}
              {item.v2.riskFlags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-amber-700">
                  {item.v2.riskFlags.map((f) => (
                    <span
                      key={f}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5"
                    >
                      ⚠ {f}
                    </span>
                  ))}
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Reasoning / context</summary>
                <p className="mt-2 whitespace-pre-wrap">{item.v2.reasoning}</p>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-background/60 p-2">
                  {tryFormat(item.v2.contextUsedJson)}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No matching V2 proposal.</p>
          )}
        </div>
      </div>

      {/* Verdict + feedback */}
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          {WINNER_BUTTONS.map((b) => (
            <button
              key={b.value}
              type="button"
              disabled={isPending}
              onClick={() =>
                onUpdate({ winner: b.value, reasonTags: tags, notes, scoreMismatch })
              }
              className={`rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-60 ${
                item.winner === b.value ? b.tone : "border-border text-muted-foreground"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {REASON_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                tags.includes(t)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={scoreMismatch}
            onChange={(e) => setScoreMismatch(e.target.checked)}
          />
          Score mismatch (evaluator score doesn't match human judgment)
        </label>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for the operator log…"
          rows={2}
          className="w-full rounded-md border border-border bg-background/60 p-2 text-xs"
        />

        <div className="flex justify-end">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              onUpdate({
                winner: item.winner === "unreviewed" ? "needs_edit" : (item.winner as Winner),
                reasonTags: tags,
                notes,
                scoreMismatch,
              })
            }
            className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            Save tags / notes
          </button>
        </div>
      </div>
    </div>
  );
}
