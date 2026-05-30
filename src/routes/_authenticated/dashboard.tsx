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
    <div className="mx-auto max-w-7xl px-8 py-12">
      <div className="border-b border-border pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          § Operator home · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-foreground">
          What needs your attention.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Action queue, client health, and reports — surfaced here as soon as each module is wired in.
        </p>
      </div>

      <section className="mt-10 grid gap-0 border border-border bg-card lg:grid-cols-3 lg:divide-x lg:divide-border">
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
            <ul className="-mx-2 space-y-0.5">
              {tenants.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link
                    to="/clients/$tenantId"
                    params={{ tenantId: t.id }}
                    className="group flex items-center justify-between gap-3 px-2 py-1.5 text-sm hover:bg-muted"
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
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/clients"
            className="mt-4 inline-block border-b border-accent pb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:text-accent"
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
    <article className="p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-4">
        {body ? <p className="text-sm leading-relaxed text-muted-foreground">{body}</p> : children}
      </div>
    </article>
  );
}
