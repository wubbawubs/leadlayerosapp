import { createFileRoute } from "@tanstack/react-router";
import { TabPlaceholder } from "@/components/clients/TabPlaceholder";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/pages")({
  component: () => (
    <TabPlaceholder
      title="Pages"
      body="WordPress inventory · drafts · published service / location / emergency pages will appear here in Phase 3."
    />
  ),
});
