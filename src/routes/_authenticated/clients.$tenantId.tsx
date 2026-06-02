import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { listMyTenants, getTenantSummary } from "@/lib/shared/db/repos/tenants.functions";
import { ClientCommandHeader } from "@/components/clients/ClientCommandHeader";
import { ClientTabs } from "@/components/clients/ClientTabs";

export const Route = createFileRoute("/_authenticated/clients/$tenantId")({
  component: ClientCommandCenter,
});

function ClientCommandCenter() {
  const { tenantId } = Route.useParams();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchSummary = useServerFn(getTenantSummary);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const summaryQuery = useQuery({
    queryKey: ["tenant-summary", tenantId],
    queryFn: () => fetchSummary({ data: { tenantId } }),
  });

  const tenant = tenantsQuery.data?.tenants.find((t) => t.id === tenantId) ?? null;

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col">
      <ClientCommandHeader
        tenantId={tenantId}
        tenant={tenant}
        summary={summaryQuery.data ?? null}
        loading={tenantsQuery.isLoading}
      />
      <ClientTabs tenantId={tenantId} />
      <div className="flex-1 bg-muted/30">
        <div className="animate-fade-up-in">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
