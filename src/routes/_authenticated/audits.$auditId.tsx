import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getAudit } from "@/lib/shared/db/repos/audits.functions";

export const Route = createFileRoute("/_authenticated/audits/$auditId")({
  component: AuditDetailPage,
});

interface Issue {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

function AuditDetailPage() {
  const { auditId } = Route.useParams();
  const fetchAudit = useServerFn(getAudit);

  const q = useQuery({
    queryKey: ["audit", auditId],
    queryFn: () => fetchAudit({ data: { auditId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.audit?.status;
      return status === "running" || status === "queued" ? 2000 : false;
    },
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
          <div className="mt-4">
            <Link
              to="/audits/$auditId/proposals"
              params={{ auditId }}
              className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
            >
              View SEO fix proposals →
            </Link>
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
