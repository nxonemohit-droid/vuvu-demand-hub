// Recruiter (supply partner) helpers: country-specific pitches, partner-type
// detection, duplicate keys and 0-100 priority scoring.

export type RecruiterLead = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

/** ---------------- Country pitches ---------------- */

export type CountryPitch = {
  /** Short line about the corridor, used inside the email. */
  corridor: string;
  /** What we ask this country's partners for. */
  ask: string;
  /** Local proof point / compliance note. */
  proof: string;
};

const DEFAULT_PITCH: CountryPitch = {
  corridor:
    "We work directly with employers and colleges in Latvia, Serbia, Cyprus and Estonia, where a work or study permit is usually completed in about two months.",
  ask:
    "We are looking for sourcing partners who can supply screened blue-collar candidates and Learn & Earn students.",
  proof:
    "We handle employer contracts, permits, visa paperwork and arrival support, with transparent commercials and no fee charged to the worker.",
};

export const COUNTRY_PITCHES: Record<string, CountryPitch> = {
  India: {
    corridor:
      "We hold live job orders in Latvia, Serbia, Cyprus and Estonia plus Learn & Earn college seats in Europe, where the permit is usually completed in about two months.",
    ask:
      "We are looking for eMigrate-registered manpower agencies and education consultants across India who can supply trade-tested workers (construction, welding, hospitality, food processing, logistics) and Learn & Earn students.",
    proof:
      "We work on an ethical, no-worker-fee model: Voynova pays the partner, handles employer contracts, permits, visa filing and arrival support, and shares demand lists every week.",
  },
  Nepal: {
    corridor:
      "We hold live European job orders — Latvia, Serbia, Cyprus and Estonia — plus Learn & Earn college seats, with permits usually issued in about two months.",
    ask:
      "We are looking for DoFE-licensed recruitment agencies in Kathmandu, Pokhara, Butwal and Biratnagar who can supply skilled and semi-skilled workers, and counsellors who can refer Learn & Earn students.",
    proof:
      "Demand letters, employer contracts and visa paperwork come from our side; your team only sources and pre-screens. No fee is charged to the worker.",
  },
  Bangladesh: {
    corridor:
      "We hold confirmed European demand in Latvia, Serbia, Cyprus and Estonia plus Learn & Earn seats in vocational colleges, with permits usually issued in about two months.",
    ask:
      "We are looking for BAIRA-member recruiting agencies in Dhaka, Chittagong and Sylhet who can supply construction, garment, hospitality and food-processing workers, along with student referrals.",
    proof:
      "We issue the demand letter and handle attestation support, employer contracts, permits and visa filing, with transparent commercials and no worker-paid fee.",
  },
  "Sri Lanka": {
    corridor:
      "We hold live European job orders in Latvia, Serbia, Cyprus and Estonia plus Learn & Earn college seats, with permits usually issued in about two months.",
    ask:
      "We are looking for SLBFE-licensed agencies and study-abroad counsellors in Colombo, Kandy and Negombo who can supply hospitality, construction and care workers, and refer Learn & Earn students.",
    proof:
      "Employer contracts, permits, visa paperwork and arrival support stay with us; your team sources and pre-screens. Workers pay no placement fee.",
  },
};

export function pitchFor(country?: string | null): CountryPitch {
  const key = Object.keys(COUNTRY_PITCHES).find(
    (c) => c.toLowerCase() === str(country).toLowerCase(),
  );
  return key ? COUNTRY_PITCHES[key] : DEFAULT_PITCH;
}

const WA_HOOKS: Record<string, string> = {
  India:
    "We work with eMigrate-registered agencies and education consultants in India",
  Nepal: "We work with DoFE-licensed agencies in Nepal",
  Bangladesh: "We work with BAIRA-member recruiting agencies in Bangladesh",
  "Sri Lanka": "We work with SLBFE-licensed agencies in Sri Lanka",
};

/** Short WhatsApp first message for a recruiter lead, tuned per country. */
export function recruiterWhatsApp(opts: {
  hello: string;
  company: string;
  country: string;
}): string {
  const hook = WA_HOOKS[opts.country] ?? `We work with sourcing partners in ${opts.country}`;
  return `${opts.hello}, this is Mohit from Voynova Global Solutions. ${hook}. We have live Europe job orders (Latvia, Serbia, Cyprus, Estonia) for blue-collar trades plus Learn & Earn college seats. Can we talk 15 minutes this week about a partnership with ${opts.company}? More: https://voynovaglobal.com`;
}

/** ---------------- Partner type ---------------- */

export type PartnerTypeId = "manpower" | "agents" | "study" | "visa" | "other";

const TYPE_HINTS: Array<{ id: PartnerTypeId; words: string[] }> = [
  { id: "manpower", words: ["manpower", "overseas employment", "recruiting agency", "recruitment agency", "hr solutions", "staffing"] },
  { id: "study", words: ["study abroad", "education consult", "admission", "overseas education", "student"] },
  { id: "visa", words: ["visa", "immigration", "documentation", "consultancy services"] },
  { id: "agents", words: ["agent", "labour supply", "placement", "career", "jobs"] },
];

/** Guess the partner type from the agency name, sector and profile text. */
export function detectPartnerType(lead: RecruiterLead): PartnerTypeId {
  const hay = [lead.company, lead.sector, lead.profile_summary, lead.role, lead.website]
    .map(str)
    .join(" ")
    .toLowerCase();
  for (const t of TYPE_HINTS) if (t.words.some((w) => hay.includes(w))) return t.id;
  return "other";
}

export const PARTNER_TYPE_LABELS: Record<PartnerTypeId, string> = {
  manpower: "Manpower agency",
  agents: "Recruitment agent",
  study: "Study abroad counsellor",
  visa: "Visa counsellor",
  other: "Other partner",
};

/** ---------------- Duplicate keys ---------------- */

export function normDomain(website?: unknown): string | null {
  const w = str(website);
  if (!w) return null;
  try {
    const u = new URL(w.startsWith("http") ? w : `https://${w}`);
    return u.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

export function normPhone(phone?: unknown): string | null {
  const digits = str(phone).replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.slice(-10);
}

export function normEmail(email?: unknown): string | null {
  const e = str(email).toLowerCase();
  return e.includes("@") ? e : null;
}

export function normName(company?: unknown): string | null {
  const n = str(company)
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|services|service|consultancy|consultants|consultant|overseas|group|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return n.length >= 4 ? n : null;
}

/** Keys that make two recruiter leads the same partner. */
export function dedupeKeys(lead: RecruiterLead): string[] {
  const keys: string[] = [];
  const e = normEmail(lead.email);
  if (e) keys.push(`email:${e}`);
  const p = normPhone(lead.whatsapp ?? lead.phone);
  if (p) keys.push(`phone:${p}`);
  const d = normDomain(lead.website);
  if (d) keys.push(`site:${d}`);
  const n = normName(lead.company);
  if (n) keys.push(`name:${n}|${str(lead.country).toLowerCase()}`);
  return keys;
}

/** ---------------- Priority scoring ---------------- */

const COUNTRY_POINTS: Record<string, number> = {
  India: 30,
  Nepal: 28,
  Bangladesh: 24,
  "Sri Lanka": 20,
  Uzbekistan: 16,
  Philippines: 16,
};

const TYPE_POINTS: Record<PartnerTypeId, number> = {
  manpower: 25,
  agents: 20,
  study: 18,
  visa: 12,
  other: 8,
};

const CAPACITY_WORDS: Array<[RegExp, number, string]> = [
  [/\b(\d{3,})\s*(\+|plus)?\s*(workers|candidates|deployments|placements)/i, 25, "large deployment volume"],
  [/\b(bulk|mass)\s+(recruitment|hiring|mobilis)/i, 20, "bulk mobilisation"],
  [/\b(licen[cs]ed|govt|government|approved|registered|emigrate|dofe|baira|slbfe)\b/i, 18, "licensed / registered"],
  [/\b(branch|offices|centres|centers)\b/i, 12, "multiple offices"],
  [/\b(training|skill|trade test)\b/i, 10, "own training capability"],
];

export type PriorityResult = { score: number; reason: string; capacity: string | null };

/**
 * 0-100 priority for a recruiter lead.
 * country (max 30) + partner type (max 25) + contact quality (max 25) + supply capacity (max 20).
 */
export function priorityFor(lead: RecruiterLead): PriorityResult {
  const parts: string[] = [];

  const country = str(lead.country);
  const countryPts = COUNTRY_POINTS[country] ?? 10;
  if (countryPts >= 24) parts.push(`${country} corridor`);

  const type = (str(lead.partner_type) as PartnerTypeId) || detectPartnerType(lead);
  const typePts = TYPE_POINTS[type] ?? TYPE_POINTS.other;
  parts.push(PARTNER_TYPE_LABELS[type] ?? "partner");

  // Contact quality: email + phone + named decision maker + website.
  let contactPts = 0;
  if (normEmail(lead.email)) contactPts += 10;
  if (normPhone(lead.whatsapp ?? lead.phone)) contactPts += 7;
  if (str(lead.contact_name)) contactPts += 5;
  if (normDomain(lead.website)) contactPts += 3;
  if (contactPts >= 17) parts.push("strong contact details");
  else if (contactPts <= 7) parts.push("weak contact details");

  // Supply capacity from the enriched profile text.
  const hay = [lead.profile_summary, lead.workforce_size, lead.trades, lead.notes, lead.supply_capacity]
    .map(str)
    .join(" ");
  let capacityPts = 0;
  let capacity: string | null = null;
  for (const [re, pts, label] of CAPACITY_WORDS) {
    if (re.test(hay)) {
      capacityPts = Math.max(capacityPts, pts);
      capacity = capacity ?? label;
    }
  }
  if (capacity) parts.push(capacity);

  const raw =
    Math.min(countryPts, 30) + Math.min(typePts, 25) + Math.min(contactPts, 25) + Math.min(capacityPts, 20);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, reason: parts.slice(0, 4).join(", ") || "basic partner record", capacity };
}
