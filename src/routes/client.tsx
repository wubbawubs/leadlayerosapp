import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/client")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });

    // Operators/owners should not be in the client area
    const { data: opMembership } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", data.user.id)
      .in("role", ["owner", "operator"])
      .limit(1)
      .maybeSingle();

    if (opMembership) throw redirect({ to: "/dashboard" });

    // Must have a client membership
    const { data: clientMembership } = await supabase
      .from("memberships")
      .select("tenant_id, role")
      .eq("user_id", data.user.id)
      .in("role", ["client_viewer", "client_approver"])
      .limit(1)
      .maybeSingle();

    if (!clientMembership) throw redirect({ to: "/login" });
  },
  component: () => <Outlet />,
});
