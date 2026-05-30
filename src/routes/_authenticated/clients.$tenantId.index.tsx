import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/clients/$tenantId/overview",
      params: { tenantId: params.tenantId },
    });
  },
});
