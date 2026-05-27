/**
 * Market Intelligence — Keyword seed generation (Ticket 3).
 *
 * Pure function. No DB, no API, no randomness. Given a list of services and
 * locations (plus optional vertical / country / language hints) it returns a
 * deterministic, deduplicated list of local search seeds suitable for
 * DataForSEO volume lookup.
 *
 * Rules:
 *  - Never invent volume / metrics — only the keyword strings.
 *  - Always include a generic "{service} near me" seed per service.
 *  - Emergency variants are only added for services flagged as emergency
 *    (heuristic: contains "emergency", "repair", "urgent" or "no heat/cool").
 *  - Caps total seeds at `maxKeywords` (default 100) using a stable
 *    deterministic ordering — services first, then locations, then variants.
 *  - Each seed carries its originating service + location for clustering.
 *
 * See: docs/DATAFORSEO_MARKET_SCAN_V1.md
 */

export interface KeywordSeed {
  keyword: string;
  service: string;
  location: string | null;
}

export interface GenerateMarketKeywordSeedsInput {
  services: string[];
  locations: string[];
  vertical?: string | null;
  country?: string | null;
  language?: string | null;
  maxKeywords?: number;
}

export interface GenerateMarketKeywordSeedsResult {
  seeds: KeywordSeed[];
  totalGenerated: number;
  totalKept: number;
  skipped: number;
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  US: "us",
};

function cleanLower(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Try to extract a US-style "City, ST" → ("city", "tx"). Returns city + state code (lowercased).
 */
function splitCityState(location: string): { city: string; state: string | null } {
  const trimmed = location.trim();
  const match = trimmed.match(/^(.+?)[,\s]+([A-Za-z]{2})$/);
  if (match) {
    return { city: cleanLower(match[1]), state: match[2].toLowerCase() };
  }
  return { city: cleanLower(trimmed), state: null };
}

function isEmergencyService(service: string): boolean {
  const s = service.toLowerCase();
  return (
    s.includes("emergency") ||
    s.includes("repair") ||
    s.includes("urgent") ||
    s.includes("no heat") ||
    s.includes("no cool") ||
    s.includes("burst") ||
    s.includes("leak")
  );
}

export function generateMarketKeywordSeeds(
  input: GenerateMarketKeywordSeedsInput,
): GenerateMarketKeywordSeedsResult {
  const services = (input.services ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => !!s);
  const locations = (input.locations ?? [])
    .map((l) => l?.trim())
    .filter((l): l is string => !!l);
  const maxKeywords = Math.max(1, Math.min(500, input.maxKeywords ?? 100));

  if (services.length === 0) {
    return { seeds: [], totalGenerated: 0, totalKept: 0, skipped: 0 };
  }

  const stateCountryHint =
    input.country && STATE_ABBREVIATIONS[input.country.toUpperCase()] ? "us" : null;

  // Build candidates with a stable priority order:
  //  1. "{service} {city}"
  //  2. "{service} near me" (location=null)
  //  3. "{service} {city} {state}"
  //  4. "{service} company {city}"
  //  5. "{service} contractor {city}"
  //  6. "emergency {service} {city}" (if emergency)
  //  7. "same day {service} {city}" (if emergency)
  //  8. "{service}" (bare, location=null) — only if locations.length === 0

  const candidates: KeywordSeed[] = [];
  const seen = new Set<string>();

  function push(seed: KeywordSeed) {
    const key = seed.keyword.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(seed);
  }

  for (const service of services) {
    const svcLower = cleanLower(service);
    if (!svcLower) continue;

    if (locations.length === 0) {
      push({ keyword: `${svcLower} near me`, service, location: null });
      push({ keyword: svcLower, service, location: null });
      continue;
    }

    const emergency = isEmergencyService(service);

    // Pass 1: per-location "{service} {city}"
    for (const location of locations) {
      const { city } = splitCityState(location);
      if (!city) continue;
      push({ keyword: `${svcLower} ${city}`, service, location });
    }
    // Generic "near me"
    push({ keyword: `${svcLower} near me`, service, location: null });

    // Pass 2: city + state
    for (const location of locations) {
      const { city, state } = splitCityState(location);
      if (!city) continue;
      const stateCode = state ?? stateCountryHint;
      if (!stateCode) continue;
      push({ keyword: `${svcLower} ${city} ${stateCode}`, service, location });
    }

    // Pass 3: company / contractor variants
    for (const location of locations) {
      const { city } = splitCityState(location);
      if (!city) continue;
      push({ keyword: `${svcLower} company ${city}`, service, location });
      push({ keyword: `${svcLower} contractor ${city}`, service, location });
    }

    // Pass 4: emergency / same-day variants
    if (emergency) {
      for (const location of locations) {
        const { city } = splitCityState(location);
        if (!city) continue;
        push({ keyword: `emergency ${svcLower} ${city}`, service, location });
        push({ keyword: `same day ${svcLower} ${city}`, service, location });
      }
    }
  }

  const totalGenerated = candidates.length;
  const kept = candidates.slice(0, maxKeywords);
  return {
    seeds: kept,
    totalGenerated,
    totalKept: kept.length,
    skipped: Math.max(0, totalGenerated - kept.length),
  };
}
