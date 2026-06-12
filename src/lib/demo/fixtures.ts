/**
 * Demo fixtures — Smith HVAC, Dallas TX.
 *
 * Static data representing a realistic pilot client after 2 months on LeadLayer.
 * Used by the /demo sales view and any component in demo mode.
 *
 * All types match the live backend types so the same UI components work
 * with both fixture and live data.
 */
import type { ExecutionBoardItem } from "@/lib/shared/execution/board.functions";
import type { PageInventoryItem } from "@/lib/shared/wordpressDrafts/pageInventory.functions";
import type {
  ClientHealthSummary,
  ActionQueueItem,
} from "@/lib/shared/execution/operatorQueue.functions";
import type { LeadSummary as LeadRow } from "@/lib/shared/leads/repo.functions";

// ------------------------------------------------------------------
// Tenant
// ------------------------------------------------------------------

export const DEMO_TENANT = {
  id: "demo-tenant-smith-hvac",
  name: "Smith HVAC",
  geo: "us",
  vertical: "hvac",
  status: "active",
  created_at: "2026-04-01T00:00:00.000Z",
};

// ------------------------------------------------------------------
// Growth goal
// ------------------------------------------------------------------

export const DEMO_GOAL = {
  id: "demo-goal-1",
  tenantId: DEMO_TENANT.id,
  title: "10 new HVAC clients per month",
  tier: "growth" as const,
  targetType: "clients" as const,
  targetCount: 10,
  currentCount: 4,
  timeframeMonths: 6,
  leadValue: 1800,
  closeRate: 0.35,
  requiredLeads: 29,
  serviceFocus: ["AC repair", "Emergency HVAC", "Boiler installation", "HVAC maintenance"],
  locations: ["Dallas, TX", "Plano, TX", "Frisco, TX"],
  goodFitLeads: [
    "Homeowners needing AC repair or installation",
    "Property managers",
    "Small commercial",
  ],
  badFitLeads: ["Out-of-warranty AC units older than 15 years", "Out-of-area calls"],
  capacityNotes: "3 technicians available. Max 8 jobs per day.",
  trackingNotes:
    "Calls tracked via Google Ads call extensions. Forms tracked via LeadLayer webhook on website.",
  notificationEmail: "smith@smithhvac.com",
  notifyOnLead: true,
  nextCallAt: "2026-06-15T14:00:00.000Z",
  callCadence: "monthly" as const,
  status: "active" as const,
  confidence: 0.8,
  source: "operator" as const,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-05-28T00:00:00.000Z",
};

// ------------------------------------------------------------------
// Execution board items
// ------------------------------------------------------------------

const BASE_ITEM: Omit<
  ExecutionBoardItem,
  "masterplanItemId" | "title" | "type" | "executionStatus" | "nextAction"
> = {
  priority: "high",
  effort: "medium",
  expectedImpact: "high",
  itemStatus: "in_progress",
  reason: null,
  source: null,
  supportedForProposalGeneration: true,
  proposalId: null,
  proposalStatus: null,
  proposalRiskFlags: [],
  proposalCreatedAt: null,
  qaStatus: null,
  qaReviewedAt: null,
  qaReasonTags: [],
  isPageBriefTarget: true,
  artifactId: null,
  artifactStatus: null,
  artifactCreatedAt: null,
  artifactDeliveryReadiness: null,
  artifactPrimaryKeyword: null,
  artifactKeywordVolume: null,
  artifactH1: null,
  artifactMetaTitle: null,
  artifactMetaDescription: null,
  artifactIntroPreview: null,
  artifactOperatorNotes: null,
  artifactRiskFlags: [],
  artifactMissingContext: [],
  artifactSectionCount: 0,
  artifactFaqCount: 0,
  wpDraftId: null,
  wpDraftStatus: null,
  wpEditLink: null,
  wpPreviewLink: null,
  wpPublishedAt: null,
  wpPublishedUrl: null,
  wpSeoMetaStatus: null,
  wpMetaTitle: null,
  wpMetaDescription: null,
  wpPublishSource: null,
  wpApprovedAt: null,
  wpReviewNotes: null,
  isOptimizationTarget: false,
  optimizationInventoryId: null,
  optimizationWpPostId: null,
  optimizationConnectionId: null,
  optimizationMappingType: null,
  optimizationSnapshotId: null,
  optimizationSnapshotEligibility: null,
  optimizationSnapshotBuilder: null,
  optimizationArtifactId: null,
  optimizationArtifactStatus: null,
  optimizationDeliveryStatus: null,
  optimizationUpdateId: null,
  optimizationUpdateStatus: null,
  optimizationAppliedAt: null,
  optimizationArtifactUpdateMode: null,
  optimizationArtifactRecommendedTitle: null,
  optimizationArtifactMetaTitle: null,
  optimizationArtifactMetaDescription: null,
  optimizationArtifactRiskFlags: [],
  optimizationArtifactMissingContext: [],
  optimizationArtifactOperatorChecklist: [],
  blockingReason: null,
};

export const DEMO_BOARD_ITEMS: ExecutionBoardItem[] = [
  {
    ...BASE_ITEM,
    masterplanItemId: "demo-item-1",
    title: "Emergency AC Repair Dallas",
    type: "service_page",
    executionStatus: "done",
    nextAction: "Published — page is live",
    itemStatus: "done",
    artifactStatus: "approved",
    artifactPrimaryKeyword: "emergency ac repair dallas",
    artifactKeywordVolume: 880,
    artifactH1: "Emergency AC Repair in Dallas, TX — Same-Day Response",
    artifactMetaTitle: "Emergency AC Repair Dallas TX | Smith HVAC",
    artifactMetaDescription:
      "Emergency AC repair in Dallas TX. Smith HVAC responds same-day. Licensed technicians. Call now.",
    artifactSectionCount: 5,
    artifactFaqCount: 4,
    wpDraftStatus: "published",
    wpPublishedAt: "2026-05-10T09:00:00.000Z",
    wpPublishedUrl: "https://smithhvac.com/services/emergency-ac-repair-dallas",
    wpPublishSource: "leadlayer_publish",
    wpSeoMetaStatus: "pushed_yoast",
  },
  {
    ...BASE_ITEM,
    masterplanItemId: "demo-item-2",
    title: "AC Repair Dallas TX",
    type: "service_page",
    executionStatus: "done",
    nextAction: "Published — page is live",
    itemStatus: "done",
    artifactStatus: "approved",
    artifactPrimaryKeyword: "ac repair dallas tx",
    artifactKeywordVolume: 2400,
    artifactSectionCount: 6,
    artifactFaqCount: 5,
    wpDraftStatus: "published",
    wpPublishedAt: "2026-04-22T11:00:00.000Z",
    wpPublishedUrl: "https://smithhvac.com/services/ac-repair-dallas-tx",
    wpPublishSource: "leadlayer_publish",
    wpSeoMetaStatus: "pushed_yoast",
  },
  {
    ...BASE_ITEM,
    masterplanItemId: "demo-item-3",
    title: "HVAC Repair Plano TX",
    type: "location_page",
    executionStatus: "approved",
    nextAction: "Create WordPress draft",
    itemStatus: "approved",
    artifactId: "demo-artifact-3",
    artifactStatus: "approved",
    artifactPrimaryKeyword: "hvac repair plano tx",
    artifactKeywordVolume: 590,
    artifactH1: "HVAC Repair in Plano, TX — Smith HVAC",
    artifactMetaTitle: "HVAC Repair Plano TX | Smith HVAC | Fast Response",
    artifactMetaDescription:
      "Trusted HVAC repair in Plano TX. Smith HVAC serves all of Plano and surrounding areas. Same-day service available.",
    artifactIntroPreview:
      "When your heating or cooling system breaks down in Plano, you need a team you can trust. Smith HVAC has been serving Plano homeowners and businesses since 2015...",
    artifactSectionCount: 5,
    artifactFaqCount: 4,
    artifactOperatorNotes:
      "No Google reviews mentioned — proofBlock.items is empty. Recommend adding at least 2 verified review quotes before publishing.",
    artifactRiskFlags: ["No verified review count in business profile — proof block empty"],
    artifactDeliveryReadiness: "inventory_synced",
    wpSeoMetaStatus: null,
  },
  {
    ...BASE_ITEM,
    masterplanItemId: "demo-item-4",
    title: "Boiler Installation Dallas",
    type: "service_page",
    executionStatus: "in_qa",
    nextAction: "Review page brief",
    itemStatus: "in_progress",
    artifactId: "demo-artifact-4",
    artifactStatus: "needs_review",
    artifactPrimaryKeyword: "boiler installation dallas",
    artifactKeywordVolume: 320,
    artifactH1: "Boiler Installation in Dallas, TX — Expert Fitting & Setup",
    artifactMetaTitle: "Boiler Installation Dallas TX | Smith HVAC",
    artifactMetaDescription:
      "Professional boiler installation in Dallas TX. Smith HVAC installs all major brands. Free quotes. Licensed & insured.",
    artifactIntroPreview:
      "Installing a new boiler in your Dallas home is a significant investment. Smith HVAC's certified technicians ensure your boiler is fitted correctly the first time...",
    artifactSectionCount: 4,
    artifactFaqCount: 4,
    artifactOperatorNotes:
      "Schema uses LocalBusiness — consider HomeAndConstructionBusiness for HVAC. Phone and address auto-filled from GBP.",
    artifactRiskFlags: [],
    artifactMissingContext: [],
    artifactDeliveryReadiness: "connected",
  },
  {
    ...BASE_ITEM,
    masterplanItemId: "demo-item-5",
    title: "HVAC Maintenance Contract Dallas",
    type: "service_page",
    executionStatus: "planned",
    nextAction: "Generate page brief",
    itemStatus: "proposed",
    artifactDeliveryReadiness: "connected",
  },
];

// ------------------------------------------------------------------
// Page inventory
// ------------------------------------------------------------------

export const DEMO_PAGES: PageInventoryItem[] = [
  {
    id: "demo-page-1",
    source: "leadlayer_new",
    type: "new_page",
    status: "live",
    draftStatus: "published",
    title: "Emergency AC Repair Dallas TX",
    slug: "services/emergency-ac-repair-dallas",
    url: "https://smithhvac.com/services/emergency-ac-repair-dallas",
    wpEditLink: null,
    wpPreviewLink: null,
    wpPostId: 101,
    seoMetaStatus: "pushed_yoast",
    publishedAt: "2026-05-10T09:00:00.000Z",
    lastActionAt: "2026-05-10T09:00:00.000Z",
  },
  {
    id: "demo-page-2",
    source: "leadlayer_new",
    type: "new_page",
    status: "live",
    draftStatus: "published",
    title: "AC Repair Dallas TX",
    slug: "services/ac-repair-dallas-tx",
    url: "https://smithhvac.com/services/ac-repair-dallas-tx",
    wpEditLink: null,
    wpPreviewLink: null,
    wpPostId: 98,
    seoMetaStatus: "pushed_yoast",
    publishedAt: "2026-04-22T11:00:00.000Z",
    lastActionAt: "2026-04-22T11:00:00.000Z",
  },
  {
    id: "demo-page-3",
    source: "leadlayer_optimized",
    type: "optimized",
    status: "live",
    draftStatus: null,
    title: "Homepage",
    slug: "",
    url: "https://smithhvac.com/",
    wpEditLink: null,
    wpPreviewLink: null,
    wpPostId: 1,
    seoMetaStatus: null,
    publishedAt: "2026-05-18T14:00:00.000Z",
    lastActionAt: "2026-05-18T14:00:00.000Z",
  },
  {
    id: "demo-page-4",
    source: "leadlayer_new",
    type: "new_page",
    status: "draft",
    draftStatus: "approved_for_publish",
    title: "HVAC Repair Plano TX",
    slug: "locations/hvac-repair-plano-tx",
    url: null,
    wpEditLink: "https://smithhvac.com/wp-admin/post.php?post=112&action=edit",
    wpPreviewLink: "https://smithhvac.com/?p=112&preview=true",
    wpPostId: 112,
    seoMetaStatus: "pushed_yoast",
    publishedAt: null,
    lastActionAt: "2026-05-28T10:00:00.000Z",
  },
];

// ------------------------------------------------------------------
// Leads
// ------------------------------------------------------------------

export const DEMO_LEADS: LeadRow[] = [
  {
    id: "demo-lead-1",
    source: "call",
    status: "won",
    name: "James T.",
    email: null,
    phone: "214-555-0101",
    closedAmount: 2400,
    closedAt: "2026-05-20T00:00:00.000Z",
    wonNotes: "AC replacement",
    createdAt: "2026-05-12T10:00:00.000Z",
    attribution: {},
  },
  {
    id: "demo-lead-2",
    source: "form",
    status: "won",
    name: "Sara M.",
    email: "sara@example.com",
    phone: null,
    closedAmount: 380,
    closedAt: "2026-05-22T00:00:00.000Z",
    wonNotes: "Emergency repair",
    createdAt: "2026-05-14T08:00:00.000Z",
    attribution: {},
  },
  {
    id: "demo-lead-3",
    source: "call",
    status: "won",
    name: "Paul K.",
    email: null,
    phone: "214-555-0203",
    closedAmount: 1750,
    closedAt: "2026-05-26T00:00:00.000Z",
    wonNotes: "Boiler service",
    createdAt: "2026-05-18T16:00:00.000Z",
    attribution: {},
  },
  {
    id: "demo-lead-4",
    source: "organic",
    status: "qualified",
    name: "Lisa H.",
    email: "lisa@example.com",
    phone: "214-555-0304",
    closedAmount: null,
    closedAt: null,
    wonNotes: null,
    createdAt: "2026-05-24T09:00:00.000Z",
    attribution: {},
  },
  {
    id: "demo-lead-5",
    source: "form",
    status: "new",
    name: "Mike B.",
    email: null,
    phone: "972-555-0405",
    closedAmount: null,
    closedAt: null,
    wonNotes: null,
    createdAt: "2026-05-28T11:00:00.000Z",
    attribution: {},
  },
  {
    id: "demo-lead-6",
    source: "call",
    status: "new",
    name: "Chen W.",
    email: null,
    phone: "214-555-0506",
    closedAmount: null,
    closedAt: null,
    wonNotes: null,
    createdAt: "2026-05-29T07:00:00.000Z",
    attribution: {},
  },
  {
    id: "demo-lead-7",
    source: "form",
    status: "lost",
    name: "Terry S.",
    email: "terry@example.com",
    phone: null,
    closedAmount: null,
    closedAt: null,
    wonNotes: null,
    createdAt: "2026-05-06T14:00:00.000Z",
    attribution: {},
  },
];

// ------------------------------------------------------------------
// Client health (for demo operator dashboard)
// ------------------------------------------------------------------

export const DEMO_CLIENT_HEALTH: ClientHealthSummary = {
  tenantId: DEMO_TENANT.id,
  tenantName: DEMO_TENANT.name,
  tier: "growth",
  health: "green",
  leadsThisMonth: 7,
  leadsPrevMonth: 5,
  pendingActionCount: 1,
  lastDeliveryAt: "2026-05-10T09:00:00.000Z",
  lastActivityAt: "2026-05-29T07:00:00.000Z",
  activeGoalExists: true,
  nextCallAt: "2026-06-15T14:00:00.000Z",
};

// ------------------------------------------------------------------
// Action queue item (demo — review brief)
// ------------------------------------------------------------------

export const DEMO_ACTION_QUEUE: ActionQueueItem[] = [
  {
    tenantId: DEMO_TENANT.id,
    tenantName: DEMO_TENANT.name,
    type: "review_brief",
    urgency: "medium",
    artifactId: "demo-artifact-4",
    draftId: null,
    masterplanItemId: "demo-item-4",
    pageTitle: "Boiler Installation Dallas",
    primaryKeyword: "boiler installation dallas",
    keywordVolume: 320,
    riskFlagCount: 0,
    daysPending: 1,
    createdAt: "2026-05-29T10:00:00.000Z",
  },
];

// ------------------------------------------------------------------
// Monthly report summary
// ------------------------------------------------------------------

export const DEMO_REPORT = {
  periodLabel: "May 2026",
  leadCount: 7,
  revenue: 4530,
  pagesLive: 2,
  pagesOptimized: 1,
  wonLeads: 3,
};
