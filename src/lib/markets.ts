export type Market = {
  country: string;
  speed: "fast" | "medium";
  days: string;
  permit: string;
  sectors: string[];
};

export const MARKETS: Market[] = [
  { country: "Latvia", speed: "fast", days: "15–45 days", permit: "Seasonal work visa / employer-backed permit", sectors: ["agriculture", "food processing", "construction", "hospitality", "logistics"] },
  { country: "Serbia", speed: "fast", days: "19–60 days", permit: "Unified permit (jedinstvena dozvola)", sectors: ["construction", "manufacturing", "food processing", "agriculture", "logistics"] },
  { country: "North Macedonia", speed: "fast", days: "30–60 days", permit: "Temporary residence + work permit", sectors: ["construction", "manufacturing", "textile", "hospitality"] },
  { country: "Montenegro", speed: "fast", days: "30–60 days", permit: "Single permit (MUP)", sectors: ["hospitality", "construction", "marine"] },
  { country: "Cyprus", speed: "fast", days: "30–60 days", permit: "Employer-sponsored work permit", sectors: ["hospitality", "construction", "agriculture", "cleaning", "logistics"] },
  { country: "Estonia", speed: "medium", days: "30–60 days", permit: "Short-term registered employment", sectors: ["logistics", "food processing", "construction", "manufacturing"] },
  { country: "Lithuania", speed: "medium", days: "30–60 days", permit: "National D visa + work permit", sectors: ["logistics", "construction", "manufacturing", "food processing"] },
  { country: "Bosnia and Herzegovina", speed: "medium", days: "45–60 days", permit: "Work + residence permit", sectors: ["construction", "manufacturing"] },
  { country: "Albania", speed: "medium", days: "45–60 days", permit: "Unique permit", sectors: ["hospitality", "construction"] },
  { country: "Moldova", speed: "medium", days: "45–60 days", permit: "D visa (employment) + temporary stay", sectors: ["construction", "agriculture", "manufacturing"] },
];

export type LeadKind = "employer" | "education" | "supply";

/**
 * Source countries for supply partners: manpower agencies, recruitment agents
 * and study-abroad / visa counsellors who can send us workers and students.
 */
export const SUPPLY_COUNTRIES = [
  "India",
  "Nepal",
  "Bangladesh",
  "Sri Lanka",
  "Uzbekistan",
  "Philippines",
];

export const SECTORS = [
  "construction",
  "hospitality",
  "agriculture",
  "food processing",
  "logistics",
  "manufacturing",
  "cleaning",
  "care",
];

export const STAGES = ["new", "contacted", "replied", "interested", "deal", "rejected"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  deal: "Deal",
  rejected: "Not a fit",
};

export function marketFor(country?: string | null): Market | undefined {
  if (!country) return undefined;
  return MARKETS.find((m) => m.country.toLowerCase() === country.trim().toLowerCase());
}
