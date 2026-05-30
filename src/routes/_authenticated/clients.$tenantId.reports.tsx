import { createFileRoute } from "@tanstack/react-router";
import { TabPlaceholder } from "@/components/clients/TabPlaceholder";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/reports")({
  component: () => (
    <TabPlaceholder
      title="Reports"
      body="Monthly reports · public share links · monthly execution plan approval flow connect in Phase 3."
    />
  ),
});
