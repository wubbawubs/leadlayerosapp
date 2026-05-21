/**
 * Audits repo — server functions for starting/listing/reading SEO audits.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAudit } from "@/lib/shared/audits/runner.server";

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

export const startAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; siteConnectionId: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        siteConnectionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Verify site connection belongs to tenant
    const { data: site, error: sErr } = await supabase
      .from("site_connections")
      .select("id, tenant_id, status")
      .eq("id", data.siteConnectionId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!site) throw new Error("Site connection not found");
    if (site.status !== "connected") throw new Error("Site is not connected");

    const { data: audit, error: iErr } = await supabaseAdmin
      .from("audits")
      .insert({
        tenant_id: data.tenantId,
        site_connection_id: data.siteConnectionId,
        status: "queued",
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    // Run synchronously. WP.com sites with ≤20 pages typically finish in <15s.
    try {
      await runAudit(audit.id);
    } catch (e) {
      // runAudit already marks failed; surface message but don't throw here so
      // the UI can navigate to the report page.
      console.error("Audit failed", e);
    }
    return { auditId: audit.id as string };
  });

export const listAudits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; siteConnectionId: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        siteConnectionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("audits")
      .select("id, status, started_at, finished_at, pages_count, summary, error, created_at")
      .eq("tenant_id", data.tenantId)
      .eq("site_connection_id", data.siteConnectionId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { audits: rows ?? [] };
  });

export const getAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string }) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: audit, error } = await supabase
      .from("audits")
      .select(
        "id, tenant_id, site_connection_id, status, started_at, finished_at, pages_count, summary, error, created_at",
      )
      .eq("id", data.auditId)
      .maybeSingle();
    if (error) throw error;
    if (!audit) throw new Error("Audit not found");

    const { data: pages, error: pErr } = await supabase
      .from("audit_pages")
      .select(
        "id, url, status_code, title, meta_description, h1, images_without_alt, internal_links_count, external_links_count, word_count, issues, fetched_at",
      )
      .eq("audit_id", data.auditId)
      .order("fetched_at", { ascending: true });
    if (pErr) throw pErr;

    return { audit, pages: pages ?? [] };
  });
