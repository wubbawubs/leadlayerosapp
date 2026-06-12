/**
 * Public monthly report share page — no auth required.
 *
 * Accessible at /r/:shareToken
 * Fetches report by share_token via service_role (supabaseAdmin).
 * Never exposes tenant_id, internal IDs, or debug data.
 * Read-only — no editing, no login, no client portal.
 *
 * Design: paper editorial document (DESIGN.md v3). This page gets
 * forwarded to people who've never seen LeadLayer — it has to read
 * like a printed proof-of-work, not an app screen. Localized via the
 * tenant's geo (NL → Dutch, US → English).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getReportByShareToken } from "@/lib/shared/monthlyReports/monthlyReports.functions";
import type { MonthlyReport } from "@/lib/shared/monthlyReports/schemas";
import { AnimatedMark } from "@/components/brand/AnimatedMark";
import { Mark } from "@/components/brand/Mark";
import { portalCopy, type PortalLocale } from "@/lib/shared/clientPortal/portalCopy";

// ------------------------------------------------------------------
// Server function — no auth middleware. Public token lookup.
// ------------------------------------------------------------------

const fetchByToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const result = await getReportByShareToken(data.token);
    return { report: result?.report ?? null, locale: result?.locale ?? ("en" as const) };
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

  const locale: PortalLocale = query.data?.locale ?? "en";
  const cr = portalCopy(locale).report;

  if (query.isLoading) {
    return (
      <div className="paper flex min-h-screen flex-col items-center justify-center gap-5">
        <AnimatedMark className="h-9 w-9" />
        <p className="label-mono">{cr.loading}</p>
      </div>
    );
  }

  const report = query.data?.report ?? null;

  if (!report) {
    return (
      <div className="paper flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Mark className="h-8 w-8" />
        <p className="font-display text-xl font-bold text-ink">{cr.notFoundTitle}</p>
        <p className="max-w-sm text-base text-ink-2">{cr.notFoundBody}</p>
      </div>
    );
  }

  return <PublicReportView report={report} locale={locale} />;
}

function PublicReportView({ report, locale }: { report: MonthlyReport; locale: PortalLocale }) {
  const cr = portalCopy(locale).report;
  const gp = report.goalProgressSummary;
  const ls = report.leadSummary;
  const es = report.executionSummary;
  const ws = report.wordpressSummary;

  return (
    <div className="paper paper-grain min-h-screen">
      {/* Charcoal masthead */}
      <header className="surface-charcoal">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="flex items-center justify-between">
            <p className="label-mono">{cr.kicker}</p>
            <Mark className="h-6 w-6" />
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
            {formatPeriod(report.periodStart, report.periodEnd, locale)}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-6 py-10">
        {/* Goal progress */}
        <section>
          <SectionHeader>{cr.goalProgress}</SectionHeader>
          <div className="paper-card grid grid-cols-2 divide-x divide-paper-line sm:grid-cols-4">
            <Stat label={cr.leadsThisPeriod} value={gp.actualLeads} />
            <Stat label={cr.requiredPerMonth} value={gp.requiredLeadsPerMonth ?? "—"} />
            <Stat
              label={cr.gap}
              value={gp.gap != null ? (gp.gap > 0 ? `−${gp.gap}` : cr.onTrack) : "—"}
              tone={gp.gap != null && gp.gap > 0 ? "warn" : gp.gap != null ? "good" : undefined}
            />
            <Stat
              label={ws.draftsPublished > 0 ? cr.pagesPublished : cr.pagesInDraft}
              value={ws.draftsPublished > 0 ? ws.draftsPublished : ws.draftsCreated}
            />
          </div>
          {gp.provenRevenue > 0 && (
            <div
              className="mt-3 rounded-[4px] border px-5 py-4"
              style={{
                borderColor: "rgba(31,122,54,0.3)",
                backgroundColor: "rgba(31,122,54,0.07)",
              }}
            >
              <p className="label-mono" style={{ color: "var(--paper-success)" }}>
                {cr.closedRevenue}
              </p>
              <p className="mt-1.5 font-display text-3xl font-bold tracking-tight text-paper-success">
                €{gp.provenRevenue.toLocaleString(locale === "nl" ? "nl-NL" : "en-US")}
              </p>
              <p className="mt-1 text-sm text-ink-2">{cr.fromWonLeads(gp.wonLeadCount)}</p>
            </div>
          )}
          {gp.paceNote && (
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{gp.paceNote}</p>
          )}
        </section>

        {/* Lead breakdown — only show if there are leads */}
        {ls.total > 0 && (
          <section>
            <SectionHeader>{cr.leadBreakdown}</SectionHeader>
            <div className="paper-card grid grid-cols-3 divide-x divide-paper-line sm:grid-cols-5">
              <Stat label={cr.lbNew} value={ls.new} />
              <Stat label={cr.lbQualified} value={ls.qualified} />
              <Stat label={cr.lbWon} value={ls.won} tone={ls.won > 0 ? "good" : undefined} />
              <Stat label={cr.lbLost} value={ls.lost} />
              <Stat label={cr.lbJunk} value={ls.junk} />
            </div>
          </section>
        )}

        {/* Delivery — only show if something was delivered */}
        {(es.artifactsApproved > 0 ||
          ws.draftsCreated > 0 ||
          ws.draftsPublished > 0 ||
          es.masterplanItemsDone > 0 ||
          (ws.pagesOptimized ?? 0) > 0) && (
          <section>
            <SectionHeader>{cr.workDelivered}</SectionHeader>
            <div className="paper-card grid grid-cols-2 divide-x divide-paper-line sm:grid-cols-3">
              {ws.draftsPublished > 0 && (
                <Stat label={cr.pagesPublished} value={ws.draftsPublished} />
              )}
              {(ws.pagesOptimized ?? 0) > 0 && (
                <Stat label={cr.pagesImprovedStat} value={ws.pagesOptimized ?? 0} />
              )}
              {ws.draftsCreated > 0 && ws.draftsPublished < ws.draftsCreated && (
                <Stat label={cr.draftsInProgress} value={ws.draftsCreated - ws.draftsPublished} />
              )}
              {es.artifactsApproved > 0 && (
                <Stat label={cr.briefsApproved} value={es.artifactsApproved} />
              )}
              {es.masterplanItemsDone > 0 && (
                <Stat label={cr.tasksCompleted} value={es.masterplanItemsDone} />
              )}
            </div>
            {ws.drafts.length > 0 && (
              <ul className="mt-3 divide-y divide-paper-line border-y border-paper-line">
                {ws.drafts.map((d, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-4 py-2.5 text-[15px]"
                  >
                    <span className="min-w-0 truncate font-medium text-ink">
                      {d.title ?? d.targetSlug ?? "Untitled"}
                    </span>
                    <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-ink-3">
                      {d.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Narrative */}
        {report.narrative && (
          <section>
            <SectionHeader>{cr.summary}</SectionHeader>
            <div className="paper-card p-5">
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink">
                {report.narrative}
              </pre>
            </div>
          </section>
        )}

        {/* Next actions — numbered, editorial */}
        {report.nextActions.length > 0 && (
          <section>
            <SectionHeader>{cr.nextUp}</SectionHeader>
            <ul className="space-y-3">
              {report.nextActions.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-[15px] leading-snug text-ink">
                  <span
                    className="mt-px font-mono text-sm font-semibold"
                    style={{
                      color:
                        a.priority === "critical" || a.priority === "high"
                          ? "var(--amber-signal)"
                          : "var(--amber-deep)",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {a.label}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Risks — only show if any exist */}
        {report.risks.length > 0 && (
          <section>
            <SectionHeader>{cr.worthKnowing}</SectionHeader>
            <div
              className="rounded-[4px] border px-5 py-4"
              style={{
                borderColor: "rgba(217,119,6,0.35)",
                backgroundColor: "rgba(217,119,6,0.07)",
              }}
            >
              <ul className="space-y-2">
                {report.risks.map((r, i) => (
                  <li key={i} className="text-[15px] leading-relaxed text-ink-2">
                    <span className="font-semibold text-amber-deep">{r.label}</span>
                    {r.description ? ` — ${r.description}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="pt-2">
          <div className="rule-hair" />
          <div className="flex items-center justify-between py-5">
            <div className="flex items-center gap-2">
              <Mark className="h-5 w-5" />
              <span className="text-sm text-ink-3">{cr.generatedBy}</span>
            </div>
            <span className="text-sm text-ink-3">{cr.readOnly}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="label-mono">{children}</p>
      <div className="rule-hair mt-2" />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "warn";
}) {
  const color =
    tone === "good" ? "text-paper-success" : tone === "warn" ? "text-amber-signal" : "text-ink";
  return (
    <div className="px-4 py-4">
      <p className={`font-display text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      <p className="mt-1 text-[13px] text-ink-2">{label}</p>
    </div>
  );
}

function formatPeriod(start: string, end: string, locale: PortalLocale): string {
  const intl = locale === "nl" ? "nl-NL" : "en-US";
  try {
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    return `${s.toLocaleDateString(intl, { month: "long", day: "numeric", timeZone: "UTC" })} – ${e.toLocaleDateString(intl, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
  } catch {
    return `${start} – ${end}`;
  }
}
