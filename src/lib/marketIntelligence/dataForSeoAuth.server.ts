/**
 * DataForSEO auth helper — shared across market + competitive intelligence.
 */

export function dataForSeoBasicAuthHeader(): string {
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

export function isDataForSeoConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}
