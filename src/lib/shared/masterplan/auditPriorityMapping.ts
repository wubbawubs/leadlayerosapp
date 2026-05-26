/**
 * Audit Issue → Masterplan Priority Mapping.
 *
 * Pure interpretation layer. The audit engine stays objective (it only
 * reports facts). This module decides how serious each issue is in the
 * context of a Lead Growth OS: things that block conversion or kill
 * service-page autoriteit are high; cosmetics are low.
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type Impact = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";

export interface IssuePriority {
  code: string;
  /** Friendly label for the operator UI. */
  label: string;
  severity: Severity;
  /** Masterplan priority is derived from severity + impact. */
  priority: "high" | "medium" | "low";
  impact: Impact;
  effort: Effort;
  /** Why this matters for lead growth (not generic SEO). */
  rationale: string;
  /** Which masterplan category this belongs to. */
  category: "conversion" | "indexability" | "content" | "structure" | "performance" | "trust";
}

const TABLE: Record<string, Omit<IssuePriority, "code">> = {
  // -- Conversion blockers ---------------------------------------------------
  missing_cta: {
    label: "Geen CTA op pagina",
    severity: "critical",
    priority: "high",
    impact: "high",
    effort: "low",
    rationale: "Zonder duidelijke CTA verliest de pagina elke lead, ongeacht traffic.",
    category: "conversion",
  },
  broken_form: {
    label: "Formulier werkt niet",
    severity: "critical",
    priority: "high",
    impact: "high",
    effort: "medium",
    rationale: "Een kapot formulier kost direct meetbare leads.",
    category: "conversion",
  },
  missing_phone: {
    label: "Telefoonnummer ontbreekt",
    severity: "high",
    priority: "high",
    impact: "high",
    effort: "low",
    rationale: "Voor lokale services is bellen de snelste conversie.",
    category: "conversion",
  },

  // -- Indexability ----------------------------------------------------------
  noindex: {
    label: "Pagina staat op noindex",
    severity: "critical",
    priority: "high",
    impact: "high",
    effort: "low",
    rationale: "Noindex blokkeert organisch verkeer volledig.",
    category: "indexability",
  },
  blocked_by_robots: {
    label: "Geblokkeerd in robots.txt",
    severity: "critical",
    priority: "high",
    impact: "high",
    effort: "low",
    rationale: "Crawlers kunnen pagina niet zien — geen ranking mogelijk.",
    category: "indexability",
  },
  missing_canonical: {
    label: "Geen canonical tag",
    severity: "medium",
    priority: "medium",
    impact: "medium",
    effort: "low",
    rationale: "Dubbele content-risico — verdunt ranking signal.",
    category: "indexability",
  },
  broken_link: {
    label: "Broken link",
    severity: "high",
    priority: "medium",
    impact: "medium",
    effort: "low",
    rationale: "Verspilt crawl budget en verstoort interne link-autoriteit.",
    category: "structure",
  },

  // -- Content fundamentals --------------------------------------------------
  missing_h1: {
    label: "H1 ontbreekt",
    severity: "high",
    priority: "high",
    impact: "high",
    effort: "low",
    rationale: "H1 is het sterkste content signal — zonder is topic onduidelijk.",
    category: "content",
  },
  duplicate_h1: {
    label: "Meerdere H1's",
    severity: "medium",
    priority: "medium",
    impact: "medium",
    effort: "low",
    rationale: "Verwart ranking signal van primair onderwerp.",
    category: "content",
  },
  missing_title: {
    label: "Title tag ontbreekt",
    severity: "critical",
    priority: "high",
    impact: "high",
    effort: "low",
    rationale: "Geen title = geen CTR in SERP, ook als pagina rankt.",
    category: "content",
  },
  duplicate_title: {
    label: "Dubbele title",
    severity: "high",
    priority: "medium",
    impact: "medium",
    effort: "low",
    rationale: "Cannibalisme tussen pagina's verlaagt ranking-kans van beide.",
    category: "content",
  },
  missing_meta_description: {
    label: "Meta description ontbreekt",
    severity: "medium",
    priority: "medium",
    impact: "medium",
    effort: "low",
    rationale: "Auto-snippet pakt vaak verkeerde tekst — slechte CTR in SERP.",
    category: "content",
  },
  short_meta_description: {
    label: "Meta description te kort",
    severity: "low",
    priority: "low",
    impact: "low",
    effort: "low",
    rationale: "Mist kans om voor de klik te overtuigen.",
    category: "content",
  },
  thin_content: {
    label: "Te weinig content",
    severity: "high",
    priority: "high",
    impact: "high",
    effort: "high",
    rationale: "Dunne pagina's ranken zelden voor commerciële intent.",
    category: "content",
  },
  low_word_count: {
    label: "Lage word count",
    severity: "medium",
    priority: "medium",
    impact: "medium",
    effort: "medium",
    rationale: "Onder ~300 woorden is intent moeilijk te bevredigen.",
    category: "content",
  },
  missing_alt: {
    label: "Afbeeldingen zonder alt",
    severity: "low",
    priority: "low",
    impact: "low",
    effort: "low",
    rationale: "Toegankelijkheid + image search — kleine maar makkelijke win.",
    category: "content",
  },

  // -- Structure / Schema ----------------------------------------------------
  missing_schema: {
    label: "Geen schema markup",
    severity: "medium",
    priority: "medium",
    impact: "medium",
    effort: "medium",
    rationale: "Mist rich-result kansen (FAQ, LocalBusiness, Review).",
    category: "structure",
  },
  no_internal_links: {
    label: "Geen interne links",
    severity: "high",
    priority: "high",
    impact: "high",
    effort: "low",
    rationale: "Isolated pagina krijgt geen autoriteit via interne linking.",
    category: "structure",
  },
  orphan_page: {
    label: "Orphan page",
    severity: "high",
    priority: "medium",
    impact: "medium",
    effort: "low",
    rationale: "Niet bereikbaar via interne navigatie — verspilde content.",
    category: "structure",
  },

  // -- Performance -----------------------------------------------------------
  slow_page: {
    label: "Trage pagina",
    severity: "high",
    priority: "high",
    impact: "high",
    effort: "high",
    rationale: "Mobile bouncerate stijgt drastisch boven 3s laadtijd.",
    category: "performance",
  },
  large_images: {
    label: "Niet-geoptimaliseerde afbeeldingen",
    severity: "medium",
    priority: "medium",
    impact: "medium",
    effort: "low",
    rationale: "Snelle win op page speed via WebP + dimensies.",
    category: "performance",
  },

  // -- Trust -----------------------------------------------------------------
  no_https: {
    label: "Geen HTTPS",
    severity: "critical",
    priority: "high",
    impact: "high",
    effort: "medium",
    rationale: "Browser warning kost direct vertrouwen en conversie.",
    category: "trust",
  },
  mixed_content: {
    label: "Mixed content",
    severity: "high",
    priority: "medium",
    impact: "medium",
    effort: "medium",
    rationale: "Browser kan content blokkeren — onbetrouwbare ervaring.",
    category: "trust",
  },
};

const DEFAULT: Omit<IssuePriority, "code"> = {
  label: "Audit issue",
  severity: "medium",
  priority: "medium",
  impact: "medium",
  effort: "medium",
  rationale: "Audit-signaal — relevantie voor groei wordt na review bepaald.",
  category: "structure",
};

export function mapAuditIssueToPriority(code: string): IssuePriority {
  const key = code.toLowerCase().trim();
  const hit = TABLE[key];
  if (hit) return { code, ...hit };

  // Heuristic fallback: substring matching for issue families
  for (const [k, v] of Object.entries(TABLE)) {
    if (key.includes(k) || k.includes(key)) return { code, ...v };
  }
  return { code, ...DEFAULT };
}

/**
 * Rank a set of issues by priority then severity. Stable for equal-rank items.
 */
export function rankAuditIssues(codes: string[]): IssuePriority[] {
  const rank: Record<IssuePriority["priority"], number> = { high: 0, medium: 1, low: 2 };
  const sevRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return codes
    .map(mapAuditIssueToPriority)
    .sort((a, b) => {
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      return sevRank[a.severity] - sevRank[b.severity];
    });
}

/**
 * Group issues by category. Useful when the masterplan wants to consolidate
 * multiple "content" fixes into a single editorial sprint instead of 10
 * separate website_fix items.
 */
export function groupAuditIssuesByCategory(
  codes: string[],
): Record<IssuePriority["category"], IssuePriority[]> {
  const out: Record<string, IssuePriority[]> = {};
  for (const issue of codes.map(mapAuditIssueToPriority)) {
    if (!out[issue.category]) out[issue.category] = [];
    out[issue.category].push(issue);
  }
  return out as Record<IssuePriority["category"], IssuePriority[]>;
}
