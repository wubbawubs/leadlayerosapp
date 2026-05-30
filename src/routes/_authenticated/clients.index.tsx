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
    <div className="mx-auto max-w-7xl px-8 py-12">
      <div className="border-b border-border pb-8">
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

      {tenantsQuery.isLoading && (
        <p className="mt-10 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Loading clients…
        </p>
      )}

      {!tenantsQuery.isLoading && tenants.length === 0 && (
        <div className="mt-10 border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            No clients yet
          </p>
        </div>
      )}

      {tenants.length > 0 && (
        <section className="mt-10 border-t border-border">
          {tenants.map((t, i) => (
            <ClientRow key={t.id} tenant={t} index={i + 1} />
          ))}
        </section>
      )}
    </div>
  );
}

function ClientRow({
  tenant,
  index,
}: {
  tenant: { id: string; name: string; geo: string; vertical: string; status: string };
  index: number;
}) {
  return (
    <Link
      to="/clients/$tenantId"
      params={{ tenantId: tenant.id }}
      className="group grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-2 py-5 transition hover:bg-card"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        § {String(index).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <h3 className="truncate font-display text-lg font-semibold tracking-tight text-foreground">
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
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <StatusDot tone="neutral" />
        <span className="font-mono uppercase tracking-wider">Health pending</span>
      </div>
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition group-hover:text-accent">
        Open <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
