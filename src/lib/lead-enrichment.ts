// Deduplication + enrichment for demand leads.
//
// Two leads are merged when they share either:
//   1) a normalized website domain (apex domain after stripping www., common
//      ccTLD/sld combinations preserved), OR
//   2) the same normalized company name within the same country.
//
// On merge we keep the highest-scoring lead as the "primary" and fold in
// LinkedIn/website/email/phone/contact-name/sector tags/worker origins from the
// duplicates. We also derive likely email patterns (first.last@, flast@, etc.)
// from the company domain and a contact name when one is available.

const SOCIAL_HOSTS = /(linkedin|facebook|twitter|x|instagram|indeed|glassdoor|google|bing|yahoo|youtube|tiktok)\./i;

/** Extract apex-ish domain from a URL or email. Returns lowercase, no www. */
export function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  // email
  if (raw.includes("@") && !raw.includes("/")) {
    const at = raw.split("@")[1];
    return cleanHost(at);
  }
  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
    return cleanHost(url.hostname);
  } catch {
    return null;
  }
}

function cleanHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.replace(/^www\./, "").trim();
  if (!h || h.indexOf(".") < 0) return null;
  if (SOCIAL_HOSTS.test(h)) return null; // social/job boards aren't company domains
  return h;
}

/** Normalized company name: lowercase, strip legal suffixes & punctuation. */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[®©™]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(d\.?o\.?o\.?|d\.?o\.?o\.?el|gmbh|ag|kg|s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?|sas|bv|nv|ltd|llc|inc|plc|co|corp|kft|sp\.?\s*z\s*o\.?o\.?|oy|ab|ou|sia|uab|eood|ood|ad|dd|sa)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Stable dedupe key — domain wins, otherwise normalized name + country. */
export function leadDedupeKey(args: {
  domain: string | null;
  name: string | null;
  country: string | null;
}): string {
  if (args.domain) return `d:${args.domain}`;
  const n = normalizeCompanyName(args.name);
  if (!n) return `id:${Math.random().toString(36).slice(2)}`; // never merge unnamed
  return `n:${n}|c:${(args.country ?? "").toLowerCase()}`;
}

/** Split a contact name into first/last (best-effort). */
function splitName(full: string | null | undefined): { first: string; last: string } | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0].toLowerCase(), last: parts[parts.length - 1].toLowerCase() };
}

const ASCII = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

/** Build candidate work emails from a contact name + company domain. */
export function guessEmailPatterns(
  contactName: string | null | undefined,
  domain: string | null,
): string[] {
  if (!domain) return [];
  const generics = ["info", "hr", "careers", "jobs", "contact", "recruitment", "people"]
    .map((u) => `${u}@${domain}`);
  const split = splitName(contactName);
  if (!split) return generics;
  const f = ASCII(split.first);
  const l = ASCII(split.last);
  if (!f || !l) return generics;
  const named = [
    `${f}.${l}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f}_${l}@${domain}`,
    `${f}@${domain}`,
    `${f}.${l[0]}@${domain}`,
  ];
  // Named patterns first — more useful for outreach.
  return Array.from(new Set([...named, ...generics]));
}

export type Enrichable = {
  id: string;
  employer_name: string | null;
  country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  source_url: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  sector_tags: string[] | null;
  worker_origin_focus: string[] | null;
  computed_score?: number;
};

export type Enrichment = {
  domain: string | null;
  dedupe_key: string;
  duplicate_count: number;          // how many extra leads were merged in
  duplicate_ids: string[];          // ids of the merged-in leads
  extra_emails: string[];           // unique emails harvested across duplicates
  email_patterns: string[];         // guessed work emails from name + domain
};

/** Pick the best domain for a lead from website/linkedin/email/source URLs. */
export function pickPrimaryDomain(lead: Enrichable, fallbackEmails: string[] = []): string | null {
  return (
    extractDomain(lead.website_url) ??
    extractDomain(lead.contact_email) ??
    extractDomain(lead.source_url) ??
    extractDomain(fallbackEmails[0] ?? null)
  );
}

/**
 * Merge an array of leads in-place by dedupe key. Keeps the highest
 * `computed_score` as primary; folds enrichable fields from duplicates.
 * Returns deduped leads with attached `enrichment` metadata.
 */
export function dedupeAndEnrich<T extends Enrichable>(
  leads: T[],
  collectEmailsForLead: (lead: T) => string[] = () => [],
): (T & { enrichment: Enrichment })[] {
  const groups = new Map<string, T[]>();
  for (const l of leads) {
    const harvestedEmails = collectEmailsForLead(l);
    const domain = pickPrimaryDomain(l, harvestedEmails);
    const key = leadDedupeKey({ domain, name: l.employer_name, country: l.country });
    const arr = groups.get(key);
    if (arr) arr.push(l); else groups.set(key, [l]);
  }

  const out: (T & { enrichment: Enrichment })[] = [];
  for (const [key, group] of groups) {
    // Highest computed_score wins; ties broken by most-complete contact info.
    group.sort((a, b) => {
      const sa = a.computed_score ?? 0;
      const sb = b.computed_score ?? 0;
      if (sa !== sb) return sb - sa;
      const score = (x: T) =>
        (x.contact_email ? 2 : 0) + (x.contact_phone ? 1 : 0) + (x.linkedin_url ? 1 : 0) + (x.website_url ? 1 : 0);
      return score(b) - score(a);
    });
    const primary = { ...group[0] } as T;
    const dups = group.slice(1);

    // Fold enrichment fields from duplicates onto the primary.
    const allEmails = new Set<string>();
    if (primary.contact_email) allEmails.add(primary.contact_email.toLowerCase());
    for (const d of group) {
      for (const e of collectEmailsForLead(d)) allEmails.add(e.toLowerCase());
      if (d.contact_email) allEmails.add(d.contact_email.toLowerCase());
      primary.linkedin_url = primary.linkedin_url ?? d.linkedin_url;
      primary.website_url = primary.website_url ?? d.website_url;
      primary.contact_email = primary.contact_email ?? d.contact_email;
      primary.contact_phone = primary.contact_phone ?? d.contact_phone;
      primary.contact_name = primary.contact_name ?? d.contact_name;
      primary.sector_tags = mergeUnique(primary.sector_tags, d.sector_tags);
      primary.worker_origin_focus = mergeUnique(primary.worker_origin_focus, d.worker_origin_focus);
    }

    const domain = pickPrimaryDomain(primary, [...allEmails]);
    const extraEmails = [...allEmails].filter((e) => e !== primary.contact_email?.toLowerCase());
    const enrichment: Enrichment = {
      domain,
      dedupe_key: key,
      duplicate_count: dups.length,
      duplicate_ids: dups.map((d) => d.id),
      extra_emails: extraEmails,
      email_patterns: guessEmailPatterns(primary.contact_name, domain),
    };
    out.push(Object.assign(primary, { enrichment }));
  }
  return out;
}

function mergeUnique(a: string[] | null, b: string[] | null): string[] {
  return Array.from(new Set([...(a ?? []), ...(b ?? [])]));
}