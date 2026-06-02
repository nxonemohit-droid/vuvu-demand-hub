// Status pill + blocking-reason derivation for the Mail / Outreach surface.
// Single source of truth so the Leads tab and Pending Mails tab agree.

export type OutreachStatus =
  | "new"
  | "queued"
  | "sent"
  | "replied"
  | "bounced"
  | "snoozed"
  | "unsubscribed"
  | "suppressed";

export type BlockingReason =
  | "missing_email"
  | "missing_first_name"
  | "unresolved_template_var"
  | "over_daily_cap"
  | "suppressed"
  | "bounced"
  | "provider_error"
  | "lead_deleted"
  | "none";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (e?: string | null): boolean =>
  !!e && EMAIL_RE.test(e.trim());

export const hasUnresolvedVars = (text?: string | null): boolean => {
  if (!text) return false;
  // Matches any leftover {{ token }} that did not get replaced.
  // Skips handlebars control blocks ({{#if}} / {{/if}}).
  return /\{\{\s*(?!#|\/)[\w.-]+\s*\}\}/.test(text);
};

export type LeadForStatus = {
  id: string;
  contact_email?: string | null;
  contact_linkedin?: string | null;
  email_status?: string | null;
  email_last_event?: string | null;
  replied_at?: string | null;
  snoozed_until?: string | null;
};

/**
 * Resolve the single status pill shown next to a lead.
 * Inputs that don't exist on every row default to undefined and are ignored.
 */
export function resolveLeadStatus(
  lead: LeadForStatus,
  ctx: {
    suppressedEmails: Set<string>;
    pendingLeadIds: Set<string>;
  },
): OutreachStatus {
  const email = (lead.contact_email ?? "").trim().toLowerCase();
  if (email && ctx.suppressedEmails.has(email)) return "suppressed";

  const last = (lead.email_last_event ?? "").toLowerCase();
  if (lead.email_status === "bounced" || last === "bounced") return "bounced";
  if (last === "unsubscribed") return "unsubscribed";
  if (lead.replied_at) return "replied";

  if (lead.snoozed_until && new Date(lead.snoozed_until) > new Date()) {
    return "snoozed";
  }
  if (ctx.pendingLeadIds.has(lead.id)) return "queued";
  if (lead.email_status === "sent") return "sent";
  return "new";
}

/** A lead is outreach-eligible if it has a usable channel and isn't burned. */
export function isEligible(
  lead: LeadForStatus,
  ctx: { suppressedEmails: Set<string> },
): boolean {
  const status = resolveLeadStatus(lead, {
    suppressedEmails: ctx.suppressedEmails,
    pendingLeadIds: new Set(),
  });
  if (status === "bounced" || status === "unsubscribed" || status === "suppressed") {
    return false;
  }
  const emailOk = isValidEmail(lead.contact_email);
  const liOk = !!(lead.contact_linkedin && lead.contact_linkedin.trim().length > 5);
  return emailOk || liOk;
}

export type PendingMailRow = {
  id: string;
  lead_id: string | null;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  send_at: string | null;
  status: string;
  error: string | null;
  blocking_reason: string | null;
  created_at: string;
};

export type PendingBucket = "draft" | "scheduled" | "awaiting_enrichment" | "blocked";

export function classifyPending(
  row: PendingMailRow,
  ctx: {
    suppressedEmails: Set<string>;
    leadEmailSource: Map<string, string>; // lead_id → email_source
    sentTodayCount: number;
    dailyCap: number;
  },
): { bucket: PendingBucket; reason: BlockingReason; detail?: string } {
  // Terminal / failed
  if (row.status === "failed") {
    if (row.error?.toLowerCase().includes("invalid recipient")) {
      return { bucket: "blocked", reason: "missing_email", detail: row.error ?? undefined };
    }
    return { bucket: "blocked", reason: "provider_error", detail: row.error ?? undefined };
  }

  // Pending checks
  const email = (row.to_email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { bucket: "awaiting_enrichment", reason: "missing_email" };
  }
  if (row.lead_id) {
    const src = ctx.leadEmailSource.get(row.lead_id);
    if (src === "missing") {
      return { bucket: "awaiting_enrichment", reason: "missing_email" };
    }
  }
  if (ctx.suppressedEmails.has(email)) {
    return { bucket: "blocked", reason: "suppressed" };
  }
  if (hasUnresolvedVars(row.subject) || hasUnresolvedVars(row.body)) {
    return { bucket: "blocked", reason: "unresolved_template_var" };
  }
  if (ctx.dailyCap > 0 && ctx.sentTodayCount >= ctx.dailyCap) {
    return { bucket: "blocked", reason: "over_daily_cap" };
  }

  const sendAt = row.send_at ? new Date(row.send_at).getTime() : 0;
  if (sendAt > Date.now() + 30_000) {
    return { bucket: "scheduled", reason: "none" };
  }
  return { bucket: "draft", reason: "none" };
}

export const STATUS_BADGE: Record<OutreachStatus, { label: string; tone: string }> = {
  new:          { label: "New",          tone: "bg-muted text-foreground border-border" },
  queued:       { label: "Queued",       tone: "bg-primary/10 text-primary border-primary/30" },
  sent:         { label: "Sent",         tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  replied:      { label: "Replied",      tone: "bg-emerald-600 text-emerald-50 border-transparent" },
  bounced:      { label: "Bounced",      tone: "bg-destructive/15 text-destructive border-destructive/30" },
  snoozed:      { label: "Snoozed",      tone: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  unsubscribed: { label: "Unsubscribed", tone: "bg-destructive/10 text-destructive border-destructive/20" },
  suppressed:   { label: "Suppressed",   tone: "bg-destructive/10 text-destructive border-destructive/20" },
};

export const REASON_LABEL: Record<BlockingReason, string> = {
  missing_email: "Missing email",
  missing_first_name: "Missing first name",
  unresolved_template_var: "Unresolved template variable",
  over_daily_cap: "Sender over daily cap",
  suppressed: "Recipient suppressed",
  bounced: "Recipient bounced",
  provider_error: "Provider error",
  lead_deleted: "Lead deleted",
  none: "—",
};