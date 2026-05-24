// Shared shape + builder for a "Lead" object used across the leads list,
// the LeadCard, and the lead detail page. Centralised here so the table,
// cards and detail page all show the same enriched fields without
// duplicating the picker / scoring / dedupe logic.

import {
  TARGET_AUDIENCE_OPTIONS,
  SECTOR_OPTIONS,
  COMPANY_SIZE_OPTIONS,
} from "@/lib/lead-taxonomies";
import { computeLeadScore, type ScoreBreakdown } from "@/lib/lead-scoring";
import { dedupeAndEnrich, type Enrichment } from "@/lib/lead-enrichment";

export type RawLead = {
  id: string;
  employer_name: string | null;
  role: string;
  country: string;
  city: string | null;
  priority: string;
  score: number | null;
  urgency_score: number;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  phone_e164?: string | null;
  whatsapp_number?: string | null;
  source_url: string | null;
  created_at: string;
  demand_size: number | null;
  worker_origin_focus: string[] | null;
  target_audience_type: string | null;
  sector_tags: string[] | null;
  raw_signals: { payload: Record<string, unknown> | null } | null;
  quality_score?: number | null;
};

export type Lead = RawLead & {
  linkedin_url: string | null;
  website_url: string | null;
  company_size: string;
  computed_score: number;
  score_breakdown: ScoreBreakdown;
  enrichment: Enrichment;
};

export const LEAD_SELECT_COLUMNS =
  "id,employer_name,role,country,city,priority,score,urgency_score,quality_score,contact_email,contact_name,contact_phone,phone_e164,whatsapp_number,source_url,created_at,demand_size,worker_origin_focus,target_audience_type,sector_tags,raw_signals(payload)";

/* ---------------- pickers ---------------- */

export function pickLinkedIn(lead: RawLead): string | null {
  if (lead.source_url && /linkedin\.com\//i.test(lead.source_url)) return lead.source_url;
  const payload = lead.raw_signals?.payload;
  if (!payload || typeof payload !== "object") return null;
  const candidates = ["linkedin_url","linkedinUrl","linkedin","company_linkedin","companyLinkedin","employer_linkedin"];
  for (const key of candidates) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "string" && v.includes("linkedin.com")) return v;
  }
  for (const v of Object.values(payload)) {
    if (typeof v === "string") {
      const m = v.match(/https?:\/\/[^\s"']*linkedin\.com\/[^\s"']+/i);
      if (m) return m[0];
    }
  }
  return null;
}

export function pickWebsite(lead: RawLead): string | null {
  const payload = lead.raw_signals?.payload as Record<string, unknown> | null | undefined;
  if (payload) {
    for (const key of ["website","company_website","companyWebsite","website_url","employer_website","url"]) {
      const v = payload[key];
      if (typeof v === "string" && /^https?:\/\//i.test(v) && !/linkedin\.com|facebook\.com|indeed\.com/i.test(v)) {
        return v;
      }
    }
  }
  if (
    lead.source_url &&
    !/linkedin\.com|facebook\.com|indeed\.com|google\.com/i.test(lead.source_url)
  ) {
    return lead.source_url;
  }
  return null;
}

export function collectUrls(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload) return [];
  const urls = new Set<string>();
  const walk = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      const m = v.match(/https?:\/\/[^\s"'<>)]+/gi);
      if (m) m.forEach((x) => urls.add(x));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(payload);
  return Array.from(urls);
}

export function collectEmails(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload) return [];
  const emails = new Set<string>();
  const walk = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      const m = v.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (m) m.forEach((e) => emails.add(e));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(payload);
  return Array.from(emails);
}

/* ---------------- labels ---------------- */

export function audienceLabel(value: string | null): string {
  if (!value) return "—";
  return TARGET_AUDIENCE_OPTIONS.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}

export function sectorLabel(value: string): string {
  return SECTOR_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function sizeLabel(value: string): string {
  return COMPANY_SIZE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Infer company size bucket from headcount/employees fields in raw payload. */
export function inferCompanySize(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return "unknown";
  const candidateKeys = [
    "company_size","companySize","employees","employee_count","employeeCount",
    "headcount","staff_count","size","company_employees",
  ];
  let n: number | null = null;
  for (const key of candidateKeys) {
    const v = payload[key];
    if (typeof v === "number" && Number.isFinite(v)) { n = v; break; }
    if (typeof v === "string") {
      const m = v.match(/(\d[\d,\.]*)/);
      if (m) {
        const parsed = parseInt(m[1].replace(/[,\.]/g, ""), 10);
        if (Number.isFinite(parsed)) { n = parsed; break; }
      }
      const lower = v.toLowerCase();
      if (/1\s*-\s*50|small|<\s*50/.test(lower)) return "small";
      if (/51\s*-\s*250|medium|mid/.test(lower)) return "medium";
      if (/251\s*-\s*1000|large/.test(lower)) return "large";
      if (/1000\+|enterprise|10000?\+/.test(lower)) return "enterprise";
    }
  }
  if (n == null) return "unknown";
  if (n <= 50) return "small";
  if (n <= 250) return "medium";
  if (n <= 1000) return "large";
  return "enterprise";
}

/* ---------------- builders ---------------- */

/** Promote a raw row into a fully-enriched Lead (without dedupe). */
export function enrichSingle(row: RawLead): Lead {
  const breakdown = computeLeadScore(row);
  const enriched = {
    ...row,
    linkedin_url: pickLinkedIn(row),
    website_url: pickWebsite(row),
    company_size: inferCompanySize(row.raw_signals?.payload ?? null),
    computed_score: breakdown.total,
    score_breakdown: breakdown,
  };
  // Run through dedupe just to populate `enrichment` consistently.
  const [withEnrichment] = dedupeAndEnrich([enriched], (l) =>
    collectEmails(l.raw_signals?.payload ?? null),
  );
  return withEnrichment as Lead;
}

/** Same flow as Leads page: score every row, then dedupe + enrich. */
export function enrichMany(rows: RawLead[]): Lead[] {
  const scored = rows.map((row) => {
    const breakdown = computeLeadScore(row);
    return {
      ...row,
      linkedin_url: pickLinkedIn(row),
      website_url: pickWebsite(row),
      company_size: inferCompanySize(row.raw_signals?.payload ?? null),
      computed_score: breakdown.total,
      score_breakdown: breakdown,
    };
  });
  return dedupeAndEnrich(scored, (l) =>
    collectEmails(l.raw_signals?.payload ?? null),
  ) as Lead[];
}

export const PRIORITY_PILL_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-primary/10 text-primary border-primary/30",
  low: "bg-muted text-muted-foreground border-border",
};

/** Color the *numeric* priority score: red ≥80, amber 50–79, green <50. */
export function priorityScoreClass(score: number): string {
  if (score >= 80) return "bg-destructive/10 text-destructive border-destructive/30";
  if (score >= 50) return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
}

/** Tier + label for the data-quality score (0–100). */
export function qualityTier(score: number | null | undefined): {
  cls: string;
  symbol: string;
  label: string;
} {
  const s = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  if (s >= 70) return { cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", symbol: "★", label: `${s}` };
  if (s >= 40) return { cls: "bg-amber-500/10 text-amber-600 border-amber-500/30", symbol: "◑", label: `${s}` };
  return { cls: "bg-destructive/10 text-destructive border-destructive/30", symbol: "✕", label: `${s}` };
}