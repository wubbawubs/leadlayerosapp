import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { listProposalsForMasterplanItem } from "@/lib/shared/masterplan/proposalGen.functions";
import { proposalStatusLabel } from "@/lib/shared/masterplan/labels";

export const Route = createFileRoute(
  "/_authenticated/growth/masterplan_/$itemId/proposals",
)({
  component: LinkedProposalsPage,
  head: () => ({
    meta: [{ title: "Linked proposals — LeadLayer" }],
  }),
});

type LinkedProposal = {
  id: string;
  status: string;
  actionType: string;
  title: string;
  summary: string;
  reasoning: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  origin: string;
  createdAt: string;
  modelUsed: string;
  riskFlags: string[];
};

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
        : Promise.resolve({ proposals: [] as LinkedProposal[] }),
    enabled: !!tenantId,
  });
  const proposals: LinkedProposal[] =
    (proposalsQuery.data?.proposals as LinkedProposal[] | undefined) ?? [];

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
          Proposals gegenereerd vanuit dit masterplan item. Klik op een voorstel om de volledige aanbeveling te zien.
        </p>

        <div className="mt-8 space-y-4">
          {proposalsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Laden…</p>
          )}
          {proposalsQuery.error && (
            <p className="text-sm text-destructive">
              Kon proposals niet laden: {String((proposalsQuery.error as Error).message)}
            </p>
          )}
          {!proposalsQuery.isLoading && proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nog geen proposals voor dit item. Ga terug naar Masterplan en klik "Generate proposal".
            </p>
          )}
          {proposals.map((p) => {
            const recommendation =
              typeof p.after?.recommendation === "string"
                ? (p.after.recommendation as string)
                : null;
            return (
              <details
                key={p.id}
                className="group rounded-lg border border-border bg-card/70 p-4 open:bg-card"
                open
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      From masterplan
                    </span>
                    <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                      {p.actionType}
                    </span>
                    <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {proposalStatusLabel(p.status)}
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
                </summary>

                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {recommendation && (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Recommendation
                      </h4>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {recommendation}
                      </p>
                    </section>
                  )}
                  {p.reasoning && (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Reasoning
                      </h4>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {p.reasoning}
                      </p>
                    </section>
                  )}
                  {p.riskFlags.length > 0 && (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Risk flags
                      </h4>
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {p.riskFlags.map((f) => (
                          <li
                            key={f}
                            className="rounded border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {f}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {!recommendation && !p.reasoning && (
                    <p className="text-sm text-muted-foreground">
                      Geen aanbeveling-inhoud opgeslagen. Klik "Regenerate proposal" op de masterplan-pagina om opnieuw te genereren.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </main>
    </div>
  );
}

