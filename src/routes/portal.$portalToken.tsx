/**
 * /portal/:portalToken — full client portal.
 *
 * Public. No auth. Token-based access.
 * 4 tabs: Home · Leads · Pages · Reports
 * Mobile-first: stacked cards, not tables.
 *
 * Clients can mark leads as Won and enter revenue directly.
 * This is the stickiest feature — every new lead = reason to open the portal.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useState } from "react";
// createServerFn + z are used by fetchPortal above
import { toast } from "sonner";
import {
  ExternalLink,
  ArrowRight,
  Trophy,
  FileText,
  Layers,
  TrendingUp,
  Clock,
  ChevronRight,
  X,
  CheckCircle2,
} from "lucide-react";

import {
  getClientPortalData,
  markLeadWonFromPortal as _markLeadWonFromPortal,
  type ClientPortalData,
  type ClientPortalLead,
} from "@/lib/shared/clientPortal/clientPortal.functions";
import { Mark } from "@/components/brand/Mark";
import { AnimatedMark } from "@/components/brand/AnimatedMark";

// ------------------------------------------------------------------
// Server functions — public, no auth
// ------------------------------------------------------------------

const fetchPortal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const portal = await getClientPortalData(data.token);
    return { portal };
  });

// markLeadWonFromPortal is used directly via useServerFn in MarkWonModal.
// No wrapper needed — it already has no auth middleware (public portal mutation).
const markWonFn = _markLeadWonFromPortal;

// ------------------------------------------------------------------
// Route
// ------------------------------------------------------------------

export const Route = createFileRoute("/portal/$portalToken")({
  component: ClientPortalPage,
  head: () => ({ meta: [{ title: "Your Growth Dashboard" }] }),
});

type Tab = "home" | "leads" | "pages" | "reports";

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: "home", label: "Home", icon: TrendingUp },
  { id: "leads", label: "Leads", icon: Trophy },
  { id: "pages", label: "Pages", icon: Layers },
  { id: "reports", label: "Reports", icon: FileText },
];

// ------------------------------------------------------------------
// Root
// ------------------------------------------------------------------

function ClientPortalPage() {
  const { portalToken } = Route.useParams();
  const doFetch = useServerFn(fetchPortal);
  const [activeTab, setActiveTab] = useState<Tab>("home");

  const query = useQuery({
    queryKey: ["client-portal", portalToken],
    queryFn: () => doFetch({ data: { token: portalToken } }),
    retry: false,
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-foreground">
        <AnimatedMark className="h-10 w-10" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
          Loading your dashboard…
        </p>
      </div>
    );
  }

  const portal = query.data?.portal ?? null;

  if (!portal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-foreground px-8 text-center">
        <Mark className="h-10 w-10" />
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Dashboard not found</h1>
          <p className="mt-2 max-w-sm text-sm text-white/50">
            This link may have expired or been revoked. Contact your operator for a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader portal={portal} />
      <PortalTabs active={activeTab} onSelect={setActiveTab} />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:max-w-4xl">
        {activeTab === "home" && <HomeTab portal={portal} onNavigate={setActiveTab} />}
        {activeTab === "leads" && <LeadsTab portal={portal} portalToken={portalToken} />}
        {activeTab === "pages" && <PagesTab portal={portal} />}
        {activeTab === "reports" && <ReportsTab portal={portal} />}
      </main>
      <PortalFooter />
    </div>
  );
}

// ------------------------------------------------------------------
// Shell
// ------------------------------------------------------------------

function PortalHeader({ portal }: { portal: ClientPortalData }) {
  return (
    <header className="relative overflow-hidden bg-foreground">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 400px at 90% -10%, oklch(72% 0.16 55 / 0.12), transparent 60%), radial-gradient(600px 400px at -10% 110%, oklch(46% 0.22 260 / 0.10), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-4xl px-6 pb-10 pt-8 sm:px-8">
        <div className="flex items-center gap-2">
          <Mark className="h-5 w-5" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">
            LeadLayer
          </span>
        </div>
        <h1 className="mt-6 font-hero text-[clamp(2.5rem,7vw,5rem)] leading-none text-white">
          {portal.businessName}
        </h1>
        <GoalStatusLine goal={portal.goal} />

        {/* Three hero stats */}
        <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
          <HeroStat
            label="Revenue"
            value={portal.stats.provenRevenue > 0 ? formatMoney(portal.stats.provenRevenue) : "—"}
            accent
          />
          <HeroStat label="Leads won" value={String(portal.stats.leadsWon)} />
          <HeroStat
            label="Pages live"
            value={String(portal.stats.pagesLive + portal.stats.pagesOptimized)}
          />
        </div>
      </div>
    </header>
  );
}

function GoalStatusLine({ goal }: { goal: ClientPortalData["goal"] }) {
  if (!goal || goal.status === "no_goal" || goal.status === "no_data") return null;

  const color =
    goal.status === "complete" || goal.status === "ahead"
      ? "text-status-green"
      : goal.status === "behind"
        ? "text-status-amber"
        : "text-white/50";

  const label =
    goal.status === "complete" ? "Goal reached"
    : goal.status === "ahead" ? "Ahead of pace"
    : goal.status === "on_track" ? "On track"
    : "Behind pace";

  return (
    <p className={`mt-2 font-mono text-[11px] uppercase tracking-wider ${color}`}>
      {label}
      {goal.daysRemaining != null && goal.daysRemaining > 0 && (
        <span className="ml-2 text-white/25">· {goal.daysRemaining} days left</span>
      )}
    </p>
  );
}

function HeroStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-foreground/80 px-4 py-5 sm:px-6">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className={`mt-1.5 font-hero text-3xl sm:text-4xl ${accent ? "text-accent" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function PortalTabs({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
}) {
  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <ul className="-mb-px mx-auto flex max-w-4xl gap-0 overflow-x-auto px-4 sm:px-6">
        {TABS.map((t) => (
          <li key={t.id} className="flex-1 sm:flex-none">
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              className={`flex w-full items-center justify-center gap-2 border-b-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors sm:justify-start ${
                active === t.id
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PortalFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-card py-6">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-2">
          <Mark className="h-4 w-4" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Powered by LeadLayer
          </span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Always live
        </p>
      </div>
    </footer>
  );
}

// ------------------------------------------------------------------
// Home tab
// ------------------------------------------------------------------

function HomeTab({
  portal,
  onNavigate,
}: {
  portal: ClientPortalData;
  onNavigate: (t: Tab) => void;
}) {
  const { goal, stats, recentActivity, leads, reports, nextMonthFocus } = portal;

  // Preview: 3 most recent leads
  const recentLeads = leads.slice(0, 3);
  const latestReport = reports[0] ?? null;

  return (
    <div className="space-y-10">
      {/* Goal progress */}
      {goal && goal.status !== "no_goal" && goal.status !== "no_data" && (
        <GoalCard goal={goal} />
      )}

      {/* Recent activity — what happened */}
      {recentActivity.length > 0 && (
        <ActivityFeed activity={recentActivity} />
      )}

      {/* This month snapshot */}
      {(stats.leadsThisMonth > 0 || stats.pagesLive > 0) && (
        <ThisMonthCard stats={stats} />
      )}

      {/* Leads preview */}
      {recentLeads.length > 0 && (
        <section>
          <SectionHeader
            eyebrow="§ Leads"
            title="Recent leads"
            action={{ label: "See all leads", onClick: () => onNavigate("leads") }}
          />
          <div className="mt-4 space-y-2">
            {recentLeads.map((l) => (
              <LeadCard key={l.id} lead={l} compact />
            ))}
          </div>
        </section>
      )}

      {/* Latest report */}
      {latestReport && (
        <section>
          <SectionHeader eyebrow="§ Report" title="Latest report" />
          <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
            <div className="p-5">
              <p className="font-display text-base font-semibold text-foreground">
                {latestReport.periodLabel}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <MiniStat label="Leads" value={String(latestReport.leadCount)} />
                <MiniStat label="Revenue" value={formatMoney(latestReport.revenue)} accent />
                <MiniStat label="Pages" value={String(latestReport.pagesPublished + latestReport.pagesOptimized)} />
              </div>
            </div>
            {latestReport.shareToken && (
              <div className="border-t border-border px-5 py-3">
                <a
                  href={`/r/${latestReport.shareToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground hover:text-accent"
                >
                  View full report <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* What's coming next */}
      {nextMonthFocus.length > 0 && (
        <section>
          <SectionHeader eyebrow="§ Next" title="What we're working on" />
          <div className="mt-4 rounded-lg border border-border bg-card p-5">
            <ul className="space-y-2.5">
              {nextMonthFocus.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 font-mono text-[9px] text-accent">§{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-foreground">{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Empty home */}
      {recentActivity.length === 0 && recentLeads.length === 0 && !latestReport && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Your dashboard is live.
          </p>
          <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground">
            Results appear here as pages go live and leads come in.
          </p>
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: NonNullable<ClientPortalData["goal"]> }) {
  const barColor =
    goal.status === "complete" || goal.status === "ahead"
      ? "bg-status-green"
      : goal.status === "behind"
        ? "bg-status-amber"
        : "bg-accent";

  return (
    <section>
      <SectionHeader eyebrow="§ Goal" title={goal.title ?? "Growth goal"} />
      <div className="mt-4 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-3xl font-bold tracking-tight text-foreground">
              {goal.actualLeads}
              {goal.targetCount != null && (
                <span className="ml-1.5 text-lg font-normal text-muted-foreground">
                  / {goal.targetCount} leads needed
                </span>
              )}
            </p>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {goal.progressPercent}%
          </p>
        </div>
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
              style={{ width: `${goal.progressPercent}%` }}
            />
          </div>
          {goal.daysRemaining != null && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {goal.daysRemaining} days remaining in this cycle
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ActivityFeed({ activity }: { activity: ClientPortalData["recentActivity"] }) {
  const ICON: Record<ClientPortalData["recentActivity"][0]["type"], typeof Clock> = {
    page_published: Layers,
    lead_received: TrendingUp,
    report_ready: FileText,
    page_optimized: Layers,
  };

  return (
    <section>
      <SectionHeader eyebrow="§ Activity" title="What happened recently" />
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
        {activity.slice(0, 8).map((item, i) => {
          const Icon = ICON[item.type] ?? Clock;
          return (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{item.label}</p>
                {item.detail && (
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    {item.detail}
                  </p>
                )}
              </div>
              <p className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatRelative(item.date)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ThisMonthCard({ stats }: { stats: ClientPortalData["stats"] }) {
  return (
    <section>
      <SectionHeader eyebrow="§ This month" title="Month to date" />
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <StatBlock label="Leads" value={String(stats.leadsThisMonth)} />
        <StatBlock label="Won" value={String(stats.leadsWon)} />
        <StatBlock label="Revenue" value={formatMoney(stats.provenRevenue)} accent />
        <StatBlock label="Pages" value={String(stats.pagesLive + stats.pagesOptimized)} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Leads tab
// ------------------------------------------------------------------

type LeadFilter = "all" | "new" | "qualified" | "won" | "lost" | "junk";

function LeadsTab({
  portal,
  portalToken,
}: {
  portal: ClientPortalData;
  portalToken: string;
}) {
  const { leads, stats } = portal;
  const [filter, setFilter] = useState<LeadFilter>("all");
  const [wonLead, setWonLead] = useState<ClientPortalLead | null>(null);
  const qc = useQueryClient();

  const counts: Record<LeadFilter, number> = {
    all: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    qualified: leads.filter((l) => l.status === "qualified").length,
    won: leads.filter((l) => l.status === "won").length,
    lost: leads.filter((l) => l.status === "lost").length,
    junk: leads.filter((l) => l.status === "junk").length,
  };

  const visible = leads.filter((l) => filter === "all" || l.status === filter);

  const FILTERS: { id: LeadFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "new", label: "New" },
    { id: "qualified", label: "Qualified" },
    { id: "won", label: "Won" },
    { id: "lost", label: "Lost" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <StatBlock label="Total leads" value={String(leads.length)} />
        <StatBlock label="Won" value={String(stats.leadsWon)} />
        <StatBlock label="Revenue" value={formatMoney(stats.provenRevenue)} accent />
        <StatBlock label="This month" value={String(stats.leadsThisMonth)} />
      </div>

      {/* Revenue prompt if there are won leads without amount or new/qualified leads */}
      {leads.some((l) => (l.status === "new" || l.status === "qualified")) && (
        <div className="flex items-start gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
          <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-sm text-foreground">
            When a lead turns into a job, tap <strong>Mark Won</strong> and enter the revenue.
            It feeds your goal progress automatically.
          </p>
        </div>
      )}

      {/* Filters */}
      <nav className="-mb-px flex flex-wrap gap-1 border-b border-border">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              filter === f.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            <span className="text-muted-foreground/60">{counts[f.id]}</span>
          </button>
        ))}
      </nav>

      {/* Lead cards */}
      {visible.length === 0 ? (
        <p className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          No leads match this filter.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              onMarkWon={
                l.status === "new" || l.status === "qualified"
                  ? () => setWonLead(l)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {wonLead && (
        <MarkWonModal
          lead={wonLead}
          portalToken={portalToken}
          onClose={() => setWonLead(null)}
          onSuccess={() => {
            setWonLead(null);
            qc.invalidateQueries({ queryKey: ["client-portal", portalToken] });
            toast.success("Revenue logged — goal progress updated");
          }}
        />
      )}
    </div>
  );
}

function LeadCard({
  lead,
  compact = false,
  onMarkWon,
}: {
  lead: ClientPortalLead;
  compact?: boolean;
  onMarkWon?: () => void;
}) {
  const statusColor =
    lead.status === "won" ? "text-status-green border-status-green/20 bg-status-green-soft"
    : lead.status === "qualified" ? "text-status-info border-status-info/20 bg-status-info-soft"
    : lead.status === "lost" || lead.status === "junk" ? "text-status-neutral border-status-neutral/20 bg-status-neutral-soft"
    : "text-status-amber border-status-amber/20 bg-status-amber-soft";

  const contact = lead.name ?? lead.email ?? lead.phone ?? "Unknown lead";

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-sm font-semibold text-foreground">{contact}</p>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusColor}`}>
            {lead.status}
          </span>
        </div>
        {!compact && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {lead.source && <span>{lead.source}</span>}
            {lead.phone && <span>{lead.phone}</span>}
            {lead.email && <span>{lead.email}</span>}
            <span>{formatRelative(lead.createdAt)}</span>
          </div>
        )}
        {compact && (
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {lead.source ?? "—"} · {formatRelative(lead.createdAt)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {lead.status === "won" && lead.closedAmount != null && (
          <p className="font-display text-base font-bold text-status-green">
            {formatMoney(lead.closedAmount)}
          </p>
        )}
        {onMarkWon && (
          <button
            type="button"
            onClick={onMarkWon}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground hover:opacity-90"
          >
            <Trophy className="h-3 w-3" />
            <span className="hidden sm:inline">Mark won</span>
          </button>
        )}
      </div>
    </div>
  );
}

function MarkWonModal({
  lead,
  portalToken,
  onClose,
  onSuccess,
}: {
  lead: ClientPortalLead;
  portalToken: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const doMark = useServerFn(markWonFn);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      doMark({
        data: {
          portalToken,
          leadId: lead.id,
          closedAmount: parseFloat(amount),
          wonNotes: notes.trim() || undefined,
        },
      }),
    onSuccess,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-semibold text-foreground">
            Mark as won
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseFloat(amount);
            if (!Number.isFinite(n) || n < 0) { toast.error("Enter a valid amount"); return; }
            mutation.mutate();
          }}
          className="p-5 space-y-4"
        >
          <div>
            <p className="text-sm text-foreground">{lead.name ?? lead.email ?? lead.phone ?? "Lead"}</p>
            {lead.source && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                via {lead.source}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Closed amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
                className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Notes <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Service type, project name…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={mutation.isPending || !amount}
              className="flex-1 rounded-md bg-primary py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending ? "Saving…" : "Confirm won"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Pages tab
// ------------------------------------------------------------------

type PageFilter = "all" | "new_page" | "optimized";

function PagesTab({ portal }: { portal: ClientPortalData }) {
  const { pages } = portal;
  const [filter, setFilter] = useState<PageFilter>("all");

  const counts = {
    all: pages.length,
    new_page: pages.filter((p) => p.type === "new_page").length,
    optimized: pages.filter((p) => p.type === "optimized").length,
  };

  const visible = pages.filter((p) => filter === "all" || p.type === filter);

  const FILTERS: { id: PageFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "new_page", label: "New pages" },
    { id: "optimized", label: "Optimized" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <StatBlock label="Total" value={String(pages.length)} />
        <StatBlock label="New pages" value={String(counts.new_page)} />
        <StatBlock label="Optimized" value={String(counts.optimized)} />
      </div>

      <nav className="-mb-px flex gap-1 border-b border-border">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              filter === f.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            <span className="text-muted-foreground/60">{counts[f.id]}</span>
          </button>
        ))}
      </nav>

      {visible.length === 0 ? (
        <p className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          No pages yet.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((page, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-lg border border-border bg-card px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-foreground">{page.title}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {page.url}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {page.type === "new_page" ? "New page" : "Optimized"} · {formatDate(page.publishedAt)}
                </p>
              </div>
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground hover:border-accent hover:text-accent"
              >
                <ExternalLink className="h-3 w-3" />
                View
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Reports tab
// ------------------------------------------------------------------

function ReportsTab({ portal }: { portal: ClientPortalData }) {
  const { reports } = portal;

  return (
    <div className="space-y-6">
      {reports.length === 0 ? (
        <p className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          No reports yet.
        </p>
      ) : (
        <div className="space-y-3">
          {reports.map((r, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="font-display text-base font-semibold text-foreground">
                    {r.periodLabel}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-4">
                    <MiniStat label="Leads" value={String(r.leadCount)} />
                    <MiniStat label="Revenue" value={formatMoney(r.revenue)} accent />
                    <MiniStat label="Pages" value={String(r.pagesPublished + r.pagesOptimized)} />
                  </div>
                </div>
                {r.shareToken && (
                  <a
                    href={`/r/${r.shareToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent"
                  >
                    View <ChevronRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Shared display atoms
// ------------------------------------------------------------------

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
        <h2 className="mt-0.5 font-display text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1.5 font-display text-2xl font-bold tracking-tight ${accent ? "text-status-green" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 font-display text-base font-semibold tracking-tight ${accent ? "text-status-green" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------
// Formatting helpers
// ------------------------------------------------------------------

function formatMoney(n: number): string {
  if (!n || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatRelative(iso: string): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
