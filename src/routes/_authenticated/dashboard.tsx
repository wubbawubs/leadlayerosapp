import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin } from "lucide-react";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getOperatorActionQueue,
  getClientHealthSummaries,
  type ActionType,
  type ActionQueueItem,
  type ClientHealthSummary,
} from "@/lib/shared/execution/operatorQueue.functions";
import { StatusDot, StatusPill, type StatusTone } from "@/components/execution/StatusPill";
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

const URGENCY_TONE: Record<ActionQueueItem["urgency"], StatusTone> = {
  high: "red",
  medium: "amber",
  low: "neutral",
};

const HEALTH_TONE: Record<ClientHealthSummary["health"], StatusTone> = {
  green: "green",
  amber: "amber",
  red: "red",
};

function DashboardPage() {
  const fetchTenants = useServerFn(listMyTenants);
  const fetchQueue = useServerFn(getOperatorActionQueue);
  const fetchHealth = useServerFn(getClientHealthSummaries);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
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

  return (
    <div className="mx-auto max-w-7xl animate-fade-up-in px-8 py-12">
      <div className="border-b border-border pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          § Operator home · {today}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-foreground">
          What needs your attention.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Cross-tenant action queue and client health, surfaced for the operator's daily run.
        </p>
      </div>

      {/* Action queue */}
      <section className="mt-10 border border-border bg-card">
        <header className="flex items-baseline justify-between border-b border-border px-6 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              § 01 · Action queue
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
              {queueQuery.isLoading ? "Loading…" : `${actions.length} action${actions.length === 1 ? "" : "s"} waiting`}
            </h2>
          </div>
        </header>

        {queueQuery.isLoading && (
          <div>
            {[...Array(3)].map((_, i) => <SkeletonActionRow key={i} />)}
          </div>
        )}

        {!queueQuery.isLoading && actions.length === 0 && (
          <div className="px-6 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              No urgent actions. All clients are up to date.
            </p>
          </div>
        )}

        {actions.length > 0 && (
          <ul className="divide-y divide-border">
            {actions.map((a, i) => (
              <li key={`${a.artifactId ?? a.draftId ?? i}-${i}`}>
                <Link
                  to="/clients/$tenantId/execution"
                  params={{ tenantId: a.tenantId }}
                  className="group grid grid-cols-[3rem_minmax(0,1.2fr)_minmax(0,1.4fr)_auto_auto] items-center gap-4 px-6 py-4 transition hover:bg-muted/40"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    § {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold text-foreground">
                      {a.tenantName}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {ACTION_LABELS[a.type]}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{a.pageTitle}</p>
                    {a.primaryKeyword && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {a.primaryKeyword}
                        {a.keywordVolume ? ` · ${a.keywordVolume} vol` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={URGENCY_TONE[a.urgency]}>
                      {a.daysPending > 0 ? `${a.daysPending}d pending` : "new"}
                    </StatusPill>
                    {a.riskFlagCount > 0 && (
                      <StatusPill tone="amber">{a.riskFlagCount} risk</StatusPill>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition group-hover:text-accent">
                    Open <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Client health grid */}
      <section className="mt-10">
        <header className="flex items-baseline justify-between border-b border-border pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              § 02 · Client health
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
              {summaries.length || tenants.length} client{(summaries.length || tenants.length) === 1 ? "" : "s"}
            </h2>
          </div>
          <Link
            to="/clients"
            className="border-b border-accent pb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:text-accent"
          >
            All clients →
          </Link>
        </header>

        {healthQuery.isLoading && tenants.length === 0 && (
          <div className="mt-6 grid gap-0 border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => <SkeletonClientCard key={i} />)}
          </div>
        )}

        {summaries.length > 0 ? (
          <div className="mt-6 grid gap-0 border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((s) => (
              <HealthCard key={s.tenantId} summary={s} />
            ))}
          </div>
        ) : tenants.length > 0 ? (
          <div className="mt-6 grid gap-0 border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
            {tenants.map((t) => (
              <FallbackClientCard key={t.id} tenant={t} />
            ))}
          </div>
        ) : (
          !healthQuery.isLoading && (
            <div className="mt-6 border border-dashed border-border bg-card/60 p-10 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                No clients yet
              </p>
            </div>
          )
        )}
      </section>
    </div>
  );
}

function HealthCard({ summary }: { summary: ClientHealthSummary }) {
  return (
    <Link
      to="/clients/$tenantId"
      params={{ tenantId: summary.tenantId }}
      className="group block border-b border-r border-border p-5 transition hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-foreground">
            {summary.tenantName}
          </p>
          {summary.tier && (
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Tier · {summary.tier}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusDot tone={HEALTH_TONE[summary.health]} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {summary.health}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Leads MTD" value={String(summary.leadsThisMonth)} />
        <Stat
          label="Pending"
          value={String(summary.pendingActionCount)}
          accent={summary.pendingActionCount > 0}
        />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {summary.lastDeliveryAt
            ? `Last delivery ${new Date(summary.lastDeliveryAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
            : "No deliveries yet"}
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition group-hover:text-accent">
          Open <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

function FallbackClientCard({
  tenant,
}: {
  tenant: { id: string; name: string; geo: string; vertical: string };
}) {
  return (
    <Link
      to="/clients/$tenantId"
      params={{ tenantId: tenant.id }}
      className="group block border-b border-r border-border p-5 transition hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-foreground">
            {tenant.name}
          </p>
          {tenant.geo && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {tenant.geo}
            </p>
          )}
        </div>
        <StatusDot tone="neutral" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Health pending
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition group-hover:text-accent">
          Open <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

function Stat({
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
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-lg font-semibold tracking-tight ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
