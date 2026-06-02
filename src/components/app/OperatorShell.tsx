import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, LogOut } from "lucide-react";
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

function NavBrand() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-2">
      <Mark className="h-7 w-7 shrink-0" />
      {!collapsed && (
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm font-bold tracking-tight text-foreground">
            LeadLayer
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            Operator OS
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
      {NAV.map((item, i) => {
        const active =
          pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
              <Link to={item.to} className="flex items-center gap-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  §{String(i + 1).padStart(2, "0")}
                </span>
                <item.icon className="h-4 w-4" />
                <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
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

export function OperatorShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <NavProgressBar />
      <div className="flex min-h-screen w-full bg-background bg-blueprint-subtle">
        <Sidebar collapsible="icon" className="border-r border-border">
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
          <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <SidebarTrigger />
            <span className="h-3 w-px bg-border" />
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              LeadLayer · Operator OS
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              Live
            </span>
          </header>
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
