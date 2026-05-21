import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

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
  },
  component: () => <Outlet />,
});
