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
  const language = (identity.language || "").toLowerCase().slice(0, 2) || "en";
  const country = identity.country ? identity.country.toUpperCase().slice(0, 2) : null;
  const locale = country ? `${language}-${country}` : language;
  return {
    language,
    country,
    locale,
    languageName: LANG_NAMES[language] ?? language.toUpperCase(),
    businessName: identity.brandName || identity.businessName || null,
  };
}
