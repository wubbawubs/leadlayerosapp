import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/settings")({
  component: ClientSettings,
});

function ClientSettings() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        § Client settings
      </p>
      <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
        Settings shortcuts
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Inline forms land in Phase 3. For now, open the existing setting pages directly:
      </p>
      <ul className="mt-6 space-y-2">
        {[
          { label: "Business profile", to: "/settings/business-profile" as const },
          { label: "Tone profile", to: "/settings/tone-profile" as const },
          { label: "Growth goal", to: "/settings/growth-goal" as const },
        ].map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="inline-flex items-center justify-between rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              {l.label} →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
