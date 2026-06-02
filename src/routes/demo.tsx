/**
 * /demo — public sales demo, no auth required.
 * Uses DEMO_* fixtures exclusively. No backend calls.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ExternalLink, CheckCircle2, Globe, TrendingUp } from "lucide-react";

import {
  DEMO_TENANT,
  DEMO_GOAL,
  DEMO_BOARD_ITEMS,
  DEMO_PAGES,
  DEMO_LEADS,
  DEMO_REPORT,
} from "@/lib/demo/fixtures";
import { Mark } from "@/components/brand/Mark";
import { StatusPill, StatusDot, type StatusTone } from "@/components/execution/StatusPill";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
  head: () => ({ meta: [{ title: "LeadLayer Demo — Smith HVAC" }] }),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "overview" | "execution" | "pages" | "leads" | "reports";

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function DemoPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-background">
      <DemoBanner />
      <DemoHeader />
      <DemoNav tab={tab} setTab={setTab} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        {tab === "overview" && <OverviewTab />}
        {tab === "execution" && <ExecutionTab />}
        {tab === "pages" && <PagesTab />}
        {tab === "leads" && <LeadsTab />}
        {tab === "reports" && <ReportsTab />}
      </main>
      <DemoCTA />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function DemoBanner() {
  return (
    <div className="border-b border-border bg-muted/40 px-6 py-2 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Demo mode — Smith HVAC, Dallas TX · Sample data only
      </p>
    </div>
  );
}

function DemoHeader() {
  return (
    <header className="border-b border-border bg-background px-8 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <Mark className="h-6 w-6" />
            <span className="font-display text-sm font-bold tracking-tight text-foreground">
              LeadLayer
            </span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            / demo
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              § Client · Command center
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
              {DEMO_TENANT.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                {DEMO_TENANT.geo}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                {DEMO_TENANT.vertical}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <StatusDot tone="green" />
                Healthy
              </span>
            </div>
          </div>
          <div className="font-mono text-right text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Goal: {DEMO_GOAL.title}
          </div>
        </div>
      </div>
    </header>
  );
}

function DemoNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "execution", label: "Execution" },
    { id: "pages", label: "Pages" },
    { id: "leads", label: "Leads" },
    { id: "reports", label: "Reports" },
  ];
  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <ul className="-mb-px mx-auto flex max-w-6xl flex-wrap gap-1 px-4">
        {TABS.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-block border-b-2 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors ${
                tab === t.id
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const wonLeads = DEMO_LEADS.filter((l) => l.status === "won");
  const revenue = wonLeads.reduce((s, l) => s + (l.closedAmount ?? 0), 0);
  const livePages = DEMO_PAGES.filter((p) => p.status === "live").length;
  const draftPages = DEMO_PAGES.filter((p) => p.status === "draft").length;

  const pacePercent = Math.round(
    ((DEMO_GOAL.currentCount ?? 0) / DEMO_GOAL.targetCount) * 100,
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-0 border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Goal progress" value={`${DEMO_GOAL.currentCount} / ${DEMO_GOAL.targetCount}`} sub="clients this cycle" />
        <StatCard label="Leads this month" value={String(DEMO_LEADS.length)} sub={`${wonLeads.length} won`} />
        <StatCard label="Revenue tracked" value={`€${revenue.toLocaleString()}`} sub="proven won value" accent />
        <StatCard label="Pages live" value={String(livePages)} sub={draftPages > 0 ? `${draftPages} in draft` : "all published"} />
      </div>

      <section className="border border-border bg-card p-6">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          § Goal pacing
        </p>
        <p className="font-display text-lg font-semibold text-foreground">
          {DEMO_GOAL.title}
        </p>
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between font-mono text-xs text-muted-foreground">
            <span>{DEMO_GOAL.currentCount} of {DEMO_GOAL.targetCount} clients</span>
            <span>{pacePercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-status-green transition-all"
              style={{ width: `${Math.min(pacePercent, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            On track · {DEMO_GOAL.timeframeMonths}-month plan · close rate {Math.round((DEMO_GOAL.closeRate ?? 0) * 100)}%
          </p>
        </div>
      </section>

      <section className="border border-border bg-card p-6">
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          § Latest report — {DEMO_REPORT.periodLabel}
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Metric label="Leads" value={String(DEMO_REPORT.leadCount)} />
          <Metric label="Won" value={String(DEMO_REPORT.wonLeads)} />
          <Metric label="Revenue" value={`€${DEMO_REPORT.revenue.toLocaleString()}`} />
          <Metric label="Pages live" value={String(DEMO_REPORT.pagesLive)} />
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution tab
// ---------------------------------------------------------------------------

const EXEC_TONE: Record<string, StatusTone> = {
  done: "green",
  approved: "info",
  in_qa: "amber",
  planned: "neutral",
  blocked: "red",
  needs_edit: "amber",
  manual_task: "neutral",
};

function ExecutionTab() {
  return (
    <section className="border border-border bg-card">
      <header className="border-b border-border px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          § Execution board
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-foreground">
          {DEMO_BOARD_ITEMS.length} items
        </h2>
      </header>
      <ul className="divide-y divide-border">
        {DEMO_BOARD_ITEMS.map((item) => (
          <li key={item.masterplanItemId} className="grid grid-cols-[minmax(0,2fr)_auto_auto] items-center gap-4 px-6 py-4">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {item.title}
              </p>
              {item.artifactPrimaryKeyword && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.artifactPrimaryKeyword}
                  {item.artifactKeywordVolume ? ` · ${item.artifactKeywordVolume}/mo` : ""}
                </p>
              )}
            </div>
            <StatusPill tone={EXEC_TONE[item.executionStatus] ?? "neutral"}>
              {item.executionStatus.replace("_", " ")}
            </StatusPill>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {item.nextAction}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pages tab
// ---------------------------------------------------------------------------

const PAGE_TONE: Record<string, StatusTone> = {
  live: "green",
  draft: "neutral",
  failed: "red",
};

function PagesTab() {
  return (
    <section className="border border-border bg-card">
      <header className="border-b border-border px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          § Pages
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-foreground">
          {DEMO_PAGES.length} pages
        </h2>
      </header>
      <ul className="divide-y divide-border">
        {DEMO_PAGES.map((page) => (
          <li key={page.id} className="grid grid-cols-[minmax(0,2fr)_auto_auto_auto] items-center gap-4 px-6 py-4">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {page.title}
              </p>
              {page.url && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{page.url}</p>
              )}
            </div>
            <StatusPill tone="neutral">
              {page.type === "new_page" ? "New page" : "Optimized"}
            </StatusPill>
            <StatusPill tone={PAGE_TONE[page.status] ?? "neutral"}>
              {page.status}
            </StatusPill>
            {page.seoMetaStatus === "pushed_yoast" || page.seoMetaStatus === "pushed_rankmath" ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-status-green">
                <CheckCircle2 className="h-3 w-3" />
                SEO
              </span>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">—</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Leads tab
// ---------------------------------------------------------------------------

const LEAD_TONE: Record<string, StatusTone> = {
  new: "amber",
  qualified: "info",
  won: "green",
  lost: "neutral",
  junk: "neutral",
};

function LeadsTab() {
  const wonRevenue = DEMO_LEADS.filter((l) => l.status === "won").reduce(
    (s, l) => s + (l.closedAmount ?? 0),
    0,
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-0 border border-border bg-card sm:grid-cols-3">
        <StatCard label="Total leads" value={String(DEMO_LEADS.length)} sub="this month" />
        <StatCard label="Won" value={String(DEMO_LEADS.filter((l) => l.status === "won").length)} sub="closed deals" />
        <StatCard label="Revenue" value={`€${wonRevenue.toLocaleString()}`} sub="proven value" accent />
      </div>

      <section className="border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            § Lead inbox
          </p>
        </header>
        <ul className="divide-y divide-border">
          {DEMO_LEADS.map((lead) => (
            <li key={lead.id} className="grid grid-cols-[minmax(0,1.5fr)_auto_auto_auto] items-center gap-4 px-6 py-4">
              <div>
                <p className="font-display text-sm font-semibold text-foreground">
                  {lead.name ?? "Unknown"}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {lead.source} · {new Date(lead.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </p>
              </div>
              <StatusPill tone={LEAD_TONE[lead.status] ?? "neutral"}>
                {lead.status}
              </StatusPill>
              {lead.closedAmount != null ? (
                <span className="font-display text-sm font-semibold text-status-green">
                  €{lead.closedAmount.toLocaleString()}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
              <span className="font-mono text-[10px] text-muted-foreground">
                {lead.wonNotes ?? ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports tab
// ---------------------------------------------------------------------------

function ReportsTab() {
  return (
    <section className="border border-border bg-card p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
        § Monthly report — {DEMO_REPORT.periodLabel}
      </p>
      <h2 className="mt-1 font-display text-2xl font-semibold text-foreground">
        {DEMO_REPORT.periodLabel} Performance
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">Status: approved · Share link active</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Leads" value={String(DEMO_REPORT.leadCount)} />
        <Metric label="Won leads" value={String(DEMO_REPORT.wonLeads)} />
        <Metric label="Revenue" value={`€${DEMO_REPORT.revenue.toLocaleString()}`} />
        <Metric label="Pages live" value={String(DEMO_REPORT.pagesLive)} />
      </div>

      <div className="mt-6 rounded-md border border-dashed border-border bg-muted/30 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Share link
        </p>
        <p className="mt-1 font-mono text-sm text-foreground">/r/abc123demo</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Clients receive a clean summary — no internal data exposed.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA footer
// ---------------------------------------------------------------------------

function DemoCTA() {
  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-8 py-16 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          § LeadLayer OS
        </p>
        <h2 className="mt-3 font-display text-4xl font-bold tracking-tight text-foreground">
          This is what your clients get.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Goal tracking, page delivery, lead capture, and monthly reports — all managed for them.
          You run the operation. They see the proof.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90"
          >
            Start your first client <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-6 py-3 font-medium text-foreground hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Reusable display atoms
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="border-b border-r border-border p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 font-display text-3xl font-bold tracking-tight ${accent ? "text-status-green" : "text-foreground"}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
