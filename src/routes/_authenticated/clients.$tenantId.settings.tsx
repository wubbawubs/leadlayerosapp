import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/settings")({
  component: ClientSettings,
  head: () => ({ meta: [{ title: "Settings — LeadLayer" }] }),
});

type Row = {
  title: string;
  description: string;
  to: string;
  params?: Record<string, string>;
};

type Group = {
  label: string;
  rows: Row[];
};

function ClientSettings() {
  const { tenantId } = Route.useParams();

  const groups: Group[] = [
    {
      label: "Growth",
      rows: [
        {
          title: "Growth goal",
          description: "Target leads, close rate, and required lead volume.",
          to: "/settings/growth-goal",
        },
        {
          title: "Business profile",
          description: "Services, locations, and offer details used across deliverables.",
          to: "/settings/business-profile",
        },
        {
          title: "Tone profile",
          description: "Voice and writing style applied to all generated copy.",
          to: "/settings/tone-profile",
        },
      ],
    },
    {
      label: "Delivery",
      rows: [
        {
          title: "WordPress connection",
          description: "Manage connected sites and WordPress credentials.",
          to: "/sites",
        },
      ],
    },
    {
      label: "Intelligence",
      rows: [
        {
          title: "Intelligence pipeline",
          description: "Run and inspect the full intelligence pipeline.",
          to: "/growth/intelligence",
        },
        {
          title: "Product flow",
          description: "Orchestrated flow across intelligence stages.",
          to: "/growth/flow",
        },
        {
          title: "Blueprint",
          description: "Generated page blueprint and priority structure.",
          to: "/growth/blueprint",
        },
        {
          title: "Masterplan",
          description: "Strategic masterplan and proposal generation.",
          to: "/growth/masterplan",
        },
        {
          title: "GBP intelligence",
          description: "Google Business Profile signals and optimization.",
          to: "/growth/gbp",
        },
        {
          title: "Monthly plan",
          description: "Monthly execution plan and selected actions.",
          to: "/growth/monthly-plan",
        },
      ],
    },
    {
      label: "Advanced",
      rows: [
        {
          title: "Audits",
          description: "Site audits, comparisons, and proposal artifacts.",
          to: "/sites",
        },
        {
          title: "Legacy dashboard",
          description: "Original operator dashboard and tools.",
          to: "/app",
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          § Client settings · {tenantId.slice(0, 8)}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
          Configuration hub
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Links to existing setup and configuration tools for this client.
        </p>
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.label}>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              § {group.label}
            </p>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              {group.rows.map((row, i) => (
                <div
                  key={row.title}
                  className={`flex items-center justify-between gap-4 px-5 py-4 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{row.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.description}
                    </p>
                  </div>
                  <Link
                    to={row.to}
                    className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Open →
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
