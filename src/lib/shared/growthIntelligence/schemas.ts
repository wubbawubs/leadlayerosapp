/**
 * Growth Intelligence Snapshot V1 — schemas.
 *
 * Central normalized truth object. Reads from every existing intelligence
 * module (goal, business profile, tone, audit, page intel, market, competitors,
 * GBP, masterplan, tracking, ranking) and exposes one shape consumed by:
 *   - Blueprint
 *   - Masterplan
 *   - Execution (future)
 *   - WordPress delivery (future)
 *   - Monthly loop (future)
 *
 * Pure types. No DB, no API, no fetching.
 * See: docs/GROWTH_INTELLIGENCE_SNAPSHOT.md
 */

export const GROWTH_INTELLIGENCE_SCHEMA_VERSION = "1.0.0";

export type ModuleStatus =
  | "missing"
  | "placeholder"
  | "partial"
  | "available"
  | "reviewed"
  | "connected";

export type OverallStatus =
  | "missing"
  | "collecting"
  | "partial"
  | "ready"
  | "review_required";

export type SnapshotNextActionType =
  | "create_goal"
  | "complete_business_profile"
  | "approve_tone_profile"
  | "connect_site"
  | "run_audit"
  | "run_page_intelligence"
  | "run_market_scan"
  | "run_competitor_scan"
  | "review_gbp"
  | "review_blueprint"
  | "generate_masterplan"
  | "create_execution_tasks"
  | "setup_tracking"
  | "connect_wordpress";

export type Priority = "low" | "medium" | "high" | "critical";

export interface SnapshotNextBestAction {
  type: SnapshotNextActionType;
  label: string;
  priority: Priority;
  href?: string;
  reason: string;
}

export interface MissingContextItem {
  key: string;
  severity: Priority;
  label: string;
  whyItMatters: string;
  nextAction: string;
}

export interface DataAvailabilityEntry {
  module: string;
  status: ModuleStatus;
  label: string;
  lastUpdated?: string;
  nextAction?: string;
}

// ---------------------------------------------------------------------------
// Per-module slices
// ---------------------------------------------------------------------------

interface ModuleBase {
  status: ModuleStatus;
  confidence: number; // 0..1
  missing: string[];
}

export interface GoalSlice extends ModuleBase {
  targetSummary: string | null;
  targetType: string | null;
  targetCount: number | null;
  timeframeMonths: number | null;
  closeRate: number | null;
  leadValue: number | null;
  requiredLeadsPerMonth: number | null;
  currentLeadsPerMonth: number | null;
  serviceFocus: string[];
  locations: string[];
}

export interface BusinessSlice extends ModuleBase {
  businessName: string | null;
  brandName: string | null;
  vertical: string | null;
  primaryOffer: string | null;
  icpSummary: string | null;
  services: string[];
  locations: string[];
  claimGuardrailsPresent: boolean;
  proofStatus: "missing" | "partial" | "verified";
}

export interface ToneSlice extends ModuleBase {
  summary: string | null;
  language: string | null;
  country: string | null;
  commercialIntensity: "low" | "medium" | "high" | null;
  preferredWordsCount: number;
  forbiddenWordsCount: number;
}

export interface WebsiteSlice extends ModuleBase {
  siteUrl: string | null;
  connectedDomain: string | null;
  isTemporaryDomain: boolean;
  latestAuditId: string | null;
  auditStatus: string | null;
  auditScore: number | null;
  pagesCrawled: number | null;
  siteAuditAvailable: boolean;
}

export interface PagesSlice extends ModuleBase {
  pagesAnalyzed: number;
  keyPagesCount: number;
  averageConversionReadiness: number | null;
  thinPagesCount: number;
  pagesWithCta: number;
  pagesWithTrust: number;
}

export interface MarketSlice extends ModuleBase {
  source: string | null;
  scanCompletedAt: string | null;
  localClustersCount: number;
  localDemandVolume: number | null;
  genericReferenceDemandVolume: number | null;
  topService: string | null;
  topLocation: string | null;
  volumeCoveragePercent: number | null;
}

export interface CompetitorsSlice extends ModuleBase {
  source: string | null;
  scanStatus: string | null;
  scanCompletedAt: string | null;
  directCompetitorsCount: number;
  intermediariesCount: number;
  medianDirectCompetitorScore: number | null;
  selfScore: number | null;
  topGap: string | null;
  warnings: string[];
}

export interface GbpSlice extends ModuleBase {
  source: string | null;
  profileStatus: string | null;
  primaryCategory: string | null;
  rating: number | null;
  reviewCount: number | null;
  completenessScore: number;
  trustScore: number;
  localVisibilityScore: number;
}

export interface TrackingSlice extends ModuleBase {
  callTracking: boolean;
  formTracking: boolean;
  analytics: boolean;
  attribution: boolean;
  currentLeadBaseline: number | null;
}

export interface RankingSlice extends ModuleBase {
  clustersTracked: number;
  rankingBaselineAvailable: boolean;
}

export interface MasterplanSlice extends ModuleBase {
  masterplanId: string | null;
  itemCount: number;
  activeItems: number;
}

export interface WordpressSlice extends ModuleBase {
  connectionStatus: string | null;
  kind: "self_hosted" | "wordpress_com" | null;
  baseUrl: string | null;
  inventoryCount: number;
  mappingCount: number;
  missingPageCount: number;
  capabilitiesOk: boolean | null;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface GrowthIntelligenceSnapshot {
  tenantId: string;
  siteId: string | null;
  growthGoalId: string | null;
  generatedAt: string;
  schemaVersion: typeof GROWTH_INTELLIGENCE_SCHEMA_VERSION;

  status: {
    overall: OverallStatus;
    readinessScore: number; // 0..100
    confidence: number; // 0..1
    nextBestAction: SnapshotNextBestAction;
  };

  goal: GoalSlice;
  business: BusinessSlice;
  tone: ToneSlice;
  website: WebsiteSlice;
  pages: PagesSlice;
  market: MarketSlice;
  competitors: CompetitorsSlice;
  gbp: GbpSlice;
  tracking: TrackingSlice;
  ranking: RankingSlice;
  masterplan: MasterplanSlice;
  wordpress: WordpressSlice;

  dataAvailability: DataAvailabilityEntry[];
  missingContext: MissingContextItem[];
  warnings: string[];
  nextActions: SnapshotNextBestAction[];
}
