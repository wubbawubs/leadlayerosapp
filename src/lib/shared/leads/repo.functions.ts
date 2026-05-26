/**
 * Tracking / Lead Inbox V1.
 *
 * Backend serverFns to manually log inbound leads and read inbox stats.
 * The `leads` and `lead_events` tables already exist with RLS scoped to
 * `is_tenant_member(tenant_id)` for reads and `has_tenant_min_role(..., operator)`
 * for writes — we mirror those gates in code via membership checks.
 *
 * UI comes later as part of the redesign — these fns are designed to be
 * called from a future Lead Inbox page and from the reporting math layer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

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
  return data.role as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(supabase: any, userId: string, tenantId: string) {
  const role = await assertMember(supabase, userId, tenantId);
  if (role !== "owner" && role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

export const LEAD_STATUSES = ["new", "qualified", "unqualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const LogLeadInputSchema = z.object({
  tenantId: z.string().uuid(),
  source: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().min(3).max(40).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
  pageId: z.string().uuid().optional(),
  attribution: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const logLeadManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LogLeadInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const status: LeadStatus = data.status ?? "new";

    const insertPayload = {
      tenant_id: data.tenantId,
      source: data.source ?? "manual",
      status,
      name: data.name ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      page_id: data.pageId ?? null,
      payload: {
        logged_via: "manual",
        logged_by: userId,
        notes: data.notes ?? null,
        occurred_at: data.occurredAt ?? new Date().toISOString(),
      },
      attribution: data.attribution ?? {},
    };

    const { data: row, error } = await admin
      .from("leads")
      .insert(insertPayload)
      .select("id, created_at")
      .single();
    if (error) throw error;

    // Best-effort audit trail; ignore failure (the lead is the source of truth).
    await admin.from("lead_events").insert({
      tenant_id: data.tenantId,
      lead_id: row.id,
      event_type: "manual_log",
      payload: { by: userId, status, source: insertPayload.source },
    });

    return { leadId: row.id as string, createdAt: row.created_at as string };
  });

const ListLeadsInputSchema = z.object({
  tenantId: z.string().uuid(),
  status: z.enum(LEAD_STATUSES).optional(),
  since: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export interface LeadSummary {
  id: string;
  source: string | null;
  status: LeadStatus;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  attribution: Record<string, any>;
}

export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListLeadsInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ leads: LeadSummary[] }> => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    let q = admin
      .from("leads")
      .select("id, source, status, name, email, phone, created_at, attribution")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);

    if (data.status) q = q.eq("status", data.status);
    if (data.since) q = q.gte("created_at", data.since);

    const { data: rows, error } = await q;
    if (error) throw error;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      leads: (rows ?? []).map((r: any) => ({
        id: r.id,
        source: r.source ?? null,
        status: (r.status ?? "new") as LeadStatus,
        name: r.name ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        createdAt: r.created_at,
        attribution: (r.attribution ?? {}) as Record<string, any>,
      })),
    };
  });

export interface LeadStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  last30Days: number;
  last7Days: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export const getLeadStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ stats: LeadStats }> => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await admin
      .from("leads")
      .select("status, created_at")
      .eq("tenant_id", data.tenantId);
    if (error) throw error;

    const byStatus: Record<LeadStatus, number> = {
      new: 0,
      qualified: 0,
      unqualified: 0,
      won: 0,
      lost: 0,
    };
    let firstSeen: string | null = null;
    let lastSeen: string | null = null;
    const now = Date.now();
    const day = 86_400_000;
    let last7 = 0;
    let last30 = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rows ?? []) as any[]) {
      const status = (r.status ?? "new") as LeadStatus;
      if (status in byStatus) byStatus[status]++;
      const t = r.created_at as string;
      if (!firstSeen || t < firstSeen) firstSeen = t;
      if (!lastSeen || t > lastSeen) lastSeen = t;
      const ageMs = now - new Date(t).getTime();
      if (ageMs <= 7 * day) last7++;
      if (ageMs <= 30 * day) last30++;
    }

    return {
      stats: {
        total: rows?.length ?? 0,
        byStatus,
        last30Days: last30,
        last7Days: last7,
        firstSeen,
        lastSeen,
      },
    };
  });
