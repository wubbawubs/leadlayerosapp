import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Briefcase, Plus } from "lucide-react";
import { SkeletonClientCard } from "@/components/ui/Skeletons";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getClientHealthSummaries,
  type ClientHealthSummary,
} from "@/lib/shared/execution/operatorQueue.functions";
import { StatusDot, type StatusTone } from "@/components/execution/StatusPill";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsIndexPage,
  head: () => ({ meta: [{ title: "Clients — LeadLayer" }] }),
});

const HEALTH_TONE: Record<ClientHealthSummary["health"], StatusTone> = {
  green: "green",
  amber: "amber",
  red: "red",
};

function ClientsIndexPage() {
  const navigate = useNavigate();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchHealth = useServerFn(getClientHealthSummaries);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const healthQuery = useQuery({
    queryKey: ["client-health"],
    queryFn: () => fetchHealth({ data: {} }),
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const summaries = healthQuery.data?.summaries ?? [];
  const summaryById = new Map(summaries.map((s) => [s.tenantId, s]));

  const loading = tenantsQuery.isLoading && healthQuery.isLoading;
  const isEmpty = !loading && tenants.length === 0 && summaries.length === 0;

  return (
    <div className="mx-auto max-w-7xl animate-fade-up-in px-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            § Clients · Portfolio
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-foreground">
            Your client portfolio.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Pick a client to open their command center: overview, execution, pages, leads, reports, and settings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/onboarding/welcome" })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add client
        </button>
      </div>

      {loading && (
        <div className="mt-10 grid gap-0 border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(4)].map((_, i) => <SkeletonClientCard key={i} />)}
        </div>
      )}

      {isEmpty && (
        <div className="mt-10 border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            No clients yet.
          </p>
        </div>
      )}

      {tenants.length > 0 && (
        <section className="mt-10 grid gap-0 border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
          {tenants.map((t) => (
            <ClientCard
              key={t.id}
              tenant={t}
              summary={summaryById.get(t.id) ?? null}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ClientCard({
  tenant,
  summary,
}: {
  tenant: { id: string; name: string; geo: string; vertical: string };
  summary: ClientHealthSummary | null;
}) {
  const lastActivity = summary?.lastDeliveryAt ?? summary?.lastActivityAt ?? null;
  return (
    <Link
      to="/clients/$tenantId"
      params={{ tenantId: tenant.id }}
      className="group flex flex-col gap-4 border-b border-r border-border p-5 transition hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold tracking-tight text-foreground">
            {tenant.name}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {tenant.geo && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {tenant.geo}
              </span>
            )}
            {tenant.vertical && (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {tenant.vertical}
              </span>
            )}
          </div>
        </div>
        {summary && (
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusDot tone={HEALTH_TONE[summary.health]} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {summary.health}
            </span>
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          {summary.tier && <Stat label="Tier" value={summary.tier} />}
          <Stat label="Leads MTD" value={String(summary.leadsThisMonth)} />
          <Stat
            label="Pending"
            value={String(summary.pendingActionCount)}
            accent={summary.pendingActionCount > 0}
          />
        </div>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {lastActivity
            ? `Last activity ${new Date(lastActivity).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
            : summary
              ? "No activity yet"
              : "Health pending"}
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
        className={`mt-1 font-display text-base font-semibold tracking-tight ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
