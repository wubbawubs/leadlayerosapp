/**
 * BP-2.5 — Vertical defaults + CTA noise filter.
 * Used by the analyzer to fill empty sections with "recommended" suggestions
 * (never presented as evidence) and to strip template/navigation CTA garbage.
 */

export type SourceType = "evidence_based" | "inferred" | "recommended" | "missing";

export interface DefaultSuggestion {
  fieldPath: string;
  suggestedValue: unknown;
  rationale: string;
}

// ---- CTA noise filter ------------------------------------------------------

const TEMPLATE_CTA_NOISE = new Set(
  [
    "sign me up",
    "sign up",
    "signup",
    "subscribe",
    "log in",
    "login",
    "log in now",
    "reader",
    "upgrade",
    "wordpress.com",
    "themes",
    "patterns",
    "shop",
    "new",
    "edit site",
    "search",
    "menu",
    "close",
    "skip to content",
    "home",
    "back",
    "next",
    "previous",
    "more",
    "read more",
    "lees meer",
    "meer",
    "menu openen",
    "menu sluiten",
    "winkelmandje",
    "inloggen",
    "registreren",
    "aanmelden",
  ].map((s) => s.toLowerCase().trim()),
);

export type CtaClass = "product_cta" | "lead_magnet_cta" | "navigation" | "account" | "template_noise";

const LEAD_HINTS = [
  "scan",
  "audit",
  "demo",
  "gratis",
  "free",
  "trial",
  "proef",
  "offerte",
  "quote",
  "afspraak",
  "kennismaking",
  "intake",
  "consult",
  "advies",
  "bel mij",
  "bel me",
  "neem contact",
  "contact",
  "vraag aan",
  "aanvragen",
  "download",
  "ebook",
  "checklist",
  "whitepaper",
];

const PRODUCT_HINTS = [
  "boek",
  "book",
  "start",
  "begin",
  "probeer",
  "try",
  "bestel",
  "order",
  "koop",
  "buy",
  "abonneer",
  "plan",
  "kies",
  "select",
  "ontdek",
  "discover",
  "bekijk",
];

const ACCOUNT_HINTS = ["account", "profiel", "dashboard", "instellingen", "settings"];

export function classifyCta(text: string): CtaClass {
  const t = text.toLowerCase().trim();
  if (!t) return "template_noise";
  if (TEMPLATE_CTA_NOISE.has(t)) return "template_noise";
  if (t.length > 90) return "template_noise"; // probably extracted body text, not a CTA
  if (LEAD_HINTS.some((h) => t.includes(h))) return "lead_magnet_cta";
  if (ACCOUNT_HINTS.some((h) => t.includes(h))) return "account";
  if (PRODUCT_HINTS.some((h) => t.includes(h))) return "product_cta";
  // Single-word generics
  if (/^[a-z]+$/.test(t) && t.split(" ").length === 1 && t.length <= 6) return "navigation";
  return "product_cta";
}

export function filterCtaCandidates<T extends { text: string }>(
  ctas: T[],
): Array<T & { ctaClass: CtaClass }> {
  return ctas
    .map((c) => ({ ...c, ctaClass: classifyCta(c.text) }))
    .filter((c) => c.ctaClass === "product_cta" || c.ctaClass === "lead_magnet_cta");
}

// ---- Vertical defaults -----------------------------------------------------

interface DefaultsInput {
  vertical?: string | null;
  businessType?: string | null;
  country?: string | null;
  language?: string | null;
}

function isLocalServiceVertical(input: DefaultsInput): boolean {
  const v = `${input.vertical ?? ""} ${input.businessType ?? ""}`.toLowerCase();
  return (
    v.includes("local") ||
    v.includes("seo") ||
    v.includes("marketing") ||
    v.includes("service") ||
    v.includes("agency") ||
    v.includes("dienst")
  );
}

export function getBusinessProfileDefaults(input: DefaultsInput): DefaultSuggestion[] {
  const local = isLocalServiceVertical(input);
  const country = (input.country || "NL").toUpperCase();
  const out: DefaultSuggestion[] = [];

  // ICP defaults (always useful at low confidence)
  if (local) {
    out.push(
      {
        fieldPath: "icp_profile.painPoints",
        suggestedValue: [
          "geen tijd om zelf met marketing/SEO bezig te zijn",
          "website levert te weinig aanvragen op",
          "concurrenten zijn online beter zichtbaar",
          "marketing voelt technisch en onduidelijk",
        ],
        rationale: "Standaard pijnpunten voor lokale dienstverleners (recommended baseline).",
      },
      {
        fieldPath: "icp_profile.objections",
        suggestedValue: [
          "ik snap SEO/marketing niet",
          "ik weet niet of het werkt",
          "ik wil controle houden over mijn website",
          "ik wil geen technisch rapport",
        ],
        rationale: "Veelvoorkomende bezwaren in dit segment.",
      },
      {
        fieldPath: "icp_profile.buyingTriggers",
        suggestedValue: [
          "te weinig aanvragen via de website",
          "nieuwe website live maar weinig resultaat",
          "concurrenten worden vaker gevonden",
          "behoefte aan meer lokale klanten",
        ],
        rationale: "Typische triggers voor dit type opdracht.",
      },
      {
        fieldPath: "icp_profile.desiredLeadTypes",
        suggestedValue: [
          "lokale aanvragen",
          "contactaanvragen",
          "offerteaanvragen",
          "kennismakingsgesprekken",
        ],
        rationale: "Standaard gewenste leadtypes voor lokale dienstverleners.",
      },
      {
        fieldPath: "icp_profile.undesiredLeadTypes",
        suggestedValue: [
          "aanvragen buiten werkgebied",
          "prijsvergelijkers zonder koopintentie",
          "klanten die garanties op nummer 1 verwachten",
        ],
        rationale: "Standaard ongewenste leadtypes.",
      },
    );
  }

  // Conversion defaults
  out.push(
    {
      fieldPath: "conversion_profile.conversionBarriers",
      suggestedValue: [
        "onduidelijk wat de dienst precies oplevert",
        "geen prijsindicatie zichtbaar",
        "weinig bewijs / cases / reviews",
        "geen duidelijk contactformulier",
      ],
      rationale: "Veelvoorkomende conversiebarrières op MKB-sites.",
    },
    {
      fieldPath: "conversion_profile.trustElementsNeeded",
      suggestedValue: [
        "klantcases of voorbeelden van resultaat",
        "uitleg over werkwijze",
        "over-ons informatie / team",
        "reviews of testimonials",
      ],
      rationale: "Standaard trust elements die deze doelgroep verwacht.",
    },
  );

  // Claim guardrails (basics; vertical-specific extras for local seo)
  out.push(
    {
      fieldPath: "claim_guardrails.forbiddenClaims",
      suggestedValue: local
        ? [
            "gegarandeerd nummer 1 in Google",
            "gegarandeerd meer klanten",
            "verdubbel je omzet",
            "direct resultaat gegarandeerd",
          ]
        : [
            "gegarandeerd resultaat",
            "gegarandeerd meer omzet",
            "100% succes",
            "geen risico",
          ],
      rationale: "Standaard verboden claims om juridisch/commercieel risico te vermijden.",
    },
    {
      fieldPath: "claim_guardrails.riskyClaims",
      suggestedValue: local
        ? [
            "meer klanten aantrekken",
            "meer aanvragen krijgen",
            "bovenaan in Google komen",
            "snel resultaat uit SEO",
          ]
        : ["snel resultaat", "marktleider", "de beste in de branche"],
      rationale: "Claims die bewijs vereisen voor ze gebruikt mogen worden.",
    },
    {
      fieldPath: "claim_guardrails.safeAlternatives",
      suggestedValue: local
        ? {
            "gegarandeerd bovenaan":
              "beter vindbaar worden voor relevante lokale zoekopdrachten",
            "meer klanten gegarandeerd":
              "gericht op meer relevante aanvragen uit je regio",
          }
        : {
            "gegarandeerd resultaat": "gericht op aantoonbare verbetering",
          },
      rationale: "Veilige herformuleringen voor risky claims.",
    },
  );

  // Location fallback
  out.push(
    {
      fieldPath: "location_profile.serviceAreas",
      suggestedValue: [country === "NL" ? "Nederland" : country],
      rationale:
        "Geen specifieke steden/regio's gevonden — landelijke serviceArea als basis. Vraag operator om specifieke focusregio's.",
    },
    {
      fieldPath: "location_profile.localSearchPatterns",
      suggestedValue: local
        ? ["[dienst] + [stad]", "[dienst] in de buurt", "[bedrijfstype] + [regio]"]
        : ["[brand] + [stad]", "[dienst] + [stad]"],
      rationale: "Standaard lokale zoekpatronen.",
    },
    {
      fieldPath: "location_profile.locationPageOpportunities",
      suggestedValue: [
        "Maak pagina's voor belangrijke steden of regio's zodra focusgebieden bekend zijn.",
      ],
      rationale: "Standaard groeikans voor lokale verticals.",
    },
  );

  // Proof gaps
  out.push(
    {
      fieldPath: "proof_profile.proofGaps",
      suggestedValue: [
        "geen klantcases zichtbaar",
        "geen reviews/testimonials",
        "geen meetbare resultaten gepubliceerd",
        "geen team / over-ons context",
      ],
      rationale: "Vaak ontbrekende proof-elementen — checken of ze elders bestaan.",
    },
    {
      fieldPath: "proof_profile.requiresVerification",
      suggestedValue: [
        "case study van bestaande klant",
        "before/after voorbeeld",
        "testimonial met naam",
        "voorbeeld van dienstverlening output",
      ],
      rationale: "Suggesties voor proof-assets die de operator kan aanleveren.",
    },
  );

  return out;
}
