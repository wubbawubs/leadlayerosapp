/**
 * DataForSEO SERP client (Ticket 4) — server-only.
 *
 * Calls /v3/serp/google/organic/live/advanced and returns a tolerant,
 * normalized result. Single-cluster failures throw — orchestrator catches
 * them and marks the scan as partial.
 *
 * Rules:
 *  - Never invent SERP/local-pack data.
 *  - Tolerate missing/nested/unexpected fields in DataForSEO responses.
 *  - Store raw response on each row for traceability.
 */

import { dataForSeoBasicAuthHeader } from "./dataForSeoAuth.server";

const ENDPOINT =
  "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

export interface DataForSeoSerpInput {
  keyword: string;
  /** DataForSEO location string, e.g. "Dallas,Texas,United States". */
  locationName?: string | null;
  languageCode?: string | null;
  /** Top-N organic results to return (default 3). */
  depth?: number;
}

export interface SerpOrganicResult {
  rank: number | null;
  url: string | null;
  domain: string | null;
  title: string | null;
  snippet: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>;
}

export interface SerpLocalPackResult {
  rank: number | null;
  name: string | null;
  rating: number | null;
  reviewCount: number | null;
  domain: string | null;
  url: string | null;
  category: string | null;
  address: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>;
}

export interface SerpResult {
  keyword: string;
  locationName: string | null;
  languageCode: string | null;
  organic: SerpOrganicResult[];
  localPack: SerpLocalPackResult[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>;
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim().length > 0) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickInt(...vals: unknown[]): number | null {
  const n = pickNumber(...vals);
  return n == null ? null : Math.round(n);
}

function extractDomain(urlOrDomain: string | null): string | null {
  if (!urlOrDomain) return null;
  try {
    const u = new URL(
      urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`,
    );
    return u.hostname.replace(/^www\./, "");
  } catch {
    return urlOrDomain.toLowerCase().replace(/^www\./, "");
  }
}

export async function fetchSerpForKeyword(
  input: DataForSeoSerpInput,
): Promise<SerpResult> {
  const keyword = input.keyword?.trim();
  if (!keyword) {
    throw new Error("fetchSerpForKeyword: keyword is required");
  }
  const depth = Math.max(3, Math.min(20, input.depth ?? 10));
  const body = [
    {
      keyword,
      language_code: input.languageCode ?? "en",
      location_name: input.locationName ?? "United States",
      depth,
      device: "desktop",
    },
  ];

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: dataForSeoBasicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `DataForSEO SERP error ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json().catch(() => ({}));

  const task = json?.tasks?.[0];
  if (task && typeof task.status_code === "number" && task.status_code >= 40000) {
    throw new Error(
      `DataForSEO SERP task error ${task.status_code}: ${task.status_message ?? "unknown"}`,
    );
  }

  const result = task?.result?.[0] ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(result?.items) ? result.items : [];

  const organic: SerpOrganicResult[] = [];
  const localPack: SerpLocalPackResult[] = [];

  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const type = String(it.type ?? "").toLowerCase();

    if (type === "organic") {
      if (organic.length >= 3) continue;
      const url = pickString(it.url, it.relative_url);
      organic.push({
        rank: pickInt(it.rank_absolute, it.rank_group),
        url,
        domain: extractDomain(pickString(it.domain) ?? url),
        title: pickString(it.title),
        snippet: pickString(it.description, it.snippet),
        raw: it,
      });
    } else if (type === "local_pack" || type === "map") {
      // Some payloads return individual local_pack items; others nest items.
      const packItems = Array.isArray(it.items) ? it.items : [it];
      for (const pi of packItems) {
        if (!pi || typeof pi !== "object") continue;
        const url = pickString(pi.url, pi.website, pi.domain_url);
        localPack.push({
          rank: pickInt(pi.rank_absolute, pi.rank_group, it.rank_absolute),
          name: pickString(pi.title, pi.name),
          rating: pickNumber(
            pi.rating?.value,
            pi.rating_value,
            pi.rating,
          ),
          reviewCount: pickInt(
            pi.rating?.votes_count,
            pi.rating?.reviews_count,
            pi.reviews_count,
            pi.rating_count,
          ),
          domain: extractDomain(pickString(pi.domain) ?? url),
          url,
          category: pickString(
            pi.category,
            Array.isArray(pi.categories) ? pi.categories[0] : null,
          ),
          address: pickString(pi.address, pi.address_info?.address),
          raw: pi,
        });
      }
    }
  }

  return {
    keyword,
    locationName: input.locationName ?? null,
    languageCode: input.languageCode ?? "en",
    organic,
    localPack,
    raw: result,
  };
}
