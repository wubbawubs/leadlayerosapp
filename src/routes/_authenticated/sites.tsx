import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import { TenantSwitcher } from "@/components/app/TenantSwitcher";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  listSiteConnections,
  probeSiteConnection,
} from "@/lib/shared/db/repos/siteConnections.functions";

export const Route = createFileRoute("/_authenticated/sites")({
  component: SitesPage,
});

function SitesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchSites = useServerFn(listSiteConnections);
  const probe = useServerFn(probeSiteConnection);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenants.length) return;
    const stored = typeof window !== "undefined"
      ? localStorage.getItem("ll.activeTenantId")
      : null;
    const valid = tenants.find((t) => t.id === stored)?.id ?? tenants[0].id;
    setTenantId(valid);
  }, [tenants]);

  const sitesQuery = useQuery({
    queryKey: ["site-connections", tenantId],
    queryFn: () => fetchSites({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const probeMutation = useMutation({
    mutationFn: (id: string) => probe({ data: { siteConnectionId: id } }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["site-connections", tenantId] }),
  });

  if (tenantsQuery.isLoading) {
    return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;
  }
  if (!tenants.length) {
    return (
      <Shell>
        <p className="text-muted-foreground">
          You need a tenant first.{" "}
          <Link to="/onboarding" className="text-primary underline">
            Start onboarding
          </Link>
          .
        </p>
      </Shell>
    );
  }

  return (
    <Shell tenants={tenants} onSignOut={() => navigate({ to: "/" })}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            S2 · Site connect
          </p>
          <h1 className="font-display text-4xl text-foreground">
            Connected sites
          </h1>
        </div>
        <Link
          to="/sites/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          + Connect WordPress site
        </Link>
      </div>

      {sitesQuery.isLoading && <p className="text-muted-foreground">Loading sites…</p>}
      {sitesQuery.error && (
        <p className="text-destructive text-sm">
          {(sitesQuery.error as Error).message}
        </p>
      )}
      {sitesQuery.data && sitesQuery.data.connections.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-muted-foreground">
            No sites connected yet. Connect your first WordPress site to get started.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {sitesQuery.data?.connections.map((c) => {
          const result = (c.probe_result ?? null) as null | {
            ok?: boolean;
            error?: string;
            user?: { name?: string; roles?: string[] };
            httpStatus?: number;
            elapsedMs?: number;
          };
          return (
            <div
              key={c.id}
              className="rounded-lg border border-border bg-card/70 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} hasProbe={!!c.last_probe_at} />
                    <span className="font-mono text-sm text-foreground truncate">
                      {c.base_url}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.type} · user <span className="font-mono">{c.username}</span>
                    {c.last_probe_at && (
                      <> · probed {new Date(c.last_probe_at).toLocaleString()}</>
                    )}
                  </p>
                  {result && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {result.ok && result.user
                        ? `OK · ${result.user.name} (${result.user.roles?.join(", ") || "no roles"}) · ${result.elapsedMs}ms`
                        : result.error || "Unknown result"}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => probeMutation.mutate(c.id)}
                  disabled={probeMutation.isPending && probeMutation.variables === c.id}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
                >
                  {probeMutation.isPending && probeMutation.variables === c.id
                    ? "Probing…"
                    : "Re-probe"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function StatusBadge({
  status,
  hasProbe,
}: {
  status: string;
  hasProbe: boolean;
}) {
  if (!hasProbe || status === "pending") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Never probed
      </span>
    );
  }
  if (status === "connected") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
      {status}
    </span>
  );
}

function Shell({
  children,
  tenants,
  onSignOut,
}: {
  children: React.ReactNode;
  tenants?: { id: string; name: string; geo: string; vertical: string; status: string }[];
  onSignOut?: () => void;

}) {
  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/sites" className="text-foreground font-medium">
              Sites
            </Link>
          </nav>
        </div>
        {tenants && (
          <div className="flex items-center gap-2">
            <TenantSwitcher tenants={tenants} />
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </header>
      <main className="container mx-auto px-6 pb-24 pt-4">{children}</main>
    </div>
  );
}
