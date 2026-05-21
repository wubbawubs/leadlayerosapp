/**
 * Locale helpers — NL-first, US supported. Used to:
 *   - format currency / dates in the UI
 *   - choose the right SERP database, review platforms, AVG/CCPA copy
 *   - prefix LLM prompts with the target language + spelling
 */

export type LocaleCode = "nl-NL" | "en-US";

export const DEFAULT_LOCALE: LocaleCode = "nl-NL";

export const LOCALES: Record<LocaleCode, {
  label: string;
  language: string;
  currency: "EUR" | "USD";
  spelling: "nl" | "en-US";
  promptHint: string;
}> = {
  "nl-NL": {
    label: "Nederlands",
    language: "Dutch",
    currency: "EUR",
    spelling: "nl",
    promptHint: "Reply in Dutch (Nederlands). Use Dutch spelling and conventions.",
  },
  "en-US": {
    label: "English (US)",
    language: "English",
    currency: "USD",
    spelling: "en-US",
    promptHint: "Reply in US English. Use US spelling and conventions.",
  },
};

export function localeMeta(code: LocaleCode = DEFAULT_LOCALE) {
  return LOCALES[code];
}
