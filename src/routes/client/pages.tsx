import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Check, Loader2, Circle, Search } from "lucide-react";
import {
  getMyClientDashboard,
  getMyClientStrategy,
} from "@/lib/shared/clientPortal/clientAuth.functions";
import { ClientShell } from "@/components/app/ClientShell";
import { useCountUp, SectionLabel } from "@/components/client/bits";
import { portalCopy, formatDate, type PortalLocale } from "@/lib/shared/clientPortal/portalCopy";
import type {
  ClientPortalData,
  ClientStrategy,
} from "@/lib/shared/clientPortal/clientAuth.functions";

export const Route = createFileRoute("/client/pages")({
  component: ClientPages,
  head: () => ({ meta: [{ title: "SEO & Strategy — LeadLayer" }] }),
});

function ClientPages() {
  const fetchDashboard = useServerFn(getMyClientDashboard);
  const fetchStrategy = useServerFn(getMyClientStrategy);

  const query = useQuery({
    queryKey: ["client-dashboard"],
    queryFn: () => fetchDashboard(),
    retry: false,
  });
  const strategyQuery = useQuery({
    queryKey: ["client-strategy"],
    queryFn: () => fetchStrategy(),
    retry: false,
  });

  const portal = query.data?.data ?? null;
  const strategy = strategyQuery.data?.strategy ?? null;
  const locale: PortalLocale = portal?.locale ?? "en";
  const c = portalCopy(locale);
  const s = c.strategy;
  const pages = portal?.pages ?? [];

  const newPages = pages.filter((p) => p.type === "new_page");
  const optimizedPages = pages.filter((p) => p.type === "optimized");

  return (
    <ClientShell
      businessName={portal?.businessName}
      locale={locale}
      hero={
        <StrategyHero
          count={pages.length}
          newCount={newPages.length}
          improvedCount={optimizedPages.length}
          locale={locale}
        />
      }
    >
      {/* Strategy summary — the "why" */}
      {strategy?.summary && (
        <section className="mb-10">
          <div className="mb-4">
            <SectionLabel>{s.yourStrategy}</SectionLabel>
          </div>
          <div className="paper-card p-5">
            <p className="text-[15px] leading-relaxed text-ink">{strategy.summary}</p>
          </div>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* ── Main: pages + roadmap ── */}
        <div className="min-w-0 space-y-10">
          {/* Pages delivered */}
          <section>
            <div className="mb-4">
              <SectionLabel>{s.delivered}</SectionLabel>
            </div>
            {query.isLoading ? (
              <div className="space-y-2.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-[4px] bg-paper-subtle" />
                ))}
              </div>
            ) : pages.length === 0 ? (
              <div className="rounded-[4px] border border-dashed border-paper-line-strong px-6 py-12 text-center">
                <p className="text-base font-medium text-ink-2">{c.pagesEmptyTitle}</p>
                <p className="mx-auto mt-2 max-w-xs text-sm text-ink-3">{c.pagesEmptyBody}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {pages.map((page, i) => (
                  <PageCard key={i} page={page} locale={locale} />
                ))}
              </div>
            )}
          </section>

          {/* Roadmap */}
          {strategy && strategy.roadmap.length > 0 && (
            <section>
              <div className="mb-4">
                <SectionLabel>{s.roadmap}</SectionLabel>
              </div>
              <div className="paper-card divide-y divide-paper-line">
                {strategy.roadmap.map((item, i) => (
                  <RoadmapRow key={i} item={item} locale={locale} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Side: search coverage ── */}
        <aside>
          {strategy && strategy.coverage.length > 0 && (
            <section>
              <div className="mb-4">
                <SectionLabel>{s.coverage}</SectionLabel>
              </div>
              <div className="space-y-4">
                {strategy.coverage.map((cl, i) => (
                  <CoverageRow
                    key={i}
                    cluster={cl}
                    max={Math.max(...strategy.coverage.map((x) => x.volume ?? 0), 1)}
                    locale={locale}
                  />
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </ClientShell>
  );
}

function StrategyHero({
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
      <p className="label-mono">{c.strategy.kicker}</p>
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

function RoadmapRow({
  item,
  locale,
}: {
  item: ClientStrategy["roadmap"][number];
  locale: PortalLocale;
}) {
  const s = portalCopy(locale).strategy;
  const cfg = {
    done: {
      icon: <Check className="h-3.5 w-3.5" />,
      label: s.statusDone,
      color: "var(--paper-success)",
      bg: "rgba(31,122,54,0.12)",
    },
    in_progress: {
      icon: <Loader2 className="h-3.5 w-3.5" />,
      label: s.statusInProgress,
      color: "var(--amber-deep)",
      bg: "rgba(217,119,6,0.12)",
    },
    planned: {
      icon: <Circle className="h-3 w-3" />,
      label: s.statusPlanned,
      color: "var(--paper-info)",
      bg: "rgba(47,90,117,0.10)",
    },
  }[item.status];

  return (
    <div className="flex items-start gap-3 p-4">
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px]"
        style={{ color: cfg.color, backgroundColor: cfg.bg }}
      >
        {cfg.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p
            className={`text-[15px] font-semibold ${item.status === "done" ? "text-ink-2" : "text-ink"}`}
          >
            {item.title}
          </p>
          <span
            className="shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: cfg.color, backgroundColor: cfg.bg }}
          >
            {cfg.label}
          </span>
        </div>
        {item.description && (
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.description}</p>
        )}
      </div>
    </div>
  );
}

function CoverageRow({
  cluster,
  max,
  locale,
}: {
  cluster: ClientStrategy["coverage"][number];
  max: number;
  locale: PortalLocale;
}) {
  const s = portalCopy(locale).strategy;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium text-ink">
          <Search className="h-3.5 w-3.5 shrink-0 text-amber-deep" />
          <span className="truncate">{cluster.name}</span>
        </span>
        {cluster.volume != null && (
          <span className="shrink-0 font-mono text-[12px] text-ink-3">
            {s.searchesPerMonth(cluster.volume)}
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper-inset">
        <div
          className="h-full rounded-full"
          style={{ width: `${((cluster.volume ?? 0) / max) * 100}%`, background: "var(--amber)" }}
        />
      </div>
    </div>
  );
}
