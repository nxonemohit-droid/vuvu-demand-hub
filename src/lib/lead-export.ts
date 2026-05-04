// CSV / JSON exporters for demand leads.
// CSV is a flat row per lead with the most useful fields (incl. enrichment).
// JSON is the full enriched object so downstream tooling can use everything.

type AnyLead = Record<string, unknown> & {
  id: string;
  employer_name?: string | null;
  role?: string;
  country?: string;
  city?: string | null;
  priority?: string;
  computed_score?: number;
  urgency_score?: number;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  source_url?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  target_audience_type?: string | null;
  sector_tags?: string[] | null;
  worker_origin_focus?: string[] | null;
  demand_size?: number | null;
  created_at?: string;
  enrichment?: {
    domain?: string | null;
    duplicate_count?: number;
    extra_emails?: string[];
    email_patterns?: string[];
  };
};

const CSV_COLUMNS: { key: string; header: string; get: (l: AnyLead) => unknown }[] = [
  { key: "id",            header: "ID",                   get: (l) => l.id },
  { key: "employer_name", header: "Employer",             get: (l) => l.employer_name ?? "" },
  { key: "role",          header: "Role",                 get: (l) => l.role ?? "" },
  { key: "country",       header: "Country",              get: (l) => l.country ?? "" },
  { key: "city",          header: "City",                 get: (l) => l.city ?? "" },
  { key: "priority",      header: "Priority",             get: (l) => l.priority ?? "" },
  { key: "score",         header: "Score",                get: (l) => l.computed_score ?? 0 },
  { key: "urgency",       header: "Urgency",              get: (l) => l.urgency_score ?? 0 },
  { key: "audience",      header: "Audience",             get: (l) => l.target_audience_type ?? "" },
  { key: "sectors",       header: "Sectors",              get: (l) => (l.sector_tags ?? []).join("; ") },
  { key: "worker_origin", header: "Worker source",        get: (l) => (l.worker_origin_focus ?? []).join("; ") },
  { key: "demand_size",   header: "Demand size",          get: (l) => l.demand_size ?? "" },
  { key: "contact_name",  header: "Contact name",         get: (l) => l.contact_name ?? "" },
  { key: "contact_email", header: "Contact email",        get: (l) => l.contact_email ?? "" },
  { key: "contact_phone", header: "Contact phone",        get: (l) => l.contact_phone ?? "" },
  { key: "domain",        header: "Domain",               get: (l) => l.enrichment?.domain ?? "" },
  { key: "website",       header: "Website",              get: (l) => l.website_url ?? "" },
  { key: "linkedin",      header: "LinkedIn",             get: (l) => l.linkedin_url ?? "" },
  { key: "source_url",    header: "Source URL",           get: (l) => l.source_url ?? "" },
  { key: "extra_emails",  header: "Other emails",         get: (l) => (l.enrichment?.extra_emails ?? []).join("; ") },
  { key: "email_guesses", header: "Likely emails (guess)", get: (l) => (l.enrichment?.email_patterns ?? []).slice(0, 6).join("; ") },
  { key: "duplicates",    header: "Duplicates merged",    get: (l) => l.enrichment?.duplicate_count ?? 0 },
  { key: "created_at",    header: "Created at",           get: (l) => l.created_at ?? "" },
];

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function leadsToCsv(leads: AnyLead[]): string {
  const head = CSV_COLUMNS.map((c) => csvEscape(c.header)).join(",");
  const rows = leads.map((l) => CSV_COLUMNS.map((c) => csvEscape(c.get(l))).join(","));
  // BOM so Excel treats UTF-8 correctly.
  return "\uFEFF" + [head, ...rows].join("\r\n");
}

export function leadsToJson(leads: AnyLead[]): string {
  return JSON.stringify(leads, null, 2);
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportLeads(leads: AnyLead[], format: "csv" | "json", baseName = "voynova-leads") {
  const ts = timestamp();
  if (format === "csv") {
    downloadFile(`${baseName}-${ts}.csv`, leadsToCsv(leads), "text/csv");
  } else {
    downloadFile(`${baseName}-${ts}.json`, leadsToJson(leads), "application/json");
  }
}

export function safeFileSlug(s: string | null | undefined, fallback = "lead"): string {
  if (!s) return fallback;
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
}