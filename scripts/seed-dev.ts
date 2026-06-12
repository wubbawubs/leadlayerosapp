/**
 * Dev seed script — run with:
 *   bun scripts/seed-dev.ts
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (bun auto-loads it).
 * Creates the demo users itself:
 *   operator@leadlayer.test / test123!   (owner)
 *   client@leadlayer.test   / test123!   (client_approver — client portal)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — run with bun so .env is loaded",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_PASSWORD = "test123!";

/** Find a user by email or create it (confirmed) — idempotent. */
async function ensureUser(email: string): Promise<string> {
  const { data: list, error: listErr } = await (admin as any).auth.admin.listUsers();
  if (listErr) throw new Error("Cannot list users: " + listErr.message);
  const existing = (list?.users ?? []).find((u: any) => u.email === email);
  if (existing) return existing.id as string;

  const { data, error } = await (admin as any).auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`Cannot create ${email}: ${error.message}`);
  return data.user.id as string;
}

// ── helpers ────────────────────────────────────────────────────────
const hex = (n = 24) => randomBytes(n).toString("hex");
const uuid = () => randomUUID();

async function insert(table: string, data: object | object[]) {
  const rows = Array.isArray(data) ? data : [data];
  const { error } = await (admin as any).from(table).insert(rows);
  if (error) throw new Error(`[${table}] ${error.message}\n${JSON.stringify(error, null, 2)}`);
}

async function rpc(fn: string, args: object) {
  const { error } = await (admin as any).rpc(fn, args);
  if (error) throw new Error(`[rpc:${fn}] ${error.message}`);
}

// ── ids ────────────────────────────────────────────────────────────
const IDS = {
  tenant: uuid(),
  portalToken: hex(20),
  conn: uuid(),
  wpConn: uuid(),
  inv1: uuid(),
  inv2: uuid(),
  inv3: uuid(),
  goal: uuid(),
  plan: uuid(),
  item1: uuid(),
  item2: uuid(),
  item3: uuid(),
  item4: uuid(),
  item5: uuid(),
  scan: uuid(),
  cluster1: uuid(),
  cluster2: uuid(),
  bp: uuid(),
  tone: uuid(),
  gbp: uuid(),
  audit: uuid(),
  pageHome: uuid(),
  pageSvc: uuid(),
  pageLoc: uuid(),
  apHome: uuid(),
  apSvc: uuid(),
  apLoc: uuid(),
  piHome: uuid(),
  piSvc: uuid(),
  piLoc: uuid(),
  artifact1: uuid(),
  artifact2: uuid(),
  artifact3: uuid(),
  ingestion: uuid(),
  ingestionKey: "llk_" + hex(16),
  lead1: uuid(),
  lead2: uuid(),
  lead3: uuid(),
  lead4: uuid(),
  lead5: uuid(),
  lead6: uuid(),
  lead7: uuid(),
  report: uuid(),
  shareToken: hex(16),
};

// ── dates ──────────────────────────────────────────────────────────
const now = new Date();
const ago = (d: number, h = 0) =>
  new Date(now.getTime() - d * 86400000 - h * 3600000).toISOString();
const fwd = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  .toISOString()
  .split("T")[0];
const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];

// ── main ───────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 LeadLayer dev seed starting…\n");

  // 0. Demo users (idempotent)
  const operatorId = await ensureUser("operator@leadlayer.test");
  const clientId = await ensureUser("client@leadlayer.test");
  console.log("✓ Users:", { operatorId, clientId });

  // 1. Tenant + memberships (operator owns it, client views it)
  await insert("tenants", {
    id: IDS.tenant,
    name: "Hartman Klimaat & Sanitair",
    geo: "NL",
    vertical: "home_services",
    status: "active",
    plan: "pro",
    portal_token: IDS.portalToken,
    portal_token_created_at: now.toISOString(),
  });
  await insert("memberships", [
    { user_id: operatorId, tenant_id: IDS.tenant, role: "owner" },
    { user_id: clientId, tenant_id: IDS.tenant, role: "client_approver" },
  ]);
  await (admin as any)
    .from("profiles")
    .update({ display_name: "LP (Operator)" })
    .eq("id", operatorId);
  await (admin as any).from("profiles").update({ display_name: "Erik Hartman" }).eq("id", clientId);
  console.log("✓ Tenant + memberships");

  // 2. Site connection + WordPress
  await insert("site_connections", {
    id: IDS.conn,
    tenant_id: IDS.tenant,
    type: "wordpress",
    status: "connected",
    base_url: "https://hartmanklimaat.nl",
    username: "hartman_admin",
  });
  await insert("wordpress_connections", {
    id: IDS.wpConn,
    tenant_id: IDS.tenant,
    site_connection_id: IDS.conn,
    kind: "self_hosted",
    base_url: "https://hartmanklimaat.nl",
    rest_base_url: "https://hartmanklimaat.nl/wp-json/wp/v2",
    status: "connected",
    capabilities: {
      can_read_posts: true,
      can_write_posts: true,
      yoast_active: true,
      rankmath_active: false,
      page_builder: "elementor",
    },
    last_checked_at: ago(0, 2),
  });
  await insert("wordpress_site_inventory", [
    {
      id: IDS.inv1,
      tenant_id: IDS.tenant,
      wordpress_connection_id: IDS.wpConn,
      site_connection_id: IDS.conn,
      wp_post_id: 1,
      post_type: "page",
      status: "publish",
      title: "Home",
      slug: "",
      link: "https://hartmanklimaat.nl/",
      template: "elementor_canvas",
      last_synced_at: now.toISOString(),
    },
    {
      id: IDS.inv2,
      tenant_id: IDS.tenant,
      wordpress_connection_id: IDS.wpConn,
      site_connection_id: IDS.conn,
      wp_post_id: 12,
      post_type: "page",
      status: "publish",
      title: "Airco Installatie",
      slug: "diensten/airco-installatie",
      link: "https://hartmanklimaat.nl/diensten/airco-installatie/",
      template: "elementor_full_width",
      last_synced_at: now.toISOString(),
    },
    {
      id: IDS.inv3,
      tenant_id: IDS.tenant,
      wordpress_connection_id: IDS.wpConn,
      site_connection_id: IDS.conn,
      wp_post_id: 24,
      post_type: "page",
      status: "publish",
      title: "CV-ketel Onderhoud",
      slug: "diensten/cv-ketel-onderhoud",
      link: "https://hartmanklimaat.nl/diensten/cv-ketel-onderhoud/",
      template: "elementor_full_width",
      last_synced_at: now.toISOString(),
    },
  ]);
  console.log("✓ Site connection + WP inventory");

  // 3. Growth goal
  await insert("growth_goals", {
    id: IDS.goal,
    tenant_id: IDS.tenant,
    title: "8 nieuwe klanten per maand via website",
    target_type: "clients",
    target_count: 8,
    current_count: 3,
    timeframe_months: 6,
    lead_value: 1650,
    close_rate: 0.3,
    required_leads: 27,
    service_focus: ["Airco installatie", "Warmtepomp", "CV-ketel onderhoud", "Vloerverwarming"],
    locations: ["Eindhoven", "Tilburg", "Den Bosch", "Helmond"],
    good_fit_leads: ["Woningeigenaren renovatie", "VvE's", "Kleine bedrijfspanden"],
    bad_fit_leads: ["Alleen keuring gewenst", "Geen budget renovatie", "Buiten werkgebied"],
    capacity_notes: "4 monteurs beschikbaar. Max 6 installaties per dag.",
    tier: "growth",
    notification_email: "info@hartmanklimaat.nl",
    notify_on_lead: true,
    next_call_at: fwd(12),
    call_cadence: "monthly",
    status: "active",
    confidence: 0.75,
    source: "operator",
  });
  console.log("✓ Growth goal");

  // 4. Master plan + items
  await insert("master_plans", {
    id: IDS.plan,
    tenant_id: IDS.tenant,
    growth_goal_id: IDS.goal,
    status: "active",
    summary:
      "Focus op lokale zoekintentie voor airco & warmtepomp in regio Eindhoven. Nieuwe service- en locatiepagina's + homepage optimalisatie.",
    strategy_summary:
      "Combineer hogevolume-service keywords (airco installatie eindhoven) met geografische spreiding. Bewijs via reviews en keurmerken.",
    lead_math: { monthlyLeadsNeeded: 27, currentLeads: 3, gap: 24, pagesNeeded: 8, pagesLive: 1 },
    confidence: 0.78,
  });
  await insert("masterplan_items", [
    {
      id: IDS.item1,
      tenant_id: IDS.tenant,
      master_plan_id: IDS.plan,
      linked_goal_id: IDS.goal,
      type: "service_page",
      title: "Airco Installatie Eindhoven",
      description: "Nieuwe pagina voor 'airco installatie eindhoven' (2.900/mnd).",
      priority: "critical",
      status: "done",
      effort: "medium",
      expected_impact: "high",
      source: "ai",
    },
    {
      id: IDS.item2,
      tenant_id: IDS.tenant,
      master_plan_id: IDS.plan,
      linked_goal_id: IDS.goal,
      type: "service_page",
      title: "Warmtepomp Installatie Eindhoven",
      description:
        "Pagina voor 'warmtepomp installatie eindhoven' (1.600/mnd). ISDE-subsidie angle.",
      priority: "high",
      status: "done",
      effort: "medium",
      expected_impact: "high",
      source: "ai",
    },
    {
      id: IDS.item3,
      tenant_id: IDS.tenant,
      master_plan_id: IDS.plan,
      linked_goal_id: IDS.goal,
      type: "location_page",
      title: "Airco Tilburg",
      description: "Locatiepagina Tilburg. 'airco installateur tilburg' (720/mnd).",
      priority: "high",
      status: "approved",
      effort: "low",
      expected_impact: "medium",
      source: "ai",
    },
    {
      id: IDS.item4,
      tenant_id: IDS.tenant,
      master_plan_id: IDS.plan,
      linked_goal_id: IDS.goal,
      type: "website_fix",
      title: "Homepage optimalisatie",
      description: "H1 ontbreekt. Meta description generiek. Geen schema markup.",
      priority: "high",
      status: "in_progress",
      effort: "low",
      expected_impact: "high",
      source: "audit",
    },
    {
      id: IDS.item5,
      tenant_id: IDS.tenant,
      master_plan_id: IDS.plan,
      linked_goal_id: IDS.goal,
      type: "service_page",
      title: "CV-ketel Onderhoud Eindhoven",
      description: "'cv ketel onderhoud eindhoven' (880/mnd).",
      priority: "medium",
      status: "proposed",
      effort: "medium",
      expected_impact: "medium",
      source: "ai",
    },
  ]);
  console.log("✓ Master plan + 5 items");

  // 5. Market scan + keywords + clusters
  await insert("market_scans", {
    id: IDS.scan,
    tenant_id: IDS.tenant,
    growth_goal_id: IDS.goal,
    status: "completed",
    language: "nl",
    country: "NL",
    region: "Noord-Brabant",
    vertical: "home_services",
    services: ["airco", "warmtepomp", "cv-ketel", "vloerverwarming"],
    locations: ["Eindhoven", "Tilburg", "Den Bosch", "Helmond"],
    source: "dataforseo",
    scan_started_at: ago(5),
    scan_completed_at: ago(5),
    summary: { totalKeywords: 48, totalVolume: 18400, topIntent: "commercial", clusters: 6 },
    confidence: 0.82,
  });
  await insert("market_keywords", [
    {
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      service: "airco",
      location: "Eindhoven",
      keyword: "airco installatie eindhoven",
      intent: "commercial",
      volume: 2900,
      difficulty: 42,
      cpc: 3.8,
      source: "dataforseo",
    },
    {
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      service: "airco",
      location: "Eindhoven",
      keyword: "airco eindhoven installeren",
      intent: "commercial",
      volume: 720,
      difficulty: 38,
      cpc: 3.2,
      source: "dataforseo",
    },
    {
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      service: "warmtepomp",
      location: "Eindhoven",
      keyword: "warmtepomp installatie eindhoven",
      intent: "commercial",
      volume: 1600,
      difficulty: 51,
      cpc: 4.5,
      source: "dataforseo",
    },
    {
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      service: "warmtepomp",
      location: "Eindhoven",
      keyword: "warmtepomp subsidie eindhoven",
      intent: "commercial",
      volume: 480,
      difficulty: 35,
      cpc: 2.9,
      source: "dataforseo",
    },
    {
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      service: "airco",
      location: "Tilburg",
      keyword: "airco installateur tilburg",
      intent: "commercial",
      volume: 720,
      difficulty: 36,
      cpc: 3.4,
      source: "dataforseo",
    },
    {
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      service: "cv-ketel",
      location: "Eindhoven",
      keyword: "cv ketel onderhoud eindhoven",
      intent: "service",
      volume: 880,
      difficulty: 28,
      cpc: 2.2,
      source: "dataforseo",
    },
    {
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      service: "cv-ketel",
      location: "Eindhoven",
      keyword: "cv ketel storing eindhoven spoed",
      intent: "emergency",
      volume: 390,
      difficulty: 22,
      cpc: 4.1,
      source: "dataforseo",
    },
  ]);
  await insert("market_demand_clusters", [
    {
      id: IDS.cluster1,
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      cluster_name: "Airco installatie Eindhoven",
      service: "airco",
      location: "Eindhoven",
      intent: "commercial",
      total_volume: 3620,
      keyword_count: 2,
      average_difficulty: 40,
      opportunity_score: 0.84,
      priority: "critical",
      representative_keywords: ["airco installatie eindhoven", "airco eindhoven installeren"],
    },
    {
      id: IDS.cluster2,
      tenant_id: IDS.tenant,
      market_scan_id: IDS.scan,
      cluster_name: "Warmtepomp regio Eindhoven",
      service: "warmtepomp",
      location: "Eindhoven",
      intent: "commercial",
      total_volume: 2080,
      keyword_count: 2,
      average_difficulty: 43,
      opportunity_score: 0.79,
      priority: "high",
      representative_keywords: [
        "warmtepomp installatie eindhoven",
        "warmtepomp subsidie eindhoven",
      ],
    },
  ]);
  console.log("✓ Market scan + keywords + clusters");

  // 6. Business profile + tone + GBP
  await insert("business_profiles_v2", {
    id: IDS.bp,
    tenant_id: IDS.tenant,
    status: "active",
    confidence_score: 0.82,
    business_identity: {
      name: "Hartman Klimaat & Sanitair",
      founded: 2011,
      tagline: "Betrouwbaar. Snel. Vakkundig.",
      employees: 6,
      certifications: ["F-gassen gecertificeerd", "STEK erkend", "Daikin Premier Partner"],
    },
    offer_profile: {
      primary: "Airco installatie en onderhoud",
      secondary: ["Warmtepomp installatie", "CV-ketel service", "Vloerverwarming", "Ventilatie"],
      priceRange: "middensegment",
      responseTime: "zelfde dag voor storingen",
    },
    icp_profile: {
      primary: "Woningeigenaren 35-65 jaar renovatie of comfort-upgrade",
      secondary: ["VvE beheerders", "ZZP-ers kantoor aan huis"],
      notFit: ["Grote projectontwikkelaars", "Enkel keuring"],
    },
    location_profile: {
      primaryCity: "Eindhoven",
      radius: 40,
      coveredCities: ["Tilburg", "Den Bosch", "Helmond", "Waalre", "Veldhoven"],
      language: "nl",
    },
    conversion_profile: {
      mainCTA: "Vraag offerte aan",
      phone: "040-1234567",
      urgencyCTA: "Storing? Bel direct",
      leadQualifiers: ["Gratis thuisadvies", "Binnen 48u reactie"],
    },
    proof_profile: {
      reviewCount: 67,
      averageRating: 4.8,
      platform: "Google",
      notableReviews: ["Snel en netjes gewerkt, aanrader!", "Binnen 2 uur ter plaatse bij storing"],
      trustBadges: ["STEK", "Daikin Premier", "10 jaar garantie"],
    },
    claim_guardrails: {
      avoidClaims: ["Goedkoopste", "#1 in Nederland"],
      avoidTopics: ["Prijsvergelijking zonder context"],
    },
    strategy_angles: [
      { angle: "Lokale snelheid", description: "Regio Eindhoven, zelfde dag beschikbaar" },
      { angle: "Subsidie-expert", description: "ISDE en SEEH warmtepomp subsidie begeleiding" },
    ],
  });
  await insert("tone_profiles", {
    id: IDS.tone,
    tenant_id: IDS.tenant,
    status: "approved",
    language: "nl",
    locale: "nl-NL",
    profile: {
      formality: "informal",
      personality: ["direct", "betrouwbaar", "vakkundig"],
      sentenceLength: "medium",
      avoidPatterns: ["overdreven superlatieven", "vage beloften"],
      preferredOpenings: ["Als u", "Wij zorgen", "Direct"],
      cta_style: "actiegericht",
    },
    confidence_score: 0.78,
    job_status: "done",
    analyzed_at: ago(3),
  });
  await insert("gbp_profiles", {
    id: IDS.gbp,
    tenant_id: IDS.tenant,
    growth_goal_id: IDS.goal,
    status: "reviewed",
    source: "manual",
    business_name: "Hartman Klimaat & Sanitair",
    primary_category: "Air conditioning contractor",
    rating: 4.8,
    review_count: 67,
    photos_status: "strong",
    posts_status: "occasional",
    nap_consistency: "consistent",
    completeness_score: 0.82,
    trust_score: 0.79,
    local_visibility_score: 0.71,
    gaps: ["Geen recente Google Posts (>30 dagen)", "Openingstijden niet volledig"],
    recommendations: [
      "Post maandelijks 1 Google Post met actie/tip",
      "Voeg spoed-openingstijden toe",
    ],
  });
  console.log("✓ Business profile + tone + GBP");

  // 7. Pages
  await insert("pages", [
    {
      id: IDS.pageHome,
      tenant_id: IDS.tenant,
      site_connection_id: IDS.conn,
      wp_post_id: 1,
      url: "https://hartmanklimaat.nl/",
      title: "Hartman Klimaat & Sanitair | Eindhoven",
      meta_description: "Airco, warmtepomp en cv-ketel specialist in regio Eindhoven.",
      h1: null,
      status_code: 200,
      health_score: 54,
      last_audited_at: ago(2),
    },
    {
      id: IDS.pageSvc,
      tenant_id: IDS.tenant,
      site_connection_id: IDS.conn,
      wp_post_id: 12,
      url: "https://hartmanklimaat.nl/diensten/airco-installatie/",
      title: "Airco Installatie Eindhoven | Hartman Klimaat",
      meta_description:
        "Professionele airco installatie in Eindhoven. F-gassen gecertificeerd. Gratis offerte.",
      h1: "Airco Installatie Eindhoven",
      status_code: 200,
      health_score: 78,
      last_audited_at: ago(2),
    },
    {
      id: IDS.pageLoc,
      tenant_id: IDS.tenant,
      site_connection_id: IDS.conn,
      wp_post_id: 24,
      url: "https://hartmanklimaat.nl/diensten/cv-ketel-onderhoud/",
      title: "CV-ketel Onderhoud | Hartman Klimaat & Sanitair",
      meta_description: "Betrouwbaar cv-ketel onderhoud in Eindhoven en omstreken.",
      h1: "CV-ketel Onderhoud Eindhoven",
      status_code: 200,
      health_score: 62,
      last_audited_at: ago(2),
    },
  ]);
  console.log("✓ Pages");

  // 8. Audit + audit_pages + page_intelligence
  await insert("audits", {
    id: IDS.audit,
    tenant_id: IDS.tenant,
    site_connection_id: IDS.conn,
    status: "succeeded",
    started_at: ago(2),
    finished_at: ago(2),
    pages_count: 3,
    summary: { totalIssues: 12, critical: 0, high: 3, medium: 6, low: 3, avgHealthScore: 65 },
  });
  await insert("audit_pages", [
    {
      id: IDS.apHome,
      audit_id: IDS.audit,
      tenant_id: IDS.tenant,
      page_id: IDS.pageHome,
      url: "https://hartmanklimaat.nl/",
      status_code: 200,
      title: "Hartman Klimaat & Sanitair | Eindhoven",
      meta_description: "Airco, warmtepomp en cv-ketel specialist.",
      h1: null,
      images_without_alt: 3,
      word_count: 320,
      issues: [
        { code: "missing_h1", severity: "high", title: "Geen H1 aanwezig" },
        { code: "schema_missing", severity: "medium", title: "Geen Schema markup" },
        { code: "meta_generic", severity: "medium", title: "Meta description te generiek" },
      ],
    },
    {
      id: IDS.apSvc,
      audit_id: IDS.audit,
      tenant_id: IDS.tenant,
      page_id: IDS.pageSvc,
      url: "https://hartmanklimaat.nl/diensten/airco-installatie/",
      status_code: 200,
      title: "Airco Installatie Eindhoven",
      meta_description: "Professionele airco installatie.",
      h1: "Airco Installatie Eindhoven",
      images_without_alt: 1,
      word_count: 680,
      issues: [{ code: "images_no_alt", severity: "low", title: "1 afbeelding zonder alt-tekst" }],
    },
    {
      id: IDS.apLoc,
      audit_id: IDS.audit,
      tenant_id: IDS.tenant,
      page_id: IDS.pageLoc,
      url: "https://hartmanklimaat.nl/diensten/cv-ketel-onderhoud/",
      status_code: 200,
      title: "CV-ketel Onderhoud",
      meta_description: "Betrouwbaar cv-ketel onderhoud.",
      h1: "CV-ketel Onderhoud Eindhoven",
      images_without_alt: 0,
      word_count: 520,
      issues: [
        { code: "internal_links_low", severity: "medium", title: "Weinig interne links (2)" },
        { code: "word_count_low", severity: "medium", title: "Tekst te kort (<600 woorden)" },
      ],
    },
  ]);
  await insert("page_intelligence", [
    {
      id: IDS.piHome,
      tenant_id: IDS.tenant,
      page_id: IDS.pageHome,
      audit_page_id: IDS.apHome,
      audit_id: IDS.audit,
      page_url: "https://hartmanklimaat.nl/",
      page_type: "homepage",
      intent: "trust",
      commercial_priority: "high",
      seo_role: "trust_page",
      target_keyword: "airco installateur eindhoven",
      desired_action: "Bel of vraag offerte aan",
      funnel_stage: "awareness",
      confidence: 0.88,
      analyzed_at: ago(2),
    },
    {
      id: IDS.piSvc,
      tenant_id: IDS.tenant,
      page_id: IDS.pageSvc,
      audit_page_id: IDS.apSvc,
      audit_id: IDS.audit,
      page_url: "https://hartmanklimaat.nl/diensten/airco-installatie/",
      page_type: "service",
      intent: "commercial",
      commercial_priority: "critical",
      seo_role: "rank_target",
      target_keyword: "airco installatie eindhoven",
      desired_action: "Offerte aanvragen",
      funnel_stage: "conversion",
      confidence: 0.91,
      analyzed_at: ago(2),
    },
    {
      id: IDS.piLoc,
      tenant_id: IDS.tenant,
      page_id: IDS.pageLoc,
      audit_page_id: IDS.apLoc,
      audit_id: IDS.audit,
      page_url: "https://hartmanklimaat.nl/diensten/cv-ketel-onderhoud/",
      page_type: "service",
      intent: "commercial",
      commercial_priority: "medium",
      seo_role: "rank_target",
      target_keyword: "cv ketel onderhoud eindhoven",
      desired_action: "Afspraak plannen",
      funnel_stage: "conversion",
      confidence: 0.85,
      analyzed_at: ago(2),
    },
  ]);
  console.log("✓ Audit + audit_pages + page_intelligence");

  // 9. Execution artifacts
  await insert("execution_artifacts", [
    {
      id: IDS.artifact1,
      tenant_id: IDS.tenant,
      masterplan_item_id: IDS.item1,
      growth_goal_id: IDS.goal,
      artifact_type: "page_brief",
      status: "approved",
      payload: {
        primaryKeyword: "airco installatie eindhoven",
        keywordVolume: 2900,
        h1: "Airco Installatie in Eindhoven — Snel & Vakkundig",
        metaTitle: "Airco Installatie Eindhoven | Hartman Klimaat",
        metaDescription:
          "Professionele airco installatie in Eindhoven. F-gassen gecertificeerd. Daikin & Mitsubishi dealer. Gratis offerte aanvragen.",
        introPreview:
          "Een airco laten installeren in uw woning of bedrijfspand in Eindhoven? Hartman Klimaat & Sanitair is uw erkende specialist in de regio...",
        sectionCount: 6,
        faqCount: 5,
      },
      quality_gates: { brand_fit: 0.92, seo_fit: 0.89, commercial_fit: 0.94 },
      delivery_readiness: "inventory_synced",
    },
    {
      id: IDS.artifact2,
      tenant_id: IDS.tenant,
      masterplan_item_id: IDS.item2,
      growth_goal_id: IDS.goal,
      artifact_type: "page_brief",
      status: "approved",
      payload: {
        primaryKeyword: "warmtepomp installatie eindhoven",
        keywordVolume: 1600,
        h1: "Warmtepomp Installatie Eindhoven — Subsidie & Advies",
        metaTitle: "Warmtepomp Installatie Eindhoven | Hartman Klimaat",
        metaDescription:
          "Warmtepomp installateur in Eindhoven. ISDE-subsidie begeleiding. Daikin Altherma specialist. Gratis thuisadvies.",
        introPreview:
          "Duurzaam verwarmen met een warmtepomp is slim én haalbaar. Hartman Klimaat begeleidt u van subsidieaanvraag tot en met installatie...",
        sectionCount: 5,
        faqCount: 4,
      },
      quality_gates: { brand_fit: 0.88, seo_fit: 0.91, commercial_fit: 0.87 },
      delivery_readiness: "connected",
    },
    {
      id: IDS.artifact3,
      tenant_id: IDS.tenant,
      masterplan_item_id: IDS.item4,
      growth_goal_id: IDS.goal,
      artifact_type: "page_optimization_brief",
      status: "needs_review",
      payload: {
        targetPage: "https://hartmanklimaat.nl/",
        wpPostId: 1,
        recommendedH1: "Airco & Warmtepomp Installateur Eindhoven | Hartman Klimaat",
        recommendedMetaTitle: "Airco & Warmtepomp Eindhoven | Hartman Klimaat & Sanitair",
        recommendedMetaDescription:
          "Uw specialist voor airco, warmtepomp en cv-ketel in Eindhoven. F-gassen gecertificeerd. Bel 040-1234567.",
        updateMode: "meta_only",
        checklist: ["H1 toevoegen", "Meta title aanpassen", "Schema LocalBusiness toevoegen"],
      },
      quality_gates: { brand_fit: 0.9, seo_fit: 0.85, commercial_fit: 0.88 },
      delivery_readiness: "connected",
    },
  ]);
  console.log("✓ Execution artifacts");

  // 10. Lead ingestion source
  await insert("lead_ingestion_sources", {
    id: IDS.ingestion,
    tenant_id: IDS.tenant,
    site_connection_id: IDS.conn,
    name: "Website contact formulier",
    source_type: "form_webhook",
    public_key: IDS.ingestionKey,
    status: "active",
    default_source: "form",
    default_status: "new",
  });

  // 11. Leads + events
  await insert("leads", [
    {
      id: IDS.lead1,
      tenant_id: IDS.tenant,
      page_id: IDS.pageSvc,
      source: "call",
      status: "won",
      name: "Jan de Boer",
      phone: "06-12345678",
      closed_amount: 2850,
      close_probability: 1.0,
      closed_at: ago(18),
      won_notes: "Airco installatie woonkamer + slaapkamer. Daikin Stylish.",
      created_at: ago(22),
    },
    {
      id: IDS.lead2,
      tenant_id: IDS.tenant,
      page_id: IDS.pageSvc,
      source: "form",
      status: "won",
      name: "Sandra Willems",
      email: "sandra.willems@gmail.com",
      closed_amount: 1400,
      close_probability: 1.0,
      closed_at: ago(12),
      won_notes: "Warmtepomp advies + installatie. ISDE-subsidie aangevraagd.",
      created_at: ago(16),
    },
    {
      id: IDS.lead3,
      tenant_id: IDS.tenant,
      page_id: IDS.pageLoc,
      source: "organic",
      status: "won",
      name: "Kees Bakker",
      phone: "06-98765432",
      closed_amount: 380,
      close_probability: 1.0,
      closed_at: ago(8),
      won_notes: "CV-ketel onderhoud jaarcontract afgesloten.",
      created_at: ago(10),
    },
    {
      id: IDS.lead4,
      tenant_id: IDS.tenant,
      page_id: IDS.pageSvc,
      source: "form",
      status: "qualified",
      name: "Marieke van Dijk",
      email: "marieke@vdijk.nl",
      phone: "06-11223344",
      close_probability: 0.6,
      created_at: ago(4),
    },
    {
      id: IDS.lead5,
      tenant_id: IDS.tenant,
      page_id: IDS.pageHome,
      source: "organic",
      status: "qualified",
      name: "Peter Smit",
      phone: "06-55667788",
      close_probability: 0.5,
      created_at: ago(3),
    },
    {
      id: IDS.lead6,
      tenant_id: IDS.tenant,
      page_id: IDS.pageSvc,
      source: "form",
      status: "new",
      name: "Fatima El Amrani",
      email: "f.elamrani@hotmail.com",
      created_at: ago(1),
    },
    {
      id: IDS.lead7,
      tenant_id: IDS.tenant,
      source: "call",
      status: "new",
      name: "Thomas Jansen",
      phone: "06-44332211",
      created_at: ago(0, 6),
    },
  ]);
  await insert("lead_events", [
    {
      tenant_id: IDS.tenant,
      lead_id: IDS.lead1,
      event_type: "status_changed",
      payload: { from: "new", to: "qualified", note: "Thuisbezoek gepland" },
    },
    {
      tenant_id: IDS.tenant,
      lead_id: IDS.lead1,
      event_type: "status_changed",
      payload: { from: "qualified", to: "won", amount: 2850 },
    },
    {
      tenant_id: IDS.tenant,
      lead_id: IDS.lead2,
      event_type: "status_changed",
      payload: { from: "new", to: "qualified", note: "Subsidiecheck gedaan" },
    },
    {
      tenant_id: IDS.tenant,
      lead_id: IDS.lead2,
      event_type: "status_changed",
      payload: { from: "qualified", to: "won", amount: 1400 },
    },
    {
      tenant_id: IDS.tenant,
      lead_id: IDS.lead3,
      event_type: "status_changed",
      payload: { from: "new", to: "won", amount: 380 },
    },
    {
      tenant_id: IDS.tenant,
      lead_id: IDS.lead6,
      event_type: "created",
      payload: { source: "form", page: "airco-installatie" },
    },
    {
      tenant_id: IDS.tenant,
      lead_id: IDS.lead7,
      event_type: "created",
      payload: { source: "call", note: "Storing melding" },
    },
  ]);
  console.log("✓ Leads (3 won €4.630, 2 qualified, 2 new) + events");

  // 12. Health scores
  await insert("health_scores", [
    { tenant_id: IDS.tenant, category: "seo", score: 68, measured_at: ago(2) },
    { tenant_id: IDS.tenant, category: "content", score: 72, measured_at: ago(2) },
    { tenant_id: IDS.tenant, category: "technical", score: 55, measured_at: ago(2) },
    { tenant_id: IDS.tenant, category: "local", score: 81, measured_at: ago(2) },
    { tenant_id: IDS.tenant, category: "conversion", score: 63, measured_at: ago(2) },
  ]);

  // 13. Monthly report
  await insert("monthly_reports", {
    id: IDS.report,
    tenant_id: IDS.tenant,
    growth_goal_id: IDS.goal,
    period_start: lastMonthStart,
    period_end: lastMonthEnd,
    status: "approved",
    lead_summary: { total: 7, new: 2, qualified: 2, won: 3, lost: 0, junk: 0 },
    execution_summary: {
      artifactsGenerated: 3,
      artifactsApproved: 2,
      masterplanItemsDone: 2,
      masterplanItemsInProgress: 1,
    },
    wordpress_summary: {
      draftsCreated: 2,
      draftsPublished: 1,
      pagesOptimized: 0,
      drafts: [
        {
          title: "Airco Installatie Eindhoven",
          targetSlug: "diensten/airco-installatie",
          wpEditLink: null,
          publishedUrl: "https://hartmanklimaat.nl/diensten/airco-installatie/",
          status: "published",
          publishedAt: ago(14),
        },
        {
          title: "Warmtepomp Installatie Eindhoven",
          targetSlug: "diensten/warmtepomp-installatie",
          wpEditLink: null,
          publishedUrl: null,
          status: "draft",
          publishedAt: null,
        },
      ],
    },
    goal_progress_summary: {
      actualLeads: 7,
      requiredLeadsPerMonth: 27,
      gap: 20,
      provenRevenue: 4630,
      wonLeadCount: 3,
      paceNote:
        "Lead volume is at 38% of target. The two new service pages should close most of the gap once they start ranking.",
    },
    next_actions: [
      {
        label: "Homepage optimalisatie uitvoeren",
        reason: "H1 ontbreekt, meta description generiek",
        priority: "high",
      },
      {
        label: "Airco Tilburg pagina publiceren",
        reason: "Brief approved, klaar voor delivery",
        priority: "high",
      },
      {
        label: "Google Post plaatsen",
        reason: "Laatste post >30 dagen geleden",
        priority: "medium",
      },
    ],
    risks: [
      {
        key: "lead_volume",
        label: "Lead volume onder target",
        severity: "medium",
        description: "38% van target — extra pagina's zijn urgent om de gap te dichten.",
      },
    ],
    narrative:
      "Mei was een stevige startmaand. De airco-pagina staat live en brengt al verkeer. De warmtepomp-pagina staat klaar als concept. Homepage-optimalisatie staat voor juni. Lead volume ligt nog onder target maar de kwaliteit is goed: 3 van 7 leads zijn gewonnen.",
    share_token: IDS.shareToken,
    share_token_created_at: ago(3),
  });

  // 14. Intelligence run
  await insert("intelligence_runs", {
    tenant_id: IDS.tenant,
    site_id: IDS.conn,
    growth_goal_id: IDS.goal,
    status: "completed",
    current_stage: "done",
    triggered_by: "operator",
    trigger_reason: "Initial intelligence run na onboarding",
    started_at: ago(5),
    completed_at: ago(5),
  });
  console.log("✓ Health scores + monthly report + intelligence run");

  // ── Done ────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  LeadLayer dev seed — DONE");
  console.log("═══════════════════════════════════════════════════════");
  console.log("\n  Operator login:");
  console.log("    URL:       http://localhost:8080/login");
  console.log("    Email:     operator@leadlayer.test");
  console.log(`    Password:  ${DEMO_PASSWORD}`);
  console.log(`    Tenant ID: ${IDS.tenant}`);
  console.log("\n  Client portal login (same URL):");
  console.log("    Email:     client@leadlayer.test");
  console.log(`    Password:  ${DEMO_PASSWORD}`);
  console.log("\n  Monthly report share link:");
  console.log(`    http://localhost:8080/r/${IDS.shareToken}`);
  console.log("\n  Webhook ingestion key:");
  console.log(`    ${IDS.ingestionKey}`);
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err.message ?? err);
  process.exit(1);
});
