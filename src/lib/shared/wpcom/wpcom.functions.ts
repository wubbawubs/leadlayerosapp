/**
 * Server function to begin WordPress.com OAuth.
 * Returns a signed authorize URL that the browser then navigates to.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildAuthorizeUrl,
  getRedirectUri,
  signState,
} from "@/lib/shared/wpcom/oauth.server";

export const startWpcomOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify the user is at least operator on this tenant.
    const { data: m, error } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!m || (m.role !== "owner" && m.role !== "operator")) {
      throw new Error("Forbidden: operator or owner required");
    }

    const clientId = process.env.WPCOM_CLIENT_ID;
    if (!clientId) throw new Error("WPCOM_CLIENT_ID not configured");

    const request = getRequest();
    const redirectUri = getRedirectUri(request);
    const state = signState({ t: data.tenantId, u: userId });
    const authorizeUrl = buildAuthorizeUrl({
      clientId,
      redirectUri,
      state,
      scope: "global",
    });
    return { authorizeUrl };
  });
