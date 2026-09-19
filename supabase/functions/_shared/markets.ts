// Target markets for Voynova: Europe corridors where a work permit for a
// third-country blue-collar worker realistically completes inside ~2 months.

export type Market = {
  country: string;
  code: string;
  speed: "fast" | "medium";
  days: string;
  permit: string;
  sectors: string[];
};

export const MARKETS: Market[] = [
  { country: "Latvia", code: "lv", speed: "fast", days: "15–45 days", permit: "Seasonal work visa / employer-backed permit", sectors: ["agriculture", "food processing", "construction", "hospitality", "logistics"] },
  { country: "Serbia", code: "rs", speed: "fast", days: "19–60 days", permit: "Unified permit (jedinstvena dozvola)", sectors: ["construction", "manufacturing", "food processing", "agriculture", "logistics"] },
  { country: "North Macedonia", code: "mk", speed: "fast", days: "30–60 days", permit: "Temporary residence + work permit", sectors: ["construction", "manufacturing", "textile", "hospitality"] },
  { country: "Montenegro", code: "me", speed: "fast", days: "30–60 days", permit: "Single permit (MUP)", sectors: ["hospitality", "construction", "marine"] },
  { country: "Cyprus", code: "cy", speed: "fast", days: "30–60 days", permit: "Employer-sponsored work permit", sectors: ["hospitality", "construction", "agriculture", "cleaning", "logistics"] },
  { country: "Estonia", code: "ee", speed: "medium", days: "30–60 days", permit: "Short-term registered employment", sectors: ["logistics", "food processing", "construction", "manufacturing"] },
  { country: "Lithuania", code: "lt", speed: "medium", days: "30–60 days", permit: "National D visa + work permit", sectors: ["logistics", "construction", "manufacturing", "food processing"] },
  { country: "Bosnia and Herzegovina", code: "ba", speed: "medium", days: "45–60 days", permit: "Work + residence permit", sectors: ["construction", "manufacturing"] },
  { country: "Albania", code: "al", speed: "medium", days: "45–60 days", permit: "Unique permit", sectors: ["hospitality", "construction"] },
  { country: "Moldova", code: "md", speed: "medium", days: "45–60 days", permit: "D visa (employment) + temporary stay", sectors: ["construction", "agriculture", "manufacturing"] },
];

export const COUNTRY_NAMES = MARKETS.map((m) => m.country);

export function marketFor(country: string | null | undefined): Market | undefined {
  if (!country) return undefined;
  const c = country.trim().toLowerCase();
  return MARKETS.find((m) => m.country.toLowerCase() === c);
}

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

// Employer-hiring search patterns (blue-collar demand signals).
const EMPLOYER_PATTERNS = [
  'hiring "{sector}" workers foreign employees {country}',
  '"{sector}" company {country} "we are hiring" contact email',
  '{country} "{sector}" employer work permit third country nationals recruitment',
  '"{sector}" {country} vacancies "HR manager" email contact',
  '{country} recruitment agency "{sector}" workers from India Nepal',
];

// Education / Learn-and-earn patterns (short skill courses + work rights).
const EDUCATION_PATTERNS = [
  '{country} college short term skill course international students admission email',
  '{country} "learn and earn" programme international students work while studying',
  '{country} vocational school diploma admissions office contact international',
  '{country} study visa easy admission hospitality culinary course international students',
  '{country} private college intake admission international students part time work',
];

export function buildQueries(
  kind: "employer" | "education",
  countries: string[],
  sectors: string[],
  extraKeywords: string[],
): string[] {
  const out: string[] = [];
  for (const country of countries) {
    if (kind === "education") {
      for (const p of EDUCATION_PATTERNS) out.push(p.replace(/\{country\}/g, country));
    } else {
      const secs = sectors.length ? sectors : ["construction", "hospitality"];
      for (const sector of secs) {
        for (const p of EMPLOYER_PATTERNS) {
          out.push(p.replace(/\{country\}/g, country).replace(/\{sector\}/g, sector));
        }
      }
    }
    for (const kw of extraKeywords) out.push(`${kw} ${country}`);
  }
  return out;
}

// Junk domains that never yield a direct employer/college contact.
const BLOCKED = [
  "wikipedia.org", "facebook.com", "twitter.com", "x.com", "youtube.com",
  "reddit.com", "quora.com", "pinterest.com", "instagram.com", "tiktok.com",
  "glassdoor.com", "wikiwand.com", "tripadvisor.com", "booking.com",
];

export function isUsefulUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return !BLOCKED.some((b) => host === b || host.endsWith("." + b));
  } catch {
    return false;
  }
}

export function scoreLead(lead: {
  country?: string | null;
  sector?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  contact_name?: string | null;
  hiring_signal?: string | null;
  website?: string | null;
}): number {
  let s = 0;
  const m = marketFor(lead.country);
  if (m) s += m.speed === "fast" ? 30 : 18;
  if (m && lead.sector && m.sectors.includes(lead.sector.toLowerCase())) s += 15;
  if (lead.email && lead.email.includes("@")) s += 25;
  if (lead.whatsapp || lead.phone) s += 12;
  if (lead.contact_name) s += 10;
  if (lead.hiring_signal) s += 5;
  if (lead.website) s += 3;
  return Math.min(100, s);
}
