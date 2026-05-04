// Shared classifiers/derivations used across Leads list, cards and detail page.

export type Freshness = "fresh" | "aging" | "stale";

export function getFreshness(createdAt: string | null | undefined): Freshness {
  if (!createdAt) return "stale";
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (days < 14) return "fresh";
  if (days <= 45) return "aging";
  return "stale";
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
};

export const FRESHNESS_CLASS: Record<Freshness, string> = {
  fresh: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  aging: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  stale: "bg-destructive/10 text-destructive border-destructive/30",
};

export type TrustTier = "high" | "medium" | "low";

const HIGH_TRUST = ["company_site", "linkedin"];
const MEDIUM_TRUST = ["indeed", "directory", "google_jobs"];
// everything else (facebook, classifieds, twitter, ...) → low

export function getTrustTier(source: string | null | undefined): TrustTier {
  const s = (source ?? "").toLowerCase();
  if (HIGH_TRUST.some((k) => s.includes(k))) return "high";
  if (MEDIUM_TRUST.some((k) => s.includes(k))) return "medium";
  return "low";
}

export const TRUST_RANK: Record<TrustTier, number> = { high: 3, medium: 2, low: 1 };

export const TRUST_DOT_CLASS: Record<TrustTier, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-destructive",
};

export const TRUST_LABEL: Record<TrustTier, string> = {
  high: "High trust source",
  medium: "Medium trust source",
  low: "Low trust source",
};

export type RoleType = "decision_maker" | "recruiter" | "other";

const DECISION_KW = [
  "ceo","cto","coo","cfo","founder","co-founder","owner","president",
  "director","head of","vp","vice president","managing","chief","partner",
];
const RECRUITER_KW = [
  "recruit","talent","sourc","hr ","human resources","people ops","staffing",
  "headhunt","hiring manager",
];

export function classifyRoleType(role: string | null | undefined, audience?: string | null): RoleType {
  const r = (role ?? "").toLowerCase();
  const a = (audience ?? "").toLowerCase();
  if (RECRUITER_KW.some((k) => r.includes(k)) || /recruit|staffing|hr_manager|sourcer/.test(a)) {
    return "recruiter";
  }
  if (DECISION_KW.some((k) => r.includes(k)) || a === "hiring_manager") {
    return "decision_maker";
  }
  return "other";
}

export const ROLE_TYPE_LABEL: Record<RoleType, string> = {
  decision_maker: "Decision Maker",
  recruiter: "Recruiter",
  other: "Other",
};

export const ROLE_TYPE_CLASS: Record<RoleType, string> = {
  decision_maker: "bg-primary/10 text-primary border-primary/30",
  recruiter: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

/** Extract bare domain from a website url, contact email, or null. */
export function extractDomain(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes("@")) {
      const d = c.split("@")[1]?.toLowerCase().trim();
      if (d) return d.replace(/^www\./, "");
    }
    try {
      const u = new URL(c.startsWith("http") ? c : `https://${c}`);
      return u.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      /* ignore */
    }
  }
  return null;
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","aol.com",
  "proton.me","protonmail.com","gmx.com","mail.com","yandex.com","live.com",
]);

export function isGenericEmailDomain(email: string | null | undefined): boolean {
  if (!email || !email.includes("@")) return false;
  const d = email.split("@")[1]?.toLowerCase();
  return !!d && GENERIC_EMAIL_DOMAINS.has(d);
}
