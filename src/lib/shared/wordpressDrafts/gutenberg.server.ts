/**
 * Gutenberg content transformer V2 — server-only.
 *
 * Converts a PageBriefArtifactPayload into WordPress block editor content.
 *
 * V2 introduces three page templates:
 *   service_page          → renderServicePageTemplate
 *   local_landing_page    → renderLocalLandingPageTemplate
 *   emergency_service_page → renderEmergencyServicePageTemplate
 *
 * Template selection:
 *   payload.pageType === "location_page"             → local_landing_page
 *   payload.pageType === "service_page" + urgency H1 → emergency_service_page
 *   otherwise                                        → service_page (default)
 *
 * Key V2 changes from V1:
 *   - CTA: real wp:buttons > wp:button (was styled paragraph)
 *   - Internal links: real <a href> list under a heading (was comma-note paragraph)
 *   - Intro: adds className="wp-block-intro" for theme hook
 *   - Emergency: urgency bar, ordered process list, verified-proof-only section
 *   - Local: services-as-list, local proof section
 *
 * Safety rules enforced here:
 *   - H1 is WP post title — never in body content
 *   - No proof invented — sections are skipped when inputs are missing
 *   - No 24/7 / licensed / insured claims unless present in proofBlock.items
 *   - Schema stays valid JSON-LD
 */

import type { PageBriefArtifactPayload } from "@/lib/shared/executionArtifacts/schemas";
import type { DraftTemplateType, WordpressDraftPayload } from "./schemas";

// ------------------------------------------------------------------
// HTML helpers
// ------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ------------------------------------------------------------------
// Core block serializers
// ------------------------------------------------------------------

function wpParagraph(html: string, className?: string): string {
  const attrs = className ? ` {"className":"${className}"}` : "";
  const cls = className ? ` class="${escapeHtml(className)}"` : "";
  const escaped = escapeHtml(html);
  return `<!-- wp:paragraph${attrs} -->\n<p${cls}>${escaped}</p>\n<!-- /wp:paragraph -->`;
}

function wpHeading(text: string, level: 2 | 3 = 2): string {
  const escaped = escapeHtml(text);
  return `<!-- wp:heading {"level":${level}} -->\n<h${level}>${escaped}</h${level}>\n<!-- /wp:heading -->`;
}

function wpSeparator(): string {
  return `<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->`;
}

function wpListItems(items: string[]): string {
  const lis = items
    .filter((s) => s.trim())
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("\n");
  return `<!-- wp:list -->\n<ul class="wp-block-list">\n${lis}\n</ul>\n<!-- /wp:list -->`;
}

function wpOrderedListItems(items: string[]): string {
  const lis = items
    .filter((s) => s.trim())
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("\n");
  return `<!-- wp:list {"ordered":true} -->\n<ol class="wp-block-list">\n${lis}\n</ol>\n<!-- /wp:list -->`;
}

function wpHtmlBlock(raw: string): string {
  return `<!-- wp:html -->\n${raw}\n<!-- /wp:html -->`;
}

// wp:buttons > wp:button — real button block (V2 replacement for styled paragraph)
function wpButtonsBlock(
  primaryText: string,
  opts?: { color?: "primary" | "vivid-red"; fontSize?: "large" },
): string {
  const color = opts?.color ?? "primary";
  const sizeAttr = opts?.fontSize ? `,"fontSize":"${opts.fontSize}"` : "";
  const sizeClass = opts?.fontSize ? ` has-${opts.fontSize}-font-size` : "";
  const colorClass =
    color === "vivid-red"
      ? "has-white-color has-vivid-red-background-color"
      : "has-white-color has-primary-background-color";
  const btnAttrs =
    color === "vivid-red"
      ? `{"backgroundColor":"vivid-red","textColor":"white"${sizeAttr}}`
      : `{"backgroundColor":"primary","textColor":"white"${sizeAttr}}`;
  const escaped = escapeHtml(primaryText);

  return [
    `<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->`,
    `<div class="wp-block-buttons"><!-- wp:button ${btnAttrs} -->`,
    `<div class="wp-block-button"><a class="wp-block-button__link${sizeClass} ${colorClass} wp-element-button">${escaped}</a></div>`,
    `<!-- /wp:button --></div>`,
    `<!-- /wp:buttons -->`,
  ].join("\n");
}

// Internal links rendered as a heading + real anchor list
function wpInternalLinksSection(
  links: Array<{ anchorText: string; targetSlug: string }>,
): string {
  if (links.length === 0) return "";
  const items = links.map(
    (l) => `<li><a href="/${escapeHtml(l.targetSlug)}">${escapeHtml(l.anchorText)}</a></li>`,
  );
  return [
    wpHeading("Related pages", 2),
    `<!-- wp:list -->\n<ul class="wp-block-list">\n${items.join("\n")}\n</ul>\n<!-- /wp:list -->`,
  ].join("\n\n");
}

// Schema block — always valid JSON-LD
function wpSchemaBlock(schema: {
  type: string;
  suggestedFields: Record<string, string>;
  overrides?: Record<string, unknown>;
}): string {
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schema.type,
    ...schema.suggestedFields,
    ...schema.overrides,
  };
  const jsonLd = `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
  return wpHtmlBlock(jsonLd);
}

// FAQ section: h2 + h3/paragraph pairs
function wpFaqSection(faqBlock: Array<{ question: string; answer: string }>): string {
  if (faqBlock.length === 0) return "";
  const items = faqBlock.flatMap((f) => [
    wpHeading(f.question, 3),
    wpParagraph(f.answer),
  ]);
  return [wpHeading("Frequently asked questions", 2), ...items].join("\n\n");
}

// CTA section: button + optional secondary
function wpCtaSection(
  ctaBlock: { primary: string; secondary?: string | null; placement?: string },
  opts?: { color?: "primary" | "vivid-red"; fontSize?: "large" },
): string {
  const parts: string[] = [wpButtonsBlock(ctaBlock.primary, opts)];
  if (ctaBlock.secondary) {
    parts.push(wpParagraph(ctaBlock.secondary, "wp-block-cta-secondary"));
  }
  if (ctaBlock.placement) {
    parts.push(wpParagraph(ctaBlock.placement));
  }
  return parts.join("\n\n");
}

// ------------------------------------------------------------------
// Template type detection
// ------------------------------------------------------------------

const EMERGENCY_SIGNALS = [
  "emergency",
  "urgent",
  "same-day",
  "same day",
  "24/7",
  "24-7",
  "no heat",
  "no ac",
  "no air",
  "burst pipe",
  "flood",
  "spoed",   // Dutch: urgent
  "nood",    // Dutch: emergency
];

export function deriveTemplateType(payload: PageBriefArtifactPayload): DraftTemplateType {
  if (payload.pageType === "location_page") return "local_landing_page";

  // Emergency detection: H1 or operatorNotes contains urgency signal
  const h1Lower = payload.h1.toLowerCase();
  const notesLower = (payload.operatorNotes ?? "").toLowerCase();
  const isEmergency = EMERGENCY_SIGNALS.some(
    (s) => h1Lower.includes(s) || notesLower.includes(s),
  );
  if (isEmergency) return "emergency_service_page";

  return "service_page";
}

// ------------------------------------------------------------------
// Template 1 — Service Page
// ------------------------------------------------------------------

function renderServicePageTemplate(p: PageBriefArtifactPayload): string {
  const blocks: string[] = [];

  // 1. Problem / urgency intro
  if (p.introBlock) {
    blocks.push(wpParagraph(p.introBlock, "wp-block-intro"));
  }

  // 2. Service sections (heading + body per section)
  for (const section of p.serviceSections ?? []) {
    if (section.heading) blocks.push(wpHeading(section.heading, 2));
    if (section.body) blocks.push(wpParagraph(section.body));
  }

  // 3. Why choose us
  const proofItems = p.proofBlock?.items?.filter((i) => i.trim()) ?? [];
  if (proofItems.length > 0) {
    blocks.push(wpSeparator());
    blocks.push(wpHeading("Why choose us", 2));
    blocks.push(wpListItems(proofItems));
  }

  // 4. FAQ
  const faqSection = wpFaqSection(p.faqBlock ?? []);
  if (faqSection) {
    blocks.push(wpSeparator());
    blocks.push(faqSection);
  }

  // 5. CTA
  if (p.ctaBlock?.primary) {
    blocks.push(wpSeparator());
    blocks.push(wpCtaSection(p.ctaBlock));
  }

  // 6. Internal links
  const links = wpInternalLinksSection(p.internalLinkTargets ?? []);
  if (links) {
    blocks.push(links);
  }

  // 7. Schema
  if (p.schemaRecommendation?.type) {
    blocks.push(
      wpSchemaBlock({
        type: p.schemaRecommendation.type,
        suggestedFields: p.schemaRecommendation.suggestedFields,
      }),
    );
  }

  return blocks.join("\n\n");
}

// ------------------------------------------------------------------
// Template 2 — Local Landing Page
// ------------------------------------------------------------------

function renderLocalLandingPageTemplate(p: PageBriefArtifactPayload): string {
  const blocks: string[] = [];
  const location = p.targetLocation ?? "your area";

  // 1. Local area intro
  if (p.introBlock) {
    blocks.push(wpParagraph(p.introBlock, "wp-block-intro"));
  }

  // 2. Service sections — each as its own H2 + paragraph for crawlability
  for (const section of p.serviceSections ?? []) {
    if (section.heading) blocks.push(wpHeading(section.heading, 2));
    if (section.body) blocks.push(wpParagraph(section.body));
  }

  // 3. Local proof (only if proof items exist — never invent)
  const proofItems = p.proofBlock?.items?.filter((i) => i.trim()) ?? [];
  if (proofItems.length > 0) {
    blocks.push(wpSeparator());
    blocks.push(wpHeading(`Trusted by ${location} customers`, 2));
    blocks.push(wpListItems(proofItems));
  }

  // 4. FAQ
  const faqSection = wpFaqSection(p.faqBlock ?? []);
  if (faqSection) {
    blocks.push(wpSeparator());
    blocks.push(faqSection);
  }

  // 5. CTA
  if (p.ctaBlock?.primary) {
    blocks.push(wpSeparator());
    blocks.push(wpCtaSection(p.ctaBlock));
  }

  // 6. Internal links (esp. link to primary service page)
  const links = wpInternalLinksSection(p.internalLinkTargets ?? []);
  if (links) {
    blocks.push(links);
  }

  // 7. Schema — include areaServed override
  if (p.schemaRecommendation?.type) {
    blocks.push(
      wpSchemaBlock({
        type: p.schemaRecommendation.type,
        suggestedFields: p.schemaRecommendation.suggestedFields,
        overrides: p.targetLocation ? { areaServed: p.targetLocation } : {},
      }),
    );
  }

  return blocks.join("\n\n");
}

// ------------------------------------------------------------------
// Template 3 — Emergency / Urgent Service Page
// ------------------------------------------------------------------

function renderEmergencyServicePageTemplate(p: PageBriefArtifactPayload): string {
  const blocks: string[] = [];
  const service = p.targetService ?? "service";
  const location = p.targetLocation ?? "your area";

  // 1. Urgency bar — prominent styled paragraph, not an invented claim
  if (p.ctaBlock?.primary) {
    blocks.push(
      `<!-- wp:paragraph {"className":"wp-block-emergency-header"} -->\n<p class="wp-block-emergency-header">${escapeHtml(p.ctaBlock.primary)}</p>\n<!-- /wp:paragraph -->`,
    );
  }

  // 2. Intro (becomes "what is happening / why act now")
  if (p.introBlock) {
    blocks.push(wpParagraph(p.introBlock, "wp-block-intro"));
  }

  // 3. "What to do right now" — ordered steps derived from first service section
  //    Steps are generic and safe (no invented claims)
  const firstSection = (p.serviceSections ?? [])[0];
  blocks.push(wpHeading("What to do right now", 2));
  const doNowItems: string[] = [
    p.ctaBlock?.primary
      ? `Contact us — ${p.ctaBlock.primary}`
      : "Contact us immediately",
    "Describe the problem and your location",
    "We will confirm availability and arrive as quickly as possible",
  ];
  blocks.push(wpOrderedListItems(doNowItems));

  // 4. Emergency service explanation — second section or first section body
  const explanationSection = (p.serviceSections ?? [])[1] ?? firstSection;
  if (explanationSection) {
    blocks.push(wpHeading(`Our emergency ${service} service`, 2));
    if (explanationSection.body) blocks.push(wpParagraph(explanationSection.body));
  }

  // Additional service sections beyond [0] and [1]
  for (const section of (p.serviceSections ?? []).slice(2)) {
    if (section.heading) blocks.push(wpHeading(section.heading, 2));
    if (section.body) blocks.push(wpParagraph(section.body));
  }

  // 5. Verified availability — ONLY if proof items exist, never invented
  const proofItems = p.proofBlock?.items?.filter((i) => i.trim()) ?? [];
  if (proofItems.length > 0) {
    blocks.push(wpSeparator());
    blocks.push(wpHeading("Verified availability", 2));
    blocks.push(wpListItems(proofItems));
  }

  // 6. Areas served — use targetLocation only (no fabricated nearby areas)
  blocks.push(wpHeading(`Areas we serve for emergency calls`, 2));
  blocks.push(wpParagraph(`We respond to emergency calls in ${escapeHtml(location)} and surrounding areas.`));

  // 7. Emergency FAQ
  const faqSection = wpFaqSection(p.faqBlock ?? []);
  if (faqSection) {
    blocks.push(wpSeparator());
    blocks.push(faqSection);
  }

  // 8. Strong final CTA — red button for urgency
  if (p.ctaBlock?.primary) {
    blocks.push(wpSeparator());
    blocks.push(wpCtaSection(p.ctaBlock, { color: "vivid-red", fontSize: "large" }));
  }

  // 9. Internal links
  const links = wpInternalLinksSection(p.internalLinkTargets ?? []);
  if (links) {
    blocks.push(links);
  }

  // 10. Schema
  if (p.schemaRecommendation?.type) {
    blocks.push(
      wpSchemaBlock({
        type: p.schemaRecommendation.type,
        suggestedFields: p.schemaRecommendation.suggestedFields,
      }),
    );
  }

  return blocks.join("\n\n");
}

// ------------------------------------------------------------------
// Main entry point
// ------------------------------------------------------------------

export function pageBriefToGutenbergContent(
  payload: PageBriefArtifactPayload,
): WordpressDraftPayload {
  const templateType = deriveTemplateType(payload);

  let content: string;
  switch (templateType) {
    case "local_landing_page":
      content = renderLocalLandingPageTemplate(payload);
      break;
    case "emergency_service_page":
      content = renderEmergencyServicePageTemplate(payload);
      break;
    case "service_page":
    default:
      content = renderServicePageTemplate(payload);
      break;
  }

  return {
    title: payload.h1,
    slug: payload.targetSlug,
    content,
    excerpt: payload.metaDescription,
    metaTitle: payload.metaTitle,
    metaDescription: payload.metaDescription,
    pageType: payload.pageType,
    templateType,
    targetService: payload.targetService,
    targetLocation: payload.targetLocation,
  };
}
