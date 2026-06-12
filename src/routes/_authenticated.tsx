import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { OperatorShell } from "@/components/app/OperatorShell";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // Skip auth check during SSR — session lives in localStorage (client-only).
    if (typeof window === "undefined") return;

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }

    if (location.pathname.startsWith("/onboarding")) return;

    const { count } = await supabase
      .from("memberships")
      .select("tenant_id", { count: "exact", head: true })
      .eq("user_id", data.user.id);

    if ((count ?? 0) === 0) {
      throw redirect({ to: "/onboarding/welcome" });
    }

    // Client-only users don't belong in the operator app
    const { data: opMembership } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", data.user.id)
      .in("role", ["owner", "operator"])
      .limit(1)
      .maybeSingle();

    if (!opMembership) {
      throw redirect({ to: "/client" as any });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  // Onboarding renders its own shell — no operator chrome for first-run flow.
  if (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/onboarding")
  ) {
    return <Outlet />;
  }
  return (
    <OperatorShell>
      <Outlet />
    </OperatorShell>
  );
}
