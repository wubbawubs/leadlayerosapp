import { createFileRoute } from "@tanstack/react-router";
import { TabPlaceholder } from "@/components/clients/TabPlaceholder";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/leads")({
  component: () => (
    <TabPlaceholder
      title="Leads"
      body="Lead inbox · manual capture · webhook leads · status / won / closed revenue land here in Phase 3."
    />
  ),
});
