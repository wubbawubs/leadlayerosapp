/**
 * Client shell v3 — "charcoal frame, paper sheet".
 *
 * The charcoal band frames the app: brand + nav on top, an optional
 * page hero inside it (greeting, headline numbers). The paper sheet
 * slides up over the frame and carries the content. Mobile gets a
 * charcoal bottom tab bar; desktop gets inline nav in the masthead.
 *
 * See DESIGN.md (client surface). Copy comes from portalCopy.ts.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Trophy, Layers, FileText, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Mark } from "@/components/brand/Mark";
import { portalCopy, type PortalLocale } from "@/lib/shared/clientPortal/portalCopy";

const TABS = [
  { id: "home", icon: Home, to: "/client" as const },
  { id: "leads", icon: Trophy, to: "/client/leads" as const },
  { id: "pages", icon: Layers, to: "/client/pages" as const },
  { id: "reports", icon: FileText, to: "/client/reports" as const },
] as const;

export function ClientShell({
  children,
  businessName,
  locale = "en",
  hero,
}: {
  children: React.ReactNode;
  businessName?: string;
  locale?: PortalLocale;
  hero?: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const c = portalCopy(locale);
  const tabLabel = (id: (typeof TABS)[number]["id"]) => c.tabs[id];

  const isActive = (to: string) => pathname === to || (to !== "/client" && pathname.startsWith(to));

  return (
    <div className="paper flex min-h-screen flex-col">
      {/* ── Charcoal frame ── */}
      <div className="surface-charcoal">
        {/* Masthead */}
        <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Mark className="h-7 w-7 shrink-0" />
            <span className="truncate font-display text-base font-bold tracking-tight text-ink">
              {businessName ?? "LeadLayer"}
            </span>
          </div>

          {/* Desktop nav, inline in the masthead */}
          <nav className="hidden items-center gap-1 sm:flex">
            {TABS.map((t) => {
              const active = isActive(t.to);
              return (
                <Link
                  key={t.id}
                  to={t.to}
                  className={`relative px-4 py-2 text-[15px] font-medium transition-colors ${
                    active ? "text-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {tabLabel(t.id)}
                  {active && <span className="absolute inset-x-4 -bottom-0.5 h-0.5 bg-amber" />}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-sm text-ink-3 transition hover:bg-charcoal-soft hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{c.signOut}</span>
          </button>
        </header>

        {/* Page hero inside the frame */}
        {hero && <div className="mx-auto w-full max-w-5xl px-5 pb-12 pt-6 sm:pt-10">{hero}</div>}
      </div>

      {/* ── Paper sheet ── */}
      <main
        className={`relative z-[1] flex-1 bg-paper paper-grain pb-28 sm:pb-0 ${hero ? "-mt-4 rounded-t-[10px] border-t border-paper-line" : ""}`}
      >
        <div className="page-fade-up mx-auto w-full max-w-5xl px-5 py-8">{children}</div>

        {/* Footer */}
        <footer className="mx-auto w-full max-w-5xl px-5 pb-10 sm:pb-8">
          <div className="rule-hair" />
          <div className="flex items-center gap-2 pt-4">
            <Mark className="h-4 w-4 opacity-80" />
            <span className="text-[13px] text-ink-3">{c.poweredBy}</span>
          </div>
        </footer>
      </main>

      {/* ── Mobile bottom tab bar (charcoal, matches the frame) ── */}
      <nav className="surface-charcoal fixed bottom-0 left-0 right-0 z-10 grid grid-cols-4 border-t border-charcoal-line pb-[env(safe-area-inset-bottom)] sm:hidden">
        {TABS.map((t) => {
          const active = isActive(t.to);
          return (
            <Link
              key={t.id}
              to={t.to}
              className={`relative flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-colors ${
                active ? "text-amber-bright" : "text-ink-3"
              }`}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 bg-amber" />}
              <t.icon className="h-5 w-5" />
              {tabLabel(t.id)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
