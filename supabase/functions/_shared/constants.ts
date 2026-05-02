// Centralised demand-intelligence taxonomy. Edit here to broaden coverage —
// every adapter & dispatcher reads from this single source of truth.

export type CountryMeta = {
  iso2: string;
  langs: string[];
  boards: string[];
};

export const COUNTRY_META: Record<string, CountryMeta> = {
  Serbia: { iso2: "RS", langs: ["en", "sr"], boards: ["poslovi.infostud.com", "helloworld.rs"] },
  Croatia: { iso2: "HR", langs: ["en", "hr"], boards: ["mojposao.net", "posao.hr"] },
  Slovenia: { iso2: "SI", langs: ["en", "sl"], boards: ["mojedelo.com", "optius.com"] },
  "Bosnia and Herzegovina": { iso2: "BA", langs: ["en", "bs"], boards: ["posao.ba", "kolektiv.ba"] },
  Montenegro: { iso2: "ME", langs: ["en", "sr"], boards: ["posao.me", "poslovi.me"] },
  "North Macedonia": { iso2: "MK", langs: ["en", "mk"], boards: ["vrabotuvanje.com.mk"] },
  Albania: { iso2: "AL", langs: ["en", "sq"], boards: ["duapune.com"] },
  Bulgaria: { iso2: "BG", langs: ["en", "bg"], boards: ["jobs.bg", "zaplata.bg"] },
  Romania: { iso2: "RO", langs: ["en", "ro"], boards: ["ejobs.ro", "bestjobs.eu"] },
  Hungary: { iso2: "HU", langs: ["en", "hu"], boards: ["profession.hu"] },
  Poland: { iso2: "PL", langs: ["en", "pl"], boards: ["pracuj.pl", "olx.pl"] },
  Czechia: { iso2: "CZ", langs: ["en", "cs"], boards: ["jobs.cz", "prace.cz"] },
  Slovakia: { iso2: "SK", langs: ["en", "sk"], boards: ["profesia.sk"] },
  Germany: { iso2: "DE", langs: ["en", "de"], boards: ["stepstone.de", "arbeitsagentur.de"] },
  Austria: { iso2: "AT", langs: ["en", "de"], boards: ["karriere.at", "stepstone.at"] },
  Netherlands: { iso2: "NL", langs: ["en", "nl"], boards: ["nationalevacaturebank.nl"] },
  Belgium: { iso2: "BE", langs: ["en", "nl", "fr"], boards: ["vdab.be", "stepstone.be"] },
  France: { iso2: "FR", langs: ["en", "fr"], boards: ["pole-emploi.fr", "apec.fr"] },
  Italy: { iso2: "IT", langs: ["en", "it"], boards: ["infojobs.it", "monster.it"] },
  Spain: { iso2: "ES", langs: ["en", "es"], boards: ["infojobs.net"] },
  Portugal: { iso2: "PT", langs: ["en", "pt"], boards: ["net-empregos.com"] },
  Greece: { iso2: "GR", langs: ["en", "el"], boards: ["kariera.gr", "skywalker.gr"] },
  Malta: { iso2: "MT", langs: ["en"], boards: ["keepmeposted.com.mt"] },
};

// Voynova focus countries — used by scheduled bulk plans.
export const PRIORITY_COUNTRIES = [
  "Germany", "Netherlands", "Poland", "Austria", "Czechia",
  "Serbia", "Romania", "Greece", "Croatia", "Slovenia",
  "Bulgaria", "Hungary", "Italy", "Spain", "Portugal",
];

// Sources where LinkedIn-Official actor is preferred (better trust + structure).
// Other countries fall back to Bebity for breadth.
export const LINKEDIN_OFFICIAL_PRIORITY = new Set(["DE", "NL", "PL", "AT", "CZ"]);

// Indeed actor only supports a fixed list of countries.
export const INDEED_ALLOWED = new Set([
  "AT","BE","BR","CA","CZ","DK","FI","FR","DE","GR","HU","IE","IT","LU","NL","NO",
  "PL","PT","RO","ES","SE","CH","TR","GB","US",
]);

export const PRIORITY_KEYWORDS = [
  "nurse", "caregiver", "construction worker", "welder", "electrician",
  "driver", "factory worker", "warehouse", "mason", "plumber",
  "carpenter", "hotel staff", "cleaner", "chef",
];

export const ROLE_SYNONYMS: Record<string, string[]> = {
  mason: ["mason", "bricklayer", "Maurer", "murarz", "zidar"],
  plumber: ["plumber", "Klempner", "hydraulik", "vodoinstalater"],
  electrician: ["electrician", "Elektriker", "elektryk", "električar"],
  caregiver: ["caregiver", "care worker", "Pflegekraft", "opiekun", "badante"],
  nurse: ["nurse", "Krankenpfleger", "pielęgniarka", "medicinska sestra"],
  "factory worker": ["factory worker", "production operator", "Produktionsmitarbeiter", "pracownik produkcji"],
  driver: ["driver", "truck driver", "Fahrer", "kierowca", "vozač"],
  "construction worker": ["construction worker", "Bauarbeiter", "pracownik budowlany", "građevinski radnik"],
  welder: ["welder", "Schweißer", "spawacz", "varilac"],
  carpenter: ["carpenter", "Zimmermann", "cieśla", "stolar"],
  warehouse: ["warehouse worker", "Lagerarbeiter", "magazynier", "magacioner"],
  cleaner: ["cleaner", "housekeeping", "Reinigungskraft", "sprzątaczka"],
  chef: ["chef", "cook", "Koch", "kucharz", "kuvar"],
  "hotel staff": ["hotel staff", "reception", "Hotelmitarbeiter", "recepcionista"],
};

// Maps source_registry.id -> legacy demand_source enum value used by raw_signals/scrape_jobs.
// Keeps backwards compat with existing tables until full cutover.
export function legacySourceForRegistryId(sourceId: string): string {
  if (sourceId.startsWith("linkedin")) return "linkedin";
  if (sourceId.startsWith("indeed")) return "indeed";
  if (sourceId === "google_jobs") return "google_jobs";
  if (sourceId.startsWith("career_page")) return "career_page";
  if (sourceId.startsWith("company_site")) return "company_site";
  if (sourceId.startsWith("facebook")) return "facebook";
  if (sourceId.startsWith("directory")) return "directory";
  return "google";
}

// Career-section URL hints used by Firecrawl /map filtering.
export const CAREER_PATH_HINTS = [
  "career", "careers", "job", "jobs", "vacanc", "vacancy", "vacancies",
  "open-positions", "opportunities", "join-us", "work-with-us", "hiring",
  "stellen", "stellenangebote", "karriere",         // de
  "oferty", "praca", "rekrutacja",                  // pl
  "lavora", "lavoro", "carriera",                   // it
  "empleo", "trabaja", "carreras",                  // es
  "emploi", "carriere", "rejoignez",                // fr
  "posao", "poslovi", "karijera",                   // sr/hr/bs
  "kariera", "ergasia",                             // gr
  "kariera", "prace",                               // cz/sk
  "vacatures", "werkenbij",                         // nl
];

export function looksLikeCareerUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url) return false;
  const u = url.toLowerCase();
  return CAREER_PATH_HINTS.some((h) => u.includes(h));
}

// JSON schema Firecrawl uses for direct structured extraction (no LLM cost on us).
export const FIRECRAWL_JOB_SCHEMA = {
  type: "object",
  properties: {
    is_job_posting: { type: "boolean", description: "True only if this page advertises an open position" },
    role_title: { type: "string" },
    company_name: { type: "string" },
    country: { type: "string", description: "Full English country name" },
    city: { type: "string" },
    employment_type: { type: "string" },
    salary_min: { type: "number" },
    salary_max: { type: "number" },
    salary_currency: { type: "string" },
    visa_sponsorship: { type: "boolean" },
    accommodation_provided: { type: "boolean" },
    headcount: { type: "number", description: "Number of workers needed if mentioned" },
    contact_email: { type: "string" },
    contact_phone: { type: "string" },
    posted_at: { type: "string", description: "ISO date if shown" },
    is_blue_collar: { type: "boolean" },
    summary: { type: "string", description: "2-3 sentence summary" },
  },
  required: ["is_job_posting"],
} as const;