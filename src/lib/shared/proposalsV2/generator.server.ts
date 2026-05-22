/**
 * Proposal V2 — action-specific generator (V2.1 locale-aware).
 * Single source of context: GrowthContext (no extra DB reads).
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
  },
};

function getLocaleRules(ctx: GrowthContext): LocaleRules {
  return LOCALE_RULES[ctx.instructions.locale] ?? LOCALE_RULES["nl-NL"];
}

// ---------- Prompt building ----------

function buildPrompt(ctx: GrowthContext, compactRetry = false, overLength?: number): string {
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
  if (action.maxLength) sections.push(`MAX LENGTH: ${action.maxLength} chars (HARD LIMIT)`);
  sections.push("");

  sections.push(`LOCALE RULES:\n- ${locale.promptHeader}\n- ${locale.toneGuidance}`);
  sections.push(`Locale-preferred phrases: ${locale.preferredPhrases.join(", ")}`);
  sections.push(`Locale-banned phrases (DO NOT USE): ${locale.bannedPhrases.join(", ")}`);
  sections.push("");

  sections.push("ACTION RULES:");
  for (const r of action.generationRules) sections.push(`- ${r}`);
  sections.push("- NEVER invent facts (proof, addresses, ratings, prices).");
  sections.push("- NEVER use banned phrases listed above.");
  sections.push("- Match tone formality and CTA style.");
  if (action.actionType === "write_alt_text") {
    sections.push(
      "- ALT TEXT RULE: only describe what is verifiable from filename/topic/surrounding text. If unsure, write a generic-but-relevant description tied to the page topic. NEVER invent people, emotions, charts, or success imagery.",
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

  if (compactRetry && action.maxLength) {
    sections.push(
      `RETRY INSTRUCTION: previous output was ${overLength ?? "?"} chars, over the ${action.maxLength}-char limit. Rewrite STRICTLY ≤ ${action.maxLength} characters. Count characters before returning.`,
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

// ---------- Length helpers ----------

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

// ---------- Public API ----------

export interface GeneratorResult {
  output: GeneratorTextOutput;
  modelUsed: string;
  retried: boolean;
}

const SYSTEM = (locale: string) =>
  `You are a senior SEO+brand copywriter writing for the ${locale} market. Output ONLY valid JSON. Never include markdown, prose, or English fallbacks when the locale is non-English. Respect ALL length limits exactly — count characters before returning.`;

export async function runActionGenerator(ctx: GrowthContext): Promise<GeneratorResult> {
  const task = pickTask(ctx.action.actionType);
  const system = SYSTEM(ctx.instructions.locale);

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

  // Retry once if over length (meta + alt)
  const over = measureOverLength(parsed, ctx.action.maxLength, ctx.action.actionType);
  if (over !== null) {
    retried = true;
    try {
      const r2 = await llmComplete({
        task,
        system,
        prompt: buildPrompt(ctx, true, over),
        temperature: 0.3,
        maxTokens: 1400,
        jsonMode: true,
      });
      const parsed2 = GeneratorTextOutputSchema.parse(extractJson(r2.text));
      const over2 = measureOverLength(parsed2, ctx.action.maxLength, ctx.action.actionType);
      // Keep retry only if it actually fits or is shorter
      if (over2 === null || (over2 < over)) {
        parsed = parsed2;
        modelUsed = r2.model;
      }
    } catch {
      // keep original
    }
  }

  return { output: parsed, modelUsed, retried };
}
