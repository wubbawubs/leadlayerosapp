import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, LogOut } from "lucide-react";

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
      {NAV.map((item) => {
        const active =
          pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
              <Link to={item.to} className="flex items-center gap-2">
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
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

export function OperatorShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
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
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <SidebarTrigger />
            <div className="ml-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              LeadLayer Operator
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
