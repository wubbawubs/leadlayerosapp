import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText } from "lucide-react";
import { getMyClientDashboard } from "@/lib/shared/clientPortal/clientAuth.functions";
import { ClientShell } from "@/components/app/ClientShell";
import { portalCopy, formatMoney, type PortalLocale } from "@/lib/shared/clientPortal/portalCopy";
import type { ClientPortalData } from "@/lib/shared/clientPortal/clientAuth.functions";

export const Route = createFileRoute("/client/reports")({
  component: ClientReports,
  head: () => ({ meta: [{ title: "Reports — LeadLayer" }] }),
});

function ClientReports() {
  const fetchDashboard = useServerFn(getMyClientDashboard);
  const query = useQuery({
    queryKey: ["client-dashboard"],
    queryFn: () => fetchDashboard(),
    retry: false,
  });

  const portal = query.data?.data ?? null;
  const locale: PortalLocale = portal?.locale ?? "en";
  const c = portalCopy(locale);
  const reports = portal?.reports ?? [];

  return (
    <ClientShell
      businessName={portal?.businessName}
      locale={locale}
      hero={
        <div>
          <p className="label-mono">{c.reportsKicker}</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.03em] text-ink sm:text-5xl">
            {c.reportsTitle}
          </h1>
          <p className="mt-3 max-w-md text-base text-ink-2">{c.reportsSubtitle}</p>
        </div>
      }
    >
      {query.isLoading ? (
        <div className="space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-[4px] bg-paper-subtle" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-paper-line-strong px-6 py-14 text-center">
          <p className="text-base text-ink-2">{c.reportsEmptyTitle}</p>
          <p className="mt-1.5 text-sm text-ink-3">{c.reportsEmptyBody}</p>
        </div>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {reports.map((report, i) => (
            <ReportCard key={i} report={report} isLatest={i === 0} locale={locale} />
          ))}
        </div>
      )}
    </ClientShell>
  );
}

function ReportCard({
  report,
  isLatest,
  locale,
}: {
  report: ClientPortalData["reports"][number];
  isLatest: boolean;
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);

  if (!report.shareToken) {
    return (
      <div className="paper-card p-4 opacity-60">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-ink-3" />
          <div>
            <p className="text-base font-medium text-ink">{report.periodLabel}</p>
            <p className="text-[13px] text-ink-3">{c.reportPreparing}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <a
      href={`/r/${report.shareToken}`}
      target="_blank"
      rel="noopener noreferrer"
      className="paper-card flex items-center justify-between p-4"
      style={isLatest ? { borderLeft: "3px solid var(--amber)" } : undefined}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[4px] bg-paper-subtle">
          <FileText className={`h-4 w-4 ${isLatest ? "text-amber-deep" : "text-ink-3"}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-display text-base font-semibold text-ink">{report.periodLabel}</p>
            {isLatest && (
              <span className="rounded-[3px] bg-amber/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-deep">
                {c.reportLatest}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-2">
            {report.leadCount > 0 && <span>{c.reportLeads(report.leadCount)}</span>}
            {report.revenue > 0 && (
              <span className="font-medium text-paper-success">
                {c.wonValue(formatMoney(report.revenue, locale))}
              </span>
            )}
            {report.pagesPublished > 0 && <span>{c.reportPages(report.pagesPublished)}</span>}
          </div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-3" />
    </a>
  );
}
