// CSV / JSON exporters for demand leads.
// CSV uses papaparse with the canonical Voynova column set so downstream
// CRMs / spreadsheets always get a predictable shape.
// JSON is the full enriched object so downstream tooling can use everything.
import Papa from "papaparse";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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

/**
 * Generate a quick PDF summary table of the given leads.
 * Brand colors: Voynova blue (#0052CC) header, green (#36B37E) accent.
 */
export function exportLeadsPdf(leads: AnyLead[], baseName = "voynova-leads") {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const ts = timestamp();

  // Header
  doc.setFillColor(0, 82, 204);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 56, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Voynova — Lead Export", 32, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${leads.length} leads · generated ${new Date().toLocaleString("en-GB")}`, 32, 44);

  autoTable(doc, {
    startY: 72,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [0, 82, 204], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 245, 247] },
    margin: { left: 24, right: 24 },
    head: [[
      "Company", "Contact", "Role", "Country", "Industry",
      "Priority", "Score", "Email", "Phone",
    ]],
    body: leads.map((l) => [
      l.employer_name ?? "—",
      l.contact_name ?? "—",
      l.role ?? "—",
      [l.country, l.city].filter(Boolean).join(", "),
      (l.sector_tags ?? []).slice(0, 2).join(", "),
      l.priority ?? "—",
      String(l.computed_score ?? l.urgency_score ?? 0),
      l.contact_email ?? "—",
      l.contact_phone ?? "—",
    ]),
    columnStyles: { 0: { fontStyle: "bold" } },
  });

  // Footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Voynova Global Solutions · page ${i}/${pages}`,
      doc.internal.pageSize.getWidth() - 32,
      doc.internal.pageSize.getHeight() - 16,
      { align: "right" },
    );
  }

  doc.save(`${baseName}-${ts}.pdf`);
}

export function safeFileSlug(s: string | null | undefined, fallback = "lead"): string {
  if (!s) return fallback;
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
}