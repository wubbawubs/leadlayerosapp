/**
 * Blueprint — Page Diagnostics fetcher.
 *
 * Server-side. Pulls the latest audit's page_intelligence joined with
 * audit_pages for a tenant and shapes them into the `GeneratorPage` rows
 * the Blueprint generator consumes for Page Diagnostics + Conversion
 * Readiness scoring.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface BlueprintPageDiagnostic {
  id: string;
  url: string | null;
  title: string | null;
  role: string | null;
  pageType: string | null;
  intent: string | null;
  commercialPriority: string | null;
  recommendedCta: string | null;
  hasCta: boolean;
  hasTrustSignals: boolean;
  isThin: boolean;
  wordCount: number | null;
  imagesWithoutAlt: number | null;
  hasH1: boolean;
  hasMeta: boolean;
  issues: string[];
  riskFlags: string[];
  missingContext: string[];
  conversionReadiness: number;
  gaps: string[];
  nextAction: string | null;
  isLocalRelevant: boolean;
  confidence: number;
}

type AuditIssue = { code?: string; message?: string; severity?: string };

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x != null ? String((x as { message?: unknown })?.message ?? x) : ""))
    .filter((s): s is string => !!s && typeof s === "string");
}

function computeReadiness(p: {
  hasCta: boolean;
  hasTrustSignals: boolean;
  isThin: boolean;
  hasH1: boolean;
  hasMeta: boolean;
  criticalIssueCount: number;
}): number {
  let s = 0;
  if (p.hasCta) s += 30;
  if (p.hasTrustSignals) s += 25;
  if (!p.isThin) s += 15;
  if (p.hasH1) s += 10;
  if (p.hasMeta) s += 10;
  if (p.criticalIssueCount === 0) s += 10;
  return Math.max(0, Math.min(100, s));
}

function summarizeGaps(p: BlueprintPageDiagnostic): string[] {
  const gaps: string[] = [];
  if (!p.hasCta) gaps.push("Primary CTA unclear — recommend a strong call-to-action.");
  if (!p.hasTrustSignals) gaps.push("Trust signals not visible (reviews / proof / licensing).");
  if (p.isThin) gaps.push(`Thin content (${p.wordCount ?? 0} words) — add depth.`);
  if (!p.hasH1) gaps.push("Missing or weak H1.");
  if (!p.hasMeta) gaps.push("Missing meta description.");
  if ((p.imagesWithoutAlt ?? 0) > 0) gaps.push(`${p.imagesWithoutAlt} image(s) without alt text.`);
  for (const r of p.riskFlags) gaps.push(r);
  for (const m of p.missingContext) gaps.push(`Needs confirmation: ${m}`);
  return gaps;
}

function nextActionFor(p: BlueprintPageDiagnostic): string | null {
  if (p.conversionReadiness < 40) {
    return `Rebuild ${p.pageType ?? "page"} for conversion — fix CTA, proof, and copy depth.`;
  }
  if (!p.hasCta) return `Add a primary CTA${p.recommendedCta ? ` ("${p.recommendedCta}")` : ""}.`;
  if (!p.hasTrustSignals) return "Surface reviews / proof / licensing above the fold.";
  if (p.isThin) return "Expand page with intent-aligned content and FAQs.";
  if (!p.hasMeta || !p.hasH1) return "Tighten on-page SEO (H1 + meta description).";
  if ((p.imagesWithoutAlt ?? 0) > 0) return "Add alt text to images for accessibility + SEO.";
  return p.recommendedCta ? `Refine CTA: "${p.recommendedCta}".` : null;
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const fetchBlueprintPageDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Tenant membership check via RLS-aware client.
    const { data: membership, error: mErr } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!membership) return { pages: [] as BlueprintPageDiagnostic[], auditId: null };

    // Latest audit for the tenant (any status — even partial gives us data).
    const { data: auditRows, error: aErr } = await supabaseAdmin
      .from("audits")
      .select("id, finished_at, started_at")
      .eq("tenant_id", data.tenantId)
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (aErr) throw aErr;
    const audit = auditRows?.[0];
    if (!audit) return { pages: [] as BlueprintPageDiagnostic[], auditId: null };

    const { data: piRows, error: piErr } = await supabaseAdmin
      .from("page_intelligence")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("audit_id", audit.id);
    if (piErr) throw piErr;

    const auditPageIds = (piRows ?? [])
      .map((r) => r.audit_page_id as string | null)
      .filter((id): id is string => !!id);
    const pageIds = (piRows ?? [])
      .map((r) => r.page_id as string | null)
      .filter((id): id is string => !!id);

    const [{ data: apRows }, { data: pRows }] = await Promise.all([
      auditPageIds.length
        ? supabaseAdmin
            .from("audit_pages")
            .select("id, url, title, h1, meta_description, word_count, images_without_alt, issues")
            .in("id", auditPageIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      pageIds.length
        ? supabaseAdmin
            .from("pages")
            .select("id, url, title, h1, meta_description, health_score")
            .in("id", pageIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

    const apById = new Map<string, Record<string, unknown>>();
    for (const r of apRows ?? []) apById.set(r.id as string, r);
    const pById = new Map<string, Record<string, unknown>>();
    for (const r of pRows ?? []) pById.set(r.id as string, r);

    const pages: BlueprintPageDiagnostic[] = (piRows ?? []).map((pi) => {
      const ap = pi.audit_page_id ? apById.get(pi.audit_page_id as string) : undefined;
      const p = pi.page_id ? pById.get(pi.page_id as string) : undefined;
      const url = (pi.page_url as string | null) ?? (ap?.url as string | null) ?? (p?.url as string | null) ?? null;
      const title = (ap?.title as string | null) ?? (p?.title as string | null) ?? null;
      const h1 = (ap?.h1 as string | null) ?? (p?.h1 as string | null) ?? null;
      const meta = (ap?.meta_description as string | null) ?? (p?.meta_description as string | null) ?? null;
      const wordCount = (ap?.word_count as number | null) ?? null;
      const imagesWithoutAlt = (ap?.images_without_alt as number | null) ?? null;
      const issues = (ap?.issues as AuditIssue[] | null) ?? [];
      const issueMessages = issues
        .map((i) => i.message ?? i.code ?? "")
        .filter((s): s is string => !!s);
      const criticalIssueCount = issues.filter(
        (i) => i.severity === "critical" || i.severity === "high",
      ).length;
      const riskFlags = asStringArray(pi.risk_flags);
      const missingContext = asStringArray(pi.missing_page_context);
      const recommendedCta = (pi.recommended_cta as string | null) ?? null;
      const intent = (pi.intent as string | null) ?? null;
      const pageType = (pi.page_type as string | null) ?? null;
      const seoRole = (pi.seo_role as string | null) ?? null;
      const commercialPriority = (pi.commercial_priority as string | null) ?? null;
      const localRel = (pi.local_relevance as { isLocal?: boolean } | null) ?? null;

      const hasCta = !!recommendedCta || intent === "commercial" || intent === "transactional";
      // Trust = h1 + reasonable meta + no high/critical issues, and not flagged as risky.
      const hasTrustSignals =
        !!h1 && !!meta && (meta?.length ?? 0) >= 80 && riskFlags.length === 0;
      const isThin = (wordCount ?? 0) > 0 && (wordCount ?? 0) < 250;

      const base = {
        hasCta,
        hasTrustSignals,
        isThin,
        hasH1: !!h1,
        hasMeta: !!meta,
        criticalIssueCount,
      };
      const conversionReadiness = computeReadiness(base);

      const draft: BlueprintPageDiagnostic = {
        id: pi.id as string,
        url,
        title,
        role: seoRole ?? pageType ?? null,
        pageType,
        intent,
        commercialPriority,
        recommendedCta,
        hasCta,
        hasTrustSignals,
        isThin,
        wordCount,
        imagesWithoutAlt,
        hasH1: !!h1,
        hasMeta: !!meta,
        issues: issueMessages,
        riskFlags,
        missingContext,
        conversionReadiness,
        gaps: [],
        nextAction: null,
        isLocalRelevant: !!localRel?.isLocal,
        confidence: typeof pi.confidence === "number" ? (pi.confidence as number) : 0,
      };
      draft.gaps = summarizeGaps(draft);
      draft.nextAction = nextActionFor(draft);
      return draft;
    });

    // Prioritise: commercial priority desc → conversion readiness asc (worst first).
    pages.sort((a, b) => {
      const pa = PRIORITY_RANK[(a.commercialPriority ?? "").toLowerCase()] ?? 0;
      const pb = PRIORITY_RANK[(b.commercialPriority ?? "").toLowerCase()] ?? 0;
      if (pb !== pa) return pb - pa;
      return a.conversionReadiness - b.conversionReadiness;
    });

    return { pages, auditId: audit.id as string };
  });
