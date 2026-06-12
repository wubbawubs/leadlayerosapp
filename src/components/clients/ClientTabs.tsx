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
    <nav className="sticky top-11 z-[5] border-b border-[rgba(255,255,255,0.06)] bg-[#0D0E10]">
      <ul className="-mb-px flex gap-0 overflow-x-auto px-6 lg:px-8">
        {TABS.map((t) => {
          const href   = t.to.replace("$tenantId", tenantId);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                params={{ tenantId }}
                className={`inline-block whitespace-nowrap border-b-2 px-4 py-3 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  active
                    ? "border-[#E8913A] text-[#F5F5F5]"
                    : "border-transparent text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.60)]"
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
