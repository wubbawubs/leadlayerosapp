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

type ButtonDef = { value: Winner; label: string; tone: string };

const COMPARE_BUTTONS: ButtonDef[] = [
  { value: "v1", label: "V1 better", tone: "border-blue-400/40 bg-blue-500/10 text-blue-600" },
  { value: "v2", label: "V2 better", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" },
  { value: "both_good", label: "Both good", tone: "border-violet-500/40 bg-violet-500/10 text-violet-600" },
  { value: "both_bad", label: "Both bad", tone: "border-red-500/40 bg-red-500/10 text-red-600" },
  { value: "needs_edit", label: "Needs edit", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
];

// V2-only review mode — same stored winner values, friendlier labels.
const V2_ONLY_BUTTONS: ButtonDef[] = [
  { value: "v2", label: "Approve quality", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" },
  { value: "both_good", label: "Good, review later", tone: "border-violet-500/40 bg-violet-500/10 text-violet-600" },
  { value: "needs_edit", label: "Needs edit", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
  { value: "both_bad", label: "Reject", tone: "border-red-500/40 bg-red-500/10 text-red-600" },
];

// Cosmetic relabeling for V2-only mode. Stored tag values are unchanged.
const V2_ONLY_TAG_LABELS: Record<string, string> = {
  better_tone: "good_tone",
  better_seo: "good_seo",
  better_business_fit: "good_business_fit",
  better_page_fit: "good_page_fit",
  less_generic: "not_generic",
};

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

  const hasAnyV1 = items.some((i) => Boolean(i.v1));
  const v2OnlyMode = items.length > 0 && !hasAnyV1;

  // V2-only metrics (derived client-side from the same winner values).
  const v2Metrics = useMemo(() => {
    const m = { approved: 0, reviewLater: 0, needsEdit: 0, rejected: 0 };
    for (const it of items) {
      if (it.winner === "v2") m.approved++;
      else if (it.winner === "both_good") m.reviewLater++;
      else if (it.winner === "needs_edit") m.needsEdit++;
      else if (it.winner === "both_bad") m.rejected++;
    }
    return m;
  }, [items]);

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
            {v2OnlyMode ? "QA Review V2" : "QA Compare V1"}
          </p>
          <h1 className="font-display text-4xl text-foreground">
            {v2OnlyMode ? "QA Review V2" : "V1 vs V2 proposals"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {v2OnlyMode
              ? "Review V2 proposals and capture operator feedback. V1 is being phased out and is not available for this set."
              : "Compare each issue side by side and capture operator feedback."}
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
          {v2OnlyMode ? (
            <>
              <Stat label="Approved" value={v2Metrics.approved} />
              <Stat label="Review later" value={v2Metrics.reviewLater} />
              <Stat label="Needs edit" value={v2Metrics.needsEdit} />
              <Stat label="Rejected" value={v2Metrics.rejected} />
              <Stat label="Correctly blocked" value={summary.correctlyBlocked ?? 0} />
              <Stat
                label="Copy approval rate"
                value={
                  summary.copyReviewed && summary.copyReviewed > 0
                    ? `${Math.round((summary.copyApprovalRate ?? 0) * 100)}%`
                    : "—"
                }
              />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {v2OnlyMode && summary && (summary.correctlyBlocked ?? 0) > 0 && (
        <p className="mb-4 text-[11px] text-muted-foreground">
          Copy approval rate excludes {summary.correctlyBlocked} correctly blocked schema
          proposal{summary.correctlyBlocked === 1 ? "" : "s"} (denominator: copy proposals only,
          {" "}{summary.copyTotal ?? 0} total).
        </p>
      )}

      {summary && summary.v2AverageWeighted !== null && (
        <p className="mb-4 text-xs text-muted-foreground">
          V2 avg weighted score:{" "}
          <span className="text-foreground">{summary.v2AverageWeighted.toFixed(2)}</span>
          {!v2OnlyMode && (
            <>
              {" "}· Per-action V2 win rate:{" "}
              {Object.entries(summary.winRateByAction).map(([k, v]) => (
                <span key={k} className="mr-3">
                  {k}: {v.reviewed > 0 ? `${Math.round((v.wins / v.reviewed) * 100)}%` : "—"} (
                  {v.reviewed})
                </span>
              ))}
            </>
          )}
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

  const hasV1 = Boolean(item.v1);
  const buttons = hasV1 ? COMPARE_BUTTONS : V2_ONLY_BUTTONS;

  // Detect schema proposals correctly blocked due to missing verified proof —
  // surface as "correctly blocked" hint so operators don't mark them as "Needs edit".
  const isSchemaCorrectlyBlocked =
    (item as Item & { correctlyBlocked?: boolean }).correctlyBlocked === true ||
    (!!item.v2 &&
      item.v2.actionType === "propose_schema" &&
      (item.v2.status === "rejected" || !!item.v2.blockReason) &&
      /(verified|proof|business proof|verifiedProofPoints|business identity)/i.test(
        `${item.v2.blockReason ?? ""} ${item.v2.reasoning ?? ""}`,
      ));

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
          {item.hasPriorReview && item.winner === "unreviewed" && (
            <div className="mt-2 text-[11px] italic text-muted-foreground">
              Previous review exists from an older run.
            </div>
          )}
          {isSchemaCorrectlyBlocked && (
            <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-700">
              ✓ Correctly blocked — schema should not be generated without verified business proof.
              Use "Good, review later" or tag <code>correct_safety_block</code> instead of "Needs edit".
              Excluded from copy approval rate.
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {isSchemaCorrectlyBlocked && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700">
              Correctly blocked
            </div>
          )}
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
      </div>

      <div className={`grid gap-4 ${hasV1 ? "lg:grid-cols-2" : ""}`}>
        {/* V1 — only when present */}
        {hasV1 && item.v1 && (
          <div className="rounded-md border border-blue-400/30 bg-blue-500/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                V1
              </span>
              <span className="text-xs text-muted-foreground">
                conf {(item.v1.confidence * 100).toFixed(0)}% · {item.v1.status}
              </span>
            </div>
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
          </div>
        )}

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

      {!hasV1 && (
        <p className="mt-3 text-[11px] italic text-muted-foreground">
          V1 proposal not available. Reviewing V2 output directly.
        </p>
      )}

      {/* Verdict + feedback */}
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          {buttons.map((b) => (
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
          {REASON_TAGS.map((t) => {
            const label = !hasV1 && V2_ONLY_TAG_LABELS[t] ? V2_ONLY_TAG_LABELS[t] : t;
            return (
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
                {label}
              </button>
            );
          })}
        </div>

        {!hasV1 ? (
          <label
            className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
              scoreMismatch
                ? "border-amber-500/50 bg-amber-500/10 text-amber-800"
                : "border-border bg-background/40 text-muted-foreground"
            }`}
          >
            <input
              type="checkbox"
              checked={scoreMismatch}
              onChange={(e) => setScoreMismatch(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Score mismatch</span> — use this when the
              evaluator score feels too low or too high compared to the actual output.
              Critical signal for tuning businessFit / offerFit.
            </span>
          </label>
        ) : (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={scoreMismatch}
              onChange={(e) => setScoreMismatch(e.target.checked)}
            />
            Score mismatch (evaluator score doesn't match human judgment)
          </label>
        )}

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
