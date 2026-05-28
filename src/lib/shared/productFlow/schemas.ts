/**
 * Product Flow Orchestration V1 — schemas.
 *
 * Derived purely from the GrowthIntelligenceSnapshot. No DB, no fetching.
 * Defines the lifecycle stage, review gates, automation checklist and
 * client/operator-facing status copy that drives the guided journey UI.
 *
 * See: docs/PRODUCT_FLOW_ORCHESTRATION_V1.md
 */

import type { SnapshotNextBestAction } from "@/lib/shared/growthIntelligence/schemas";

export const PRODUCT_FLOW_SCHEMA_VERSION = "1.0.0";

export type ClientLifecycleStage =
  | "onboarding"
  | "collecting_intelligence"
  | "operator_review"
  | "blueprint_ready"
  | "client_review"
  | "masterplan_ready"
  | "execution_ready"
  | "in_execution"
  | "monthly_review";

export type ReviewGate =
  | "business_profile"
  | "tone_profile"
  | "gbp_profile"
  | "intelligence_snapshot"
  | "blueprint"
  | "masterplan"
  | "execution_artifacts"
  | "publishing_bundle";

export type AutomationStatus =
  | "not_started"
  | "running"
  | "complete"
  | "partial"
  | "failed"
  | "blocked";

export type ReviewGateStatus =
  | "not_ready"
  | "ready_for_review"
  | "approved"
  | "blocked";

export interface AutomationChecklistItem {
  key: string;
  label: string;
  status: AutomationStatus;
  sourceModule: string;
  href?: string;
  reason?: string;
}

export interface ReviewGateState {
  gate: ReviewGate;
  label: string;
  status: ReviewGateStatus;
  href?: string;
  missing?: string[];
  reason?: string;
}

export interface ProductFlowBlocker {
  key: string;
  label: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  href?: string;
}

export interface ProductFlowState {
  tenantId: string;
  siteId: string | null;
  growthGoalId: string | null;
  generatedAt: string;
  schemaVersion: typeof PRODUCT_FLOW_SCHEMA_VERSION;

  lifecycleStage: ClientLifecycleStage;
  lifecycleLabel: string;
  progressPercent: number; // 0..100

  primaryNextAction: SnapshotNextBestAction;
  secondaryActions: SnapshotNextBestAction[];

  automationChecklist: AutomationChecklistItem[];
  reviewGates: ReviewGateState[];
  blockers: ProductFlowBlocker[];

  clientVisibleStatus: string;
  operatorStatus: string;
}

export const LIFECYCLE_LABELS: Record<ClientLifecycleStage, string> = {
  onboarding: "Onboarding",
  collecting_intelligence: "Collecting intelligence",
  operator_review: "Operator review",
  blueprint_ready: "Blueprint ready",
  client_review: "Client review",
  masterplan_ready: "Masterplan ready",
  execution_ready: "Execution ready",
  in_execution: "In execution",
  monthly_review: "Monthly review",
};

export const LIFECYCLE_PROGRESS: Record<ClientLifecycleStage, number> = {
  onboarding: 5,
  collecting_intelligence: 25,
  operator_review: 45,
  blueprint_ready: 60,
  client_review: 70,
  masterplan_ready: 80,
  execution_ready: 90,
  in_execution: 95,
  monthly_review: 100,
};

export const CLIENT_VISIBLE_COPY: Record<ClientLifecycleStage, string> = {
  onboarding: "Your growth setup is being prepared.",
  collecting_intelligence:
    "We are analyzing your website, market, competitors, and local visibility.",
  operator_review: "Our team is reviewing your Growth Blueprint.",
  blueprint_ready: "Your Growth Blueprint is ready.",
  client_review: "Your Growth Blueprint is ready for your review.",
  masterplan_ready: "Your execution roadmap is ready.",
  execution_ready: "We are preparing the first execution actions.",
  in_execution: "Execution is underway.",
  monthly_review: "Your monthly growth report is ready.",
};
