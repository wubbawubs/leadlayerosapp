/**
 * Proposal V2 — evaluator/gate.
 * Pure-logic scoring + hard guardrail enforcement.
 * Returns scores + status. No LLM call (kept deterministic and cheap).
 */
import type { GrowthContext } from "@/lib/shared/growthContext/schemas";
import type { GeneratorTextOutput } from "./schemas";
import type { ProposalV2Scores, ProposalV2Status } from "./schemas";

function extractAfterText(after: Record<string, unknown>): string {
  if (typeof after.text === "string") return after.text;
  if (typeof after.html === "string") return after.html;
  if (typeof after.recommendation === "string") return after.recommendation;
  if (Array.isArray(after.alts)) return (after.alts as string[]).join(" | ");
  if (after.jsonld) return JSON.stringify(after.jsonld).slice(0, 800);
  return JSON.stringify(after).slice(0, 800);
}

const GENERIC_PHRASES = [
  "ontdek meer",
  "neem nu contact op",
  "start vandaag",
  "klik hier",
  "lees verder",
  "discover more",
  "learn more",
  "click here",
  "get started today",
];

function hasGenericPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.some((p) => lower.includes(p));
}

function includesAny(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => w && lower.includes(w.toLowerCase()));
}

export interface EvaluationResult {
  scores: ProposalV2Scores;
  status: ProposalV2Status;
  riskFlags: string[];
  publishable: boolean;
  weighted: number;
}

export function evaluateProposalV2(
  ctx: GrowthContext,
  output: GeneratorTextOutput,
): EvaluationResult {
  const text = extractAfterText(output.after);
  const riskFlags: string[] = [...output.riskFlags];

  // ---- Hard guardrails ----
  const forbiddenClaimHits = includesAny(text, ctx.guardrails.forbiddenClaims);
  const forbiddenWordHits = includesAny(text, ctx.guardrails.forbiddenWords);

  let status: ProposalV2Status = "draft";

  // Readiness-driven gating
  if (ctx.readiness.status === "blocked") {
    status = "rejected";
    riskFlags.push("readiness:blocked");
  } else if (ctx.readiness.status === "needs_context") {
    status = "needs_context";
    riskFlags.push("readiness:needs_context");
  }

  if (forbiddenClaimHits.length > 0) {
    status = "rejected";
    riskFlags.push(`forbidden_claim:${forbiddenClaimHits.join(",")}`);
  }
  if (forbiddenWordHits.length > 0 && status !== "rejected") {
    status = "needs_review";
    riskFlags.push(`forbidden_word:${forbiddenWordHits.join(",")}`);
  }

  // Schema: must not invent facts when proof is missing
  if (ctx.action.actionType === "propose_schema") {
    const proof = ctx.business?.proof as { verifiedProofPoints?: unknown[] } | undefined;
    const hasProof = Array.isArray(proof?.verifiedProofPoints) && proof.verifiedProofPoints.length > 0;
    if (!hasProof) {
      riskFlags.push("schema:no_verified_proof");
      if (status !== "rejected") status = "needs_review";
    }
  }

  // Length check
  if (ctx.action.maxLength && text.length > ctx.action.maxLength + 20) {
    riskFlags.push(`length:over_${ctx.action.maxLength}`);
    if (status === "draft") status = "needs_review";
  }

  // ---- Soft scores (0..10) ----
  const generic = hasGenericPhrase(text);
  const tone = ctx.tone;
  const biz = ctx.business;
  const page = ctx.page;

  const preferredHits = tone
    ? includesAny(text, tone.preferredWords).length
    : 0;
  const angle = ctx.instructions.primaryAngle;
  const angleHit = angle ? text.toLowerCase().includes(angle.toLowerCase()) : false;

  const scores: ProposalV2Scores = {
    seoFit: clamp(6 + (output.keywordsUsed.length > 0 ? 2 : 0) + (page ? 1 : -1)),
    toneFit: clamp(tone ? 6 + Math.min(2, preferredHits) - (forbiddenWordHits.length ? 3 : 0) : 5),
    businessFit: clamp(biz ? 6 + (angleHit ? 2 : 0) - (forbiddenClaimHits.length ? 4 : 0) : 5),
    pageFit: clamp(page ? 6 + (page.confidence >= 0.7 ? 2 : 0) : 4),
    offerFit: clamp(biz ? 6 + (angleHit ? 1 : 0) : 5),
    icpFit: clamp(page?.targetAudience ? 7 : 5),
    locationFit: clamp(
      ctx.instructions.shouldMentionLocation
        ? text.toLowerCase().match(/(amsterdam|rotterdam|utrecht|den haag|eindhoven|nederland)/) ? 8 : 5
        : 7,
    ),
    claimSafety: clamp(forbiddenClaimHits.length > 0 ? 1 : ctx.guardrails.allowedClaims.length > 0 ? 8 : 6),
    proofSafety: clamp(
      ctx.action.actionType === "propose_schema"
        ? (riskFlags.includes("schema:no_verified_proof") ? 4 : 8)
        : 8,
    ),
    conversionFit: clamp(ctx.instructions.preferredCTA && text.toLowerCase().includes(ctx.instructions.preferredCTA.toLowerCase()) ? 8 : 6),
    genericnessRisk: clamp(generic ? 8 : 3),
  };

  if (scores.genericnessRisk >= 6 && status === "draft") {
    status = "needs_review";
    riskFlags.push("generic_phrasing");
  }
  if (scores.claimSafety < 8 && status === "draft") {
    status = "needs_review";
  }
  if (scores.businessFit < 7 && status === "draft") {
    status = "needs_review";
  }
  if (scores.pageFit < 7 && status === "draft") {
    status = "needs_review";
  }

  // Weighted score (used as overall quality signal)
  const weighted =
    scores.seoFit * 0.12 +
    scores.toneFit * 0.12 +
    scores.businessFit * 0.14 +
    scores.pageFit * 0.14 +
    scores.offerFit * 0.06 +
    scores.icpFit * 0.06 +
    scores.locationFit * 0.04 +
    scores.claimSafety * 0.12 +
    scores.proofSafety * 0.08 +
    scores.conversionFit * 0.08 +
    (10 - scores.genericnessRisk) * 0.04;

  if (status === "draft" && weighted < 7) status = "needs_review";

  const publishable = status === "draft" && weighted >= 8;

  return {
    scores,
    status,
    riskFlags: Array.from(new Set(riskFlags)),
    publishable,
    weighted: Math.round(weighted * 10) / 10,
  };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(10, n));
}
