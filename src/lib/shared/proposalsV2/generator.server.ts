/**
 * Proposal V2 — action-specific generator.
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

function buildPrompt(ctx: GrowthContext): string {
  const page = ctx.page;
  const tone = ctx.tone;
  const biz = ctx.business;
  const ins = ctx.instructions;
  const action = ctx.action;

  const sections: string[] = [];
  sections.push(`ACTION: ${action.actionType}`);
  sections.push(`LANGUAGE: ${ins.language}  LOCALE: ${ins.locale}`);
  if (action.maxLength) sections.push(`MAX LENGTH: ${action.maxLength} chars`);
  sections.push("");
  sections.push("RULES:");
  for (const r of action.generationRules) sections.push(`- ${r}`);
  sections.push("- NEVER invent facts (proof, addresses, ratings, prices).");
  sections.push("- NEVER use forbidden claims/words listed below.");
  sections.push("- Match tone formality and CTA style.");
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
    sections.push("BUSINESS:");
    const id = biz.identity as { name?: string; tagline?: string };
    if (id?.name) sections.push(`- Name: ${id.name}`);
    const offer = biz.offer as { mainPromise?: string; primaryOffer?: string };
    if (offer?.mainPromise) sections.push(`- Promise: ${offer.mainPromise}`);
    if (offer?.primaryOffer) sections.push(`- Primary offer: ${offer.primaryOffer}`);
    if (biz.primaryStrategyAngle) sections.push(`- Strategy angle: ${biz.primaryStrategyAngle}`);
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
      return `{ "text": "120-160 chars meta description" }`;
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

export interface GeneratorResult {
  output: GeneratorTextOutput;
  modelUsed: string;
}

export async function runActionGenerator(ctx: GrowthContext): Promise<GeneratorResult> {
  const task = pickTask(ctx.action.actionType);
  const prompt = buildPrompt(ctx);
  const result = await llmComplete({
    task,
    system:
      "You are a senior SEO+brand copywriter. Output ONLY valid JSON. Never include markdown or prose.",
    prompt,
    temperature: 0.4,
    maxTokens: 1400,
    jsonMode: true,
  });
  const parsed = GeneratorTextOutputSchema.parse(extractJson(result.text));
  return { output: parsed, modelUsed: result.model };
}
