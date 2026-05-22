/**
 * Proposal V2 — evaluator/gate (V2.1).
 * Pure-logic scoring + hard guardrail enforcement.
 * Adds: language mismatch detection, locale-aware weak-phrase guard,
 * hard length gating, stronger offer/ICP fit scoring.
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
  "klik hier",
  "lees verder",
  "click here",
  "learn more",
  "get started today",
];

// Locale-specific weak/banned phrases — mirror generator.ts.
const WEAK_BY_LOCALE: Record<string, string[]> = {
  "nl-NL": [
    "wel resultaat",
    "succes",
    "laat je bedrijf groeien",
    "ontdek",
    "continue optimalisatie",
    "revolutionair",
    "gegarandeerd",
    "nummer 1",
    "stijgende resultaten",
  ],
  "en-US": [
    "guaranteed",
    "#1",
    "number one",
    "world-class",
    "revolutionary",
    "best in class",
    "discover",
    "unlock the power",
    "skyrocket",
  ],
};

function hasGenericPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.some((p) => lower.includes(p));
}

function findWeakPhrases(text: string, locale: string): string[] {
  const list = WEAK_BY_LOCALE[locale] ?? WEAK_BY_LOCALE["nl-NL"];
  const lower = text.toLowerCase();
  return list.filter((p) => lower.includes(p.toLowerCase()));
}

function includesAny(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => w && lower.includes(w.toLowerCase()));
}

// ---------- Language detection (lightweight heuristic) ----------
const NL_MARKERS = [" de ", " het ", " een ", " je ", " jouw ", " voor ", " met ", " zonder ", " naar ", " ook ", " niet ", " wij "];
const EN_MARKERS = [" the ", " your ", " with ", " for ", " and ", " you ", " our ", " a ", " an ", " to "];

function detectLanguage(text: string): "nl" | "en" | "unknown" {
  const t = ` ${text.toLowerCase()} `;
  const nl = NL_MARKERS.reduce((n, m) => n + (t.includes(m) ? 1 : 0), 0);
  const en = EN_MARKERS.reduce((n, m) => n + (t.includes(m) ? 1 : 0), 0);
  if (nl >= 2 && nl > en) return "nl";
  if (en >= 2 && en > nl) return "en";
  return "unknown";
}

function expectedLanguage(locale: string): "nl" | "en" | null {
  if (locale.startsWith("nl")) return "nl";
  if (locale.startsWith("en")) return "en";
  return null;
}

// ---------- Length helpers ----------
function measureLength(after: Record<string, unknown>, actionType: string): number {
  if (actionType === "write_alt_text") {
    const alts = (after.alts as string[] | undefined) ?? [];
    return alts.reduce((m, a) => Math.max(m, (a ?? "").length), 0);
  }
  if (typeof after.text === "string") return after.text.length;
  return 0;
}

// ---------- Concept clusters (V2.3) ----------
// Cluster hits drive businessFit/offerFit even when literal tokens are absent.

const NL_CLUSTERS: Record<string, RegExp[]> = {
  icp: [/lokale ondernemer/i, /\bondernemers?\b/i, /lokale bedrijven/i, /\bmkb\b/i, /kleine onderneming/i],
  promise: [/beter vindbaar/i, /vindbaarheid/i, /\bgoogle\b/i, /lokale zichtbaarheid/i, /beter zichtbaar/i],
  mechanism: [/websitescan/i, /websitecheck/i, /\bscan\b/i, /verbeterpunten/i, /controleren/i, /stap voor stap/i],
  friction: [/zonder technisch gedoe/i, /geen gedoe/i, /gewone taal/i, /begrijpelijk/i, /zonder jargon/i],
  cta: [/gratis (web)?scan/i, /websitecheck/i, /\bcontact\b/i, /aanvra(ag|gen)/i, /vrijblijvend/i],
};

const EN_CLUSTERS: Record<string, RegExp[]> = {
  icp: [/local business(es)?/i, /small business(es)?/i, /local owners?/i, /smb/i],
  promise: [/rank local/i, /local visibility/i, /found by/i, /found locally/i, /near me/i],
  mechanism: [/website scan/i, /website review/i, /\bscan\b/i, /improvements?/i, /step by step/i],
  friction: [/without (the )?technical hassle/i, /no jargon/i, /plain (english|language)/i],
  cta: [/free (website )?scan/i, /free review/i, /\bcontact\b/i, /get started/i],
};

function clusterHits(text: string, locale: string): { count: number; hit: string[] } {
  const clusters = locale.startsWith("nl") ? NL_CLUSTERS : EN_CLUSTERS;
  const hit: string[] = [];
  for (const [name, regs] of Object.entries(clusters)) {
    if (regs.some((r) => r.test(text))) hit.push(name);
  }
  return { count: hit.length, hit };
}

// Soft NL claim phrases — allowed but should flag as needs_review.
const NL_SOFT_CLAIM_PATTERNS: RegExp[] = [
  /\bmeer klanten aantrekken\b/i,
  /\bdirect meer omzet\b/i,
  /\bdubbele omzet\b/i,
];


// ---------- Main ----------
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
  const weakHits = findWeakPhrases(text, ctx.instructions.locale);

  let status: ProposalV2Status = "draft";

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
  if (weakHits.length > 0 && status !== "rejected") {
    status = "needs_review";
    riskFlags.push(`weak_phrase:${weakHits.join(",")}`);
  }

  // ---- Language mismatch ----
  const expected = expectedLanguage(ctx.instructions.locale);
  if (expected) {
    const userFacing = [output.title, output.summary, output.reasoning, text].join(" \n ");
    const detected = detectLanguage(userFacing);
    if (detected !== "unknown" && detected !== expected) {
      riskFlags.push(`language:mismatch_${detected}_vs_${expected}`);
      if (status === "draft") status = "needs_review";
    }
  }

  // ---- Hard length gate ----
  const maxLen = ctx.action.maxLength;
  if (maxLen) {
    const len = measureLength(output.after, ctx.action.actionType);
    if (len > maxLen) {
      riskFlags.push(`length:over_${maxLen}_actual_${len}`);
      // Hard gate: never publishable
      if (status === "draft") status = "needs_review";
    }
  }

  // ---- Alt grounding ----
  if (ctx.action.actionType === "write_alt_text") {
    const alts = (output.after.alts as string[] | undefined) ?? [];
    const allText = alts.join(" ").toLowerCase();
    const inventionTriggers = [
      "tevreden",
      "glimlacht",
      "glimlachend",
      "stijgende",
      "grafiek met groei",
      "happy customer",
      "smiling",
      "rising chart",
      "success",
    ];
    const inventions = inventionTriggers.filter((t) => allText.includes(t));
    if (inventions.length > 0) {
      riskFlags.push(`image_context:weak (${inventions.join(",")})`);
      if (status === "draft") status = "needs_review";
    }
  }

  // ---- Schema proof ----
  if (ctx.action.actionType === "propose_schema") {
    const proof = ctx.business?.proof as { verifiedProofPoints?: unknown[] } | undefined;
    const hasProof = Array.isArray(proof?.verifiedProofPoints) && proof.verifiedProofPoints.length > 0;
    if (!hasProof) {
      riskFlags.push("schema:no_verified_proof");
      if (status !== "rejected") status = "needs_review";
    }
  }

  // ---- Soft scores (0..10) ----
  const generic = hasGenericPhrase(text);
  const tone = ctx.tone;
  const biz = ctx.business;
  const page = ctx.page;

  const preferredHits = tone ? includesAny(text, tone.preferredWords).length : 0;
  const angle = ctx.instructions.primaryAngle;
  const angleHit = angle ? text.toLowerCase().includes(angle.toLowerCase().slice(0, 30)) : false;
  const { conceptCount, offerTokenHits } = conceptHits(text, ctx);
  // Combine literal token hits + conceptual matches (each capped).
  const combinedFit = Math.min(3, offerTokenHits) + Math.min(3, conceptCount);

  const scores: ProposalV2Scores = {
    seoFit: clamp(6 + (output.keywordsUsed.length > 0 ? 2 : 0) + (page ? 1 : -1)),
    toneFit: clamp(tone ? 6 + Math.min(2, preferredHits) - (forbiddenWordHits.length || weakHits.length ? 3 : 0) : 5),
    businessFit: clamp(
      biz
        ? 5 + combinedFit + (angleHit ? 1 : 0) - (forbiddenClaimHits.length ? 4 : 0)
        : 5,
    ),
    pageFit: clamp(page ? 6 + (page.confidence >= 0.7 ? 2 : 0) : 4),
    offerFit: clamp(biz ? 5 + combinedFit + (angleHit ? 1 : 0) : 5),
    icpFit: clamp(page?.targetAudience ? 7 : 5),
    locationFit: clamp(
      ctx.instructions.shouldMentionLocation
        ? text.toLowerCase().match(/(amsterdam|rotterdam|utrecht|den haag|eindhoven|nederland|near me)/) ? 8 : 5
        : 7,
    ),
    claimSafety: clamp(
      forbiddenClaimHits.length > 0
        ? 1
        : weakHits.length > 0
        ? 4
        : ctx.guardrails.allowedClaims.length > 0
        ? 8
        : 6,
    ),
    proofSafety: clamp(
      ctx.action.actionType === "propose_schema"
        ? (riskFlags.some((f) => f.startsWith("schema:no_verified_proof")) ? 4 : 8)
        : 8,
    ),
    conversionFit: clamp(
      ctx.instructions.preferredCTA && text.toLowerCase().includes(ctx.instructions.preferredCTA.toLowerCase().slice(0, 20)) ? 8 : 6,
    ),
    genericnessRisk: clamp(generic || weakHits.length > 0 ? 8 : 3),
  };

  if (scores.genericnessRisk >= 6 && status === "draft") {
    status = "needs_review";
    riskFlags.push("generic_phrasing");
  }
  if (scores.claimSafety < 8 && status === "draft") status = "needs_review";
  if (scores.businessFit < 7 && status === "draft") status = "needs_review";
  if (scores.pageFit < 7 && status === "draft") status = "needs_review";

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

  if (status === "draft" && weighted < 7.5) status = "needs_review";

  // Hard length: never publishable on over-length
  const overLength = riskFlags.some((f) => f.startsWith("length:over_"));
  const publishable = status === "draft" && weighted >= 8 && !overLength;

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
