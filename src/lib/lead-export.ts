// CSV / JSON exporters for demand leads.
// CSV uses papaparse with the canonical Voynova column set so downstream
// CRMs / spreadsheets always get a predictable shape.
// JSON is the full enriched object so downstream tooling can use everything.
import Papa from "papaparse";

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
  notes?: string | null;
  enrichment?: {
    domain?: string | null;
    duplicate_count?: number;
    extra_emails?: string[];
    email_patterns?: string[];
  };
};

/**
 * Canonical Voynova lead-export column set.
 * Order is meaningful — keep stable so partner imports don't break.
 */
const CSV_COLUMNS: { header: string; get: (l: AnyLead) => unknown }[] = [
  { header: "company",             get: (l) => l.employer_name ?? "" },
  { header: "contact_name",        get: (l) => l.contact_name ?? "" },
  { header: "role",                get: (l) => l.role ?? "" },
  { header: "email",               get: (l) => l.contact_email ?? "" },
  { header: "phone",               get: (l) => l.contact_phone ?? "" },
  { header: "website",             get: (l) => l.website_url ?? "" },
  { header: "linkedin",            get: (l) => l.linkedin_url ?? "" },
  { header: "country",             get: (l) => l.country ?? "" },
  { header: "city",                get: (l) => l.city ?? "" },
  { header: "industry",            get: (l) => (l.sector_tags ?? []).join("; ") },
  { header: "worker_origin_focus", get: (l) => (l.worker_origin_focus ?? []).join("; ") },
  { header: "priority_score",      get: (l) => l.computed_score ?? l.urgency_score ?? 0 },
  { header: "signal_date",         get: (l) => l.created_at ?? "" },
  { header: "source_url",          get: (l) => l.source_url ?? "" },
  { header: "notes",               get: (l) => l.notes ?? "" },
];

export function leadsToCsv(leads: AnyLead[]): string {
  const fields = CSV_COLUMNS.map((c) => c.header);
  const data = leads.map((l) => {
    const row: Record<string, unknown> = {};
    for (const c of CSV_COLUMNS) row[c.header] = c.get(l) ?? "";
    return row;
  });
  const csv = Papa.unparse({ fields, data }, { quotes: true, newline: "\r\n" });
  // BOM so Excel treats UTF-8 correctly.
  return "\uFEFF" + csv;
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