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

/* -------- Create dialog -------- */
function CreateCampaignDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(100);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterCountry, setFilterCountry] = useState("");
  const [filterMinQuality, setFilterMinQuality] = useState(0);
  const [filterUncontacted, setFilterUncontacted] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(""); setSelectedIds(new Set());
    (async () => {
      const { data, error } = await supabase
        .from("recruiter_leads")
        .select("id, agency_name, contact_name, contact_email, hq_country, operating_eu_country, trades, quality_score, email_status, email_source")
        .eq("status", "active")
        .not("contact_email", "is", null)
        .order("quality_score", { ascending: false })
        .limit(2000);
      if (error) toast.error(error.message);
      setLeads((data ?? []).filter((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.contact_email ?? "")) as Lead[]);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    return leads.filter((l) =>
      (!filterCountry || (l.hq_country ?? "").toLowerCase().includes(filterCountry.toLowerCase())
        || (l.operating_eu_country ?? "").toLowerCase().includes(filterCountry.toLowerCase()))
      && (l.quality_score ?? 0) >= filterMinQuality
      && (!filterUncontacted || l.email_status !== "sent"),
    );
  }, [leads, filterCountry, filterMinQuality, filterUncontacted]);

  const toggle = (id: string) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (filtered.every((l) => selectedIds.has(l.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  };

  const create = async () => {
    if (!name.trim()) return toast.error("Name required");
    if (selectedIds.size === 0) return toast.error("Pick at least one recipient");
    setCreating(true);
    try {
      const { data: camp, error: cErr } = await supabase
        .from("email_campaigns")
        .insert({
          name: name.trim(),
          status: "draft",
          daily_limit: dailyLimit,
          start_date: startDate,
          subject_template: subject,
          body_template: body,
          total_recipients: selectedIds.size,
        })
        .select("id")
        .single();
      if (cErr || !camp) throw new Error(cErr?.message ?? "Failed to create campaign");

      const rows = leads
        .filter((l) => selectedIds.has(l.id))
        .map((l) => ({
          campaign_id: camp.id,
          recruiter_id: l.id,
          email_to: l.contact_email!,
          subject,
          body_html: body,
          status: "pending",
        }));
      // chunk inserts
      for (let i = 0; i < rows.length; i += 500) {
        const { error: iErr } = await supabase.from("campaign_emails").insert(rows.slice(i, i + 500));
        if (iErr) throw new Error(iErr.message);
      }
      toast.success(`Created "${name}" with ${rows.length} recipients`);
      onCreated(camp.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally { setCreating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>
            Pick recipients, schedule, and launch. Emails go out via Resend at your set daily cap.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
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
            <div>
              <Label>Subject template</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Body template (HTML)</Label>
              <Textarea rows={8} className="font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="text-[10px] text-muted-foreground mt-1">
                Merge tags: <code>{`{{agency_name}}`}</code> <code>{`{{first_name}}`}</code> <code>{`{{eu_country}}`}</code> <code>{`{{hq_country}}`}</code> <code>{`{{trade}}`}</code>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Recipients ({selectedIds.size} selected / {filtered.length} match)</Label>
            <div className="flex gap-2">
              <Input placeholder="Country filter" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="text-xs" />
              <Input type="number" min={0} max={100} placeholder="Min quality" value={filterMinQuality}
                onChange={(e) => setFilterMinQuality(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="text-xs w-28" />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={filterUncontacted} onChange={(e) => setFilterUncontacted(e.target.checked)} />
              Uncontacted only
            </label>
            <div className="border rounded-md max-h-[320px] overflow-y-auto">
              <div className="sticky top-0 bg-card border-b p-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id))}
                  onChange={toggleAll}
                />
                <span>Select all visible</span>
              </div>
              {filtered.slice(0, 500).map((l) => (
                <label key={l.id} className="flex items-center gap-2 p-2 border-b text-xs hover:bg-muted/40 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggle(l.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.agency_name}</div>
                    <div className="text-muted-foreground truncate">{l.contact_email} \u00b7 {l.hq_country ?? "?"} \u2192 {l.operating_eu_country ?? "?"}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{l.quality_score ?? 0}</Badge>
                  {l.email_source === "guessed" && (
                    <Badge className="text-[9px] px-1 py-0 bg-amber-500 hover:bg-amber-500 text-white">guessed</Badge>
                  )}
                </label>
              ))}
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
          <Button onClick={create} disabled={creating}>
            {creating ? "Creating\u2026" : `Create campaign (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Detail dialog -------- */
function CampaignDetailDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [emails, setEmails] = useState<CampaignEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("campaign_emails")
        .select("*")
        .eq("campaign_id", campaign.id)
        .order("scheduled_for", { ascending: true })
        .limit(500);
      if (error) toast.error(error.message);
      if (mounted) {
        setEmails((data ?? []) as CampaignEmail[]);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [campaign.id]);

  const startOfToday = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
  const sentToday = emails.filter((e) => e.status === "sent" && (e.sent_at ?? "") >= startOfToday).length;
  const pending = emails.filter((e) => e.status === "pending").length;
  const sentTotal = emails.filter((e) => e.status === "sent").length;
  const openedTotal = emails.reduce((acc, e) => acc + (e.open_count > 0 ? 1 : 0), 0);
  const openRate = sentTotal > 0 ? Math.round((openedTotal / sentTotal) * 100) : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {campaign.name}
            <Badge className={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
          </DialogTitle>
          <DialogDescription>
            {campaign.daily_limit}/day \u00b7 {campaign.send_window_start_hour}:00\u2013{campaign.send_window_end_hour}:00 {campaign.timezone}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Sent today" value={sentToday} Icon={Send} />
          <Stat label="Sent total" value={sentTotal} Icon={CheckCircle2} />
          <Stat label="Queue remaining" value={pending} Icon={Mail} />
          <Stat label="Failed" value={campaign.failed_count} Icon={AlertTriangle} tone="text-destructive" />
          <Stat label="Open rate" value={`${openRate}%`} Icon={Mail} />
        </div>

        <div className="rounded-md border overflow-x-auto mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.slice(0, 200).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{e.email_to}</TableCell>
                  <TableCell className="text-xs">{fmtDateTime(e.scheduled_for)}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "sent" ? "default" : "outline"} className="text-[10px]">
                      {e.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDateTime(e.sent_at)}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-[240px] truncate">{e.error ?? ""}</TableCell>
                </TableRow>
              ))}
              {emails.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    {loading ? "Loading\u2026" : "No emails queued."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {emails.length > 200 && (
            <div className="p-2 text-xs text-muted-foreground text-center">
              Showing first 200 of {emails.length}.
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