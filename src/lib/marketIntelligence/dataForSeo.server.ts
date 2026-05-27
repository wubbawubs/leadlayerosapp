/**
 * DataForSEO client (Ticket 3) — server-only.
 *
 * Thin wrapper around DataForSEO's Google Ads search-volume endpoint.
 * No retries, no caching. Designed to be called from a server function,
 * not from the browser. Credentials are read from process.env inside the
 * function so they're never bundled into the client.
 *
 * Endpoint:
 *   POST https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live
 *
 * Authentication: HTTP Basic with DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD.
 *
 * Failure model:
 *  - If credentials are missing → throws "DataForSEO credentials are not configured".
 *  - If the API call fails → throws an Error with a non-sensitive message.
 *  - If a single keyword has no metrics → returned with volume=null (never invented).
 *
 * Rules:
 *  - Never log credentials.
 *  - Never invent metrics. Missing volume / competition → null.
 *  - Keep the original API row in `raw` for traceability.
 */

export interface DataForSeoMetricsInput {
  keywords: string[];
  /** DataForSEO location string, e.g. "United States" or "Dallas,Texas,United States". */
  locationName?: string | null;
  /** DataForSEO language code, e.g. "en". */
  languageCode?: string | null;
}

export interface DataForSeoKeywordMetric {
  keyword: string;
  volume: number | null;
  competition: number | null;
  cpc: number | null;
  difficulty: number | null;
  source: "dataforseo";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>;
}

const ENDPOINT =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";

function basicAuthHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error(
      "DataForSEO credentials are not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD).",
    );
  }
  const token = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Normalise the DataForSEO "competition" field, which is sometimes a string
 * ("LOW" / "MEDIUM" / "HIGH") and sometimes a number 0..1 via `competition_index`.
 */
function normaliseCompetition(row: Record<string, unknown>): number | null {
  if (typeof row.competition_index === "number" && Number.isFinite(row.competition_index)) {
    // competition_index is 0..100 in some plans.
    return Math.max(0, Math.min(1, row.competition_index / 100));
  }
  if (typeof row.competition === "number" && Number.isFinite(row.competition)) {
    return Math.max(0, Math.min(1, row.competition));
  }
  if (typeof row.competition === "string") {
    switch (row.competition.toUpperCase()) {
      case "LOW":
        return 0.2;
      case "MEDIUM":
        return 0.5;
      case "HIGH":
        return 0.85;
      default:
        return null;
    }
  }
  return null;
}

export async function fetchKeywordMetricsForMarket(
  input: DataForSeoMetricsInput,
): Promise<DataForSeoKeywordMetric[]> {
  const cleaned = Array.from(
    new Set(
      (input.keywords ?? [])
        .map((k) => (typeof k === "string" ? k.trim() : ""))
        .filter((k) => k.length > 0),
    ),
  );

  if (cleaned.length === 0) return [];

  const body = [
    {
      keywords: cleaned,
      location_name: input.locationName ?? "United States",
      language_code: input.languageCode ?? "en",
      search_partners: false,
    },
  ];

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new Error(`DataForSEO request failed: ${msg}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `DataForSEO HTTP ${response.status}: ${text.slice(0, 300) || response.statusText}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new Error("DataForSEO returned an invalid response body.");
  }
  if (payload.status_code && payload.status_code >= 40000) {
    throw new Error(
      `DataForSEO error ${payload.status_code}: ${String(payload.status_message ?? "unknown")}`,
    );
  }

  const task = Array.isArray(payload.tasks) ? payload.tasks[0] : null;
  if (task?.status_code && task.status_code >= 40000) {
    throw new Error(
      `DataForSEO task error ${task.status_code}: ${String(task.status_message ?? "unknown")}`,
    );
  }
  const result = Array.isArray(task?.result) ? task.result : [];

  // Build a lookup keyed by the keyword DataForSEO echoes back.
  const byKeyword = new Map<string, Record<string, unknown>>();
  for (const row of result) {
    if (row && typeof row === "object" && typeof row.keyword === "string") {
      byKeyword.set(row.keyword.toLowerCase(), row);
    }
  }

  // Preserve input order; never invent metrics for missing keywords.
  return cleaned.map<DataForSeoKeywordMetric>((keyword) => {
    const row = byKeyword.get(keyword.toLowerCase()) ?? null;
    if (!row) {
      return {
        keyword,
        volume: null,
        competition: null,
        cpc: null,
        difficulty: null,
        source: "dataforseo",
        raw: { missing: true },
      };
    }
    const volume =
      typeof row.search_volume === "number" && Number.isFinite(row.search_volume)
        ? Math.max(0, Math.round(row.search_volume))
        : null;
    const cpc =
      typeof row.cpc === "number" && Number.isFinite(row.cpc) ? Math.max(0, row.cpc) : null;
    return {
      keyword,
      volume,
      competition: normaliseCompetition(row),
      cpc,
      difficulty: null, // search_volume endpoint does not return KD; left null on purpose.
      source: "dataforseo",
      raw: row as Record<string, unknown>,
    };
  });
}
