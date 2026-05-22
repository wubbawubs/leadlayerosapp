import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { getAudit } from "@/lib/shared/db/repos/audits.functions";
import {
  analyzeAuditPageIntelligence,
  listPageIntelligenceForAudit,
} from "@/lib/shared/pageIntelligence/repo.functions";

export const Route = createFileRoute("/_authenticated/audits/$auditId")({
  component: AuditDetailPage,
});

interface Issue {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

interface PiRow {
  id: string;
  page_id: string | null;
  audit_page_id: string | null;
  page_url: string | null;
  page_type: string;
  intent: string;
  funnel_stage: string | null;
  commercial_priority: string;
  seo_role: string | null;
  primary_topic: string | null;
  content_summary: string | null;
  target_audience: string | null;
  desired_action: string | null;
  recommended_cta: string | null;
  relevant_strategy_angle: string | null;
  local_relevance: Record<string, unknown>;
  risk_flags: Array<{ flag: string; level: string; why?: string }>;
  missing_page_context: Array<{ missing: string; impact?: string }>;
  source_evidence: Array<{ field: string; quote: string }>;
  confidence: number;
}

function AuditDetailPage() {
  const { auditId } = Route.useParams();
  const qc = useQueryClient();
  const fetchAudit = useServerFn(getAudit);
  const fetchPi = useServerFn(listPageIntelligenceForAudit);
  const analyzePi = useServerFn(analyzeAuditPageIntelligence);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const q = useQuery({
    queryKey: ["audit", auditId],
    queryFn: () => fetchAudit({ data: { auditId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.audit?.status;
      return status === "running" || status === "queued" ? 2000 : false;
    },
  });

  const piQuery = useQuery({
    queryKey: ["page-intelligence", auditId],
    queryFn: () => fetchPi({ data: { auditId } }),
    enabled: q.data?.audit?.status === "succeeded",
  });

  const piByAuditPage = useMemo(() => {
    const map = new Map<string, PiRow>();
    for (const row of (piQuery.data?.items ?? []) as unknown as PiRow[]) {
      if (row.audit_page_id) map.set(row.audit_page_id, row);
    }
    return map;
  }, [piQuery.data]);

  const analyzeMutation = useMutation({
    mutationFn: () => analyzePi({ data: { auditId } }),
    onSuccess: (res) => {
      const s = res.summary;
      toast.success(
        `Analyzed ${s.analyzedCount} pages · ${s.criticalCount} critical · ${s.highCount} high${s.failedCount ? ` · ${s.failedCount} failed` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["page-intelligence", auditId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pages = q.data?.pages ?? [];
  const audit = q.data?.audit;
  const summary = (audit?.summary ?? {}) as {
    pages_total?: number;
    pages_ok?: number;
    issues_total?: number;
    health_score?: number;
    issues_by_code?: Record<string, number>;
  };

  const grouped = useMemo(() => {
    const counts = new Map<string, { count: number; severity: string; sample: string }>();
    for (const p of pages) {
      for (const i of (p.issues ?? []) as unknown as Issue[]) {
        const cur = counts.get(i.code) ?? { count: 0, severity: i.severity, sample: i.message };
        cur.count++;
        counts.set(i.code, cur);
      }
    }
    return Array.from(counts.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || b.count - a.count;
      });
  }, [pages]);

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-muted-foreground">Loading audit…</p>
      </div>
    );
  }
  if (q.error || !audit) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-destructive text-sm">
          {(q.error as Error)?.message ?? "Audit not found"}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <Link
          to="/sites/$siteId/audits"
          params={{ siteId: audit.site_connection_id }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to audits
        </Link>
      </div>

      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Audit · {audit.status}
        </p>
        <h1 className="font-display text-4xl text-foreground">
          {new Date(audit.created_at).toLocaleString()}
        </h1>
        {audit.error && (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {audit.error}
          </p>
        )}
        {audit.status === "succeeded" && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/audits/$auditId/proposals"
              params={{ auditId }}
              className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
            >
              View SEO fix proposals →
            </Link>
            <button
              type="button"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              {analyzeMutation.isPending ? "Analyzing pages…" : "Analyze page intelligence"}
            </button>
            {piQuery.data && (
              <span className="self-center text-xs text-muted-foreground">
                {piByAuditPage.size} page{piByAuditPage.size === 1 ? "" : "s"} classified
              </span>
            )}
          </div>
        )}
      </div>


      {/* Summary cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Pages" value={summary.pages_total ?? audit.pages_count} />
        <SummaryCard label="Pages OK" value={summary.pages_ok ?? "—"} />
        <SummaryCard label="Issues" value={summary.issues_total ?? 0} />
        <SummaryCard
          label="Health"
          value={typeof summary.health_score === "number" ? `${summary.health_score}/100` : "—"}
        />
      </div>

      {/* Issues by category */}
      {grouped.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-2xl text-foreground">Top issues</h2>
          <div className="space-y-2">
            {grouped.map((g) => (
              <div
                key={g.code}
                className="flex items-center justify-between rounded-md border border-border bg-card/70 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <SeverityDot severity={g.severity} />
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-foreground">{g.code}</p>
                    <p className="truncate text-xs text-muted-foreground">{g.sample}</p>
                  </div>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  {g.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pages */}
      <section>
        <h2 className="mb-3 font-display text-2xl text-foreground">Pages</h2>
        <div className="space-y-2">
          {pages.map((p) => {
            const issues = (p.issues ?? []) as unknown as Issue[];
            const pi = piByAuditPage.get(p.id);
            const isOpen = expanded.has(p.id);
            return (
              <div key={p.id} className="rounded-md border border-border bg-card/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate font-mono text-sm text-foreground hover:underline"
                    >
                      {p.url}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.title ?? "(no title)"}
                    </p>
                    {pi && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <PiBadge variant="type">{pi.page_type}</PiBadge>
                        <PiBadge variant="intent">{pi.intent}</PiBadge>
                        <PiBadge variant={priorityVariant(pi.commercial_priority)}>
                          {pi.commercial_priority}
                        </PiBadge>
                        <span className="text-[10px] text-muted-foreground">
                          conf {Math.round((pi.confidence ?? 0) * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleExpand(p.id)}
                          className="ml-1 text-[11px] text-primary hover:underline"
                        >
                          {isOpen ? "Hide details" : "Details"}
                        </button>
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      HTTP {p.status_code ?? "—"} · {p.word_count} words · {p.images_without_alt} img w/o alt · {p.internal_links_count} internal / {p.external_links_count} external links
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                    {issues.length} issue{issues.length === 1 ? "" : "s"}
                  </span>
                </div>
                {issues.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {issues.map((i, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs">
                        <SeverityDot severity={i.severity} />
                        <span className="font-mono text-muted-foreground">{i.code}</span>
                        <span className="text-foreground/80">— {i.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {pi && isOpen && <PiDetails pi={pi} />}
              </div>
            );
          })}
          {pages.length === 0 && audit.status !== "running" && (
            <p className="text-sm text-muted-foreground">No pages in this audit.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl text-foreground">{value}</p>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    high: "bg-destructive",
    medium: "bg-amber-500",
    low: "bg-muted-foreground",
  };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${map[severity] ?? "bg-muted"}`} />;
}

type BadgeVariant = "type" | "intent" | "low" | "medium" | "high" | "critical";

function priorityVariant(p: string): BadgeVariant {
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  if (p === "medium") return "medium";
  return "low";
}

function PiBadge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  const cls: Record<BadgeVariant, string> = {
    type: "bg-muted text-foreground",
    intent: "bg-primary/10 text-primary",
    low: "bg-muted text-muted-foreground",
    medium: "bg-amber-500/15 text-amber-600",
    high: "bg-orange-500/15 text-orange-600",
    critical: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls[variant]}`}>
      {children}
    </span>
  );
}

function PiDetails({ pi }: { pi: PiRow }) {
  return (
    <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
      <DetailRow label="Topic" value={pi.primary_topic} />
      <DetailRow label="Summary" value={pi.content_summary} />
      <DetailRow label="Audience" value={pi.target_audience} />
      <DetailRow label="Desired action" value={pi.desired_action} />
      <DetailRow label="Recommended CTA" value={pi.recommended_cta} />
      <DetailRow label="Strategy angle" value={pi.relevant_strategy_angle} />
      <DetailRow label="Funnel" value={pi.funnel_stage} />
      <DetailRow label="SEO role" value={pi.seo_role} />
      {pi.local_relevance && (pi.local_relevance as { isLocal?: boolean }).isLocal && (
        <DetailRow
          label="Local"
          value={`${(pi.local_relevance as { location?: string }).location ?? ""} — ${(pi.local_relevance as { reason?: string }).reason ?? ""}`}
        />
      )}
      {pi.risk_flags?.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-foreground">Risk flags</p>
          <ul className="space-y-1">
            {pi.risk_flags.map((r, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-mono text-foreground">[{r.level}]</span> {r.flag}
                {r.why ? ` — ${r.why}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pi.missing_page_context?.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-foreground">Missing context</p>
          <ul className="space-y-1">
            {pi.missing_page_context.map((m, i) => (
              <li key={i} className="text-muted-foreground">
                {m.missing}
                {m.impact ? ` — ${m.impact}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pi.source_evidence?.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-foreground">Evidence</p>
          <ul className="space-y-1">
            {pi.source_evidence.map((e, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-mono text-foreground">{e.field}:</span> “{e.quote}”
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <p className="text-muted-foreground">
      <span className="font-semibold text-foreground">{label}:</span> {value}
    </p>
  );
}
