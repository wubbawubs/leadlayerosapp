import { createFileRoute } from "@tanstack/react-router";
import { TabPlaceholder } from "@/components/clients/TabPlaceholder";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/overview")({
  component: () => (
    <TabPlaceholder
      title="Client overview"
      body="Goal · readiness score · monthly progress · next best action will appear here in Phase 3."
    />
  ),
});
