import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listSiteConnections } from "@/lib/shared/db/repos/siteConnections.functions";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  buildWordpressPageMappings,
  checkWordpressCapabilities,
  getOrCreateWordpressConnection,
  listWordpressPageMappings,
  listWordpressSiteInventory,
  syncWordpressSiteInventory,
} from "@/lib/shared/db/repos/wordpressConnections.functions";

export const Route = createFileRoute("/_authenticated/sites/$siteId/inventory")({
  component: InventoryPage,
});

function InventoryPage() {
  const { siteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchTenants = useServerFn(listMyTenants);
  const fetchSites = useServerFn(listSiteConnections);
  const getOrCreate = useServerFn(getOrCreateWordpressConnection);
  const checkCaps = useServerFn(checkWordpressCapabilities);
  const doSync = useServerFn(syncWordpressSiteInventory);
  const fetchInv = useServerFn(listWordpressSiteInventory);
  const fetchMappings = useServerFn(listWordpressPageMappings);
  const doBuildMappings = useServerFn(buildWordpressPageMappings);

  // ------------------------------------------------------------------
  // Tenant + site resolution
  // ------------------------------------------------------------------
  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenants = tenantsQuery.data?.tenants ?? [];

  const sitesQuery = useQuery({
    queryKey: ["all-sites", tenants.map((t) => t.id).sort()],
    enabled: tenants.length > 0,
    queryFn: async () => {
      const all = await Promise.all(
        tenants.map((t) =>
          fetchSites({ data: { tenantId: t.id } }).then((r) => ({
            tenantId: t.id,
            connections: r.connections,
          })),
        ),
      );
      return all;
    },
  });

  const found = sitesQuery.data?.find((g) =>
    g.connections.some((c) => c.id === siteId),
  );
  const site = found?.connections.find((c) => c.id === siteId);
  const tenantId = found?.tenantId ?? null;

  // ------------------------------------------------------------------
  // WordPress connection metadata row (get or create)
  // ------------------------------------------------------------------
  const wpConnQuery = useQuery({
    queryKey: ["wp-connection", siteId],
    enabled:
      !!tenantId &&
      (site?.type === "wordpress" || site?.type === "wordpress_com"),
    queryFn: () =>
      getOrCreate({ data: { tenantId: tenantId!, siteConnectionId: siteId } }),
  });
  const wpConn = wpConnQuery.data?.connection ?? null;
  const wpConnId = wpConn?.id ?? null;

  // ------------------------------------------------------------------
  // Inventory + mappings
  // ------------------------------------------------------------------
  const invQuery = useQuery({
    queryKey: ["wp-inventory", wpConnId],
    enabled: !!wpConnId && !!tenantId,
    queryFn: () =>
      fetchInv({ data: { tenantId: tenantId!, wordpressConnectionId: wpConnId! } }),
  });

  const mappingsQuery = useQuery({
    queryKey: ["wp-mappings", wpConnId],
    enabled: !!wpConnId && !!tenantId,
    queryFn: () =>
      fetchMappings({ data: { tenantId: tenantId!, wordpressConnectionId: wpConnId! } }),
  });

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------
  const capsMutation = useMutation({
    mutationFn: () =>
      checkCaps({ data: { tenantId: tenantId!, wordpressConnectionId: wpConnId! } }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["wp-connection", siteId] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      doSync({ data: { tenantId: tenantId!, wordpressConnectionId: wpConnId! } }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["wp-inventory", wpConnId] });
    },
  });

  const mappingsMutation = useMutation({
    mutationFn: () =>
      doBuildMappings({ data: { tenantId: tenantId!, wordpressConnectionId: wpConnId! } }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["wp-mappings", wpConnId] });
    },
  });

  // ------------------------------------------------------------------
  // Loading / not-found states
  // ------------------------------------------------------------------
  if (tenantsQuery.isLoading || sitesQuery.isLoading) {
    return (
      <Shell>
        <p className="text-muted-foreground">Loading…</p>
      </Shell>
    );
  }

  if (!site) {
    return (
      <Shell>
        <p className="text-muted-foreground">Site not found.</p>
      </Shell>
    );
  }

  const isWordpress = site.type === "wordpress" || site.type === "wordpress_com";

  if (!isWordpress) {
    return (
      <Shell site={site} onSignOut={() => navigate({ to: "/" })}>
        <p className="text-muted-foreground">
          WordPress inventory is only available for WordPress connections.
        </p>
      </Shell>
    );
  }

  const caps = wpConn?.capabilities as CapabilityMap | undefined;
  const items = invQuery.data?.items ?? [];
  const mappings = mappingsQuery.data?.mappings ?? [];

  const mappingSummary = {
    existing: mappings.filter((m) => m.mapping_type === "existing_page").length,
    candidates: mappings.filter((m) => m.mapping_type === "candidate_match").length,
    missing: mappings.filter((m) => m.mapping_type === "missing_page").length,
    manual: mappings.filter((m) => m.mapping_type === "manual_match").length,
  };

  return (
    <Shell site={site} onSignOut={() => navigate({ to: "/" })}>
      {/* Header */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Site · WordPress
        </p>
        <h1 className="font-display text-4xl text-foreground">Site inventory</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Read-only inventory sync in V1. No live WordPress changes are made. Draft creation comes
          later.
        </p>
      </div>

      {/* Connection status card */}
      <div className="mb-6 rounded-lg border border-border bg-card/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Connection
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">{site.base_url}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {site.type === "wordpress_com" ? "WordPress.com" : "Self-hosted WordPress"}
              </span>
              {wpConn && <StatusPill status={wpConn.status} />}
            </div>
            {wpConn?.errorMessage && (
              <p className="mt-2 text-xs text-destructive">{wpConn.errorMessage}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!wpConnId || capsMutation.isPending}
              onClick={() => capsMutation.mutate()}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
            >
              {capsMutation.isPending ? "Checking…" : "Check capabilities"}
            </button>
            <button
              type="button"
              disabled={!wpConnId || wpConn?.status === "failed" || syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {syncMutation.isPending
                ? "Syncing…"
                : items.length > 0
                  ? `Re-sync inventory (${items.length})`
                  : "Sync inventory"}
            </button>
          </div>
        </div>

        {/* Capabilities grid */}
        {caps && (caps.ok !== undefined) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {(
              [
                { k: "canReadPages", label: "Read pages" },
                { k: "canReadPosts", label: "Read posts" },
                { k: "canCreateDraft", label: "Create draft" },
                { k: "canUploadMedia", label: "Upload media" },
              ] as Array<{ k: keyof CapabilityMap; label: string }>
            ).map(({ k, label }) => (
              <span
                key={k}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  caps[k]
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
              </span>
            ))}
            {caps.roles && caps.roles.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Roles: {caps.roles.join(", ")}
              </span>
            )}
            {wpConn?.lastCheckedAt && (
              <span className="ml-auto text-xs text-muted-foreground">
                Checked {new Date(wpConn.lastCheckedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {capsMutation.isError && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {(capsMutation.error as Error).message}
          </p>
        )}
        {syncMutation.isError && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {(syncMutation.error as Error).message}
          </p>
        )}
        {syncMutation.isSuccess && (
          <p className="mt-3 text-xs text-foreground">
            Synced {syncMutation.data?.syncedCount ?? 0} items successfully.
          </p>
        )}
      </div>

      {/* Mapping summary tiles */}
      {mappings.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { label: "Existing matches", value: mappingSummary.existing, color: "text-emerald-400" },
              { label: "Candidate matches", value: mappingSummary.candidates, color: "text-amber-400" },
              { label: "Missing pages", value: mappingSummary.missing, color: "text-destructive" },
              { label: "Manual overrides", value: mappingSummary.manual, color: "text-muted-foreground" },
            ] as Array<{ label: string; value: number; color: string }>
          ).map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-border bg-card/60 p-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Build / refresh mappings */}
      {items.length > 0 && (
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            disabled={mappingsMutation.isPending}
            onClick={() => mappingsMutation.mutate()}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            {mappingsMutation.isPending ? "Building mappings…" : "Build / refresh page mappings"}
          </button>
          {mappingsMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">
              Done — {mappingsMutation.data?.summary.total ?? 0} mappings built.
            </span>
          )}
          {mappingsMutation.isError && (
            <span className="text-xs text-destructive">
              {(mappingsMutation.error as Error).message}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !invQuery.isLoading && (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-muted-foreground">
            No inventory yet. Press{" "}
            <strong className="text-foreground">Sync inventory</strong> to fetch pages and posts
            from WordPress.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Make sure to run <strong className="text-foreground">Check capabilities</strong> first
            to confirm the connection is working.
          </p>
        </div>
      )}

      {/* Inventory table */}
      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/30">
              <tr>
                {["Title", "Type", "Status", "Slug", "Modified", "Mapped role"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-secondary/20">
                  <td className="max-w-[220px] truncate px-4 py-2.5 font-medium text-foreground">
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {item.title ?? "(no title)"}
                      </a>
                    ) : (
                      (item.title ?? "(no title)")
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <TypeBadge type={item.post_type ?? "page"} />
                  </td>
                  <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">
                    {item.status ?? "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {item.slug ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {item.modified_at ? new Date(item.modified_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {item.mapped_page_role ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </Shell>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

interface CapabilityMap {
  ok?: boolean;
  canReadPages?: boolean;
  canReadPosts?: boolean;
  canCreateDraft?: boolean;
  canUploadMedia?: boolean;
  canReadTaxonomies?: boolean;
  roles?: string[];
  error?: string;
  elapsedMs?: number;
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    connected: "bg-emerald-500/15 text-emerald-400",
    not_connected: "bg-muted text-muted-foreground",
    failed: "bg-destructive/15 text-destructive",
    needs_review: "bg-amber-500/15 text-amber-400",
    revoked: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cls: Record<string, string> = {
    page: "bg-blue-500/15 text-blue-400",
    post: "bg-purple-500/15 text-purple-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls[type] ?? "bg-muted text-muted-foreground"}`}
    >
      {type}
    </span>
  );
}

function Shell({
  children,
  site,
  onSignOut,
}: {
  children: React.ReactNode;
  site?: { id: string; base_url: string | null; type: string };
  onSignOut?: () => void;
}) {
  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/sites" className="text-muted-foreground hover:text-foreground">
              Sites
            </Link>
            {site && (
              <>
                <Link
                  to="/sites/$siteId/audits"
                  params={{ siteId: site.id }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Audits
                </Link>
                <span className="font-medium text-foreground">Inventory</span>
              </>
            )}
          </nav>
        </div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Sign out
          </button>
        )}
      </header>
      <main className="container mx-auto max-w-5xl px-6 pb-24 pt-4">{children}</main>
    </div>
  );
}
