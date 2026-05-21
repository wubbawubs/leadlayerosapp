import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listAudits,
  startAudit,
} from "@/lib/shared/db/repos/audits.functions";
import { listSiteConnections } from "@/lib/shared/db/repos/siteConnections.functions";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";

export const Route = createFileRoute("/_authenticated/sites/$siteId/audits")({
  component: AuditsListPage,
});

function AuditsListPage() {
  const { siteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchTenants = useServerFn(listMyTenants);
  const fetchSites = useServerFn(listSiteConnections);
  const fetchAudits = useServerFn(listAudits);
  const start = useServerFn(startAudit);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenants = tenantsQuery.data?.tenants ?? [];

  // Find which tenant this site belongs to by scanning each tenant's connections.
  const sitesQueries = useQuery({
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

  const found = sitesQueries.data?.find((g) =>
    g.connections.some((c) => c.id === siteId),
  );
  const tenantId = found?.tenantId ?? null;
  const site = found?.connections.find((c) => c.id === siteId) ?? null;

  const auditsQuery = useQuery({
    queryKey: ["audits", siteId, tenantId],
    enabled: !!tenantId,
    queryFn: () =>
      fetchAudits({ data: { tenantId: tenantId!, siteConnectionId: siteId } }),
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant not resolved yet");
      return start({ data: { tenantId, siteConnectionId: siteId } });
    },
    onSuccess: ({ auditId }) => {
      qc.invalidateQueries({ queryKey: ["audits", siteId] });
      navigate({ to: "/audits/$auditId", params: { auditId } });
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <Link to="/sites" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to sites
        </Link>
      </div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            S3 · SEO audit
          </p>
          <h1 className="font-display text-4xl text-foreground">Audits</h1>
          {site && (
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {site.base_url || site.type}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => runMutation.mutate()}
          disabled={!tenantId || runMutation.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {runMutation.isPending ? "Running audit…" : "+ Run new audit"}
        </button>
      </div>

      {runMutation.error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(runMutation.error as Error).message}
        </div>
      )}

      {auditsQuery.isLoading && (
        <p className="text-muted-foreground">Loading audits…</p>
      )}

      {auditsQuery.data && auditsQuery.data.audits.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-muted-foreground">
            No audits yet. Run your first audit to see SEO issues across your pages.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {auditsQuery.data?.audits.map((a) => {
          const summary = (a.summary ?? {}) as {
            pages_total?: number;
            issues_total?: number;
            health_score?: number;
          };
          return (
            <Link
              key={a.id}
              to="/audits/$auditId"
              params={{ auditId: a.id }}
              className="block rounded-lg border border-border bg-card/70 p-5 hover:bg-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <AuditStatusBadge status={a.status} />
                    <span className="text-sm text-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.pages_count} pages
                    {typeof summary.issues_total === "number" &&
                      ` · ${summary.issues_total} issues`}
                    {typeof summary.health_score === "number" &&
                      ` · health ${summary.health_score}/100`}
                    {a.error && ` · ${a.error.slice(0, 80)}`}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AuditStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: "bg-primary/15 text-primary",
    running: "bg-amber-500/15 text-amber-500",
    queued: "bg-muted text-muted-foreground",
    failed: "bg-destructive/15 text-destructive",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}
