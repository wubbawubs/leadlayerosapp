/**
 * Growth Context — server functions (auth-protected).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGrowthContext } from "./builder.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
}

export const previewGrowthContextForProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string; pageId: string; issueId: string }) =>
    z
      .object({
        auditId: z.string().uuid(),
        pageId: z.string().uuid(),
        issueId: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, tenant_id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (error) throw error;
    if (!audit) throw new Error("Audit not found");
    await assertMember(supabase, userId, audit.tenant_id);

    const ctx = await buildGrowthContext({
      tenantId: audit.tenant_id,
      auditId: data.auditId,
      pageId: data.pageId,
      issueId: data.issueId,
    });
    return { context: ctx };
  });
