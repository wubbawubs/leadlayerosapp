/**
 * Competitive Intelligence — Trust signal extractor.
 *
 * Pure. Reads homepage markdown (or HTML stripped of tags) and returns
 * deterministic trust signals. Never claims a signal it can't see.
 */

import type { TrustSignals } from "./schemas";

const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
const ADDRESS_HINTS = [
  /\b\d{1,5}\s+\w+(?:\s+\w+){0,4}\s+(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court|hwy|highway|pkwy|parkway)\b/i,
  /\b\d{5}(?:-\d{4})?\b/, // US ZIP
];
const EMERGENCY_HINTS = [
  /\b24[\s/-]?7\b/i,
  /\b24[-\s]?hour\b/i,
  /\bemergency\b/i,
  /\bsame[-\s]?day\b/i,
  /\bafter[-\s]?hours\b/i,
];
const LICENSE_HINTS = [
  /\blicensed\b/i,
  /\blicense\s*#?\s*\w+/i,
  /\binsured\b/i,
  /\bbonded\b/i,
];
const CERT_RE =
  /\b(NATE|EPA|BBB|HVAC Excellence|Trane Comfort Specialist|Lennox Premier|Carrier Factory Authorized|Bryant Factory Authorized|Energy Star|OSHA|ACCA|NFPA|UL Listed|RSES)\b/gi;

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ");
}

export function parseHomepageMarkdown(
  markdown: string | null | undefined,
  links?: string[],
): TrustSignals {
  const empty: TrustSignals = {
    phone: false,
    address: false,
    emergency: false,
    licensing: false,
    certifications: [],
    rawMatches: [],
  };
  if (!markdown && (!links || links.length === 0)) return empty;

  const text = stripMarkdown(markdown ?? "");
  const linksText = (links ?? []).join(" ");
  const combined = `${text} ${linksText}`;

  const phone =
    PHONE_RE.test(text) ||
    (links ?? []).some((l) => /^tel:/i.test(l));
  const address = ADDRESS_HINTS.some((re) => re.test(text));
  const emergency = EMERGENCY_HINTS.some((re) => re.test(combined));
  const licensing = LICENSE_HINTS.some((re) => re.test(combined));

  const certSet = new Set<string>();
  const certMatches = combined.match(CERT_RE) ?? [];
  for (const m of certMatches) certSet.add(m.trim());

  const rawMatches: string[] = [];
  if (phone) rawMatches.push("phone");
  if (address) rawMatches.push("address");
  if (emergency) rawMatches.push("emergency");
  if (licensing) rawMatches.push("licensing");

  return {
    phone,
    address,
    emergency,
    licensing,
    certifications: Array.from(certSet),
    rawMatches,
  };
}
