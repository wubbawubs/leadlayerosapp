/**
 * Server function wrappers around the Context Layer analyzers.
 *  - analyzeBrandVoice: triggered by the "Analyze brand voice" button
 *  - classifyAuditPages: classifies every audit_page sequentially (same
 *    per-page pattern as the proposal generator) to stay within worker
 *    timeouts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  analyzeBrandVoiceForTenant,
  classifyAuditPage,
} from "./analyzer.server";

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

export const analyzeBrandVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    try {
      const result = await analyzeBrandVoiceForTenant(data.tenantId);
      return { ok: true as const, toneSummary: result.tone_summary };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: message };
    }
  });

export const classifyAuditPageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string; auditPageId: string }) =>
    z
      .object({
        auditId: z.string().uuid(),
        auditPageId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit } = await supabase
      .from("audits")
      .select("tenant_id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (!audit) throw new Error("Audit not found");
    await assertOperator(supabase, userId, audit.tenant_id);
    try {
      const r = await classifyAuditPage(data.auditId, data.auditPageId);
      return { ok: true as const, pageType: r.page_type, intent: r.intent };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: message };
    }
  });

export const listAuditPagesForClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string }) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit } = await supabase
      .from("audits")
      .select("tenant_id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (!audit) throw new Error("Audit not found");
    await assertOperator(supabase, userId, audit.tenant_id);

    const { data: pages, error } = await supabaseAdmin
      .from("audit_pages")
      .select("id, url")
      .eq("audit_id", data.auditId);
    if (error) throw error;

    const ids = (pages ?? []).map((p) => p.id);
    const { data: existing } = await supabaseAdmin
      .from("page_intelligence")
      .select("audit_page_id")
      .in("audit_page_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const classified = new Set((existing ?? []).map((r) => r.audit_page_id));

    return {
      pages: (pages ?? []).map((p) => ({
        id: p.id as string,
        url: p.url as string,
        classified: classified.has(p.id),
      })),
    };
  });
