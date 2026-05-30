import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { StatusDot } from "@/components/execution/StatusPill";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — LeadLayer" }] }),
});

function DashboardPage() {
  const fetchTenants = useServerFn(listMyTenants);
  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenants = tenantsQuery.data?.tenants ?? [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--status-info)]">
        § Operator home
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
        What needs your attention.
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Action queue, client health, and reports — surfaced here as soon as each module is wired in.
      </p>

      <section className="mt-10 grid gap-5 lg:grid-cols-3">
        <DashCard
          eyebrow="§ 01 · Needs attention"
          title="Action queue"
          body="Cross-tenant action queue will connect in Phase 5. Open a client to take action in their command center."
        />

        <DashCard
          eyebrow="§ 02 · Client health"
          title={`${tenants.length} client${tenants.length === 1 ? "" : "s"}`}
        >
          {tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clients yet. Add a tenant from onboarding.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {tenants.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link
                    to="/clients/$tenantId"
                    params={{ tenantId: t.id }}
                    className="group flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <StatusDot tone="neutral" />
                      <span className="truncate font-medium text-foreground">
                        {t.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t.geo}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/clients"
            className="mt-3 inline-block text-xs font-medium text-[color:var(--status-info)] hover:underline"
          >
            All clients →
          </Link>
        </DashCard>

        <DashCard
          eyebrow="§ 03 · Reports due"
          title="Monthly reports"
          body="Reports awaiting operator approval will appear here. Wires in Phase 5."
        />
      </section>
    </div>
  );
}

function DashCard({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3">
        {body ? <p className="text-sm text-muted-foreground">{body}</p> : children}
      </div>
    </article>
  );
}
