// Weighted lead scoring for Voynova demand leads.
//
// Five dimensions (total weight = 100):
//   - Recruitment signals (25): explicit hiring intent — keywords, audience type,
//     demand size, contact completeness.
//   - Sponsorship history (20): visa_sponsorship flag, sponsor-keyword hits in
//     payload/notes, EU known-sponsor countries.
//   - Sector match (20): blue-collar sector tags (construction, hospitality,
//     logistics, manufacturing, agriculture, cleaning, security, healthcare aides).
//   - Country priority (20): Voynova corridor — Balkans (esp. Serbia/Greece) and
//     EU sponsor markets (DE, NL, AT, PL, CZ).
//   - Recency (15): age in days, full credit ≤7d, decays to 0 by 90d.
//
// Output: integer 0..100 plus a per-dimension breakdown for transparency.

import { BALKAN_COUNTRIES, EU_COUNTRIES } from "./lead-taxonomies";

export type ScoringInput = {
  priority?: string | null;
  urgency_score?: number | null;
  score?: number | null;
  country?: string | null;
  sector_tags?: string[] | null;
  worker_origin_focus?: string[] | null;
  target_audience_type?: string | null;
  demand_size?: number | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_name?: string | null;
  source_url?: string | null;
  created_at?: string | null;
  visa_sponsorship?: boolean | null;
  matched_keywords?: string[] | null;
  notes?: string | null;
  raw_signals?: { payload: Record<string, unknown> | null } | null;
};

export type ScoreBreakdown = {
  signals: number;     // 0..25
  sponsorship: number; // 0..20
  sector: number;      // 0..20
  country: number;     // 0..20
  recency: number;     // 0..15
  total: number;       // 0..100
};

const BLUE_COLLAR_SECTORS = new Set([
  "construction", "hospitality", "logistics", "manufacturing",
  "agriculture", "cleaning", "security", "healthcare",
]);

// Voynova corridor weights: home markets first, then proven EU sponsor markets.
const COUNTRY_WEIGHTS: Record<string, number> = {
  Serbia: 20, Greece: 20,
  Germany: 18, Netherlands: 17, Austria: 16, Poland: 15, Czechia: 14,
  Croatia: 14, Slovenia: 13, Romania: 13, Bulgaria: 12,
  Hungary: 12, Slovakia: 11, Italy: 12, Portugal: 11,
  Cyprus: 11, Malta: 10,
  "Bosnia and Herzegovina": 10, Montenegro: 10,
  "North Macedonia": 10, Albania: 9, Kosovo: 9,
};

const SPONSOR_KEYWORDS = [
  "visa sponsor", "visa sponsorship", "work permit", "sponsor visa",
  "tier 2", "blue card", "kennismigrant", "highly skilled migrant",
  "boravišna dozvola", "radna dozvola", "ΑΦΜ", "AMKA",
  "relocation support", "we sponsor",
];

const HIRING_KEYWORDS = [
  "hiring", "urgent", "immediate", "now hiring", "we are hiring",
  "apply now", "open positions", "vacancy", "vacancies", "recruiting",
];

const RECRUITER_AUDIENCE = new Set([
  "recruiter", "recruitment_agency", "staffing", "freelance_recruiter", "hr_manager",
]);

function flatHaystack(input: ScoringInput): string {
  const payload = input.raw_signals?.payload ?? null;
  const payloadText = payload ? safeStringify(payload) : "";
  return [
    input.notes ?? "",
    (input.matched_keywords ?? []).join(" "),
    payloadText,
  ].join(" ").toLowerCase();
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return ""; }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreSignals(input: ScoringInput, hay: string): number {
  let s = 0;
  // Audience signals (recruiter / agency / HR are highest intent for us)
  if (input.target_audience_type && RECRUITER_AUDIENCE.has(input.target_audience_type)) s += 8;
  else if (input.target_audience_type === "employer_direct") s += 6;
  else if (input.target_audience_type === "hiring_manager") s += 7;
  // Hiring keywords in payload/notes
  const kwHits = HIRING_KEYWORDS.reduce((acc, kw) => acc + (hay.includes(kw) ? 1 : 0), 0);
  s += clamp(kwHits * 2, 0, 6);
  // Demand size: 1 = +2, 5+ = +5, 20+ = +7
  const d = input.demand_size ?? 0;
  if (d >= 20) s += 7;
  else if (d >= 5) s += 5;
  else if (d >= 1) s += 2;
  // Contact completeness — direct contactability is itself a signal
  if (input.contact_email) s += 2;
  if (input.contact_phone) s += 2;
  if (input.contact_name) s += 1;
  return clamp(Math.round(s), 0, 25);
}

function scoreSponsorship(input: ScoringInput, hay: string): number {
  let s = 0;
  if (input.visa_sponsorship === true) s += 12;
  const kwHits = SPONSOR_KEYWORDS.reduce((acc, kw) => acc + (hay.includes(kw) ? 1 : 0), 0);
  s += clamp(kwHits * 3, 0, 9);
  // EU markets with established sponsor frameworks get a small structural bump
  const c = input.country ?? "";
  if (["Germany", "Netherlands", "Austria", "Poland", "Czechia"].includes(c)) s += 4;
  // Worker-origin focus on India/Nepal/Bangladesh implies sponsorship-aware
  if ((input.worker_origin_focus ?? []).length > 0) s += 3;
  return clamp(Math.round(s), 0, 20);
}

function scoreSector(input: ScoringInput): number {
  const tags = input.sector_tags ?? [];
  if (tags.length === 0) return 0;
  const blue = tags.filter((t) => BLUE_COLLAR_SECTORS.has(t));
  if (blue.length === 0) return 4; // some sector data, but not blue-collar
  // Top-tier blue-collar sectors for Voynova
  const TOP = new Set(["construction", "hospitality", "logistics", "manufacturing"]);
  const topHit = blue.some((t) => TOP.has(t));
  let s = topHit ? 16 : 12;
  if (blue.length >= 2) s += 4; // multi-sector employer = broader fit
  return clamp(s, 0, 20);
}

function scoreCountry(input: ScoringInput): number {
  const c = input.country ?? "";
  if (!c) return 0;
  if (COUNTRY_WEIGHTS[c] != null) return COUNTRY_WEIGHTS[c];
  if ((BALKAN_COUNTRIES as readonly string[]).includes(c)) return 10;
  if ((EU_COUNTRIES as readonly string[]).includes(c)) return 10;
  return 0;
}

function scoreRecency(input: ScoringInput): number {
  if (!input.created_at) return 0;
  const ageDays = (Date.now() - new Date(input.created_at).getTime()) / 86_400_000;
  if (ageDays <= 7) return 15;
  if (ageDays >= 90) return 0;
  // Linear decay from 15 at 7d to 0 at 90d
  const v = 15 * (1 - (ageDays - 7) / (90 - 7));
  return clamp(Math.round(v), 0, 15);
}

export function computeLeadScore(input: ScoringInput): ScoreBreakdown {
  const hay = flatHaystack(input);
  const signals = scoreSignals(input, hay);
  const sponsorship = scoreSponsorship(input, hay);
  const sector = scoreSector(input);
  const country = scoreCountry(input);
  const recency = scoreRecency(input);
  const total = clamp(signals + sponsorship + sector + country + recency, 0, 100);
  return { signals, sponsorship, sector, country, recency, total };
}

export const SCORE_DIMENSIONS: { key: keyof Omit<ScoreBreakdown, "total">; label: string; max: number }[] = [
  { key: "signals",     label: "Recruitment signals", max: 25 },
  { key: "sponsorship", label: "Sponsorship history", max: 20 },
  { key: "sector",      label: "Blue-collar sector match", max: 20 },
  { key: "country",     label: "Country priority", max: 20 },
  { key: "recency",     label: "Recency", max: 15 },
];