/**
 * Tone corpus — sitemap discovery, HTML fetching, CTA & claim regex extraction.
 * Server-only. No LLM calls in this module: pure observation, so the synthesis
 * step in analyzer.server.ts works from real evidence instead of model fantasy.
 */

const FETCH_TIMEOUT_MS = 8000;
const UA = "LeadLayerBot/1.0 (+tone-analyzer)";

export type SampleSource =
  | "homepage"
  | "service"
  | "blog"
  | "about"
  | "contact"
  | "manual_paste"
  | "approved_proposal"
  | "other";

export interface UrlPick {
  url: string;
  source_type: SampleSource;
}

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: ctl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchHtml(url: string): Promise<string | null> {
  return fetchText(url);
}

// ---------- Sitemap discovery ----------

function parseLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

export async function discoverSitemapUrls(origin: string, max = 60): Promise<string[]> {
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/wp-sitemap.xml`,
  ];
  const seen = new Set<string>();
  for (const c of candidates) {
    const xml = await fetchText(c, 5000);
    if (!xml) continue;
    const locs = parseLocs(xml);
    // If it's a sitemap index (entries point to other sitemap.xml), expand one level.
    const sub: string[] = [];
    for (const l of locs) {
      if (/\.xml(\?|$)/i.test(l)) {
        const childXml = await fetchText(l, 5000);
        if (childXml) sub.push(...parseLocs(childXml));
      } else {
        sub.push(l);
      }
      if (seen.size + sub.length >= max * 2) break;
    }
    for (const u of sub) {
      if (seen.size >= max) break;
      seen.add(u);
    }
    if (seen.size > 0) break;
  }
  return [...seen];
}

// ---------- URL classification & diversity pick ----------

export function classifyUrl(url: string): SampleSource {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (p === "/" || p === "") return "homepage";
    if (/blog|nieuws|news|artikel|insights?/.test(p)) return "blog";
    if (/about|over[-_/]ons|team|company|bedrijf/.test(p)) return "about";
    if (/contact/.test(p)) return "contact";
    if (/diensten|service|product|oplossing|pricing|tarieven|prijzen|werkwijze|wat-we-doen|case|portfolio|faq|veelgestelde/.test(p)) {
      return "service";
    }
  } catch {
    /* ignore */
  }
  return "other";
}

/**
 * Diversity-aware selection from a flat URL list.
 * Bucket caps are larger than V1 to give the synthesis step more evidence.
 */
export function pickDiverse(urls: string[], maxTotal = 18): UrlPick[] {
  const caps: Record<SampleSource, number> = {
    homepage: 1,
    service: 6,
    blog: 4,
    about: 2,
    contact: 1,
    other: 4,
    manual_paste: 0,
    approved_proposal: 0,
  };
  const picked: UrlPick[] = [];
  const seenUrls = new Set<string>();
  for (const u of urls) {
    if (seenUrls.has(u)) continue;
    seenUrls.add(u);
    const t = classifyUrl(u);
    const have = picked.filter((p) => p.source_type === t).length;
    if (have >= (caps[t] ?? 0)) continue;
    picked.push({ url: u, source_type: t });
    if (picked.length >= maxTotal) break;
  }
  return picked;
}

// ---------- HTML → text + CTA + claim extraction ----------

const VOID_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&euro;/g, "€");
}

function stripTagsKeepText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = decodeEntities(noScript.replace(/<[^>]+>/g, " "))
    .replace(VOID_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

export function extractVisibleText(html: string, max = 6000): string {
  return stripTagsKeepText(html).slice(0, max);
}

/**
 * Extract CTA candidates: anchor + button inner text, kept short (<= 60 chars).
 * Filters out navigation noise like "home", "login", language codes.
 */
const NAV_NOISE = new Set([
  "home", "login", "inloggen", "menu", "search", "zoeken", "nl", "en", "fr", "de",
  "account", "instellingen", "settings", "submit", "verzenden", "lees meer", "more", "info",
  "subscribe", "subscribed", "blog", "about", "faqs", "authors", "events", "shop", "contact page",
]);

const CTA_ACTION_RE = /^(book|schedule|request|call|get|start|contact|download|reserve|apply|order|buy|shop|try|join|sign up|maak|plan|vraag|bel|neem contact|start|download|bestel|koop)\b/i;
const CTA_QUESTION_RE = /\b(ready to|get help|need help|urgent)\b/i;
const SERVICE_LABEL_RE = /\b(services?|repair|maintenance|hvac|ac|heating|air conditioning|about|contact|faq|blog)\b/i;

export function isActionCta(text: string): boolean {
  const clean = text.replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 3 || clean.length > 60) return false;
  const lc = clean.toLowerCase();
  if (NAV_NOISE.has(lc)) return false;
  if (/^https?:\/\//i.test(clean) || /@/.test(clean)) return false;
  if (CTA_ACTION_RE.test(clean) || CTA_QUESTION_RE.test(clean)) return true;
  return false;
}

export function extractCtas(html: string): string[] {
  const out = new Map<string, number>();
  // Anchor + button text content
  const re = /<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = decodeEntities(m[1].replace(/<[^>]+>/g, " "))
      .replace(VOID_CHARS, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) continue;
    if (raw.length < 3 || raw.length > 60) continue;
    if (/^[#›»→•·\-—]+$/.test(raw)) continue;
    const lc = raw.toLowerCase();
    if (NAV_NOISE.has(lc)) continue;
    // Skip pure URLs / emails
    if (/^https?:\/\//i.test(raw) || /@/.test(raw)) continue;
    // Keep actual action CTAs, not navigation labels or service-category links.
    if (!isActionCta(raw)) continue;
    if (SERVICE_LABEL_RE.test(raw) && !CTA_ACTION_RE.test(raw) && !CTA_QUESTION_RE.test(raw)) continue;
    out.set(raw, (out.get(raw) ?? 0) + 1);
  }
  // Sort by frequency desc, return up to 30 unique
  return [...out.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([t]) => t);
}

/**
 * Extract claim-bearing sentences. We look for sentences containing modal /
 * promise / outcome verbs that typically carry a claim. The synthesis step
 * decides safety; we just supply the raw evidence.
 */
const CLAIM_PATTERNS = [
  /\bwe\s+(helpen|maken|geven|bieden|zorgen|leveren|bouwen|verbeteren|verhogen|realiseren|garanderen)\b/i,
  /\bje\s+(krijgt|ontvangt|behaalt|verdient|wint|bespaart)\b/i,
  /\b(gegarandeerd|gegarandeerde|bewezen|altijd|nooit|100%|de\s+nummer\s+1|marktleider)\b/i,
  /\b(meer|hogere|betere|snellere|lagere)\s+\w+/i,
  /\bbinnen\s+\d+\s+(dagen|weken|maanden)\b/i,
];

export function extractClaimSentences(plainText: string, max = 40): string[] {
  const sentences = plainText
    .split(/(?<=[.!?])\s+(?=[A-ZÉÊÖÜÄÁÍÓÚ])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 240);
  const matched: string[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    if (matched.length >= max) break;
    for (const re of CLAIM_PATTERNS) {
      if (re.test(s)) {
        const k = s.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          matched.push(s);
        }
        break;
      }
    }
  }
  return matched;
}

/**
 * Headline candidates: H1/H2/H3 inner text. Useful as "real example sentences"
 * for the synthesis step.
 */
export function extractHeadlines(html: string, max = 25): string[] {
  const out: string[] = [];
  const re = /<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = decodeEntities(m[2].replace(/<[^>]+>/g, " "))
      .replace(VOID_CHARS, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (t.length >= 4 && t.length <= 160) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * One-shot per-URL observation bundle used by the analyzer.
 */
export interface PageObservation {
  url: string;
  source_type: SampleSource;
  text: string; // visible text, capped
  ctas: string[];
  claimSentences: string[];
  headlines: string[];
}

export async function observePage(url: string, source_type: SampleSource): Promise<PageObservation | null> {
  const html = await fetchHtml(url);
  if (!html) return null;
  const text = extractVisibleText(html);
  if (text.length < 80) return null;
  return {
    url,
    source_type,
    text,
    ctas: extractCtas(html),
    claimSentences: extractClaimSentences(text),
    headlines: extractHeadlines(html),
  };
}

/** Aggregate dedupe across all observations, sorted by frequency. */
export function aggregateLists(observations: PageObservation[]) {
  const tally = (key: "ctas" | "claimSentences" | "headlines") => {
    const map = new Map<string, number>();
    for (const o of observations) {
      for (const v of o[key]) {
        const k = v.trim();
        if (!k) continue;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, count]) => ({ text: t, count }));
  };
  return {
    ctas: tally("ctas").filter((c) => isActionCta(c.text)).slice(0, 25),
    claimSentences: tally("claimSentences").slice(0, 30),
    headlines: tally("headlines").slice(0, 25),
  };
}
