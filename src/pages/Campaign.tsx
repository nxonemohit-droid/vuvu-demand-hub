import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Play, Pause, Plus, Send, RefreshCw, ChevronRight, Mail, AlertTriangle, CheckCircle2,
  MessageCircle, Linkedin, Users, ExternalLink, GraduationCap,
} from "lucide-react";

type Channel = "email" | "whatsapp" | "linkedin";
type LeadSource = "recruiter" | "demand" | "othm";

type Campaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed";
  channel: Channel;
  lead_source: LeadSource;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  daily_limit: number;
  start_date: string | null;
  send_window_start_hour: number;
  send_window_end_hour: number;
  timezone: string;
  subject_template: string | null;
  body_template: string | null;
  created_at: string;
};

type CampaignEmail = {
  id: string;
  campaign_id: string;
  recruiter_id: string | null;
  demand_lead_id: string | null;
  channel: Channel;
  email_to: string | null;
  to_phone: string | null;
  to_linkedin: string | null;
  subject: string | null;
  body_html: string | null;
  status: "pending" | "sent" | "failed" | "bounced" | "skipped";
  scheduled_for: string | null;
  sent_at: string | null;
  resend_message_id: string | null;
  open_count: number;
  click_count: number;
  error: string | null;
};

type RecruiterLead = {
  id: string;
  agency_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_linkedin: string | null;
  hq_country: string | null;
  operating_eu_country: string | null;
  trades: string[] | null;
  quality_score: number | null;
  email_status: string;
  email_source: string | null;
};

type DemandLead = {
  id: string;
  employer_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  phone_e164: string | null;
  whatsapp_number: string | null;
  country: string | null;
  city: string | null;
  role: string | null;
  trade_category: string | null;
  quality_score: number | null;
  outreach_queued: boolean | null;
};

type OthmLead = {
  id: string;
  entity_type: string;
  full_name: string | null;
  institution_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  country: string | null;
  city: string | null;
  course_level: string | null;
  intake_month: string | null;
  preferred_country: string | null;
  stage: string;
  quality_score: number | null;
  outreach_queued: boolean | null;
};

type AnyRecipient = {
  lead_id: string;
  source: LeadSource;
  display_name: string;
  email: string | null;
  phone: string | null;
  phone_e164: string | null;
  linkedin: string | null;
  country: string | null;
  meta: string;
  quality: number;
  already_contacted: boolean;
};

const DEFAULT_SUBJECT =
  "Voynova \u00d7 {{agency_name}} \u2014 Strategic EU Blue-Collar Workforce Partnership";
const DEFAULT_BODY =
  `Hi {{first_name}},<br><br>` +
  `I'm Mohit Gururani, Founder & MD of Voynova Global Solutions \u2014 a compliance-first, AI-powered international workforce partner sourcing pre-vetted blue-collar talent from India, Nepal and Bangladesh for EU employers.<br><br>` +
  `I'm reaching out about a strategic partnership with {{agency_name}} to support your active {{trade}} orders in {{eu_country}} (HQ: {{hq_country}}).<br><br>` +
  `\u2705 Free-recruitment / no-advance-after-deployment models<br>` +
  `\u2705 Pre-screened, compliance-vetted candidates<br>` +
  `\u2705 EU-language coaching, visa & deployment support<br><br>` +
  `Open to a quick 20-min call this week to walk you through live profiles? Even if there's nothing urgent, one conversation typically opens a long-term recurring revenue stream for the agency.<br><br>` +
  `Warm regards,<br>` +
  `Mohit Gururani<br>` +
  `Founder & Managing Director<br>` +
  `Voynova Global Solutions Pvt. Ltd.<br>` +
  `\ud83d\udce7 mohit@voynovaglobal.com<br>` +
  `\ud83c\udf10 www.voynovaglobal.com`;

const DEFAULT_WA_MESSAGE =
  `Hi {{first_name}}, this is Mohit from Voynova Global Solutions.\n\n` +
  `We help employers in {{eu_country}} hire pre-vetted blue-collar workers (welders, drivers, construction, factory) from India, Nepal & Bangladesh \u2014 fully compliance-managed, visa + deployment included.\n\n` +
  `Saw your hiring for {{role}} at {{agency_name}}. Open to a 10-min chat this week?`;

const DEFAULT_LINKEDIN_NOTE =
  `Hi {{first_name}} \u2014 reaching out from Voynova Global Solutions. We supply pre-vetted blue-collar workers (welders, drivers, construction) to EU employers from India / Nepal / Bangladesh with full visa + compliance support. Saw your role for {{role}} \u2014 worth a 10-min chat?`;

const STATUS_TONE: Record<Campaign["status"], string> = {
  draft: "bg-muted text-foreground",
  active: "bg-emerald-600 text-white hover:bg-emerald-600",
  paused: "bg-amber-500 text-white hover:bg-amber-500",
  completed: "bg-blue-600 text-white hover:bg-blue-600",
};

const CHANNEL_META: Record<Channel, { label: string; Icon: typeof Mail; tone: string }> = {
  email:    { label: "Email",    Icon: Mail,          tone: "bg-primary/15 text-primary" },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  linkedin: { label: "LinkedIn", Icon: Linkedin,      tone: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB") : "\u2014";
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "\u2014";

const CampaignPage = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadCampaigns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setCampaigns((data ?? []) as Campaign[]);
    setLoading(false);
  };

  useEffect(() => {
    loadCampaigns();
    const ch = supabase
      .channel("campaigns-list")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "email_campaigns" },
        () => loadCampaigns())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const togglePause = async (c: Campaign) => {
    const next = c.status === "active" ? "paused" : "active";
    const { error } = await supabase
      .from("email_campaigns").update({ status: next }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(next === "active" ? "Resumed" : "Paused");
  };

  const launch = async (c: Campaign) => {
    setBusy(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("schedule-campaign", {
        body: {
          campaign_id: c.id,
          daily_limit: c.daily_limit,
          start_date: c.start_date ?? new Date().toISOString().slice(0, 10),
        },
      });
      if (error) throw error;
      const d = data as { ok?: boolean; scheduled?: number; days?: number; error?: string };
      if (!d?.ok) throw new Error(d?.error ?? "Schedule failed");
      toast.success(`Scheduled ${d.scheduled ?? 0} emails across ${d.days ?? 0} day(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Schedule failed");
    } finally { setBusy(null); }
  };

  const sendTodayBatch = async (c: Campaign) => {
    setBusy(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-campaign-batch", {
        body: { campaign_id: c.id, limit: c.daily_limit ?? 100 },
      });
      if (error) throw error;
      const d = data as { ok?: boolean; sent?: number; failed?: number; skipped?: number; error?: string };
      if (!d?.ok) throw new Error(d?.error ?? "Send failed");
      toast.success(`Sent ${d.sent ?? 0} \u00b7 Failed ${d.failed ?? 0} \u00b7 Skipped ${d.skipped ?? 0}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally { setBusy(null); }
  };

  const deleteCampaign = async (c: Campaign) => {
    if (!confirm(`Delete campaign "${c.name}"? This removes all its queued emails.`)) return;
    const { error } = await supabase.from("email_campaigns").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Campaign deleted");
    if (selected?.id === c.id) setSelected(null);
  };

  // For non-email channels: flip draft -> active so the operator can work the queue.
  const activateManual = async (c: Campaign) => {
    setBusy(c.id);
    try {
      const { error } = await supabase
        .from("email_campaigns")
        .update({ status: "active", start_date: c.start_date ?? new Date().toISOString().slice(0, 10) })
        .eq("id", c.id);
      if (error) throw error;
      toast.success(`${c.name} activated \u2014 open the queue to send`);
      setSelected({ ...c, status: "active" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activate failed");
    } finally { setBusy(null); }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Multi-channel campaigns (Email, WhatsApp, LinkedIn) targeting recruiter agencies or demand leads. Daily-capped, drip-scheduled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadCampaigns}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create Campaign
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-3 flex-wrap">
            <span>All campaigns ({campaigns.length})</span>
            <div className="flex gap-1.5 text-xs font-normal text-muted-foreground">
              {(["email","whatsapp","linkedin"] as Channel[]).map((ch) => {
                const n = campaigns.filter((c) => c.channel === ch).length;
                const M = CHANNEL_META[ch];
                return (
                  <Badge key={ch} variant="outline" className="gap-1">
                    <M.Icon className="h-3 w-3" /> {M.label} \u00b7 {n}
                  </Badge>
                );
              })}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Daily limit</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const pct = c.total_recipients > 0
                    ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
                  const CM = CHANNEL_META[c.channel ?? "email"];
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge className={`gap-1 ${CM.tone}`} variant="secondary">
                          <CM.Icon className="h-3 w-3" /> {CM.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{c.lead_source ?? "recruiter"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_TONE[c.status]}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {c.sent_count}/{c.total_recipients}
                          </span>
                        </div>
                        {c.failed_count > 0 && (
                          <div className="text-[10px] text-destructive mt-1">
                            {c.failed_count} failed
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{c.daily_limit}/day</TableCell>
                      <TableCell className="text-sm">{fmtDate(c.start_date)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1 flex-wrap">
                          {c.status === "draft" && c.channel === "email" && (
                            <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => launch(c)}>
                              <Play className="h-3.5 w-3.5 mr-1" /> Launch
                            </Button>
                          )}
                          {c.status === "draft" && c.channel !== "email" && (
                            <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => activateManual(c)}>
                              <Play className="h-3.5 w-3.5 mr-1" /> Activate
                            </Button>
                          )}
                          {(c.status === "active" || c.status === "paused") && (
                            <Button size="sm" variant="outline" onClick={() => togglePause(c)}>
                              {c.status === "active"
                                ? <><Pause className="h-3.5 w-3.5 mr-1" /> Pause</>
                                : <><Play className="h-3.5 w-3.5 mr-1" /> Resume</>}
                            </Button>
                          )}
                          {c.channel === "email" ? (
                            <Button size="sm" disabled={busy === c.id || c.status !== "active"} onClick={() => sendTodayBatch(c)}>
                              <Send className="h-3.5 w-3.5 mr-1" /> Send batch
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" disabled={c.status === "draft"} onClick={() => setSelected(c)}>
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open queue
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteCampaign(c)}>
                            \u00d7
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {campaigns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      {loading ? "Loading\u2026" : "No campaigns yet. Click \u201cCreate Campaign\u201d to get started."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Automated daily send</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            A pg_cron job runs <code className="text-xs">send-campaign-batch</code> every day at 9 AM IST (03:30 UTC)
            and drains each active campaign up to its daily cap.
          </p>
          <p>Use <strong>Send batch</strong> to trigger an active campaign manually for testing.</p>
        </CardContent>
      </Card>

      <CreateCampaignDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => { setCreateOpen(false); loadCampaigns(); supabase.from("email_campaigns").select("*").eq("id", id).maybeSingle().then(({ data }) => data && setSelected(data as Campaign)); }}
      />

      {selected && (
        <CampaignDetailDialog campaign={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};


/* ============================================================
   CREATE CAMPAIGN DIALOG  —  channel + source aware
   ============================================================ */
function CreateCampaignDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [channel, setChannel] = useState<Channel>("email");
  const [source, setSource] = useState<LeadSource>("recruiter");
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(100);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [waMessage, setWaMessage] = useState(DEFAULT_WA_MESSAGE);
  const [liMessage, setLiMessage] = useState(DEFAULT_LINKEDIN_NOTE);
  const [recipients, setRecipients] = useState<AnyRecipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterCountry, setFilterCountry] = useState("");
  const [filterMinQuality, setFilterMinQuality] = useState(0);
  const [filterUncontacted, setFilterUncontacted] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [creating, setCreating] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setName(""); setSelectedIds(new Set());
    setChannel("email"); setSource("recruiter");
  }, [open]);

  // Auto-name suggestion
  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    const ch = CHANNEL_META[channel].label;
    const src = source === "recruiter" ? "Recruiters" : source === "demand" ? "Demand" : "OTHM";
    setName(`${ch} · ${src} · ${today}`);
  }, [channel, source, open]);

  // Load recipients whenever source changes
  useEffect(() => {
    if (!open) return;
    setLoadingLeads(true);
    setSelectedIds(new Set());
    (async () => {
      if (source === "recruiter") {
        const { data, error } = await supabase
          .from("recruiter_leads")
          .select("id, agency_name, contact_name, contact_email, contact_phone, contact_linkedin, hq_country, operating_eu_country, trades, quality_score, email_status, email_source")
          .eq("status", "active")
          .order("quality_score", { ascending: false })
          .limit(2000);
        if (error) toast.error(error.message);
        const mapped: AnyRecipient[] = (data ?? []).map((l: RecruiterLead) => ({
          lead_id: l.id,
          source: "recruiter",
          display_name: l.agency_name,
          email: l.contact_email,
          phone: l.contact_phone,
          phone_e164: null,
          linkedin: l.contact_linkedin,
          country: l.operating_eu_country ?? l.hq_country,
          meta: `${l.hq_country ?? "?"} → ${l.operating_eu_country ?? "?"}${l.contact_name ? " · " + l.contact_name : ""}`,
          quality: l.quality_score ?? 0,
          already_contacted: l.email_status === "sent",
        }));
        setRecipients(mapped);
      } else if (source === "demand") {
        const { data, error } = await supabase
          .from("demand_leads")
          .select("id, employer_name, contact_name, contact_email, contact_phone, phone_e164, whatsapp_number, country, city, role, trade_category, quality_score, outreach_queued")
          .order("quality_score", { ascending: false })
          .limit(2000);
        if (error) toast.error(error.message);
        const mapped: AnyRecipient[] = (data ?? []).map((l: DemandLead) => ({
          lead_id: l.id,
          source: "demand",
          display_name: l.employer_name || l.role || "(unnamed lead)",
          email: l.contact_email,
          phone: l.whatsapp_number || l.contact_phone,
          phone_e164: l.phone_e164,
          linkedin: null,
          country: l.country,
          meta: `${l.role ?? "?"} · ${l.city ?? ""} ${l.country ?? ""}${l.contact_name ? " · " + l.contact_name : ""}`.trim(),
          quality: l.quality_score ?? 0,
          already_contacted: l.outreach_queued === true,
        }));
        setRecipients(mapped);
      } else {
        const { data, error } = await supabase
          .from("othm_leads")
          .select("id, entity_type, full_name, institution_name, email, phone, whatsapp, linkedin_url, country, city, course_level, intake_month, preferred_country, stage, quality_score, outreach_queued")
          .order("created_at", { ascending: false })
          .limit(2000);
        if (error) toast.error(error.message);
        const mapped: AnyRecipient[] = (data ?? []).map((l: OthmLead) => ({
          lead_id: l.id,
          source: "othm",
          display_name: l.institution_name || l.full_name || "(unnamed)",
          email: l.email,
          phone: l.whatsapp || l.phone,
          phone_e164: null,
          linkedin: l.linkedin_url,
          country: l.country,
          meta: `${l.entity_type}${l.course_level ? " · " + l.course_level : ""}${l.intake_month ? " · " + l.intake_month : ""}${l.city ? " · " + l.city : ""}${l.country ? " " + l.country : ""}${l.full_name && l.institution_name ? " · " + l.full_name : ""}`.trim(),
          quality: l.quality_score ?? 0,
          already_contacted: l.outreach_queued === true || l.stage === "contacted" || l.stage === "enrolled",
        }));
        setRecipients(mapped);
      }
      setLoadingLeads(false);
    })();
  }, [source, open]);

  // Filter by required channel field + UI filters
  const filtered = useMemo(() => {
    return recipients.filter((r) => {
      if (channel === "email" && !(r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))) return false;
      if (channel === "whatsapp" && !(r.phone || r.phone_e164)) return false;
      if (channel === "linkedin" && !r.linkedin) return false;
      if (filterCountry && !(r.country ?? "").toLowerCase().includes(filterCountry.toLowerCase())) return false;
      if (r.quality < filterMinQuality) return false;
      if (filterUncontacted && r.already_contacted) return false;
      return true;
    });
  }, [recipients, channel, filterCountry, filterMinQuality, filterUncontacted]);

  // Channel availability counts (for the picker hint)
  const channelCounts = useMemo(() => ({
    email: recipients.filter((r) => r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)).length,
    whatsapp: recipients.filter((r) => r.phone || r.phone_e164).length,
    linkedin: recipients.filter((r) => r.linkedin).length,
  }), [recipients]);

  const toggle = (id: string) =>
    setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    if (filtered.every((l) => selectedIds.has(l.lead_id))) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((l) => l.lead_id)));
  };

  const create = async () => {
    if (!name.trim()) return toast.error("Name required");
    if (selectedIds.size === 0) return toast.error("Pick at least one recipient");
    setCreating(true);
    try {
      const subjectVal = channel === "email" ? subject : `${CHANNEL_META[channel].label} · ${name.trim()}`;
      const bodyVal = channel === "email" ? body : channel === "whatsapp" ? waMessage : liMessage;

      const { data: camp, error: cErr } = await supabase
        .from("email_campaigns")
        .insert({
          name: name.trim(),
          status: "draft",
          channel,
          lead_source: source,
          daily_limit: dailyLimit,
          start_date: startDate,
          subject_template: subjectVal,
          body_template: bodyVal,
          total_recipients: selectedIds.size,
        } as any)
        .select("id")
        .single();
      if (cErr || !camp) throw new Error(cErr?.message ?? "Failed to create campaign");

      const picked = recipients.filter((r) => selectedIds.has(r.lead_id));
      const rows = picked.map((r) => ({
        campaign_id: camp.id,
        channel,
        recruiter_id: r.source === "recruiter" ? r.lead_id : null,
        demand_lead_id: r.source === "demand" ? r.lead_id : null,
        othm_lead_id: r.source === "othm" ? r.lead_id : null,
        email_to: channel === "email" ? r.email : null,
        to_phone: channel === "whatsapp" ? (r.phone_e164 ?? r.phone) : null,
        to_linkedin: channel === "linkedin" ? r.linkedin : null,
        subject: channel === "email" ? subject : null,
        body_html: bodyVal,
        status: "pending",
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: iErr } = await supabase.from("campaign_emails").insert(rows.slice(i, i + 500) as any);
        if (iErr) throw new Error(iErr.message);
      }
      toast.success(`Created "${name}" · ${rows.length} recipients · ${CHANNEL_META[channel].label}`);
      onCreated(camp.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally { setCreating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>
            Pick a channel + audience, set your daily cap, and launch. Same UI for Email, WhatsApp and LinkedIn.
          </DialogDescription>
        </DialogHeader>

        {/* Channel + Source pickers */}
        <div className="grid md:grid-cols-2 gap-4 border-b pb-4">
          <div>
            <Label className="text-xs">Channel</Label>
            <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <TabsList className="grid grid-cols-3 w-full mt-1">
                {(["email", "whatsapp", "linkedin"] as Channel[]).map((ch) => {
                  const M = CHANNEL_META[ch];
                  return (
                    <TabsTrigger key={ch} value={ch} className="gap-1.5">
                      <M.Icon className="h-3.5 w-3.5" />
                      <span>{M.label}</span>
                      <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">{channelCounts[ch]}</Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
          <div>
            <Label className="text-xs">Audience</Label>
            <Tabs value={source} onValueChange={(v) => setSource(v as LeadSource)}>
              <TabsList className="grid grid-cols-3 w-full mt-1">
                <TabsTrigger value="recruiter" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Recruiter agencies
                </TabsTrigger>
                <TabsTrigger value="demand" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Demand leads (employers)
                </TabsTrigger>
                <TabsTrigger value="othm" className="gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" /> OTHM (students/colleges)
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-2">
          {/* Left column: campaign settings + template */}
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="EU Q3 Drive" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Daily limit</Label>
                <Input type="number" min={1} max={500} value={dailyLimit}
                  onChange={(e) => setDailyLimit(Math.max(1, Math.min(500, Number(e.target.value) || 100)))} />
              </div>
              <div>
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
            </div>

            {channel === "email" && (
              <>
                <div>
                  <Label>Subject template</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div>
                  <Label>Body template (HTML)</Label>
                  <Textarea rows={9} className="font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
                </div>
              </>
            )}
            {channel === "whatsapp" && (
              <div>
                <Label>WhatsApp message</Label>
                <Textarea rows={9} className="text-xs" value={waMessage} onChange={(e) => setWaMessage(e.target.value)} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Click-through queue. You'll open each chat from the campaign detail view (no auto-sending).
                </p>
              </div>
            )}
            {channel === "linkedin" && (
              <div>
                <Label>LinkedIn connection note</Label>
                <Textarea rows={9} className="text-xs" value={liMessage} onChange={(e) => setLiMessage(e.target.value)} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Click-through queue. Each row opens the lead's LinkedIn profile so you can send the note manually.
                  {source === "demand" && " Demand leads usually don't have LinkedIn — switch to recruiter audience for fuller coverage."}
                </p>
              </div>
            )}

            <div className="text-[10px] text-muted-foreground">
              Merge tags:
              {source === "othm" ? (
                <> <code>{`{{full_name}}`}</code> <code>{`{{first_name}}`}</code> <code>{`{{institution_name}}`}</code> <code>{`{{entity_type}}`}</code> <code>{`{{course_level}}`}</code> <code>{`{{intake_month}}`}</code> <code>{`{{preferred_country}}`}</code> <code>{`{{country}}`}</code></>
              ) : (
                <> <code>{`{{agency_name}}`}</code> <code>{`{{first_name}}`}</code> <code>{`{{eu_country}}`}</code> <code>{`{{hq_country}}`}</code> <code>{`{{role}}`}</code> <code>{`{{trade}}`}</code></>
              )}
            </div>
          </div>

          {/* Right column: recipient picker */}
          <div className="space-y-2">
            <Label>
              Recipients ({selectedIds.size} selected / {filtered.length} match
              {loadingLeads ? " · loading…" : ""})
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Country filter"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="text-xs h-9 flex-1 min-w-[140px]"
              />
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="Min quality"
                value={filterMinQuality}
                onChange={(e) => setFilterMinQuality(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="text-xs h-9 w-28 shrink-0"
              />
              <label className="flex items-center gap-2 text-xs whitespace-nowrap shrink-0">
                <input type="checkbox" checked={filterUncontacted} onChange={(e) => setFilterUncontacted(e.target.checked)} />
                Skip contacted
              </label>
            </div>
            <div className="border rounded-md max-h-[380px] overflow-y-auto">
              <div className="sticky top-0 bg-card border-b p-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((l) => selectedIds.has(l.lead_id))}
                  onChange={toggleAll}
                />
                <span>Select all visible</span>
              </div>
              {filtered.slice(0, 500).map((r) => {
                const reach = channel === "email" ? r.email
                  : channel === "whatsapp" ? (r.phone_e164 ?? r.phone)
                  : r.linkedin;
                return (
                  <label key={r.lead_id} className="flex items-center gap-2 p-2 border-b text-xs hover:bg-muted/40 cursor-pointer">
                    <input type="checkbox" checked={selectedIds.has(r.lead_id)} onChange={() => toggle(r.lead_id)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.display_name}</div>
                      <div className="text-muted-foreground truncate">{reach} · {r.meta}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{r.quality}</Badge>
                    {r.already_contacted && (
                      <Badge className="text-[9px] px-1 py-0 bg-muted text-foreground">contacted</Badge>
                    )}
                  </label>
                );
              })}
              {filtered.length === 0 && !loadingLeads && (
                <div className="p-6 text-[11px] text-muted-foreground text-center">
                  No reachable leads on this channel. Try switching audience or relaxing filters.
                </div>
              )}
              {filtered.length > 500 && (
                <div className="p-2 text-[10px] text-muted-foreground text-center">
                  Showing first 500. Tighten filters to see the rest.
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button onClick={create} disabled={creating || selectedIds.size === 0}>
            {creating ? "Creating…" : `Create campaign (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   DETAIL DIALOG — channel-aware queue + click-through
   ============================================================ */
function CampaignDetailDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [emails, setEmails] = useState<CampaignEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const channel: Channel = campaign.channel ?? "email";
  const CM = CHANNEL_META[channel];

  const load = async () => {
    const { data, error } = await supabase
      .from("campaign_emails")
      .select("*")
      .eq("campaign_id", campaign.id)
      .order("scheduled_for", { ascending: true, nullsFirst: true })
      .limit(1000);
    if (error) toast.error(error.message);
    setEmails((data ?? []) as CampaignEmail[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaign.id]);

  const startOfToday = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
  const sentToday = emails.filter((e) => e.status === "sent" && (e.sent_at ?? "") >= startOfToday).length;
  const pending = emails.filter((e) => e.status === "pending").length;
  const sentTotal = emails.filter((e) => e.status === "sent").length;
  const failedTotal = emails.filter((e) => e.status === "failed").length;
  const openedTotal = emails.reduce((acc, e) => acc + (e.open_count > 0 ? 1 : 0), 0);
  const openRate = sentTotal > 0 ? Math.round((openedTotal / sentTotal) * 100) : 0;

  const markSent = async (e: CampaignEmail) => {
    const { error } = await supabase.from("campaign_emails")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", e.id);
    if (error) return toast.error(error.message);
    setEmails((prev) => prev.map((x) => x.id === e.id ? { ...x, status: "sent", sent_at: new Date().toISOString() } : x));
  };

  const openChat = (e: CampaignEmail) => {
    if (channel === "whatsapp" && e.to_phone) {
      const digits = e.to_phone.replace(/\D/g, "");
      const text = encodeURIComponent(campaign.body_template ?? "");
      window.open(`https://wa.me/${digits}?text=${text}`, "_blank", "noopener");
    } else if (channel === "linkedin" && e.to_linkedin) {
      window.open(e.to_linkedin, "_blank", "noopener");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <CM.Icon className="h-4 w-4" />
            {campaign.name}
            <Badge className={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
            <Badge className={`gap-1 ${CM.tone}`} variant="secondary">{CM.label}</Badge>
            <Badge variant="outline" className="capitalize">{campaign.lead_source ?? "recruiter"}</Badge>
          </DialogTitle>
          <DialogDescription>
            {campaign.daily_limit}/day · {campaign.send_window_start_hour}:00–{campaign.send_window_end_hour}:00 {campaign.timezone}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Sent today" value={sentToday} Icon={Send} />
          <Stat label="Sent total" value={sentTotal} Icon={CheckCircle2} />
          <Stat label="Queue remaining" value={pending} Icon={Mail} />
          <Stat label="Failed" value={failedTotal} Icon={AlertTriangle} tone="text-destructive" />
          {channel === "email"
            ? <Stat label="Open rate" value={`${openRate}%`} Icon={Mail} />
            : <Stat label="Recipients" value={emails.length} Icon={Users} />}
        </div>

        {channel !== "email" && pending > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            This is a manual click-through queue. Click <strong>Open</strong> on any pending row to launch{" "}
            {channel === "whatsapp" ? "WhatsApp" : "LinkedIn"} in a new tab, then click <strong>Mark sent</strong> to log it.
          </div>
        )}

        <div className="rounded-md border overflow-x-auto mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.slice(0, 300).map((e) => {
                const reach = channel === "email" ? e.email_to
                  : channel === "whatsapp" ? e.to_phone
                  : e.to_linkedin;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs max-w-[260px] truncate">{reach ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDateTime(e.scheduled_for)}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "sent" ? "default" : "outline"} className="text-[10px]">
                        {e.status}
                      </Badge>
                      {e.error && <div className="text-[10px] text-destructive mt-1 truncate max-w-[200px]" title={e.error}>{e.error}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{fmtDateTime(e.sent_at)}</TableCell>
                    <TableCell className="text-right">
                      {channel !== "email" && e.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => openChat(e)}>
                            <ExternalLink className="h-3 w-3 mr-1" /> Open
                          </Button>
                          <Button size="sm" onClick={() => markSent(e)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Mark sent
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {emails.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    {loading ? "Loading…" : "No recipients queued."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {emails.length > 300 && (
            <div className="p-2 text-xs text-muted-foreground text-center">
              Showing first 300 of {emails.length}.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, Icon, tone }: { label: string; value: number | string; Icon: typeof Send; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tone ?? "text-muted-foreground"}`} />
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

export default CampaignPage;
