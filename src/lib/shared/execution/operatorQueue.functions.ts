/**
 * Operator Queue — cross-tenant action queue and client health summaries.
 *
 * Powers:
 *   - /dashboard operator home (action queue + client health grid)
 *   - /clients list page (health summaries)
 *
 * Queries raw tables with .in("tenant_id", tenantIds) instead of calling
 * getExecutionBoard N times. One DB round-trip per table, not per client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ------------------------------------------------------------------
// Shared types
// ------------------------------------------------------------------

export type ActionType =
  | "review_brief"
  | "create_draft"
  | "publish_draft"
  | "review_opt_brief"
  | "apply_optimization"
  | "retry_delivery";

export interface ActionQueueItem {
  tenantId: string;
  tenantName: string;
  type: ActionType;
  urgency: "high" | "medium" | "low";
  artifactId: string | null;
  draftId: string | null;
  masterplanItemId: string | null;
  pageTitle: string;
  primaryKeyword: string | null;
  keywordVolume: number | null;
  riskFlagCount: number;
  daysPending: number;
  createdAt: string;
}

export interface ClientHealthSummary {
  tenantId: string;
  tenantName: string;
  tier: string | null;
  health: "green" | "amber" | "red";
  leadsThisMonth: number;
  pendingActionCount: number;
  lastDeliveryAt: string | null;
  lastActivityAt: string | null;
  activeGoalExists: boolean;
  nextCallAt: string | null;
}

// ------------------------------------------------------------------
// 1. getOperatorActionQueue
// ------------------------------------------------------------------

export const getOperatorActionQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load all tenants the operator has access to
    const { data: memberships } = await supabase
      .from("memberships")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .in("role", ["owner", "operator"]);

    if (!memberships || memberships.length === 0) return { items: [] as ActionQueueItem[] };

    const tenantIds = memberships.map((m: { tenant_id: string }) => m.tenant_id);

    // Load tenant names
    const { data: tenantRows } = await admin
      .from("tenants")
      .select("id, name")
      .in("id", tenantIds);
    const tenantNameById = new Map<string, string>(
      (tenantRows ?? []).map((t: { id: string; name: string }) => [t.id, t.name ?? t.id]),
    );

    const now = Date.now();
    const items: ActionQueueItem[] = [];

    // ------------------------------------------------------------------
    // 1. Briefs needing review (needs_review status)
    // ------------------------------------------------------------------
    const { data: reviewArtRows } = await admin
      .from("execution_artifacts")
      .select("id, tenant_id, artifact_type, status, masterplan_item_id, payload, risk_flags, created_at")
      .in("tenant_id", tenantIds)
      .eq("status", "needs_review")
      .in("artifact_type", ["page_brief", "page_optimization_brief"])
      .order("created_at", { ascending: true })
      .limit(data.limit ?? 50);

    // Load masterplan item titles for briefs
    const briefItemIds = (reviewArtRows ?? [])
      .map((r: { masterplan_item_id: string }) => r.masterplan_item_id)
      .filter(Boolean);
    const itemTitleById = new Map<string, string>();
    if (briefItemIds.length > 0) {
      const { data: itemRows } = await admin
        .from("masterplan_items")
        .select("id, title")
        .in("id", briefItemIds);
      for (const r of (itemRows ?? []) as Array<{ id: string; title: string }>) {
        itemTitleById.set(r.id, r.title);
      }
    }

    for (const r of (reviewArtRows ?? []) as Array<{
      id: string;
      tenant_id: string;
      artifact_type: string;
      status: string;
      masterplan_item_id: string | null;
      payload: Record<string, unknown> | null;
      risk_flags: string[] | null;
      created_at: string;
    }>) {
      const p = r.payload ?? {};
      const daysPending = Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000);
      items.push({
        tenantId: r.tenant_id,
        tenantName: tenantNameById.get(r.tenant_id) ?? r.tenant_id,
        type: r.artifact_type === "page_optimization_brief" ? "review_opt_brief" : "review_brief",
        urgency: daysPending >= 3 ? "high" : "medium",
        artifactId: r.id,
        draftId: null,
        masterplanItemId: r.masterplan_item_id,
        pageTitle: itemTitleById.get(r.masterplan_item_id ?? "") ?? "Untitled",
        primaryKeyword: typeof p.primaryKeyword === "string" ? p.primaryKeyword : null,
        keywordVolume: typeof p.keywordVolume === "number" ? p.keywordVolume : null,
        riskFlagCount: Array.isArray(r.risk_flags) ? r.risk_flags.length : 0,
        daysPending,
        createdAt: r.created_at,
      });
    }

    // ------------------------------------------------------------------
    // 2. Approved page_brief artifacts with no WP draft yet
    // ------------------------------------------------------------------
    const { data: approvedArtRows } = await admin
      .from("execution_artifacts")
      .select("id, tenant_id, masterplan_item_id, payload, risk_flags, created_at")
      .in("tenant_id", tenantIds)
      .eq("artifact_type", "page_brief")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(data.limit ?? 50);

    if ((approvedArtRows ?? []).length > 0) {
      const approvedIds = (approvedArtRows as Array<{ id: string }>).map((r) => r.id);
      const { data: draftRows } = await admin
        .from("wordpress_drafts")
        .select("execution_artifact_id")
        .in("execution_artifact_id", approvedIds);
      const artIdsWithDraft = new Set(
        (draftRows ?? []).map((d: { execution_artifact_id: string }) => d.execution_artifact_id),
      );

      for (const r of (approvedArtRows ?? []) as Array<{
        id: string;
        tenant_id: string;
        masterplan_item_id: string | null;
        payload: Record<string, unknown> | null;
        risk_flags: string[] | null;
        created_at: string;
      }>) {
        if (artIdsWithDraft.has(r.id)) continue;
        const p = r.payload ?? {};
        const daysPending = Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000);
        items.push({
          tenantId: r.tenant_id,
          tenantName: tenantNameById.get(r.tenant_id) ?? r.tenant_id,
          type: "create_draft",
          urgency: "medium",
          artifactId: r.id,
          draftId: null,
          masterplanItemId: r.masterplan_item_id,
          pageTitle: itemTitleById.get(r.masterplan_item_id ?? "") ?? "Untitled",
          primaryKeyword: typeof p.primaryKeyword === "string" ? p.primaryKeyword : null,
          keywordVolume: typeof p.keywordVolume === "number" ? p.keywordVolume : null,
          riskFlagCount: Array.isArray(r.risk_flags) ? r.risk_flags.length : 0,
          daysPending,
          createdAt: r.created_at,
        });
      }
    }

    // ------------------------------------------------------------------
    // 3. WP drafts with status=created — ready to publish
    // ------------------------------------------------------------------
    const { data: draftCreatedRows } = await admin
      .from("wordpress_drafts")
      .select("id, tenant_id, title, execution_artifact_id, created_at")
      .in("tenant_id", tenantIds)
      .eq("status", "created")
      .order("created_at", { ascending: true })
      .limit(data.limit ?? 50);

    for (const r of (draftCreatedRows ?? []) as Array<{
      id: string;
      tenant_id: string;
      title: string | null;
      execution_artifact_id: string | null;
      created_at: string;
    }>) {
      const daysPending = Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000);
      items.push({
        tenantId: r.tenant_id,
        tenantName: tenantNameById.get(r.tenant_id) ?? r.tenant_id,
        type: "publish_draft",
        urgency: "low",
        artifactId: r.execution_artifact_id,
        draftId: r.id,
        masterplanItemId: null,
        pageTitle: r.title ?? "Untitled draft",
        primaryKeyword: null,
        keywordVolume: null,
        riskFlagCount: 0,
        daysPending,
        createdAt: r.created_at,
      });
    }

    // ------------------------------------------------------------------
    // 4. Approved page_optimization_brief — ready to apply
    // ------------------------------------------------------------------
    const { data: optApprovedRows } = await admin
      .from("execution_artifacts")
      .select("id, tenant_id, masterplan_item_id, payload, risk_flags, created_at")
      .in("tenant_id", tenantIds)
      .eq("artifact_type", "page_optimization_brief")
      .eq("status", "approved")
      .is("delivery_status", null)
      .order("created_at", { ascending: true })
      .limit(data.limit ?? 30);

    for (const r of (optApprovedRows ?? []) as Array<{
      id: string;
      tenant_id: string;
      masterplan_item_id: string | null;
      payload: Record<string, unknown> | null;
      risk_flags: string[] | null;
      created_at: string;
    }>) {
      const p = r.payload ?? {};
      const daysPending = Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000);
      items.push({
        tenantId: r.tenant_id,
        tenantName: tenantNameById.get(r.tenant_id) ?? r.tenant_id,
        type: "apply_optimization",
        urgency: "medium",
        artifactId: r.id,
        draftId: null,
        masterplanItemId: r.masterplan_item_id,
        pageTitle: typeof p.targetUrl === "string" ? p.targetUrl : (itemTitleById.get(r.masterplan_item_id ?? "") ?? "Existing page"),
        primaryKeyword: null,
        keywordVolume: null,
        riskFlagCount: Array.isArray(r.risk_flags) ? r.risk_flags.length : 0,
        daysPending,
        createdAt: r.created_at,
      });
    }

    // ------------------------------------------------------------------
    // 5. Failed deliveries — need retry
    // ------------------------------------------------------------------
    const { data: failedRows } = await admin
      .from("execution_artifacts")
      .select("id, tenant_id, artifact_type, masterplan_item_id, payload, created_at")
      .in("tenant_id", tenantIds)
      .eq("delivery_status", "delivery_failed")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 20);

    for (const r of (failedRows ?? []) as Array<{
      id: string;
      tenant_id: string;
      artifact_type: string;
      masterplan_item_id: string | null;
      payload: Record<string, unknown> | null;
      created_at: string;
    }>) {
      const p = r.payload ?? {};
      items.push({
        tenantId: r.tenant_id,
        tenantName: tenantNameById.get(r.tenant_id) ?? r.tenant_id,
        type: "retry_delivery",
        urgency: "high",
        artifactId: r.id,
        draftId: null,
        masterplanItemId: r.masterplan_item_id,
        pageTitle: typeof p.targetUrl === "string" ? p.targetUrl : (itemTitleById.get(r.masterplan_item_id ?? "") ?? "Page"),
        primaryKeyword: null,
        keywordVolume: null,
        riskFlagCount: 0,
        daysPending: Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000),
        createdAt: r.created_at,
      });
    }

    // Sort: failed first, then by daysPending desc
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => {
      const ud = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (ud !== 0) return ud;
      return b.daysPending - a.daysPending;
    });

    return { items: items.slice(0, data.limit ?? 50) };
  });

// ------------------------------------------------------------------
// 2. getClientHealthSummaries
// ------------------------------------------------------------------

export const getClientHealthSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("memberships")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .in("role", ["owner", "operator"]);

    if (!memberships || memberships.length === 0) return { summaries: [] as ClientHealthSummary[] };

    const tenantIds = memberships.map((m: { tenant_id: string }) => m.tenant_id);

    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);
    const periodStartTs = periodStart.toISOString();

    // Load all data in parallel
    const [tenantRows, goalRows, leadCountRows, pendingArtRows, draftCreatedRows, deliveryRows] =
      await Promise.all([
        admin.from("tenants").select("id, name").in("id", tenantIds),
        admin
          .from("growth_goals")
          .select("tenant_id, status, tier, next_call_at, notification_email, notify_on_lead")
          .in("tenant_id", tenantIds)
          .eq("status", "active"),
        admin
          .from("leads")
          .select("tenant_id, created_at")
          .in("tenant_id", tenantIds)
          .gte("created_at", periodStartTs),
        admin
          .from("execution_artifacts")
          .select("tenant_id, created_at")
          .in("tenant_id", tenantIds)
          .eq("status", "needs_review"),
        admin
          .from("wordpress_drafts")
          .select("tenant_id, created_at")
          .in("tenant_id", tenantIds)
          .eq("status", "created"),
        admin
          .from("wordpress_drafts")
          .select("tenant_id, published_at")
          .in("tenant_id", tenantIds)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false })
          .limit(tenantIds.length * 2),
      ]);

    // Index all data by tenant
    const goalByTenant = new Map<string, Record<string, unknown>>();
    for (const r of (goalRows ?? []) as Array<Record<string, unknown>>) {
      goalByTenant.set(r.tenant_id as string, r);
    }

    const leadsThisMonthByTenant = new Map<string, number>();
    for (const r of (leadCountRows ?? []) as Array<{ tenant_id: string }>) {
      leadsThisMonthByTenant.set(r.tenant_id, (leadsThisMonthByTenant.get(r.tenant_id) ?? 0) + 1);
    }

    const pendingCountByTenant = new Map<string, number>();
    for (const r of [...(pendingArtRows ?? []), ...(draftCreatedRows ?? [])] as Array<{ tenant_id: string }>) {
      pendingCountByTenant.set(r.tenant_id, (pendingCountByTenant.get(r.tenant_id) ?? 0) + 1);
    }

    const lastDeliveryByTenant = new Map<string, string>();
    for (const r of (deliveryRows ?? []) as Array<{ tenant_id: string; published_at: string }>) {
      if (!lastDeliveryByTenant.has(r.tenant_id)) {
        lastDeliveryByTenant.set(r.tenant_id, r.published_at);
      }
    }

    const now = Date.now();
    const summaries: ClientHealthSummary[] = [];

    for (const m of memberships as Array<{ tenant_id: string }>) {
      const tid = m.tenant_id;
      const tenantName = (tenantRows?.find((t: { id: string; name: string }) => t.id === tid)?.name) ?? tid;
      const goal = goalByTenant.get(tid) ?? null;
      const leadsThisMonth = leadsThisMonthByTenant.get(tid) ?? 0;
      const pendingActionCount = pendingCountByTenant.get(tid) ?? 0;
      const lastDeliveryAt = lastDeliveryByTenant.get(tid) ?? null;

      // Last activity = last delivery or last lead
      const lastActivityAt = lastDeliveryAt;

      // Health scoring
      let health: "green" | "amber" | "red" = "green";

      const daysSinceDelivery = lastDeliveryAt
        ? Math.floor((now - new Date(lastDeliveryAt).getTime()) / 86_400_000)
        : 999;

      if (pendingActionCount > 0 || daysSinceDelivery > 7) health = "amber";
      if (daysSinceDelivery > 14 || !goal) health = "red";

      summaries.push({
        tenantId: tid,
        tenantName: tenantName as string,
        tier: (goal?.tier as string | null) ?? null,
        health,
        leadsThisMonth,
        pendingActionCount,
        lastDeliveryAt,
        lastActivityAt,
        activeGoalExists: !!goal,
        nextCallAt: (goal?.next_call_at as string | null) ?? null,
      });
    }

    summaries.sort((a, b) => {
      const h = { red: 0, amber: 1, green: 2 };
      return h[a.health] - h[b.health];
    });

    return { summaries };
  });
