/**
 * Proposal V2 — action-specific generator (V2.2).
 * Adds:
 *  - Hard banned-phrase retry (once).
 *  - Deterministic meta compaction fallback (trim to maxLength on sentence boundary).
 *  - Alt-text "unknown image" safe mode (no fake visual details).
 */
import type { GrowthContext } from "@/lib/shared/growthContext/schemas";
import { llmComplete } from "@/lib/shared/llm/router.server";
import {
  GeneratorTextOutputSchema,
  type GeneratorTextOutput,
} from "./schemas";

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function compactList(items: string[] | undefined, max = 8): string {
  if (!items || items.length === 0) return "(none)";
  return items.slice(0, max).join(", ");
}

function pickTask(actionType: string): "default" | "cheap" | "reasoning" {
  if (actionType === "propose_schema" || actionType === "propose_intro_or_content_expansion") {
    return "default";
  }
  return "cheap";
}

// ---------- Locale rules (NL vs US) ----------

interface LocaleRules {
  languageName: string;
  promptHeader: string;
  toneGuidance: string;
  ctaExamples: string[];
  bannedPhrases: string[]; // case-insensitive, weak/AI-cliché
  preferredPhrases: string[];
  altFallback: (topic: string | undefined) => string;
}

const LOCALE_RULES: Record<string, LocaleRules> = {
  "nl-NL": {
    languageName: "Nederlands (Dutch)",
    promptHeader:
      "Schrijf ALLE user-facing velden (title, summary, reasoning, after.*) in helder, nuchter Nederlands. Geen Engelse zinnen. Geen hype.",
    toneGuidance:
      "Nederlandse zakelijke nuchtere toon. Praktisch, helder, geen overdreven claims. Gebruik 'je' tenzij Tone formality 'u' is.",
    ctaExamples: [
      "Vraag een gratis websitescan aan",
      "Bekijk hoe wij werken",
      "Plan een vrijblijvend gesprek",
    ],
    bannedPhrases: [
      "wel resultaat",
      "succes",
      "laat je bedrijf groeien",
      "ontdek",
      "continue optimalisatie",
      "revolutionair",
      "gegarandeerd",
      "nummer 1",
      "the best",
      "stijgende resultaten",
    ],
    preferredPhrases: [
      "duidelijke verbeterpunten",
      "beter vindbaar worden",
      "zonder technisch gedoe",
      "in gewone taal",
      "stap voor stap verbeteren",
      "gericht op lokale vindbaarheid",
    ],
    altFallback: (topic) =>
      topic ? `Afbeelding bij ${topic.toLowerCase().slice(0, 80)}` : "Afbeelding bij dit onderwerp",
  },
  "en-US": {
    languageName: "US English",
    promptHeader:
      "Write ALL user-facing fields (title, summary, reasoning, after.*) in clear US English. Outcome-driven but no unsupported guarantees. US spelling.",
    toneGuidance:
      "Clear, confident, outcome-driven US tone. Stronger commercial framing is allowed, but no guarantees, no superlatives without proof.",
    ctaExamples: [
      "Get a free website scan",
      "Request your local SEO review",
      "See what's holding your site back",
    ],
    bannedPhrases: [
      "guaranteed",
      "#1",
      "number one",
      "world-class",
      "revolutionary",
      "best in class",
      "discover",
      "click here",
      "unlock the power",
      "skyrocket",
    ],
    preferredPhrases: [
      "clear improvements",
      "rank locally",
      "without the technical hassle",
      "step by step",
      "built for local visibility",
    ],
    altFallback: (topic) =>
      topic ? `Image related to ${topic.toLowerCase().slice(0, 80)}` : "Image related to this topic",
  },
};

function getLocaleRules(ctx: GrowthContext): LocaleRules {
  return LOCALE_RULES[ctx.instructions.locale] ?? LOCALE_RULES["nl-NL"];
}

// ---------- Prompt building ----------

interface PromptOpts {
  compactRetry?: boolean;
  overLength?: number;
  bannedPhraseRetry?: string[];
}

function buildPrompt(ctx: GrowthContext, opts: PromptOpts = {}): string {
  const page = ctx.page;
  const tone = ctx.tone;
  const biz = ctx.business;
  const ins = ctx.instructions;
  const action = ctx.action;
  const locale = getLocaleRules(ctx);

  const sections: string[] = [];

  sections.push(`ACTION: ${action.actionType}`);
  sections.push(`LANGUAGE: ${ins.language}  LOCALE: ${ins.locale}  COUNTRY: ${ins.country}`);
  sections.push(`SALES INTENSITY: ${ins.salesIntensity}`);
  if (action.maxLength) sections.push(`MAX LENGTH: ${action.maxLength} chars (HARD LIMIT — count before returning)`);
  sections.push("");

  sections.push(`LOCALE RULES:\n- ${locale.promptHeader}\n- ${locale.toneGuidance}`);
  sections.push(`Locale-preferred phrases: ${locale.preferredPhrases.join(", ")}`);
  sections.push(`Locale-banned phrases (DO NOT USE, not even capitalized): ${locale.bannedPhrases.join(", ")}`);
  sections.push("");

  sections.push("ACTION RULES:");
  for (const r of action.generationRules) sections.push(`- ${r}`);
  sections.push("- NEVER invent facts (proof, addresses, ratings, prices).");
  sections.push("- NEVER use banned phrases listed above.");
  sections.push("- Match tone formality and CTA style.");
  if (action.actionType === "write_alt_text") {
    sections.push(
      "- ALT TEXT RULE: you have NO image data. Do NOT name objects (tablet, laptop, magnifying glass, charts, hands, people, Google). Write a short generic description tied to the page topic only.",
    );
  }
  sections.push("");

  if (page) {
    sections.push("PAGE:");
    sections.push(`- URL: ${page.pageUrl ?? "(unknown)"}`);
    sections.push(`- Type: ${page.pageType} / intent=${page.intent} / priority=${page.commercialPriority}`);
    if (page.primaryTopic) sections.push(`- Primary topic: ${page.primaryTopic}`);
    if (page.contentSummary) sections.push(`- Summary: ${page.contentSummary.slice(0, 400)}`);
    if (page.targetAudience) sections.push(`- Audience: ${page.targetAudience}`);
    if (page.desiredAction) sections.push(`- Desired action: ${page.desiredAction}`);
    if (page.recommendedCTA) sections.push(`- Recommended CTA: ${page.recommendedCTA}`);
    sections.push("");
  } else {
    sections.push("PAGE: (no page intelligence available — be cautious)\n");
  }

  if (biz) {
    sections.push("BUSINESS (USE EXPLICITLY — output must reflect this offer, not generic SEO advice):");
    const id = biz.identity as { businessName?: string; brandName?: string; tagline?: string };
    if (id?.businessName || id?.brandName) sections.push(`- Name: ${id.businessName || id.brandName}`);
    const offer = biz.offer as {
      mainPromise?: string;
      safePromise?: string;
      primaryOffer?: string;
      uniqueValueProposition?: string;
    };
    if (offer?.primaryOffer) sections.push(`- Primary offer: ${offer.primaryOffer}`);
    if (offer?.mainPromise) sections.push(`- Main promise: ${offer.mainPromise}`);
    if (offer?.safePromise) sections.push(`- Safe promise (preferred): ${offer.safePromise}`);
    if (offer?.uniqueValueProposition) sections.push(`- UVP: ${offer.uniqueValueProposition}`);
    if (biz.primaryStrategyAngle) sections.push(`- Strategy angle: ${biz.primaryStrategyAngle}`);
    const icp = biz.icp as { painPoints?: string[]; idealCustomers?: string[] };
    if (icp?.painPoints?.length) sections.push(`- ICP pains: ${compactList(icp.painPoints, 5)}`);
    if (icp?.idealCustomers?.length) sections.push(`- ICP: ${compactList(icp.idealCustomers, 5)}`);
    sections.push("");
  }

  if (tone) {
    sections.push("TONE:");
    sections.push(`- Summary: ${tone.summary}`);
    sections.push(`- Formality: ${tone.formality}  CTA style: ${tone.ctaStyle}`);
    sections.push(`- Preferred words: ${compactList(tone.preferredWords)}`);
    sections.push(`- Avoid: ${compactList(tone.avoidWords)}`);
    if (tone.goodExamples.length > 0) {
      sections.push(`- Good example: ${tone.goodExamples[0].slice(0, 200)}`);
    }
    sections.push("");
  }

  sections.push("GUARDRAILS:");
  sections.push(`- Forbidden claims: ${compactList(ctx.guardrails.forbiddenClaims)}`);
  sections.push(`- Forbidden words: ${compactList(ctx.guardrails.forbiddenWords)}`);
  sections.push(`- Allowed claims: ${compactList(ctx.guardrails.allowedClaims)}`);
  if (Object.keys(ctx.guardrails.safeAlternatives).length > 0) {
    const alts = Object.entries(ctx.guardrails.safeAlternatives)
      .slice(0, 5)
      .map(([k, v]) => `"${k}"→"${v}"`)
      .join("; ");
    sections.push(`- Safe alternatives: ${alts}`);
  }
  sections.push("");

  sections.push("ISSUE:");
  sections.push(`- Code: ${ctx.issue.issueType}`);
  sections.push(`- Severity: ${ctx.issue.severity}`);
  if (ctx.issue.message) sections.push(`- Message: ${ctx.issue.message}`);
  if (ctx.issue.targetField) sections.push(`- Target field: ${ctx.issue.targetField}`);
  const cv = ctx.issue.currentValue;
  if (cv !== null && cv !== undefined) {
    sections.push(`- Current value: ${typeof cv === "string" ? cv.slice(0, 400) : JSON.stringify(cv).slice(0, 400)}`);
  }
  sections.push("");

  if (opts.compactRetry && action.maxLength) {
    sections.push(
      `RETRY: previous output was ${opts.overLength ?? "?"} chars, over the ${action.maxLength}-char limit. Rewrite STRICTLY ≤ ${action.maxLength} characters. Count characters before returning.`,
    );
    sections.push("");
  }
  if (opts.bannedPhraseRetry && opts.bannedPhraseRetry.length > 0) {
    sections.push(
      `RETRY: previous output used BANNED phrase(s): ${opts.bannedPhraseRetry.join(", ")}. Rewrite WITHOUT any of these words or close variants.`,
    );
    sections.push("");
  }

  sections.push("OUTPUT (strict JSON, no markdown):");
  sections.push(`{
  "title": "short label of the fix",
  "summary": "one-sentence customer-facing summary",
  "reasoning": "why this works for this page+business+tone (max 800 chars)",
  "after": ${afterShapeFor(action.actionType)},
  "keywordsUsed": ["..."],
  "riskFlags": ["..."]
}`);

  return sections.join("\n");
}

function afterShapeFor(actionType: string): string {
  switch (actionType) {
    case "rewrite_meta_description":
    case "write_meta_description":
      return `{ "text": "120-155 chars meta description" }`;
    case "write_h1":
    case "rewrite_h1":
      return `{ "text": "concise H1" }`;
    case "write_alt_text":
      return `{ "alts": ["alt 1", "alt 2"] }`;
    case "propose_schema":
      return `{ "jsonld": { "@context": "https://schema.org", "@type": "..." } }`;
    case "propose_intro_or_content_expansion":
      return `{ "html": "<p>...</p>" }`;
    case "write_cta":
      return `{ "text": "CTA label", "href": "/contact" }`;
    case "fix_internal_link":
      return `{ "href": "/correct-path" }`;
    default:
      return `{ "recommendation": "concrete action" }`;
  }
}

// ---------- Length & banned phrase helpers ----------

function measureOverLength(output: GeneratorTextOutput, maxLength: number | null, actionType: string): number | null {
  if (!maxLength) return null;
  if (actionType === "write_alt_text") {
    const alts = (output.after.alts as string[] | undefined) ?? [];
    const longest = alts.reduce((m, a) => Math.max(m, (a ?? "").length), 0);
    return longest > maxLength ? longest : null;
  }
  if (typeof output.after.text === "string") {
    const len = output.after.text.length;
    return len > maxLength ? len : null;
  }
  return null;
}

function findBannedInOutput(output: GeneratorTextOutput, banned: string[]): string[] {
  const blob = [
    output.title,
    output.summary,
    typeof output.after.text === "string" ? output.after.text : "",
    typeof output.after.html === "string" ? output.after.html : "",
    Array.isArray(output.after.alts) ? (output.after.alts as string[]).join(" ") : "",
  ]
    .join(" \n ")
    .toLowerCase();
  return banned.filter((p) => blob.includes(p.toLowerCase()));
}

/** Deterministic compaction for meta-like text. Trims at sentence/word boundary. */
function compactMeta(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Try to cut at last sentence within budget
  const slice = text.slice(0, maxLen);
  const punct = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
  if (punct > maxLen * 0.6) return slice.slice(0, punct + 1).trim();
  // Otherwise cut at last word boundary
  const space = slice.lastIndexOf(" ");
  const cut = space > maxLen * 0.6 ? slice.slice(0, space) : slice;
  return cut.replace(/[\s,;:.\-]+$/u, "").trim();
}

// ---------- Deterministic banned-phrase rewrite (per-locale) ----------

interface BannedRewriteOutcome {
  text: string;
  changed: boolean;
  remaining: string[];
}

function rewriteBannedPhrases(text: string, locale: string): BannedRewriteOutcome {
  let out = text;
  let changed = false;
  if (locale === "nl-NL") {
    const before = out;
    out = out.replace(/(^|[.!?]\s+)Ontdek\b/g, (_m, p1) => `${p1}Bekijk`);
    out = out.replace(/\bOntdek\b/g, "Bekijk");
    out = out.replace(/\bontdek\b/g, "lees");
    out = out.replace(/\bwel resultaat\b/gi, "duidelijke verbeterpunten");
    out = out.replace(/\bstijgende resultaten\b/gi, "betere vindbaarheid");
    out = out.replace(/\bcontinue optimalisatie\b/gi, "stap voor stap verbeteren");
    out = out.replace(/\blaat je bedrijf groeien\b/gi, "word beter vindbaar");
    out = out.replace(/\bmeer klanten aantrekken\b/gi, "beter zichtbaar worden");
    out = out.replace(/\bgegarandeerd\b/gi, "");
    out = out.replace(/\bnummer 1\b/gi, "");
    out = out.replace(/\brevolutionair\b/gi, "");
    out = out.replace(/\bsucces\b/gi, "");
    if (out !== before) changed = true;
  } else if (locale === "en-US") {
    const before = out;
    out = out.replace(/(^|[.!?]\s+)Discover\b/g, (_m, p1) => `${p1}See`);
    out = out.replace(/\bdiscover\b/gi, "see");
    out = out.replace(/\bguaranteed\b/gi, "proven");
    out = out.replace(/\bskyrocket\b/gi, "grow");
    out = out.replace(/\bunlock the power\b/gi, "use");
    out = out.replace(/\brevolutionary\b/gi, "");
    out = out.replace(/\b(#1|number one|world-class|best in class|click here)\b/gi, "");
    if (out !== before) changed = true;
  }
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  const locRules = LOCALE_RULES[locale] ?? LOCALE_RULES["nl-NL"];
  const lower = out.toLowerCase();
  const remaining = locRules.bannedPhrases.filter((p) => lower.includes(p.toLowerCase()));
  return { text: out, changed, remaining };
}

// ---------- Deterministic meta builder (last resort) ----------

function buildDeterministicMeta(ctx: GrowthContext, maxLen: number): string | null {
  const biz = ctx.business;
  const page = ctx.page;
  const offer = biz?.offer as
    | { mainPromise?: string; safePromise?: string; primaryOffer?: string; uniqueValueProposition?: string }
    | undefined;
  const id = biz?.identity as { brandName?: string; businessName?: string } | undefined;
  const brand = id?.brandName || id?.businessName || "ons team";
  const pageType = page?.pageType ?? "";
  const topic = page?.primaryTopic ?? "lokale vindbaarheid";
  const safe = offer?.safePromise || offer?.mainPromise;
  const mech = offer?.uniqueValueProposition || offer?.primaryOffer;
  const url = (page?.pageUrl ?? "").toLowerCase();
  const isProcess = /werkwijze|process|approach|how-we-work/.test(url) || pageType === "trust";

  let candidate: string | null = null;
  if (ctx.instructions.locale === "nl-NL") {
    if (isProcess) {
      candidate = `Zo werkt ${brand}: van websitescan tot duidelijke verbeterpunten. Jij houdt controle over wat live gaat.`;
    } else if (pageType === "homepage" || pageType === "service") {
      candidate = `${safe ?? "Beter vindbaar worden in Google"}. ${mech ?? "Concrete verbeterpunten zonder technisch gedoe"}.`;
    } else if (pageType === "blog") {
      candidate = `${topic} helpt ondernemers beter zichtbaar worden in hun regio. Lees praktische uitleg zonder technisch jargon.`;
    } else {
      candidate = `${safe ?? "Beter vindbaar worden"}. ${mech ?? "Heldere uitleg zonder jargon"}.`;
    }
  } else if (ctx.instructions.locale === "en-US") {
    if (isProcess) {
      candidate = `How ${brand} works: from website scan to clear improvements. You stay in control of what goes live.`;
    } else if (pageType === "homepage" || pageType === "service") {
      candidate = `${safe ?? "Get found by local customers"}. ${mech ?? "Clear improvements without the technical hassle"}.`;
    } else if (pageType === "blog") {
      candidate = `${topic} helps local businesses rank in their area. Practical guidance without the jargon.`;
    } else {
      candidate = `${safe ?? "Get found locally"}. ${mech ?? "Clear, practical improvements"}.`;
    }
  }
  if (!candidate) return null;
  candidate = candidate.replace(/\s{2,}/g, " ").trim();
  return compactMeta(candidate, maxLen);
}

// ---------- Alt fallback cleanup ----------

function cleanupAltText(raw: string, locale: string): string {
  let out = raw;
  // Strip parenthetical / bracketed marketing fragments entirely.
  out = out.replace(/\s*\([^)]*\)\s*/g, " ");
  out = out.replace(/\s*\[[^\]]*\]\s*/g, " ");
  // Strip internal labels.
  out = out.replace(/\s*[-–—]?\s*\b(variant|option|versie|variation)\s*\d*\b\s*/gi, " ");
  out = out.replace(/\bextra\s+weergave\b/gi, " ");
  out = out.replace(/\bafbeelding\s+van\b/gi, "Afbeelding bij");
  // Brand + term normalisation
  out = out.replace(/\bklikklaar\b/gi, "KlikKlaar");
  out = out.replace(/\bseo[-\s]+diensten\b/gi, "SEO-diensten");
  out = out.replace(/\bwebsite\s+scan\b/gi, "websitescan");
  out = out.replace(/\bseo[-\s]+scan\b/gi, "SEO-scan");
  out = out.replace(/\bseo[-\s]+proces\b/gi, "SEO-proces");
  out = out.replace(/\bseo[-\s]+aanpak\b/gi, "SEO-aanpak");
  // NL locale: kill obvious English leftovers
  if (locale === "nl-NL") {
    out = out.replace(/\bSEO\s+services?\s+and\s+methodology\b/gi, "SEO-diensten en werkwijze");
    out = out.replace(/\bSEO\s+process\s+and\s+methodology\b/gi, "SEO-proces en werkwijze");
    out = out.replace(/\bprocess\s+and\s+methodology\b/gi, "werkwijze");
    out = out.replace(/\bservices\s+and\s+methodology\b/gi, "diensten en werkwijze");
    out = out.replace(/\bmethodology\b/gi, "werkwijze");
    out = out.replace(/\bservices\b/gi, "diensten");
    out = out.replace(/\bimage\s+of\b/gi, "Afbeelding bij");
    out = out.replace(/\bfeaturing\b/gi, "met");
    // Glue/connector words.
    out = out.replace(/\s+and\s+/gi, " en ");
    out = out.replace(/\bwith\s+/gi, "met ");
    out = out.replace(/\bthe\s+/gi, "");
  }
  // Re-normalize SEO casing AFTER english cleanup (services→diensten may
  // re-introduce a lowercase "seo diensten").
  out = out.replace(/\bseo[-\s]+diensten\b/gi, "SEO-diensten");
  out = out.replace(/\bseo\b/g, "SEO");
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  if (out.length > 120) out = compactMeta(out, 120);
  return out;
}

// Awkward survivors after cleanup (parens, internal labels, lowercase seo).
export function detectAltAwkward(text: string): boolean {
  if (!text || text.length < 5) return true;
  if (/\b(variant|option|versie)\s*\d*\b/i.test(text)) return true;
  if (/\bextra\s+weergave\b/i.test(text)) return true;
  if (/\([^)]*\)|\[[^\]]*\]/.test(text)) return true;
  if (/\bseo\s+diensten\b/.test(text)) return true;
  return false;
}

// Hard gate: returns true if alt is acceptable for nl-NL output.
function isAltAcceptableNl(text: string): boolean {
  if (!text || text.trim().length < 5) return false;
  if (text.length > 120) return false;
  if (detectAltAwkward(text)) return false;
  if (/\b(and|the|with|process|methodology|services|image\s+of|featuring)\b/i.test(text)) return false;
  // Lowercase "seo " followed by word → not allowed.
  if (/\bseo\s+[a-z]/.test(text)) return false;
  return true;
}

// Deterministic safe pool (nl-NL).
const SAFE_POOL_NL_GENERIC = [
  "Afbeelding bij SEO-diensten voor lokale ondernemers",
  "Afbeelding bij online vindbaarheid voor lokale bedrijven",
  "Afbeelding bij websiteverbetering en duidelijke verbeterpunten",
  "Afbeelding bij de werkwijze van KlikKlaar",
  "Afbeelding bij lokale vindbaarheid in Google",
  "Afbeelding bij duidelijke SEO-aanpak voor ondernemers",
];

function safePoolNl(pageType: string | undefined, url: string | undefined): string[] {
  const u = (url ?? "").toLowerCase();
  if (/werkwijze|process|aanpak/.test(u) || pageType === "trust") {
    return [
      "Afbeelding bij de werkwijze van KlikKlaar",
      "Afbeelding bij duidelijke SEO-aanpak voor ondernemers",
      "Afbeelding bij websiteverbetering en duidelijke verbeterpunten",
      ...SAFE_POOL_NL_GENERIC,
    ];
  }
  if (pageType === "homepage" || pageType === "service") {
    return [
      "Afbeelding bij SEO-diensten voor lokale ondernemers",
      "Afbeelding bij lokale vindbaarheid in Google",
      "Afbeelding bij online vindbaarheid voor lokale bedrijven",
      ...SAFE_POOL_NL_GENERIC,
    ];
  }
  return SAFE_POOL_NL_GENERIC;
}

function pickFromPool(pool: string[], count: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of pool) {
    if (out.length >= count) break;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p.slice(0, 120));
  }
  let i = 1;
  while (out.length < count) {
    const candidate = `Afbeelding bij websiteverbetering ${i++}`.slice(0, 120);
    const k = candidate.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(candidate);
    }
  }
  return out;
}

function dedupeAlts(alts: string[], fallback: string): string[] {
  const seen = new Set<string>();
  const distinctNl = SAFE_POOL_NL_GENERIC;
  return alts.map((a, idx) => {
    const key = a.trim().toLowerCase();
    if (key.length > 0 && !seen.has(key)) {
      seen.add(key);
      return a;
    }
    const candidates = [fallback, ...distinctNl];
    for (const c of candidates) {
      const ck = c.toLowerCase();
      if (!seen.has(ck)) {
        seen.add(ck);
        return c.slice(0, 120);
      }
    }
    const fb = `${fallback} ${idx + 1}`.slice(0, 120);
    seen.add(fb.toLowerCase());
    return fb;
  });
}

// Normalize brand casing across user-facing text fields (meta, title, summary,
// reasoning, alt). Keeps the engine output consistent with brand identity.
function normalizeBrand(text: string): string {
  if (!text) return text;
  // "klikklaar" / "Klikklaar" / "KLIKKLAAR" → "KlikKlaar", word-boundary safe.
  return text.replace(/\bklikklaar\b/gi, "KlikKlaar");
}

// ---------- Weak meta tail polish ----------
// Strip generic closer phrases ("Begrijp onze aanpak", "Lees meer over onze
// aanpak", "Ontdek onze aanpak", and "Neem contact op" / "Lees meer" when
// used as a generic last sentence).
const WEAK_TAIL_PATTERNS_NL: RegExp[] = [
  /\s*(?:[.!?]\s*)?\bBegrijp onze aanpak\.?\s*$/i,
  /\s*(?:[.!?]\s*)?\bLees meer over onze aanpak\.?\s*$/i,
  /\s*(?:[.!?]\s*)?\bOntdek onze aanpak\.?\s*$/i,
  /\s*(?:[.!?]\s*)?\bBekijk onze aanpak\.?\s*$/i,
  /\s*(?:[.!?]\s*)?\bNeem contact op\.?\s*$/i,
  /\s*(?:[.!?]\s*)?\bLees meer\.?\s*$/i,
];

function hasWeakTailNl(text: string): boolean {
  return WEAK_TAIL_PATTERNS_NL.some((r) => r.test(text));
}

function stripWeakTailNl(text: string): string {
  let out = text;
  for (const r of WEAK_TAIL_PATTERNS_NL) out = out.replace(r, "");
  return out.replace(/[\s,;:]+$/u, "").replace(/\s{2,}/g, " ").trim();
}

// Append a contextual CTA if there's room, otherwise leave the meta as-is.
function maybeAppendContextCta(text: string, ctx: GrowthContext, maxLen: number): string {
  const url = (ctx.page?.pageUrl ?? "").toLowerCase();
  const pageType = ctx.page?.pageType ?? "";
  const isProcess = /werkwijze|process|approach|how-we-work/.test(url) || pageType === "trust";
  const isCommercial = pageType === "homepage" || pageType === "service";
  let cta: string | null = null;
  if (ctx.instructions.locale === "nl-NL") {
    if (isProcess) cta = "Bekijk hoe we werken";
    else if (isCommercial) cta = "Vraag een gratis scan aan";
  } else if (ctx.instructions.locale === "en-US") {
    if (isProcess) cta = "See how we work";
    else if (isCommercial) cta = "Get a free website scan";
  }
  if (!cta) return text;
  const sep = /[.!?]\s*$/.test(text) ? " " : ". ";
  const candidate = `${text}${sep}${cta}.`;
  if (candidate.length <= maxLen) return candidate;
  return text; // no room — leave stronger ending off
}


export interface GeneratorResult {
  output: GeneratorTextOutput;
  modelUsed: string;
  retried: boolean;
  compactedDeterministically: boolean;
  bannedPhraseRetry: boolean;
}

const SYSTEM = (locale: string) =>
  `You are a senior SEO+brand copywriter writing for the ${locale} market. Output ONLY valid JSON. Never include markdown, prose, or English fallbacks when the locale is non-English. Respect ALL length limits exactly — count characters before returning.`;

export async function runActionGenerator(ctx: GrowthContext): Promise<GeneratorResult> {
  const task = pickTask(ctx.action.actionType);
  const system = SYSTEM(ctx.instructions.locale);
  const locale = getLocaleRules(ctx);

  // First attempt
  const r1 = await llmComplete({
    task,
    system,
    prompt: buildPrompt(ctx),
    temperature: 0.4,
    maxTokens: 1400,
    jsonMode: true,
  });
  let parsed = GeneratorTextOutputSchema.parse(extractJson(r1.text));
  let modelUsed = r1.model;
  let retried = false;
  let bannedPhraseRetry = false;

  // ----- Hard banned-phrase retry (once) -----
  const banned1 = findBannedInOutput(parsed, locale.bannedPhrases);
  if (banned1.length > 0) {
    bannedPhraseRetry = true;
    try {
      const r2 = await llmComplete({
        task,
        system,
        prompt: buildPrompt(ctx, { bannedPhraseRetry: banned1 }),
        temperature: 0.3,
        maxTokens: 1400,
        jsonMode: true,
      });
      const parsed2 = GeneratorTextOutputSchema.parse(extractJson(r2.text));
      const banned2 = findBannedInOutput(parsed2, locale.bannedPhrases);
      // Keep retry only if it removed banned phrases (or at least reduced)
      if (banned2.length < banned1.length) {
        parsed = parsed2;
        modelUsed = r2.model;
      }
    } catch {
      // keep original
    }
  }

  // ----- Length retry + deterministic compaction -----
  const over = measureOverLength(parsed, ctx.action.maxLength, ctx.action.actionType);
  if (over !== null) {
    retried = true;
    try {
      const r3 = await llmComplete({
        task,
        system,
        prompt: buildPrompt(ctx, { compactRetry: true, overLength: over }),
        temperature: 0.3,
        maxTokens: 1400,
        jsonMode: true,
      });
      const parsed3 = GeneratorTextOutputSchema.parse(extractJson(r3.text));
      const over2 = measureOverLength(parsed3, ctx.action.maxLength, ctx.action.actionType);
      if (over2 === null || (over2 < over)) {
        parsed = parsed3;
        modelUsed = r3.model;
      }
    } catch {
      // keep previous
    }
  }

  // Deterministic fallback compaction (meta-like text only).
  let compactedDeterministically = false;
  const maxLen = ctx.action.maxLength;
  if (
    maxLen &&
    typeof parsed.after.text === "string" &&
    parsed.after.text.length > maxLen
  ) {
    const trimmed = compactMeta(parsed.after.text, maxLen);
    parsed = {
      ...parsed,
      after: { ...parsed.after, text: trimmed },
      riskFlags: Array.from(new Set([...parsed.riskFlags, "compacted:deterministic"])),
    };
    compactedDeterministically = true;
  }

  // ----- HARD banned-phrase enforcement (V2.3) -----
  // After all LLM retries, if banned phrases are still in user-facing text,
  // try a deterministic rewrite. If still bad and the action is meta-like,
  // fall back to a deterministic context-built meta. If still bad, mark
  // blocked:banned_phrase_remaining so the evaluator rejects the proposal.
  const isMetaLike =
    ctx.action.actionType === "rewrite_meta_description" ||
    ctx.action.actionType === "write_meta_description" ||
    ctx.action.actionType === "write_cta" ||
    ctx.action.actionType === "write_h1" ||
    ctx.action.actionType === "rewrite_h1";

  if (typeof parsed.after.text === "string" && isMetaLike) {
    const original = parsed.after.text;
    const rewrite = rewriteBannedPhrases(original, ctx.instructions.locale);
    let workingText = rewrite.text;
    let flags = [...parsed.riskFlags];
    if (rewrite.changed) flags.push("banned_phrase:deterministic_rewrite");

    if (rewrite.remaining.length > 0 || (maxLen && workingText.length > maxLen)) {
      // Try deterministic context builder
      const built = maxLen ? buildDeterministicMeta(ctx, maxLen) : null;
      if (built) {
        const builtCheck = rewriteBannedPhrases(built, ctx.instructions.locale);
        if (builtCheck.remaining.length === 0) {
          workingText = builtCheck.text;
          flags.push("banned_phrase:deterministic_fallback");
        }
      }
    }
    if (maxLen && workingText.length > maxLen) {
      workingText = compactMeta(workingText, maxLen);
    }

    // Weak-tail polish (nl-NL meta): strip generic closers and optionally
    // append a contextual CTA when there's room.
    const isMetaDesc =
      ctx.action.actionType === "rewrite_meta_description" ||
      ctx.action.actionType === "write_meta_description";
    if (isMetaDesc && ctx.instructions.locale === "nl-NL" && hasWeakTailNl(workingText)) {
      const stripped = stripWeakTailNl(workingText);
      const polished = maxLen ? maybeAppendContextCta(stripped, ctx, maxLen) : stripped;
      if (polished !== workingText) {
        workingText = polished;
        flags.push("weak_tail:rewritten");
      }
    }
    if (isMetaDesc && ctx.instructions.locale === "nl-NL" && hasWeakTailNl(workingText)) {
      flags.push("weak_tail:meta");
    }

    const finalCheck = rewriteBannedPhrases(workingText, ctx.instructions.locale);
    if (finalCheck.remaining.length > 0) {
      flags.push(`blocked:banned_phrase_remaining:${finalCheck.remaining.join(",")}`);
    }
    if (workingText !== original) {
      parsed = {
        ...parsed,
        after: { ...parsed.after, text: workingText },
        riskFlags: Array.from(new Set(flags)),
      };
    } else if (flags.length !== parsed.riskFlags.length) {
      parsed = { ...parsed, riskFlags: Array.from(new Set(flags)) };
    }
  }

  // Alt unknown-image safe fallback + V2.3 cleanup + Hard Gate
  if (ctx.action.actionType === "write_alt_text") {
    const alts = (parsed.after.alts as string[] | undefined) ?? [];
    const topic = ctx.page?.primaryTopic ?? ctx.page?.contentSummary?.slice(0, 60);
    const fallback = locale.altFallback(topic);
    const concreteRe =
      /(tablet|laptop|computer|telefoon|phone|monitor|scherm|toetsenbord|keyboard|vergrootglas|magnifying|grafiek|chart|google|zoekresultaten|search results|hand|handen|persoon|ondernemer|man|vrouw|smiling|glimlach|tevreden|blij|kantoor|office)/i;
    let mutated = false;
    let safeAlts = alts.map((a) => {
      if (concreteRe.test(a)) {
        mutated = true;
        return fallback;
      }
      return a;
    });
    // Always run cleanup on every alt (not just mutated ones).
    const cleaned = safeAlts.map((a) => cleanupAltText(a, ctx.instructions.locale));
    if (cleaned.some((a, i) => a !== safeAlts[i])) mutated = true;
    // Dedupe — track whether dedupe had to substitute anything.
    const preDedupe = cleaned.slice();
    safeAlts = dedupeAlts(cleaned, fallback);
    const duplicatesReplaced = safeAlts.some((a, i) => a !== preDedupe[i]);
    const flags = [...parsed.riskFlags];
    if (mutated) flags.push("alt:safe_fallback_applied");
    if (duplicatesReplaced) flags.push("alt:duplicate");

    // ----- HARD GATE (nl-NL): if any alt still fails validation, replace
    // the whole set with deterministic page-aware safe pool entries.
    if (ctx.instructions.locale === "nl-NL") {
      const failsPre = safeAlts.some((a) => !isAltAcceptableNl(a));
      if (failsPre) {
        if (safeAlts.some((a) => /\b(and|the|with|process|methodology|services|image\s+of|featuring)\b/i.test(a))) {
          flags.push("language:mismatch_alt");
        }
        if (safeAlts.some((a) => detectAltAwkward(a))) {
          flags.push("alt:awkward_fallback");
        }
        if (safeAlts.some((a) => /\b(variant|option|versie)\s*\d*\b/i.test(a))) {
          flags.push("alt:internal_label_leak");
        }
        const pool = safePoolNl(ctx.page?.pageType, ctx.page?.pageUrl ?? undefined);
        const replaced = pickFromPool(pool, Math.max(1, safeAlts.length));
        safeAlts = replaced;
        mutated = true;
        flags.push("alt:safe_fallback_applied");

        // Second-pass guarantee: if for any reason the pool itself doesn't
        // pass validation (shouldn't happen), force ultra-generic safe set.
        const failsPost = safeAlts.some((a) => !isAltAcceptableNl(a));
        if (failsPost) {
          safeAlts = pickFromPool(
            Array.from({ length: safeAlts.length }, (_, i) =>
              `Afbeelding bij websiteverbetering ${i + 1}`,
            ),
            safeAlts.length,
          );
          flags.push("alt:fallback_failed");
        }
      }
    } else {
      // Non-NL: keep legacy detector flags only (no hard pool gate).
      if (safeAlts.some((a) => /\b(variant|option)\s*\d+\b/i.test(a))) {
        flags.push("alt:internal_label_leak");
      }
      if (safeAlts.some((a) => detectAltAwkward(a))) {
        flags.push("alt:awkward_fallback");
      }
    }

    if (mutated || safeAlts.some((a, i) => a !== alts[i]) || flags.length !== parsed.riskFlags.length) {
      parsed = {
        ...parsed,
        after: { ...parsed.after, alts: safeAlts },
        riskFlags: Array.from(new Set(flags)),
      };
    }
  }

  // Brand casing normalization across user-facing fields.
  {
    const after = parsed.after as Record<string, unknown>;
    const nextAfter: Record<string, unknown> = { ...after };
    if (typeof after.text === "string") nextAfter.text = normalizeBrand(after.text);
    if (Array.isArray(after.alts)) {
      nextAfter.alts = (after.alts as unknown[]).map((a) =>
        typeof a === "string" ? normalizeBrand(a) : a,
      );
    }
    parsed = {
      ...parsed,
      title: normalizeBrand(parsed.title ?? ""),
      summary: normalizeBrand(parsed.summary ?? ""),
      reasoning: normalizeBrand(parsed.reasoning ?? ""),
      after: nextAfter,
    };
  }

  return { output: parsed, modelUsed, retried, compactedDeterministically, bannedPhraseRetry };
}
