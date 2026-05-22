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

  // ---- Alt grounding + leak/lang/dupe ----
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
    // internal label leak (e.g. "variant 2", "option 3")
    if (/\b(variant|option)\s*\d+\b/i.test(allText)) {
      riskFlags.push("alt:internal_label_leak");
      if (status === "draft") status = "needs_review";
    }
    // language mismatch in NL locale (English content in alts)
    if (ctx.instructions.locale === "nl-NL") {
      const englishMarkers = /\b(the|and|with|process|methodology|services|image of|featuring)\b/i;
      if (englishMarkers.test(alts.join(" "))) {
        riskFlags.push("language:mismatch_alt");
        if (status === "draft") status = "needs_review";
      }
    }
    // duplicate alts (case-insensitive)
    const seen = new Set<string>();
    let dup = false;
    for (const a of alts) {
      const k = a.trim().toLowerCase();
      if (seen.has(k)) { dup = true; break; }
      seen.add(k);
    }
    if (dup) {
      riskFlags.push("alt:duplicate");
      if (status === "draft") status = "needs_review";
    }
  }

  // ---- Meta repetition (V1 learnings) ----
  const isMetaLike =
    ctx.action.actionType === "rewrite_meta_description" ||
    ctx.action.actionType === "write_meta_description";
  if (isMetaLike && typeof output.after.text === "string") {
    const t = output.after.text.toLowerCase();
    const tokens = t.split(/\s+/).filter(Boolean);
    const phrases = new Map<string, number>();
    for (let i = 0; i < tokens.length - 1; i++) {
      for (const n of [2, 3]) {
        if (i + n > tokens.length) continue;
        const phrase = tokens.slice(i, i + n).join(" ");
        if (phrase.length < 8) continue;
        phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
      }
    }
    const repeated = [...phrases.entries()].find(([, c]) => c >= 2);
    if (repeated) {
      riskFlags.push(`repetition:meta:${repeated[0]}`);
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

  // ---- V2.3: blocked banned-phrase remaining → rejected ----
  if (riskFlags.some((f) => f.startsWith("blocked:banned_phrase_remaining"))) {
    status = "rejected";
  }

  // ---- V2.3: soft NL claim sensitivity ----
  if (ctx.instructions.locale === "nl-NL") {
    const softHits = NL_SOFT_CLAIM_PATTERNS.filter((r) => r.test(text));
    if (softHits.length > 0) {
      riskFlags.push("soft_claim:nl_outcome_too_strong");
      if (status === "draft") status = "needs_review";
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

  // V2.3 conceptual cluster scoring (replaces token-only conceptHits).
  const { count: clusters, hit: clusterHit } = clusterHits(text, ctx.instructions.locale);
  const ctaHit =
    ctx.instructions.preferredCTA &&
    text.toLowerCase().includes(ctx.instructions.preferredCTA.toLowerCase().slice(0, 20));

  // BP only counts as present for scoring when it was actually hydrated with
  // usable fields. Diagnostics is the source of truth; fall back to ctx.business
  // shape when diagnostics is absent (older snapshots).
  const bpPresent = ctx.diagnostics
    ? ctx.diagnostics.businessHydrated
    : !!biz && Object.keys(biz.identity ?? {}).length > 0;

  // Base business/offer fit. Heavy bonus when 3+ clusters land on a
  // commercial page; cap at 6 when content is generic.
  const commercialPage =
    page?.pageType === "homepage" || page?.pageType === "service" || page?.commercialPriority === "high" || page?.commercialPriority === "critical";
  let businessFit: number;
  let offerFit: number;
  if (!bpPresent) {
    businessFit = 5;
    offerFit = 5;
  } else if (clusters >= 3 && commercialPage) {
    businessFit = 7 + (angleHit ? 1 : 0) + (clusters >= 4 ? 1 : 0);
    offerFit = 7 + (ctaHit ? 1 : 0) + (clusters >= 4 ? 1 : 0);
  } else if (clusters >= 2) {
    businessFit = 6 + (angleHit ? 1 : 0);
    offerFit = 6 + (ctaHit ? 1 : 0);
  } else {
    businessFit = 5 + (angleHit ? 1 : 0);
    offerFit = 5;
  }
  // If offer-mechanism + promise clusters both land, lift offerFit floor.
  if (clusterHit.includes("mechanism") && clusterHit.includes("promise") && offerFit < 7) {
    offerFit = 7;
  }
  if (forbiddenClaimHits.length > 0) {
    businessFit -= 4;
    offerFit -= 4;
  }
  if (clusterHit.length > 0) {
    riskFlags.push(`debug:clusters=${clusterHit.join("+")}`);
  }
  // Soft debug signal: BP hydrated + plenty of clusters but fit still low →
  // likely evaluator/score mismatch worth a human look. Does not change verdict.
  if (bpPresent && clusterHit.length >= 3 && (businessFit < 7 || offerFit < 7)) {
    riskFlags.push("possible_score_mismatch:business_offer_fit");
  }

  const scores: ProposalV2Scores = {
    seoFit: clamp(6 + (output.keywordsUsed.length > 0 ? 2 : 0) + (page ? 1 : -1)),
    toneFit: clamp(tone ? 6 + Math.min(2, preferredHits) - (forbiddenWordHits.length || weakHits.length ? 3 : 0) : 5),
    businessFit: clamp(businessFit),
    pageFit: clamp(page ? 6 + (page.confidence >= 0.7 ? 2 : 0) : 4),
    offerFit: clamp(offerFit),
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
