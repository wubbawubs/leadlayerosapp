/**
 * /portal/:token — deprecated. Replaced by the authenticated client dashboard at /client.
 * Old links redirect to login so clients can sign in properly.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/$portalToken")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
