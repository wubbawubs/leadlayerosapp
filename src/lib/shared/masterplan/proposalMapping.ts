/**
 * Masterplan Item → Proposal V2 mapping.
 *
 * service_page and location_page now route to page_brief artifact generation
 * (execution_artifacts table) instead of proposal_v2. See
 * src/lib/shared/executionArtifacts/artifacts.functions.ts.
 *
 * proposal_v2 remains for: website_fix, conversion, content (micro-fixes).
 * Tracking/GBP/review/reporting remain manual tasks.
 */
import type { ActionType } from "@/lib/shared/growthContext/schemas";
import type { MasterplanItemType } from "./schemas";

/** Item types that produce page_brief artifacts instead of proposal_v2. */
export const PAGE_BRIEF_ITEM_TYPES: ReadonlySet<MasterplanItemType> = new Set([
  "service_page",
  "location_page",
]);

export interface MasterplanActionMapping {
  supported: true;
  actionType: ActionType;
  /** Hint shown in the UI to operators. */
  intent: string;
}

export interface MasterplanActionUnsupported {
  supported: false;
  reason: "unsupported_for_proposal_generation";
  message: string;
}

export type MasterplanActionResult =
  | MasterplanActionMapping
  | MasterplanActionUnsupported;

const SUPPORTED: Partial<Record<MasterplanItemType, MasterplanActionMapping>> = {
  website_fix: {
    supported: true,
    actionType: "general_recommendation",
    intent: "Concrete websiteverbetering met duidelijke owner-actie.",
  },
  conversion: {
    supported: true,
    actionType: "write_cta",
    intent: "CTA- of conversiepad-aanbeveling gericht op leadgroei.",
  },
  content: {
    supported: true,
    actionType: "propose_intro_or_content_expansion",
    intent: "Voorstel voor ondersteunende of uitbreidende content.",
  },
  // service_page and location_page are intentionally omitted here.
  // They produce execution_artifacts (page_brief) via generatePageBriefArtifactFn,
  // not proposal_v2. See src/lib/shared/executionArtifacts/artifacts.functions.ts.
};

const UNSUPPORTED_MESSAGES: Partial<Record<MasterplanItemType, string>> = {
  tracking:
    "Tracking-setup is een handmatige taak — geen AI proposal totdat we een tracking-engine hebben.",
  gbp: "Google Business Profile vereist een eigen engine — voorlopig handmatige taak.",
  review: "Review-flow opzetten is operatie-werk, niet een SEO-proposal.",
  reporting: "Reporting heeft een eigen engine nodig — geen AI proposal in V1.",
  service_page:
    "Service pages use page_brief artifact generation — use 'Generate page brief' instead of 'Generate proposal'.",
  location_page:
    "Location pages use page_brief artifact generation — use 'Generate page brief' instead of 'Generate proposal'.",
};

export function mapMasterplanItemToAction(item: {
  type: MasterplanItemType;
}): MasterplanActionResult {
  const hit = SUPPORTED[item.type];
  if (hit) return hit;
  return {
    supported: false,
    reason: "unsupported_for_proposal_generation",
    message:
      UNSUPPORTED_MESSAGES[item.type] ??
      "Dit item type is in V1 nog niet geschikt voor AI proposal generation.",
  };
}

export function isSupportedItemType(type: MasterplanItemType): boolean {
  return mapMasterplanItemToAction({ type }).supported;
}
