/**
 * Client shell v4 — dark-sidebar dashboard.
 *
 * Desktop: a fixed charcoal sidebar (brand + vertical nav + sign out) with a
 * paper content area. Each page may pass a `hero` which renders as a charcoal
 * header band at the top of the content — the dark sidebar + dark header frame
 * the light dashboard, the high-end SaaS pattern (Linear / Stripe / Vercel).
 *
 * Mobile: sidebar collapses to a slim top bar + a charcoal bottom tab bar.
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

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/login";
}

export function ClientShell({
  children,
  businessName,
  locale = "en",
  hero,
  bleed = false,
}: {
  children: React.ReactNode;
  businessName?: string;
  locale?: PortalLocale;
  hero?: React.ReactNode;
  /** When true, the page renders its own full-bleed `<DashboardBand>`s and
   *  ClientShell skips the centered max-width wrapper around children. */
  bleed?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const c = portalCopy(locale);
  const tabLabel = (id: (typeof TABS)[number]["id"]) => c.tabs[id];
  const isActive = (to: string) => pathname === to || (to !== "/client" && pathname.startsWith(to));

  return (
    <div className="paper flex min-h-screen">
      {/* ── Desktop sidebar ── */}
      <aside className="surface-charcoal sticky top-0 hidden h-screen w-60 shrink-0 flex-col lg:flex">
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 px-5">
          <Mark className="h-7 w-7 shrink-0" />
          <span className="truncate font-display text-[15px] font-bold tracking-tight text-ink">
            {businessName ?? "LeadLayer"}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 pt-4">
          {TABS.map((t) => {
            const active = isActive(t.to);
            return (
              <Link
                key={t.id}
                to={t.to}
                className={`relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[15px] font-medium transition-colors ${
                  active
                    ? "bg-white/10 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                    : "text-ink-2 hover:bg-white/[0.06] hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-amber" />
                )}
                <t.icon
                  className={`h-[18px] w-[18px] shrink-0 ${active ? "text-amber-bright" : ""}`}
                />
                {tabLabel(t.id)}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="space-y-2 px-3 pb-4">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-[15px] font-medium text-ink-2 transition-colors hover:bg-paper-subtle/60 hover:text-ink"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {c.signOut}
          </button>
          <div className="flex items-center gap-2 px-3 pt-2">
            <Mark className="h-3.5 w-3.5 opacity-70" />
            <span className="text-[12px] text-ink-3">{c.poweredBy}</span>
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="surface-charcoal sticky top-0 z-20 flex h-14 items-center justify-between px-4 lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <Mark className="h-6 w-6 shrink-0" />
            <span className="truncate font-display text-sm font-bold tracking-tight text-ink">
              {businessName ?? "LeadLayer"}
            </span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-sm text-ink-3 transition hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Page hero — charcoal header band with an aurora wash so the
            open space reads as atmosphere, not a dead grey void. */}
        {hero && (
          <div className="surface-charcoal aurora-charcoal">
            <div className="mx-auto w-full max-w-[1600px] px-5 pb-10 pt-7 sm:pt-9 lg:px-10">
              {hero}
            </div>
          </div>
        )}

        {/* Content — pages render full-bleed <DashboardBand>s directly so
            section background colors can change without breaking the gutter. */}
        <main className={`flex-1 bg-paper pb-28 lg:pb-0 ${bleed ? "" : "paper-grain"}`}>
          {bleed ? (
            <div className="page-fade-up">{children}</div>
          ) : (
            <div className="page-fade-up mx-auto w-full max-w-[1600px] px-5 py-8 lg:px-10">
              {children}
            </div>
          )}

          {/* Footer (mobile only — desktop footer lives in the sidebar) */}
          <footer className="mx-auto w-full max-w-[1600px] px-5 pb-10 lg:hidden">
            <div className="rule-hair" />
            <div className="flex items-center gap-2 pt-4">
              <Mark className="h-4 w-4 opacity-80" />
              <span className="text-[13px] text-ink-3">{c.poweredBy}</span>
            </div>
          </footer>
        </main>
      </div>

      {/* ── Mobile floating glass dock ──
          (wrapper owns lg:hidden — .glass-dock sets display itself) */}
      <div
        className="fixed left-1/2 z-20 -translate-x-1/2 lg:hidden"
        style={{ bottom: "calc(14px + env(safe-area-inset-bottom))" }}
      >
        <nav className="glass-dock" aria-label="Navigation">
          {TABS.map((t) => {
            const active = isActive(t.to);
            return (
              <Link
                key={t.id}
                to={t.to}
                className={`glass-dock-item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <t.icon />
                {tabLabel(t.id)}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
