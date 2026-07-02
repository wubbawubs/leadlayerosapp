import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getOperatorActionQueue,
  getClientHealthSummaries,
  type ActionType,
  type ActionQueueItem,
  type ClientHealthSummary,
} from "@/lib/shared/execution/operatorQueue.functions";
import { StatusPill, type StatusTone } from "@/components/execution/StatusPill";
import { SkeletonActionRow, SkeletonClientCard } from "@/components/ui/Skeletons";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — LeadLayer" }] }),
});

const ACTION_LABELS: Record<ActionType, string> = {
  review_brief: "Review brief",
  create_draft: "Create draft",
  publish_draft: "Publish draft",
  review_opt_brief: "Review optimization",
  apply_optimization: "Apply optimization",
  retry_delivery: "Retry delivery",
};

// Color-coded action type dots per DESIGN.md
const ACTION_DOT: Record<ActionType, string> = {
  review_brief: "action-dot-review",
  review_opt_brief: "action-dot-review",
  create_draft: "action-dot-create",
  apply_optimization: "action-dot-create",
  publish_draft: "action-dot-publish",
  retry_delivery: "action-dot-publish",
};

const URGENCY_TONE: Record<ActionQueueItem["urgency"], StatusTone> = {
  high: "red",
  medium: "amber",
  low: "neutral",
};

const HEALTH_BORDER: Record<ClientHealthSummary["health"], string> = {
  green: "border-t-2 border-t-[#27A644]",
  amber: "border-t-2 border-t-[#E8B94A]",
  red: "border-t-2 border-t-[#E54D4D]",
};

const HEALTH_BADGE: Record<ClientHealthSummary["health"], string> = {
  green: "bg-[rgba(39,166,68,0.12)] text-[#27A644]",
  amber: "bg-[rgba(232,185,74,0.12)] text-[#E8B94A]",
  red: "bg-[rgba(229,77,77,0.12)] text-[#E54D4D]",
};

function DashboardPage() {
  const fetchTenants = useServerFn(listMyTenants);
  const fetchQueue = useServerFn(getOperatorActionQueue);
  const fetchHealth = useServerFn(getClientHealthSummaries);

  const tenantsQuery = useQuery({ queryKey: ["my-tenants"], queryFn: () => fetchTenants() });
  const queueQuery = useQuery({
    queryKey: ["operator-action-queue"],
    queryFn: () => fetchQueue({ data: { limit: 8 } }),
  });
  const healthQuery = useQuery({
    queryKey: ["client-health"],
    queryFn: () => fetchHealth({ data: {} }),
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const actions = queueQuery.data?.items ?? [];
  const summaries = healthQuery.data?.summaries ?? [];

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  // KPI rollup from health summaries
  const totalLeadsThisMonth = summaries.reduce((n, s) => n + s.leadsThisMonth, 0);
  const totalLeadsPrevMonth = summaries.reduce((n, s) => n + s.leadsPrevMonth, 0);
  const totalPendingActions = summaries.reduce((n, s) => n + s.pendingActionCount, 0);
  const clientsAtRisk = summaries.filter((s) => s.health === "red").length;
  const leadsDelta = healthQuery.isLoading ? undefined : totalLeadsThisMonth - totalLeadsPrevMonth;

  return (
    <div className="mx-auto max-w-7xl animate-fade-up-in px-6 py-8 lg:px-8">
      {/* ── Page identity ───────────────────────────────────── */}
      <div className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.30)]">
          {today}
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-[#F5F5F5]">
          Operator dashboard
        </h1>
      </div>

      {/* ── KPI strip — glass tiles ─────────────────────────── */}
      <div className="mb-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Clients"
            value={tenantsQuery.isLoading ? "—" : String(tenants.length)}
            loading={tenantsQuery.isLoading}
          />
          <KpiCard
            label="Pending actions"
            value={queueQuery.isLoading ? "—" : String(totalPendingActions)}
            loading={queueQuery.isLoading}
            accent={totalPendingActions > 0}
          />
          <KpiCard
            label="Leads MTD"
            value={healthQuery.isLoading ? "—" : String(totalLeadsThisMonth)}
            delta={leadsDelta}
            loading={healthQuery.isLoading}
          />
          <KpiCard
            label="At risk"
            value={healthQuery.isLoading ? "—" : String(clientsAtRisk)}
            loading={healthQuery.isLoading}
            danger={clientsAtRisk > 0}
          />
        </div>
      </div>

      {/* ── Action queue ────────────────────────────────────── */}
      <section className="mb-8">
        <SectionLabel>Action queue</SectionLabel>
        <div className="glass-tile mt-2 overflow-hidden rounded-[14px]">
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
            <span className="font-display text-sm font-semibold text-[#F5F5F5]">
              {queueQuery.isLoading
                ? "Loading…"
                : `${actions.length} action${actions.length === 1 ? "" : "s"} waiting`}
            </span>
          </div>

          {queueQuery.isLoading && (
            <div>
              {[...Array(3)].map((_, i) => (
                <SkeletonActionRow key={i} />
              ))}
            </div>
          )}

          {!queueQuery.isLoading && actions.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[rgba(255,255,255,0.30)]">
                No actions waiting — all clients are up to date.
              </p>
            </div>
          )}

          {actions.length > 0 && (
            <ul className="divide-y divide-[rgba(255,255,255,0.04)]">
              {actions.map((a, i) => (
                <li key={`${a.artifactId ?? a.draftId ?? i}-${i}`}>
                  <Link
                    to="/clients/$tenantId/execution"
                    params={{ tenantId: a.tenantId }}
                    className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.05]"
                  >
                    {/* Action type dot */}
                    <span className={`h-2 w-2 shrink-0 rounded-full ${ACTION_DOT[a.type]}`} />

                    {/* Client + action */}
                    <div className="min-w-0 w-40 shrink-0">
                      <p className="truncate text-sm font-medium text-[#F5F5F5]">{a.tenantName}</p>
                      <p className="mt-0.5 text-xs text-[rgba(255,255,255,0.40)]">
                        {ACTION_LABELS[a.type]}
                      </p>
                    </div>

                    {/* Page title + keyword */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[rgba(255,255,255,0.70)]">
                        {a.pageTitle}
                      </p>
                      {a.primaryKeyword && (
                        <p className="mt-0.5 truncate text-xs text-[rgba(255,255,255,0.30)]">
                          {a.primaryKeyword}
                          {a.keywordVolume ? ` · ${a.keywordVolume.toLocaleString()} vol` : ""}
                        </p>
                      )}
                    </div>

                    {/* Urgency + risk */}
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill tone={URGENCY_TONE[a.urgency]}>
                        {a.daysPending > 0 ? `${a.daysPending}d` : "new"}
                      </StatusPill>
                      {a.riskFlagCount > 0 && (
                        <StatusPill tone="amber">{a.riskFlagCount} risk</StatusPill>
                      )}
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[rgba(255,255,255,0.20)] transition group-hover:text-[#E8913A]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Client health ────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Client health</SectionLabel>
          <Link
            to="/clients"
            className="font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.30)] transition hover:text-[#E8913A]"
          >
            All clients →
          </Link>
        </div>

        {healthQuery.isLoading && tenants.length === 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <SkeletonClientCard key={i} />
            ))}
          </div>
        )}

        {summaries.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((s) => (
              <HealthCard key={s.tenantId} summary={s} />
            ))}
          </div>
        )}

        {summaries.length === 0 && tenants.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tenants.map((t) => (
              <FallbackCard key={t.id} tenant={t} />
            ))}
          </div>
        )}

        {!healthQuery.isLoading && summaries.length === 0 && tenants.length === 0 && (
          <div className="rounded-[8px] border border-dashed border-[rgba(255,255,255,0.08)] px-6 py-10 text-center">
            <p className="text-sm text-[rgba(255,255,255,0.30)]">No clients yet.</p>
            <Link
              to="/onboarding/welcome"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#E8913A] hover:underline"
            >
              Add your first client <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.30)]">
      {children}
    </p>
  );
}

function KpiCard({
  label,
  value,
  delta,
  accent = false,
  danger = false,
  loading = false,
}: {
  label: string;
  value: string;
  delta?: number;
  accent?: boolean;
  danger?: boolean;
  loading?: boolean;
}) {
  const numColor = danger ? "text-[#E54D4D]" : accent ? "text-[#E8913A]" : "text-[#F5F5F5]";
  const deltaColor =
    delta == null
      ? ""
      : delta > 0
        ? "text-[#27A644]"
        : delta < 0
          ? "text-[#E54D4D]"
          : "text-[rgba(255,255,255,0.30)]";
  const deltaSign = delta != null && delta > 0 ? "↑" : delta != null && delta < 0 ? "↓" : "→";

  return (
    <div className="glass-tile rounded-[14px] px-4 py-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.40)]">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p
          className={`font-display text-3xl font-bold leading-none ${loading ? "text-[rgba(255,255,255,0.20)]" : numColor}`}
        >
          {value}
        </p>
        {!loading && delta != null && (
          <span className={`font-mono text-[10px] ${deltaColor}`}>
            {deltaSign}
            {delta > 0 ? `+${delta}` : delta} vs May
          </span>
        )}
      </div>
    </div>
  );
}

function HealthCard({ summary }: { summary: ClientHealthSummary }) {
  return (
    <Link
      to="/clients/$tenantId"
      params={{ tenantId: summary.tenantId }}
      className="glass-tile glass-tile-hover group block rounded-[16px] p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="truncate font-display text-sm font-semibold text-[#F5F5F5]"
          title={summary.tenantName}
        >
          {summary.tenantName}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${HEALTH_BADGE[summary.health]}`}
        >
          {summary.health}
        </span>
      </div>

      {summary.tier && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-[rgba(255,255,255,0.30)]">
          {summary.tier}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Leads MTD" value={String(summary.leadsThisMonth)} />
        <Metric
          label="Pending"
          value={String(summary.pendingActionCount)}
          highlight={summary.pendingActionCount > 0}
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] pt-3">
        {summary.lastDeliveryAt ? (
          <span className="text-xs text-[rgba(255,255,255,0.30)]">
            Last delivery{" "}
            {new Date(summary.lastDeliveryAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        ) : (
          <Link
            to="/clients/$tenantId/pages"
            params={{ tenantId: summary.tenantId }}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-[rgba(255,255,255,0.30)] hover:text-[#E8913A]"
          >
            No deliveries yet · Open pages →
          </Link>
        )}
        <ArrowRight className="h-3.5 w-3.5 text-[rgba(255,255,255,0.20)] transition group-hover:text-[#E8913A]" />
      </div>
    </Link>
  );
}

function FallbackCard({
  tenant,
}: {
  tenant: { id: string; name: string; geo: string; vertical: string };
}) {
  return (
    <Link
      to="/clients/$tenantId"
      params={{ tenantId: tenant.id }}
      className="glass-tile glass-tile-hover group block rounded-[16px] p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-display text-sm font-semibold text-[#F5F5F5]">{tenant.name}</p>
        <span className="shrink-0 rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[rgba(255,255,255,0.40)]">
          pending
        </span>
      </div>
      {tenant.geo && (
        <div className="mt-1 flex items-center gap-1 text-xs text-[rgba(255,255,255,0.30)]">
          <MapPin className="h-3 w-3" />
          {tenant.geo}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] pt-3">
        <span className="text-xs text-[rgba(255,255,255,0.30)]">Health loading…</span>
        <ArrowRight className="h-3.5 w-3.5 text-[rgba(255,255,255,0.20)] transition group-hover:text-[#E8913A]" />
      </div>
    </Link>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-[rgba(255,255,255,0.30)]">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-bold leading-none ${highlight ? "text-[#E8913A]" : "text-[#F5F5F5]"}`}
      >
        {value}
      </p>
    </div>
  );
}
