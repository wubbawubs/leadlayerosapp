import { Link, useRouterState } from "@tanstack/react-router";

const TABS = [
  { label: "Overview", to: "/clients/$tenantId/overview" as const },
  { label: "Execution", to: "/clients/$tenantId/execution" as const },
  { label: "Pages", to: "/clients/$tenantId/pages" as const },
  { label: "Leads", to: "/clients/$tenantId/leads" as const },
  { label: "Reports", to: "/clients/$tenantId/reports" as const },
  { label: "Settings", to: "/clients/$tenantId/settings" as const },
];

export function ClientTabs({ tenantId }: { tenantId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="sticky top-12 z-[5] border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="-mb-px flex flex-wrap gap-1 px-4">
        {TABS.map((t) => {
          const href = t.to.replace("$tenantId", tenantId);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                params={{ tenantId }}
                className={`inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-[color:var(--status-info)] text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
