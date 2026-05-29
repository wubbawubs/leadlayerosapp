/**
 * Gutenberg content transformer — server-only.
 *
 * Converts a PageBriefArtifactPayload into WordPress block editor content.
 *
 * V1 approach: generate Gutenberg-compatible serialized block HTML.
 * Each block is wrapped in the standard <!-- wp:block --> comment markers
 * so WordPress parses them correctly in the block editor.
 *
 * Supported blocks: core/heading, core/paragraph, core/list, core/buttons,
 * core/html (JSON-LD schema), core/separator.
 *
 * The h1 becomes the WP post title — it is NOT duplicated in the content body.
 */

import type { PageBriefArtifactPayload } from "@/lib/shared/executionArtifacts/schemas";
import type { WordpressDraftPayload } from "./schemas";

// ------------------------------------------------------------------
// Block serializers
// ------------------------------------------------------------------

function wpParagraph(html: string): string {
  const escaped = escapeHtml(html);
  return `<!-- wp:paragraph -->\n<p>${escaped}</p>\n<!-- /wp:paragraph -->`;
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

function wpHtmlBlock(raw: string): string {
  return `<!-- wp:html -->\n${raw}\n<!-- /wp:html -->`;
}

function wpButtonParagraph(primaryCta: string, secondaryCta: string | null | undefined): string {
  // V1: render CTAs as a styled paragraph rather than wp:buttons
  // (avoids needing innerBlocks serialization which is complex)
  let content = `<strong>${escapeHtml(primaryCta)}</strong>`;
  if (secondaryCta) content += ` &nbsp;·&nbsp; ${escapeHtml(secondaryCta)}`;
  return `<!-- wp:paragraph {"className":"wp-block-cta"} -->\n<p class="wp-block-cta">${content}</p>\n<!-- /wp:paragraph -->`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ------------------------------------------------------------------
// Main transformer
// ------------------------------------------------------------------

export function pageBriefToGutenbergContent(
  payload: PageBriefArtifactPayload,
): WordpressDraftPayload {
  const blocks: string[] = [];

  // Intro block
  if (payload.introBlock) {
    blocks.push(wpParagraph(payload.introBlock));
  }

  // Service sections
  for (const section of payload.serviceSections ?? []) {
    if (section.heading) blocks.push(wpHeading(section.heading, 2));
    if (section.body) blocks.push(wpParagraph(section.body));
  }

  // Proof block
  if ((payload.proofBlock?.items ?? []).length > 0) {
    blocks.push(wpSeparator());
    blocks.push(wpHeading("Why choose us", 2));
    blocks.push(wpListItems(payload.proofBlock.items));
  }

  // FAQ block
  if ((payload.faqBlock ?? []).length > 0) {
    blocks.push(wpSeparator());
    blocks.push(wpHeading("Frequently asked questions", 2));
    for (const faq of payload.faqBlock) {
      blocks.push(wpHeading(faq.question, 3));
      blocks.push(wpParagraph(faq.answer));
    }
  }

  // CTA block
  if (payload.ctaBlock?.primary) {
    blocks.push(wpSeparator());
    blocks.push(wpButtonParagraph(payload.ctaBlock.primary, payload.ctaBlock.secondary));
    if (payload.ctaBlock.placement) {
      blocks.push(wpParagraph(payload.ctaBlock.placement));
    }
  }

  // Internal link suggestions (as a paragraph note — operator can adjust)
  if ((payload.internalLinkTargets ?? []).length > 0) {
    const linkNotes = payload.internalLinkTargets
      .map((l) => `${l.anchorText} → /${l.targetSlug}`)
      .join(", ");
    blocks.push(wpParagraph(`Related pages: ${linkNotes}`));
  }

  // Schema JSON-LD (injected via HTML block so it lands in page source)
  if (payload.schemaRecommendation?.type) {
    const schemaObj: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": payload.schemaRecommendation.type,
      ...payload.schemaRecommendation.suggestedFields,
    };
    const jsonLd = `<script type="application/ld+json">\n${JSON.stringify(schemaObj, null, 2)}\n</script>`;
    blocks.push(wpHtmlBlock(jsonLd));
  }

  const content = blocks.join("\n\n");

  return {
    title: payload.h1,
    slug: payload.targetSlug,
    content,
    excerpt: payload.metaDescription,
    metaTitle: payload.metaTitle,
    metaDescription: payload.metaDescription,
    pageType: payload.pageType,
    targetService: payload.targetService,
    targetLocation: payload.targetLocation,
  };
}
