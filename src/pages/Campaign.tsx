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
  MessageCircle, Linkedin, Users, ExternalLink,
} from "lucide-react";
import { pickLeadPhone } from "@/lib/phone";

type Channel = "email" | "whatsapp" | "linkedin";
type LeadSource = "recruiter" | "demand";

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

