// Centralised taxonomies for the Leads search experience.

export const WORKER_ORIGINS = ["India", "Nepal", "Bangladesh"] as const;
export type WorkerOrigin = (typeof WORKER_ORIGINS)[number];

export const TARGET_AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  // People
  { value: "recruiter", label: "Recruiters" },
  { value: "recruitment_agency", label: "Recruitment Agencies" },
  { value: "hr_manager", label: "HR Managers" },
  { value: "hiring_manager", label: "Hiring Managers" },
  { value: "staffing", label: "Staffing Companies" },
  { value: "freelance_recruiter", label: "Freelance Recruiters" },
  { value: "employer_direct", label: "Employer Direct" },
  // Employer-by-sector quick-pick (matches sector_tags)
  { value: "employer:construction", label: "Construction Employers" },
  { value: "employer:hospitality", label: "Hospitality Employers" },
  { value: "employer:logistics", label: "Logistics Employers" },
  { value: "employer:manufacturing", label: "Manufacturing Employers" },
  { value: "employer:agriculture", label: "Agriculture Employers" },
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

// Balkans + EU target countries.
export const BALKAN_COUNTRIES = [
  "Serbia","Croatia","Slovenia","Bosnia and Herzegovina","Montenegro",
  "North Macedonia","Albania","Kosovo","Bulgaria","Romania",
] as const;

export const EU_COUNTRIES = [
  "Germany","Poland","Czechia","Hungary","Slovakia","Austria",
  "Italy","Portugal","Greece","Cyprus","Malta","Netherlands",
] as const;

export const TARGET_COUNTRIES = [...BALKAN_COUNTRIES, ...EU_COUNTRIES] as const;

export const COMPANY_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "small", label: "Small (1–50)" },
  { value: "medium", label: "Medium (51–250)" },
  { value: "large", label: "Large (251–1000)" },
  { value: "enterprise", label: "Enterprise (1000+)" },
  { value: "unknown", label: "Unknown size" },
];

export type SortKey = "priority" | "recency" | "country" | "industry" | "demand";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "priority", label: "Priority (high → low)" },
  { value: "recency", label: "Most recent" },
  { value: "country", label: "Country (A → Z)" },
  { value: "industry", label: "Industry (A → Z)" },
  { value: "demand", label: "Demand volume (high → low)" },
];

export type ContactRequirement = "email" | "phone" | "website";

export type LeadFilters = {
  search: string;
  countries: string[];
  workerOrigins: string[];
  audiences: string[];
  sectors: string[];
  sizes: string[];
  contactReq: ContactRequirement[];
  minScore: number;            // 0..100
  dateFrom: string | null;     // ISO yyyy-mm-dd
  dateTo: string | null;       // ISO yyyy-mm-dd
  sort: SortKey;
};

export const EMPTY_FILTERS: LeadFilters = {
  search: "",
  countries: [],
  workerOrigins: [],
  audiences: [],
  sectors: [],
  sizes: [],
  contactReq: [],
  minScore: 0,
  dateFrom: null,
  dateTo: null,
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
    id: "hot-balkan-construction",
    name: "🔥 Hot Balkan Construction",
    filters: {
      ...EMPTY_FILTERS,
      countries: [...BALKAN_COUNTRIES],
      sectors: ["construction"],
      workerOrigins: [...WORKER_ORIGINS],
      minScore: 70,
      dateFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      sort: "demand",
    },
  },
  {
    id: "eu-hospitality-now",
    name: "🛎️ EU Hospitality Hiring Now",
    filters: {
      ...EMPTY_FILTERS,
      countries: ["Germany","Austria","Netherlands","Italy","Portugal","Greece","Cyprus","Malta"],
      sectors: ["hospitality"],
      workerOrigins: [...WORKER_ORIGINS],
      minScore: 60,
      dateFrom: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      sort: "recency",
    },
  },
  {
    id: "nepal-india-pipeline",
    name: "🇳🇵🇮🇳 Nepal–India Pipeline",
    filters: {
      ...EMPTY_FILTERS,
      countries: [...TARGET_COUNTRIES],
      workerOrigins: ["Nepal", "India"],
      sort: "demand",
    },
  },
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
      countries: ["Germany","Austria","Netherlands","Italy","Portugal","Greece"],
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
  {
    id: "high-score-30d",
    name: "Score ≥ 70 · last 30 days",
    filters: {
      ...EMPTY_FILTERS,
      minScore: 70,
      dateFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      sort: "recency",
    },
  },
];
