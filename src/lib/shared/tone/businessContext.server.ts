/**
 * Source-of-truth for tone profile language/locale: the Business Profile v2.
 * Tone profile must align with what the business profile already established
 * (e.g. business identity says language=en, country=US → tone profile en-US).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface BusinessLocale {
  language: string; // ISO 639-1 e.g. "en", "nl"
  country: string | null; // ISO 3166 e.g. "US", "NL"
  locale: string; // e.g. "en-US", "nl-NL"
  languageName: string; // human, for LLM prompts e.g. "English", "Dutch"
  businessName: string | null;
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  nl: "Dutch (Nederlands)",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
};

const LANGUAGE_ALIASES: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  us_english: "en",
  american_english: "en",
  nl: "nl",
  dutch: "nl",
  nederlands: "nl",
  de: "de",
  deutsch: "de",
  german: "de",
  fr: "fr",
  french: "fr",
  francais: "fr",
  français: "fr",
  es: "es",
  spanish: "es",
  espanol: "es",
  español: "es",
};

const COUNTRY_ALIASES: Record<string, string> = {
  us: "US",
  usa: "US",
  u_s: "US",
  united_states: "US",
  united_states_of_america: "US",
  america: "US",
  nl: "NL",
  nld: "NL",
  nederland: "NL",
  netherlands: "NL",
  the_netherlands: "NL",
  holland: "NL",
  gb: "GB",
  uk: "GB",
  united_kingdom: "GB",
  great_britain: "GB",
};

function key(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function normalizeLanguageCode(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const localeLang = trimmed.match(/^([a-z]{2})(?:[-_][a-z]{2})?$/i)?.[1];
  if (localeLang) return localeLang.toLowerCase();
  return LANGUAGE_ALIASES[key(trimmed)] ?? trimmed.toLowerCase().slice(0, 2);
}

export function normalizeCountryCode(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const localeCountry = trimmed.match(/^[a-z]{2}[-_]([a-z]{2})$/i)?.[1];
  if (localeCountry) return localeCountry.toUpperCase();
  const normalized = COUNTRY_ALIASES[key(trimmed)];
  if (normalized) return normalized;
  return trimmed.length === 2 ? trimmed.toUpperCase() : null;
}

export function normalizeLocale(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [rawLang, rawCountry] = trimmed.split(/[-_]/);
  const language = normalizeLanguageCode(rawLang);
  const country = normalizeCountryCode(rawCountry ?? trimmed);
  if (!language) return null;
  return country ? `${language}-${country}` : language;
}

export function localeFromLanguageCountry(languageValue?: string | null, countryValue?: string | null): BusinessLocale {
  const language = normalizeLanguageCode(languageValue) ?? "en";
  const country = normalizeCountryCode(countryValue);
  const locale = country ? `${language}-${country}` : language;
  return {
    language,
    country,
    locale,
    languageName: LANG_NAMES[language] ?? language.toUpperCase(),
    businessName: null,
  };
}

export async function loadBusinessLocale(tenantId: string): Promise<BusinessLocale | null> {
  const { data } = await supabaseAdmin
    .from("business_profiles_v2")
    .select("business_identity")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const identity = (data.business_identity ?? {}) as {
    language?: string;
    country?: string;
    businessName?: string;
    brandName?: string;
  };
  const locale = localeFromLanguageCountry(identity.language, identity.country);
  return {
    ...locale,
    businessName: identity.brandName || identity.businessName || null,
  };
}
