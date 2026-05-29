/**
 * Public monthly report share page — no auth required.
 *
 * Accessible at /r/:shareToken
 * Fetches report by share_token via service_role (supabaseAdmin).
 * Never exposes tenant_id, internal IDs, or debug data.
 * Read-only — no editing, no login, no client portal.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getReportByShareToken } from "@/lib/shared/monthlyReports/monthlyReports.functions";
import type { MonthlyReport } from "@/lib/shared/monthlyReports/schemas";

// ------------------------------------------------------------------
// Server function — no auth middleware. Public token lookup.
// ------------------------------------------------------------------

const fetchByToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const report = await getReportByShareToken(data.token);
    return { report };
  });

// ------------------------------------------------------------------
// Route
// ------------------------------------------------------------------

export const Route = createFileRoute("/r/$shareToken")({
  component: PublicReportPage,
  head: () => ({
    meta: [{ title: "Monthly Progress Report" }],
  }),
});

function PublicReportPage() {
  const { shareToken } = Route.useParams();

  const doFetch = useServerFn(fetchByToken);
  const query = useQuery({
    queryKey: ["public-report", shareToken],
    queryFn: () => doFetch({ data: { token: shareToken } }),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading report…</p>
      </div>
    );
  }

  const report = query.data?.report ?? null;

  if (!report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <p className="text-2xl font-semibold text-foreground">Report not found</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This link may have expired or been revoked. Contact your LeadLayer operator for a new link.
        </p>
      </div>
    );
  }

  return <PublicReportView report={report} />;
}

function PublicReportView({ report }: { report: MonthlyReport }) {
  const gp = report.goalProgressSummary;
  const ls = report.leadSummary;
  const es = report.executionSummary;
  const ws = report.wordpressSummary;

  return (
    <div className="min-h-screen bg-background">
      {/* Simple header — no branding that exposes operator details */}
      <header className="border-b border-border">
        <div className="container mx-auto max-w-3xl px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Monthly Progress Report
          </p>
          <h1 className="mt-1 font-display text-2xl text-foreground">
            {formatPeriod(report.periodStart, report.periodEnd)}
          </h1>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl space-y-8 px-6 py-8">

        {/* Goal progress */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Goal progress
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Leads this period"
              value={gp.actualLeads}
            />
            <Stat
              label="Required / month"
              value={gp.requiredLeadsPerMonth ?? "—"}
            />
            <Stat
              label="Gap"
              value={gp.gap != null ? (gp.gap > 0 ? `−${gp.gap}` : "✓ on track") : "—"}
              highlight={gp.gap != null && gp.gap > 0}
            />
            <Stat
              label={ws.draftsPublished > 0 ? "Pages published" : "Pages in draft"}
              value={ws.draftsPublished > 0 ? ws.draftsPublished : ws.draftsCreated}
            />
          </div>
          {gp.provenRevenue > 0 && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">Recorded closed revenue</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">
                €{gp.provenRevenue.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                From {gp.wonLeadCount} won lead{gp.wonLeadCount !== 1 ? "s" : ""} this period
              </p>
            </div>
          )}
          {gp.paceNote && (
            <p className="mt-3 text-sm text-muted-foreground">{gp.paceNote}</p>
          )}
        </section>

        {/* Lead breakdown — only show if there are leads */}
        {ls.total > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Lead breakdown
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 text-sm">
              <Stat label="New" value={ls.new} />
              <Stat label="Qualified" value={ls.qualified} />
              <Stat label="Won" value={ls.won} />
              <Stat label="Lost" value={ls.lost} />
              <Stat label="Unqualified" value={ls.unqualified} />
            </div>
          </section>
        )}

        {/* Delivery — only show if something was delivered */}
        {(es.artifactsApproved > 0 || ws.draftsCreated > 0 || ws.draftsPublished > 0 || es.masterplanItemsDone > 0) && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Delivery
            </h2>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {ws.draftsPublished > 0 && (
                <Stat label="Pages published" value={ws.draftsPublished} />
              )}
              {ws.draftsCreated > 0 && ws.draftsPublished < ws.draftsCreated && (
                <Stat label="Drafts pending" value={ws.draftsCreated - ws.draftsPublished} />
              )}
              {es.artifactsApproved > 0 && (
                <Stat label="Briefs approved" value={es.artifactsApproved} />
              )}
              {es.masterplanItemsDone > 0 && (
                <Stat label="Tasks completed" value={es.masterplanItemsDone} />
              )}
            </div>
            {ws.drafts.length > 0 && (
              <ul className="mt-3 space-y-1">
                {ws.drafts.map((d, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    <span className="text-foreground">{d.title ?? d.targetSlug ?? "Untitled"}</span>
                    {" · "}
                    <span className="capitalize">{d.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Narrative */}
        {report.narrative && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Summary
            </h2>
            <div className="rounded-lg border border-border bg-card/40 p-5">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                {report.narrative}
              </pre>
            </div>
          </section>
        )}

        {/* Next actions */}
        {report.nextActions.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Next actions
            </h2>
            <ul className="space-y-2">
              {report.nextActions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      a.priority === "critical" || a.priority === "high"
                        ? "bg-amber-400"
                        : "bg-muted-foreground"
                    }`}
                  />
                  <span className="text-foreground">{a.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Risks — only show if any exist */}
        {report.risks.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-amber-400">
              Risks
            </h2>
            <ul className="space-y-1">
              {report.risks.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  <span className="font-medium text-amber-300">{r.label}</span>
                  {r.description ? ` — ${r.description}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
          Report generated by LeadLayer. This link is read-only.
        </footer>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <p className={`text-2xl font-bold ${highlight ? "text-amber-400" : "text-foreground"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    return `${s.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })} – ${e.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
  } catch {
    return `${start} – ${end}`;
  }
}
