// Centralised taxonomies for the Leads search experience.
// Edit here to broaden filters across the UI and (later) backfill scripts.

export const WORKER_ORIGINS = ["India", "Nepal", "Bangladesh"] as const;
export type WorkerOrigin = (typeof WORKER_ORIGINS)[number];

export const TARGET_AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "recruiter", label: "Recruiters" },
  { value: "recruitment_agency", label: "Recruitment Agencies" },
  { value: "hr_manager", label: "HR Managers" },
  { value: "hiring_manager", label: "Hiring Managers" },
  { value: "staffing", label: "Staffing" },
  { value: "freelance_recruiter", label: "Freelance Recruiters" },
  { value: "employer_direct", label: "Employer Direct" },
];

export const SECTOR_OPTIONS: { value: string; label: string }[] = [
  { value: "construction", label: "Construction" },
  { value: "hospitality", label: "Hospitality" },
  { value: "healthcare", label: "Healthcare" },
  { value: "logistics", label: "Logistics & Warehouse" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "agriculture", label: "Agriculture" },
  { value: "cleaning", label: "Cleaning" },
  { value: "security", label: "Security" },
  { value: "retail", label: "Retail" },
];

// Balkans + EU countries we actively target. Order: Balkans first, then EU.
export const TARGET_COUNTRIES = [
  "Serbia","Croatia","Slovenia","Bosnia and Herzegovina","Montenegro",
  "North Macedonia","Albania","Bulgaria","Romania","Greece",
  "Germany","Austria","Netherlands","Belgium","France","Italy",
  "Spain","Portugal","Poland","Czechia","Slovakia","Hungary","Malta",
] as const;

export const BALKAN_COUNTRIES = [
  "Serbia","Croatia","Slovenia","Bosnia and Herzegovina","Montenegro",
  "North Macedonia","Albania","Bulgaria","Romania","Greece",
] as const;

export type SortKey = "priority" | "recency" | "country" | "industry";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "priority", label: "Priority (high → low)" },
  { value: "recency", label: "Most recent" },
  { value: "country", label: "Country (A → Z)" },
  { value: "industry", label: "Industry (A → Z)" },
];

export type ContactRequirement = "email" | "phone" | "website";

export type LeadFilters = {
  search: string;
  countries: string[];
  workerOrigins: string[];
  audiences: string[];
  sectors: string[];
  contactReq: ContactRequirement[];
  sort: SortKey;
};

export const EMPTY_FILTERS: LeadFilters = {
  search: "",
  countries: [],
  workerOrigins: [],
  audiences: [],
  sectors: [],
  contactReq: [],
  sort: "priority",
};

export const RECRUITER_MODE_FILTERS: LeadFilters = {
  ...EMPTY_FILTERS,
  countries: [...TARGET_COUNTRIES],
  workerOrigins: [...WORKER_ORIGINS],
  audiences: ["recruiter", "recruitment_agency", "staffing", "freelance_recruiter"],
  sectors: ["construction","hospitality","healthcare","logistics","manufacturing","agriculture"],
  sort: "priority",
};

export const BUILTIN_PRESETS: { id: string; name: string; filters: LeadFilters }[] = [
  {
    id: "balkans-construction",
    name: "Balkans · Construction",
    filters: { ...EMPTY_FILTERS, countries: [...BALKAN_COUNTRIES], sectors: ["construction"], sort: "priority" },
  },
  {
    id: "eu-hospitality",
    name: "EU · Hospitality",
    filters: {
      ...EMPTY_FILTERS,
      countries: ["Germany","Austria","Netherlands","France","Italy","Spain","Portugal","Greece"],
      sectors: ["hospitality"],
      sort: "priority",
    },
  },
  {
    id: "agencies-only",
    name: "Agencies & Staffing only",
    filters: { ...EMPTY_FILTERS, audiences: ["recruitment_agency","staffing","freelance_recruiter"], sort: "recency" },
  },
  {
    id: "with-email",
    name: "Has email · recent",
    filters: { ...EMPTY_FILTERS, contactReq: ["email"], sort: "recency" },
  },
];
