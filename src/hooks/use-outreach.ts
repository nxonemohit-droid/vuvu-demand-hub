import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Audience = "employer" | "supply" | "education";
export type Channel = "email" | "whatsapp";
export type StatusFilter = "all" | "sent" | "pending" | "failed" | "none";

export type ChannelStats = { sent: number; pending: number; failed: number; today: number };
export type AudienceStats = { email: ChannelStats; whatsapp: ChannelStats; replied: number };

export type SendRow = {
  id: string;
  channel: Channel;
  status: string;
  to_address: string;
  subject: string | null;
  body: string;
  sent_at: string | null;
  scheduled_for: string;
  error: string | null;
  attempts: number;
};

export type OutreachLead = {
  id: string;
  company: string;
  country: string;
  city: string | null;
  kind: Audience;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  stage: string;
  draft_whatsapp: string | null;
  outreach_sends: SendRow[];
};

export const PAGE_SIZE = 50;
const AUDIENCES: Audience[] = ["employer", "supply", "education"];

/** DD/MM/YYYY HH:mm */
export const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const countSends = async (kind: Audience, channel: Channel, status: string, since?: string) => {
  let q = supabase
    .from("outreach_sends")
    .select("id, leads!inner(kind)", { count: "exact", head: true })
    .eq("leads.kind", kind)
    .eq("channel", channel)
    .eq("status", status);
  if (since) q = q.gte("sent_at", since);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
};

const channelStats = async (kind: Audience, channel: Channel): Promise<ChannelStats> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [sent, pending, failed, todayCount] = await Promise.all([
    countSends(kind, channel, "sent"),
    countSends(kind, channel, "pending"),
    countSends(kind, channel, "failed"),
    countSends(kind, channel, "sent", today.toISOString()),
  ]);
  return { sent, pending, failed, today: todayCount };
};

/** Sent / queued / failed / today counts per audience and channel. */
export const useOutreachStats = () =>
  useQuery({
    queryKey: ["outreach-audience-stats"],
    queryFn: async () => {
      const entries = await Promise.all(
        AUDIENCES.map(async (kind) => {
          const [email, whatsapp, replied] = await Promise.all([
            channelStats(kind, "email"),
            channelStats(kind, "whatsapp"),
            supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("kind", kind)
              .eq("stage", "replied")
              .then(({ count }) => count ?? 0),
          ]);
          return [kind, { email, whatsapp, replied }] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<Audience, AudienceStats>;
    },
    refetchInterval: 30000,
  });

export type LeadListParams = {
  kind: Audience;
  status: StatusFilter;
  channel: Channel | "any";
  country: string;
  search: string;
  page: number;
};

/** Paginated lead list for one audience, with all of its email/WhatsApp sends. */
export const useOutreachLeads = (p: LeadListParams) =>
  useQuery({
    queryKey: ["outreach-leads", p],
    queryFn: async () => {
      const filterJoin = p.status === "all" ? "" : p.status === "none" ? ", f:outreach_sends(id)" : ", f:outreach_sends!inner(id)";
      let q = supabase
        .from("leads")
        .select(
          `id, company, country, city, kind, contact_name, email, phone, whatsapp, stage, draft_whatsapp,
           outreach_sends(id, channel, status, to_address, subject, body, sent_at, scheduled_for, error, attempts)${filterJoin}`,
          { count: "exact" },
        )
        .eq("kind", p.kind)
        .is("merged_into", null)
        .order("updated_at", { ascending: false })
        .range(p.page * PAGE_SIZE, p.page * PAGE_SIZE + PAGE_SIZE - 1);
      if (p.status === "none") q = q.is("f", null);
      else if (p.status !== "all") {
        q = q.eq("f.status", p.status);
        if (p.channel !== "any") q = q.eq("f.channel", p.channel);
      }
      if (p.country) q = q.eq("country", p.country);
      if (p.search.trim()) q = q.ilike("company", `%${p.search.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as OutreachLead[], total: count ?? 0 };
    },
    refetchInterval: 30000,
  });

/** Distinct countries for one audience (for the filter dropdown). */
export const useAudienceCountries = (kind: Audience) =>
  useQuery({
    queryKey: ["outreach-countries", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("country").eq("kind", kind).limit(2000);
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.country).filter(Boolean))].sort();
    },
  });

/** Which profile PDF a lead receives, mirrored from the mail engine's rules. */
export const pdfLabel = (kind: Audience, country: string) =>
  kind === "employer" ? `Employer profile — ${country}` : kind === "supply" ? `Recruiter profile — ${country}` : "Supplier profile";

/** Short, readable reason for a failed send. */
export const friendlyError = (err: string | null) => {
  if (!err) return "";
  if (/Invalid `to` field|non-ASCII|not valid/i.test(err)) return "Address/number galat hai";
  if (/401|403/.test(err)) return "Service ne mana kiya — connection check karo";
  if (/429/.test(err)) return "Limit lagi — thodi der baad dobara";
  if (/template/i.test(err)) return "WhatsApp template ki dikkat";
  if (/Manually skipped/i.test(err)) return "Aapne chhod diya";
  return err.slice(0, 120);
};
