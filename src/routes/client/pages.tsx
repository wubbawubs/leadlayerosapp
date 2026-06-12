import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { getMyClientDashboard } from "@/lib/shared/clientPortal/clientAuth.functions";
import { ClientShell } from "@/components/app/ClientShell";
import { useCountUp } from "@/components/client/bits";
import { portalCopy, formatDate, type PortalLocale } from "@/lib/shared/clientPortal/portalCopy";
import type { ClientPortalData } from "@/lib/shared/clientPortal/clientAuth.functions";

export const Route = createFileRoute("/client/pages")({
  component: ClientPages,
  head: () => ({ meta: [{ title: "Pages — LeadLayer" }] }),
});

function ClientPages() {
  const fetchDashboard = useServerFn(getMyClientDashboard);
  const query = useQuery({
    queryKey: ["client-dashboard"],
    queryFn: () => fetchDashboard(),
    retry: false,
  });

  const portal = query.data?.data ?? null;
  const locale: PortalLocale = portal?.locale ?? "en";
  const c = portalCopy(locale);
  const pages = portal?.pages ?? [];

  const newPages = pages.filter((p) => p.type === "new_page");
  const optimizedPages = pages.filter((p) => p.type === "optimized");

  return (
    <ClientShell
      businessName={portal?.businessName}
      locale={locale}
      hero={
        <PagesHero
          count={pages.length}
          newCount={newPages.length}
          improvedCount={optimizedPages.length}
          locale={locale}
        />
      }
    >
      {query.isLoading ? (
        <div className="space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-[4px] bg-paper-subtle" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-paper-line-strong px-6 py-14 text-center">
          <p className="text-base font-medium text-ink-2">{c.pagesEmptyTitle}</p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-ink-3">{c.pagesEmptyBody}</p>
        </div>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {pages.map((page, i) => (
            <PageCard key={i} page={page} locale={locale} />
          ))}
        </div>
      )}
    </ClientShell>
  );
}

function PagesHero({
  count,
  newCount,
  improvedCount,
  locale,
}: {
  count: number;
  newCount: number;
  improvedCount: number;
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);
  const animated = useCountUp(count);

  return (
    <div>
      <p className="label-mono">{c.pagesKicker}</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4">
        <span className="font-display text-6xl font-extrabold leading-none tracking-[-0.03em] text-ink">
          {animated}
        </span>
        <span className="font-display text-xl font-semibold text-ink-2">
          {c.pagesTitle(count).replace(/^\d+\s*/, "")}
        </span>
      </div>
      <div className="mt-5 flex gap-8 text-sm">
        <span className="text-ink-2">
          <span className="font-display text-base font-bold text-ink">{newCount}</span>{" "}
          {c.pagesNewBuilt.toLowerCase()}
        </span>
        <span className="text-ink-2">
          <span className="font-display text-base font-bold text-ink">{improvedCount}</span>{" "}
          {c.pagesImproved.toLowerCase()}
        </span>
      </div>
    </div>
  );
}

function PageCard({
  page,
  locale,
}: {
  page: ClientPortalData["pages"][number];
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);
  const isNew = page.type === "new_page";
  return (
    <div className="paper-card flex items-center justify-between p-4">
      <div className="min-w-0 flex-1">
        <span
          className="shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider"
          style={
            isNew
              ? { color: "var(--paper-info)", backgroundColor: "rgba(47,90,117,0.10)" }
              : { color: "var(--amber-deep)", backgroundColor: "rgba(217,119,6,0.12)" }
          }
        >
          {isNew ? c.chipNew : c.chipImproved}
        </span>
        <p className="mt-1.5 truncate text-base font-medium text-ink">{page.title}</p>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {c.liveSince} {formatDate(page.publishedAt, locale)}
        </p>
      </div>
      {page.url && (
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={c.openPage(page.title)}
          className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border border-paper-line text-ink-2 transition hover:border-amber hover:text-amber-deep"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
