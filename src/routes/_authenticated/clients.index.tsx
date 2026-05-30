import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Briefcase } from "lucide-react";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { StatusDot } from "@/components/execution/StatusPill";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsIndexPage,
  head: () => ({ meta: [{ title: "Clients — LeadLayer" }] }),
});

function ClientsIndexPage() {
  const fetchTenants = useServerFn(listMyTenants);
  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenants = tenantsQuery.data?.tenants ?? [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--status-info)]">
        § Clients
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
        Your client portfolio.
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Pick a client to open their command center: overview, execution, pages, leads, reports, and settings.
      </p>

      {tenantsQuery.isLoading && (
        <p className="mt-8 text-sm text-muted-foreground">Loading clients…</p>
      )}

      {!tenantsQuery.isLoading && tenants.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">No clients yet.</p>
        </div>
      )}

      {tenants.length > 0 && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tenants.map((t) => (
            <ClientCard key={t.id} tenant={t} />
          ))}
        </section>
      )}
    </div>
  );
}

function ClientCard({
  tenant,
}: {
  tenant: { id: string; name: string; geo: string; vertical: string; status: string };
}) {
  return (
    <Link
      to="/clients/$tenantId"
      params={{ tenantId: tenant.id }}
      className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition hover:border-[color:var(--status-info)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent font-display text-base font-semibold text-accent-foreground">
          {tenant.name.slice(0, 1).toUpperCase()}
        </div>
        <StatusDot tone="neutral" />
      </div>
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
      <div className="mt-auto flex items-center justify-end text-xs font-medium text-muted-foreground transition group-hover:text-[color:var(--status-info)]">
        Open command center
        <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </div>
    </Link>
  );
}
