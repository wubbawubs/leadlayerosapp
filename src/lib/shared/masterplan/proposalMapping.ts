/**
 * Sprint B — Masterplan Item → Proposal V2 mapping.
 *
 * V1: only a handful of item types can be turned into a proposal.
 * Tracking/GBP/review/reporting remain manual tasks until their own
 * engines exist. Lying about what we can generate would defeat the
 * whole point of an objective execution engine.
 */
import type { ActionType } from "@/lib/shared/growthContext/schemas";
import type { MasterplanItemType } from "./schemas";

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
  service_page: {
    supported: true,
    actionType: "propose_intro_or_content_expansion",
    intent: "Page brief / content plan voor een dedicated service page.",
  },
  location_page: {
    supported: true,
    actionType: "propose_intro_or_content_expansion",
    intent: "Page brief / content plan voor een lokale landing page.",
  },
};

const UNSUPPORTED_MESSAGES: Partial<Record<MasterplanItemType, string>> = {
  tracking:
    "Tracking-setup is een handmatige taak — geen AI proposal totdat we een tracking-engine hebben.",
  gbp: "Google Business Profile vereist een eigen engine — voorlopig handmatige taak.",
  review: "Review-flow opzetten is operatie-werk, niet een SEO-proposal.",
  reporting: "Reporting heeft een eigen engine nodig — geen AI proposal in V1.",
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
