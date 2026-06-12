import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, LogOut, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";
import { Mark } from "@/components/brand/Mark";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { label: string; to: string; icon: typeof LayoutDashboard };

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", to: "/clients", icon: Users },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.documentElement.classList.contains("dark");
  });

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("ll-theme", next ? "dark" : "light"); } catch {}
  }

  return { dark, toggle };
}

function NavBrand() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <Link to="/dashboard" className="flex items-center gap-3 px-2 py-2.5">
      <Mark className="h-7 w-7 shrink-0" />
      {!collapsed && (
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm font-bold tracking-tight text-foreground">
            LeadLayer OS
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-accent/80">
            Operator
          </span>
        </div>
      )}
    </Link>
  );
}

function NavItems() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <SidebarMenu>
      {NAV.map((item) => {
        const active =
          pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
              <Link
                to={item.to}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  active
                    ? "bg-sidebar-accent/60 text-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                )}
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="font-sans text-[13px] font-medium tracking-tight">
                  {item.label}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function SignOutItem() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="Sign out"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/";
          }}
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavProgressBar() {
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });
  const [finishing, setFinishing] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setFinishing(false);
      setVisible(true);
    } else if (visible) {
      setFinishing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setFinishing(false);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-0 z-[100] h-[2px] overflow-hidden">
      <div
        className={`h-full bg-accent ${finishing ? "nav-bar-finishing" : "nav-bar-loading"}`}
      />
    </div>
  );
}

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}

export function OperatorShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <NavProgressBar />
      <div className="flex min-h-screen w-full bg-background bg-blueprint-subtle">
        {/* Sidebar: one step darker than canvas (#0A0B0D) */}
        <Sidebar collapsible="icon" className="border-r border-[rgba(255,255,255,0.05)]">
          <SidebarHeader>
            <NavBrand />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <NavItems />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SignOutItem />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          {/* Top bar: canvas level (#0D0E10) — does not compete with content */}
          <header className="sticky top-0 z-10 flex h-11 items-center gap-3 border-b border-[rgba(255,255,255,0.06)] bg-[#0D0E10] px-4">
            <SidebarTrigger className="text-[rgba(255,255,255,0.40)] hover:text-[#F5F5F5]" />
            <span className="h-3 w-px bg-[rgba(255,255,255,0.08)]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.30)]">
              LeadLayer OS
            </span>
            <span className="ml-auto inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.30)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#E8913A]" />
                Live
              </span>
              <ThemeToggle />
            </span>
          </header>
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
