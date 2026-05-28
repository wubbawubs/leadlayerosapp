/**
 * Growth Intelligence Snapshot — next best action logic.
 *
 * Pure. Returns the primary next action plus an ordered list of secondaries.
 * Priority order mirrors the V1 sprint brief.
 */
import type {
  GrowthIntelligenceSnapshot,
  ModuleStatus,
  SnapshotNextBestAction,
} from "./schemas";

const isPresent = (s: ModuleStatus): boolean =>
  s === "available" || s === "reviewed" || s === "connected";
const isAtLeastPartial = (s: ModuleStatus): boolean =>
  s === "partial" || isPresent(s);

type Slices = Pick<
  GrowthIntelligenceSnapshot,
  | "goal"
  | "business"
  | "tone"
  | "website"
  | "pages"
  | "market"
  | "competitors"
  | "gbp"
  | "masterplan"
  | "tracking"
>;

interface Candidate extends SnapshotNextBestAction {
  when: boolean;
}

export function deriveNextActions(slices: Slices): {
  primary: SnapshotNextBestAction;
  secondary: SnapshotNextBestAction[];
} {
  const candidates: Candidate[] = [
    {
      when: slices.goal.status === "missing",
      type: "create_goal",
      label: "Create growth goal",
      priority: "critical",
      href: "/settings/growth-goal",
      reason: "No active growth goal — every downstream layer needs this anchor.",
    },
    {
      when: slices.business.status === "missing" || slices.business.status === "placeholder",
      type: "complete_business_profile",
      label: "Complete business profile",
      priority: "high",
      href: "/settings/business-profile",
      reason: "Business profile drives offer, ICP, locations and claim guardrails.",
    },
    {
      when: slices.tone.status === "missing" || slices.tone.status === "placeholder",
      type: "approve_tone_profile",
      label: "Review tone profile",
      priority: "medium",
      href: "/settings/tone-profile",
      reason: "Tone profile gates every artifact we generate downstream.",
    },
    {
      when: !slices.website.siteAuditAvailable && slices.website.status === "missing",
      type: "connect_site",
      label: "Connect a website",
      priority: "high",
      href: "/sites/new",
      reason: "We need a site to crawl and analyze before the Blueprint becomes specific.",
    },
    {
      when:
        slices.website.status !== "missing" &&
        !slices.website.siteAuditAvailable,
      type: "run_audit",
      label: "Run site audit",
      priority: "high",
      href: "/sites",
      reason: "Audit feeds page intelligence, scoring and the Blueprint diagnostics.",
    },
    {
      when:
        slices.website.siteAuditAvailable &&
        (slices.pages.status === "missing" || slices.pages.status === "placeholder"),
      type: "run_page_intelligence",
      label: "Run page intelligence",
      priority: "high",
      href: "/sites",
      reason: "Page intelligence powers Conversion Readiness and per-page next actions.",
    },
    {
      when: slices.market.status === "missing" || slices.market.status === "placeholder",
      type: "run_market_scan",
      label: "Run market scan",
      priority: "medium",
      href: "/growth/blueprint",
      reason: "Market demand quantifies the opportunity and feeds Masterplan targets.",
    },
    {
      when:
        isAtLeastPartial(slices.market.status) &&
        (slices.competitors.status === "missing" || slices.competitors.status === "placeholder"),
      type: "run_competitor_scan",
      label: "Run competitor scan",
      priority: "medium",
      href: "/growth/blueprint",
      reason: "Competitor matrix exposes gaps the Blueprint should attack first.",
    },
    {
      when: slices.gbp.status === "missing" || slices.gbp.status === "placeholder",
      type: "review_gbp",
      label: "Review Google Business Profile",
      priority: "high",
      href: "/growth/gbp",
      reason: "GBP completeness and trust scores drive local visibility planning.",
    },
    {
      when: slices.masterplan.status === "missing",
      type: "generate_masterplan",
      label: "Generate masterplan",
      priority: "high",
      href: "/growth/masterplan",
      reason: "Masterplan turns intelligence into a prioritized execution roadmap.",
    },
    {
      when:
        isPresent(slices.masterplan.status) &&
        slices.tracking.status === "missing",
      type: "setup_tracking",
      label: "Set up tracking",
      priority: "high",
      href: "/settings/growth-goal",
      reason:
        "Without tracking we cannot measure lead progress against the goal — the monthly loop stays blind.",
    },
    {
      when:
        isPresent(slices.masterplan.status) &&
        isPresent(slices.tracking.status) &&
        slices.masterplan.activeItems === 0,
      type: "create_execution_tasks",
      label: "Create execution tasks",
      priority: "medium",
      href: "/growth/execution",
      reason: "Approved masterplan items become execution tasks the operator can ship.",
    },
    {
      when:
        isPresent(slices.masterplan.status) &&
        isPresent(slices.tracking.status),
      type: "review_blueprint",
      label: "Review Blueprint",
      priority: "low",
      href: "/growth/blueprint",
      reason: "Confirm the Blueprint reflects the current intelligence snapshot.",
    },
  ];

  const active = candidates.filter((c) => c.when);
  if (active.length === 0) {
    const fallback: SnapshotNextBestAction = {
      type: "review_blueprint",
      label: "Review Blueprint",
      priority: "low",
      href: "/growth/blueprint",
      reason: "Continue the monthly loop — review Blueprint and refresh priorities.",
    };
    return { primary: fallback, secondary: [] };
  }
  const [primary, ...rest] = active.map(({ when: _w, ...a }) => a);
  return { primary, secondary: rest.slice(0, 4) };
}
