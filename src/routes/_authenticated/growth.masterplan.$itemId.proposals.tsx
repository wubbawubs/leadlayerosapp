import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { listProposalsForMasterplanItem } from "@/lib/shared/masterplan/proposalGen.functions";

export const Route = createFileRoute(
  "/_authenticated/growth/masterplan/$itemId/proposals",
)({
  component: LinkedProposalsPage,
  head: () => ({
    meta: [{ title: "Linked proposals — LeadLayer" }],
  }),
});

function LinkedProposalsPage() {
  const { itemId } = Route.useParams();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchProposals = useServerFn(listProposalsForMasterplanItem);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const proposalsQuery = useQuery({
    queryKey: ["proposals-for-masterplan-item", tenantId, itemId],
    queryFn: () =>
      tenantId
        ? fetchProposals({ data: { tenantId, masterplanItemId: itemId } })
        : Promise.resolve({ proposals: [] }),
    enabled: !!tenantId,
  });
  const proposals: Array<{
    id: string;
    status: string;
    actionType: string;
    title: string;
    summary: string;
    origin: string;
    createdAt: string;
    modelUsed: string;
    riskFlags: string[];
  }> = proposalsQuery.data?.proposals ?? [];

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">
              Masterplan
            </Link>
            <span className="font-medium text-foreground">Linked proposals</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-6 pb-24 pt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Sprint · Masterplan → Proposal V2
        </p>
        <h1 className="font-display text-4xl text-foreground">Linked proposals</h1>
        <p className="mt-2 text-muted-foreground">
          Proposals gegenereerd vanuit dit masterplan item.
        </p>

        <div className="mt-8 space-y-3">
          {proposalsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Laden…</p>
          )}
          {!proposalsQuery.isLoading && proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nog geen proposals voor dit item.
            </p>
          )}
          {proposals.map((p) => (
            <article
              key={p.id}
              className="rounded-lg border border-border bg-card/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  From masterplan
                </span>
                <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                  {p.actionType}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {p.status}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {new Date(p.createdAt).toLocaleString()}
                </span>
                {p.modelUsed && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    model: {p.modelUsed}
                  </span>
                )}
              </div>
              <h3 className="mt-2 font-semibold text-foreground">{p.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>
              {p.riskFlags.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  flags: {p.riskFlags.join(", ")}
                </p>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
