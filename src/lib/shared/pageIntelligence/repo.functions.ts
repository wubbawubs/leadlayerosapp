/**
 * Page Intelligence V1 — server functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzePageIntelligenceForAudit } from "./analyzer.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  if (data.role !== "owner" && data.role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

export const analyzeAuditPageIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string; forceRefresh?: boolean }) =>
    z
      .object({
        auditId: z.string().uuid(),
        forceRefresh: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, tenant_id, status")
      .eq("id", data.auditId)
      .maybeSingle();
    if (error) throw error;
    if (!audit) throw new Error("Audit not found");
    await assertOperator(supabase, userId, audit.tenant_id);

    const summary = await analyzePageIntelligenceForAudit({
      tenantId: audit.tenant_id,
      auditId: audit.id,
      forceRefresh: data.forceRefresh,
    });
    return { summary };
  });

export const listPageIntelligenceForAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string }) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: audit, error: aErr } = await supabase
      .from("audits")
      .select("id, tenant_id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!audit) throw new Error("Audit not found");

    // Match by audit_id OR by page_id of the audit's pages (so pages analyzed
    // in a prior audit still show in current view).
    const { data: byAudit, error: bErr } = await supabaseAdmin
      .from("page_intelligence")
      .select("*")
      .eq("tenant_id", audit.tenant_id)
      .eq("audit_id", audit.id);
    if (bErr) throw bErr;

    return { items: byAudit ?? [] };
  });
