/**
 * Sprint E0 — Pre-Publishing Cleanup.
 *
 * Human-readable labels for masterplan/execution surfaces. Keep operators
 * from staring at raw enum codes like `service_page` or `needs_edit`.
 */
import type { MasterplanItemType } from "./schemas";
import type { ExecutionStatus } from "@/lib/shared/execution/board.functions";

export const ITEM_TYPE_LABELS: Record<MasterplanItemType, string> = {
  website_fix: "Website fix",
  conversion: "Conversion",
  content: "Content",
  service_page: "Service page",
  location_page: "Location page",
  tracking: "Tracking",
  gbp: "Google Business Profile",
  review: "Reviews",
  reporting: "Reporting",
};

export function itemTypeLabel(type: string): string {
  return (ITEM_TYPE_LABELS as Record<string, string>)[type] ?? type;
}

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  planned: "Planned",
  in_qa: "In QA",
  needs_edit: "Needs edit",
  approved: "Approved",
  manual_task: "Manual task",
  blocked: "Blocked",
  done: "Done",
};

/** Friendly per-status helper text used in empty columns / hints. */
export const EXECUTION_STATUS_HINT: Record<ExecutionStatus, string> = {
  planned: "Items waiting for an AI proposal.",
  in_qa: "Proposals awaiting human review.",
  needs_edit: "Reviewed — edits required before approval.",
  approved: "Reviewed and approved. Publishing comes later.",
  manual_task: "Human action required — no AI handoff in V1.",
  blocked: "Blocked by safety gate or QA. Regenerate or handle manually.",
  done: "Completed or skipped — out of the active pipeline.",
};

/** Proposal_comparisons.winner values → operator-friendly labels. */
export const QA_WINNER_LABELS: Record<string, string> = {
  unreviewed: "Not reviewed yet",
  v1: "V1 (legacy) preferred",
  v2: "Approved",
  both_good: "Approved",
  both_bad: "Both rejected",
  needs_edit: "Needs edit",
  needs_context: "Needs more context",
};

export function qaWinnerLabel(winner: string | null | undefined): string {
  if (!winner) return "Not reviewed yet";
  return QA_WINNER_LABELS[winner] ?? winner;
}

/** Proposal_v2.status → operator-friendly labels. */
export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready: "Ready for review",
  needs_review: "Needs review",
  needs_context: "Needs more context",
  rejected: "Rejected by safety gate",
  approved: "Approved",
};

export function proposalStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return PROPOSAL_STATUS_LABELS[status] ?? status;
}

/**
 * Whether this item type is intentionally manual in V1. Used to render
 * "Manual task for now" so unsupported types don't feel broken.
 */
export const MANUAL_ITEM_TYPES: ReadonlySet<MasterplanItemType> = new Set([
  "tracking",
  "gbp",
  "review",
  "reporting",
]);

export function isManualType(type: string): boolean {
  return MANUAL_ITEM_TYPES.has(type as MasterplanItemType);
}
