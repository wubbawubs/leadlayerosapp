import { createFileRoute } from "@tanstack/react-router";
import { ExecutionBoard } from "@/components/execution/ExecutionBoard";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/execution")({
  component: ExecutionTab,
  head: () => ({ meta: [{ title: "Execution — LeadLayer" }] }),
});

function ExecutionTab() {
  const { tenantId } = Route.useParams();
  return <ExecutionBoard tenantId={tenantId} />;
}
