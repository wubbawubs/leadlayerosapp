/**
 * Market Intelligence — Dev-only synthetic fixtures (Ticket 2).
 *
 * Used to seed manual scans during development so the Blueprint
 * Market Intelligence section can be exercised end-to-end before
 * DataForSEO is wired up (Ticket 3).
 *
 * IMPORTANT: All fixture data must be persisted with
 * source = "synthetic_fixture" so the UI can label it as non-live.
 * Never render synthetic numbers without that label.
 */

import type { CreateMarketKeywordInput } from "./schemas";

export interface FixtureScan {
  language: string;
  country: string;
  region: string;
  vertical: string;
  services: string[];
  locations: string[];
  keywords: CreateMarketKeywordInput[];
}

export const DALLAS_HVAC_FIXTURE: FixtureScan = {
  language: "en",
  country: "US",
  region: "TX",
  vertical: "hvac",
  services: ["AC Repair", "HVAC Maintenance", "AC Installation"],
  locations: ["Dallas", "Plano", "Frisco"],
  keywords: [
    { keyword: "ac repair dallas", service: "AC Repair", location: "Dallas", intent: "service", volume: 4400, difficulty: 42, competition: 0.78 },
    { keyword: "emergency hvac repair dallas", service: "AC Repair", location: "Dallas", intent: "emergency", volume: 880, difficulty: 35, competition: 0.66 },
    { keyword: "ac not cooling dallas", service: "AC Repair", location: "Dallas", intent: "emergency", volume: 320, difficulty: 28, competition: 0.55 },
    { keyword: "hvac maintenance dallas", service: "HVAC Maintenance", location: "Dallas", intent: "service", volume: 720, difficulty: 30, competition: 0.5 },
    { keyword: "air conditioning installation dallas", service: "AC Installation", location: "Dallas", intent: "service", volume: 590, difficulty: 48, competition: 0.72 },
    { keyword: "ac repair plano", service: "AC Repair", location: "Plano", intent: "service", volume: 1300, difficulty: 38, competition: 0.62 },
    { keyword: "emergency ac repair plano", service: "AC Repair", location: "Plano", intent: "emergency", volume: 210, difficulty: 32, competition: 0.5 },
    { keyword: "hvac contractor frisco", service: "HVAC Maintenance", location: "Frisco", intent: "commercial", volume: 480, difficulty: 36, competition: 0.55 },
    { keyword: "best hvac company dallas", service: "HVAC Maintenance", location: "Dallas", intent: "comparison", volume: 260, difficulty: 41, competition: 0.7 },
    { keyword: "how much does ac repair cost", service: "AC Repair", location: null, intent: "informational", volume: 1900, difficulty: 25, competition: 0.45 },
  ],
};
