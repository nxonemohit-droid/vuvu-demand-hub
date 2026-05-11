import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useRoles } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Send, Save, Eye, FileText, Search, RefreshCw, Trash2, Plus, CheckCircle2, XCircle, Beaker,
  Clock, ShieldOff, BarChart3, Settings as SettingsIcon, Mail as MailIcon, Ban, X,
  Download, Layers,
} from "lucide-react";

type Lead = {
  id: string;
  agency_name: string;
  contact_name: string | null;
  contact_email: string | null;
  hq_country: string | null;
  operating_eu_country: string | null;
  trades: string[] | null;
  email_status: string;
  email_sent_at: string | null;
  contact_phone: string | null;
  contact_linkedin: string | null;
  source_url: string | null;
};

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
};

type SendResult = {
  leadId: string;
  email: string;
  ok: boolean;
  error?: string;
};

const DEFAULT_SUBJECT = "Voynova × {{agency_name}} — EU placements partnership";
const DEFAULT_BODY = `Hi {{first_name}},

I'm Mohit from Voynova Global Solutions. We source pre-vetted blue-collar workers from India, Nepal and Bangladesh and place them with EU employers — currently with live orders in {{eu_country}}.

I came across {{agency_name}} and your work in {{trade}} and wanted to ask if you'd be open to a short call about a sourcing partnership. We can plug into your active orders and handle visa/onboarding end-to-end.

Would 20 minutes this week work?

Best,
Mohit
Voynova Global Solutions
mohit@voynovaglobal.com`;

const renderTemplate = (tpl: string, l: Lead) => {
  const first = (l.contact_name ?? "").trim().split(" ")[0] || "there";
  const tradesArr = (l.trades ?? []).filter(Boolean);
  const trade = tradesArr[0] ?? "blue-collar workers";
  const trades = tradesArr.slice(0, 3).join(", ") || trade;
  const country = l.operating_eu_country || l.hq_country || "Europe";
  const sourceUrl = (l.source_url ?? "").trim();
  let website = sourceUrl;
  let websiteDomain = "";
  try {
    if (sourceUrl) {
      const u = new URL(sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`);
      website = `${u.protocol}//${u.host}`;
      websiteDomain = u.host.replace(/^www\./, "");
    }
  } catch { /* ignore */ }
  const phone = (l.contact_phone ?? "").trim();
  const linkedin = (l.contact_linkedin ?? "").trim();
  const recruiterName = (l.contact_name ?? "").trim() || first;
  const map: Record<string, string> = {
    agency_name: l.agency_name ?? "",
    company_name: l.agency_name ?? "",
    first_name: first,
    contact_name: l.contact_name ?? first,
    contact_email: l.contact_email ?? "",
    contact_phone: phone,
    phone,
    contact_linkedin: linkedin,
    linkedin,
    recruiter_name: recruiterName,
    agency_website: website,
    website,
    website_domain: websiteDomain,
    source_url: sourceUrl,
    eu_country: l.operating_eu_country ?? "Europe",
    operating_eu_country: l.operating_eu_country ?? "Europe",
    hq_country: l.hq_country ?? "",
    country,
    trade,
    trades,
  };
  // Allow ad-hoc fields (e.g. salary, visa_likelihood) carried on the lead
  const extra = l as unknown as Record<string, unknown>;
  const lookup = (k: string): string => {
    if (k in map) return map[k];
    const v = extra?.[k];
    return v == null ? "" : String(v);
  };
  // Conditional blocks: {{#if key}}...{{/if}} and {{#unless key}}...{{/unless}}
  // Render only when the value is truthy (non-empty string, non-zero, etc.)
  const truthy = (k: string) => {
    const v = lookup(k);
    return v !== "" && v !== "0" && v.toLowerCase() !== "false";
  };
  let out = tpl;
  for (let i = 0; i < 5; i++) {
    const before = out;
    out = out.replace(
      /\{\{\s*#if\s+(\w+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g,
      (_, k, inner) => (truthy(k) ? inner : ""),
    );
    out = out.replace(
      /\{\{\s*#unless\s+(\w+)\s*\}\}([\s\S]*?)\{\{\s*\/unless\s*\}\}/g,
      (_, k, inner) => (truthy(k) ? "" : inner),
    );
    if (out === before) break;
  }
  return out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => lookup(k));
};

const Mail = () => {
  const { isAdmin, loading: rolesLoading } = useRoles();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "not_sent" | "sent">("not_sent");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTplId, setActiveTplId] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);

  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<SendResult[]>([]);

  const [saveOpen, setSaveOpen] = useState(false);
  const [newTplName, setNewTplName] = useState("");

  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  // Bulk drafts (per-lead personalised copies)
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState("");

  // Scheduling
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });

  // Tab data
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [suppressions, setSuppressions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<{
    sent: number; delivered: number; opened: number; clicked: number;
    bounced: number; replied: number; suppressed: number;
  } | null>(null);
  const [newSuppression, setNewSuppression] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setTestEmail(data.user.email);
    });
  }, []);

  const loadOps = async () => {
    const [{ data: sch }, { data: sup }, { data: cfg }, { data: ev }, { data: leadsAgg }] =
      await Promise.all([
        supabase.from("scheduled_emails").select("*").order("send_at", { ascending: true }).limit(200),
        supabase.from("email_suppressions").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("email_send_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("email_events").select("event_type").gte("created_at", new Date(Date.now()-30*86400000).toISOString()).limit(5000),
        supabase.from("recruiter_leads").select("email_status,replied_at").limit(5000),
      ]);
    setScheduled(sch ?? []);
    setSuppressions(sup ?? []);
    setSettings(cfg);
    const counts = (ev ?? []).reduce((acc: Record<string, number>, e: any) => {
      acc[e.event_type] = (acc[e.event_type] ?? 0) + 1; return acc;
    }, {});
    setAnalytics({
      sent: counts["email.sent"] ?? 0,
      delivered: counts["email.delivered"] ?? 0,
      opened: counts["email.opened"] ?? 0,
      clicked: counts["email.clicked"] ?? 0,
      bounced: (counts["email.bounced"] ?? 0) + (counts["email.failed"] ?? 0),
      replied: (leadsAgg ?? []).filter((l: any) => l.replied_at).length,
      suppressed: 0,
    });
  };
  useEffect(() => { if (isAdmin) loadOps(); }, [isAdmin]);

  const sampleLead: Lead = {
    id: "sample",
    agency_name: "Sample Agency Ltd",
    contact_name: "Alex Sample",
    contact_email: "alex@sample.com",
    hq_country: "India",
    operating_eu_country: "Greece",
    trades: ["Welding", "Construction"],
    email_status: "not_sent",
    email_sent_at: null,
    contact_phone: "+30 21 0000 0000",
    contact_linkedin: "https://www.linkedin.com/in/alex-sample",
    source_url: "https://www.sample-agency.com",
  };

  const sendTest = async () => {
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      return toast.error("Enter a valid email");
    }
    if (!subject.trim() || !body.trim()) return toast.error("Subject and body required");

    const sourceLead =
      leads.find((l) => selected.has(l.id)) ?? sampleLead;
    const personalSubject = `[TEST] ${renderTemplate(subject, sourceLead)}`;
    const personalText =
      `--- TEST EMAIL · merge tags rendered using ${
        sourceLead.id === "sample" ? "sample data" : sourceLead.agency_name
      } ---\n\n` + renderTemplate(body, sourceLead);

    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-recruiter-email", {
        body: { to: testEmail.trim(), subject: personalSubject, text: personalText },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Test sent to ${testEmail}`);
      setTestOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTestSending(false);
    }
  };

  const loadLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recruiter_leads")
      .select("id,agency_name,contact_name,contact_email,contact_phone,contact_linkedin,source_url,hq_country,operating_eu_country,trades,email_status,email_sent_at")
      .eq("status", "active")
      .not("contact_email", "is", null)
      .order("quality_score", { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("email_templates")
      .select("id,name,subject,body,description")
      .order("updated_at", { ascending: false });
    setTemplates((data ?? []) as Template[]);
  };

  useEffect(() => { loadLeads(); loadTemplates(); }, []);

  const filtered = useMemo(() => {
    let rows = leads;
    if (filter === "not_sent") rows = rows.filter((l) => l.email_status !== "sent");
    if (filter === "sent") rows = rows.filter((l) => l.email_status === "sent");
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((l) =>
        [l.agency_name, l.contact_name, l.contact_email, l.hq_country, l.operating_eu_country]
          .filter(Boolean).some((x) => (x as string).toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [leads, filter, search]);

  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((l) => next.delete(l.id));
    else filtered.forEach((l) => next.add(l.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const applyTemplate = (id: string) => {
    setActiveTplId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
  };

  const saveTemplate = async () => {
    if (!newTplName.trim()) return toast.error("Name required");
    const { data: u } = await supabase.auth.getUser();
    const { error, data } = await supabase
      .from("email_templates")
      .insert({ name: newTplName.trim(), subject, body, created_by: u.user?.id ?? null })
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setSaveOpen(false);
    setNewTplName("");
    await loadTemplates();
    if (data) setActiveTplId(data.id);
  };

  const deleteTemplate = async () => {
    if (!activeTplId) return;
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("email_templates").delete().eq("id", activeTplId);
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    setActiveTplId("");
    await loadTemplates();
  };

  const sendBulk = async () => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients = leads
      .filter((l) => selected.has(l.id) && l.contact_email)
      .map((l) => ({ ...l, contact_email: l.contact_email!.trim() }))
      .filter((l) => emailRe.test(l.contact_email));
    if (recipients.length === 0) return toast.error("Select at least one lead with a valid email");
    if (!subject.trim() || !body.trim()) return toast.error("Subject and body are required");

    if (scheduleEnabled) {
      const sendAt = new Date(scheduleAt);
      if (isNaN(sendAt.getTime()) || sendAt.getTime() < Date.now() - 60_000) {
        return toast.error("Pick a future time");
      }
      if (!confirm(`Schedule ${recipients.length} email(s) for ${sendAt.toLocaleString()}?`)) return;
      const { data: u } = await supabase.auth.getUser();
      const rows = recipients.map((l) => ({
        lead_id: l.id, to_email: l.contact_email!,
        subject: renderTemplate(subject, l), body: renderTemplate(body, l),
        send_at: sendAt.toISOString(), template_name: templates.find(t => t.id === activeTplId)?.name ?? null,
        created_by: u.user?.id ?? null,
      }));
      const { error } = await supabase.from("scheduled_emails").insert(rows);
      if (error) return toast.error(error.message);
      toast.success(`${rows.length} email(s) scheduled`);
      setSelected(new Set());
      loadOps();
      return;
    }

    if (!confirm(`Send personalised email to ${recipients.length} recipient(s)?`)) return;

    setSending(true);
    setResults([]);
    setProgress({ done: 0, total: recipients.length });

    const out: SendResult[] = [];
    const CONCURRENCY = 4;
    let idx = 0;
    const worker = async () => {
      while (idx < recipients.length) {
        const i = idx++;
        const l = recipients[i];
        const personalSubject = renderTemplate(subject, l);
        const personalText = renderTemplate(body, l);
        try {
          const { data, error } = await supabase.functions.invoke("send-recruiter-email", {
            body: {
              leadId: l.id,
              to: l.contact_email,
              subject: personalSubject,
              text: personalText,
            },
          });
          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);
          out.push({ leadId: l.id, email: l.contact_email!, ok: true });
        } catch (e) {
          out.push({
            leadId: l.id, email: l.contact_email!, ok: false,
            error: e instanceof Error ? e.message : "send failed",
          });
        } finally {
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setResults(out);
    setSending(false);
    const okCount = out.filter((r) => r.ok).length;
    toast.success(`${okCount}/${out.length} emails sent`);
    setSelected(new Set());
    loadLeads();
    loadOps();
  };

  const cancelScheduled = async (id: string) => {
    const { error } = await supabase.from("scheduled_emails")
      .update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cancelled");
    loadOps();
  };

  // Build a personalised draft per selected lead, sorted by agency name.
  const drafts = useMemo(() => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return leads
      .filter((l) => selected.has(l.id))
      .map((l) => {
        const email = (l.contact_email ?? "").trim();
        return {
          lead: l,
          to: email,
          valid: emailRe.test(email),
          subject: renderTemplate(subject, l),
          body: renderTemplate(body, l),
        };
      })
      .sort((a, b) =>
        (a.lead.agency_name ?? "").localeCompare(b.lead.agency_name ?? ""),
      );
  }, [leads, selected, subject, body]);

  const filteredDrafts = useMemo(() => {
    const q = draftFilter.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter((d) =>
      [d.lead.agency_name, d.lead.contact_name, d.to, d.subject]
        .filter(Boolean)
        .some((x) => (x as string).toLowerCase().includes(q)),
    );
  }, [drafts, draftFilter]);

  const exportDraftsCsv = () => {
    if (drafts.length === 0) return toast.error("Select at least one recipient");
    const headers = [
      "agency_name", "contact_name", "to_email", "valid_email",
      "hq_country", "operating_eu_country", "trades", "subject", "body",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = drafts.map((d) => [
      d.lead.agency_name ?? "",
      d.lead.contact_name ?? "",
      d.to,
      d.valid ? "yes" : "no",
      d.lead.hq_country ?? "",
      d.lead.operating_eu_country ?? "",
      (d.lead.trades ?? []).join("; "),
      d.subject,
      d.body,
    ].map(esc).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outreach-drafts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${drafts.length} draft(s)`);
  };

  const addSuppression = async () => {
    const e = newSuppression.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return toast.error("Invalid email");
    const { error } = await supabase.from("email_suppressions")
      .insert({ email: e, reason: "manual", source: "user" });
    if (error) return toast.error(error.message);
    toast.success("Added to suppression list");
    setNewSuppression("");
    loadOps();
  };
  const removeSuppression = async (email: string) => {
    const { error } = await supabase.from("email_suppressions").delete().eq("email", email);
    if (error) return toast.error(error.message);
    loadOps();
  };

  const saveSettings = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("email_send_settings")
      .update(patch as never)
      .eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    loadOps();
  };

  if (rolesLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mail / Outreach</h1>
          <p className="text-sm text-muted-foreground">
            Pick recipients, choose or write a template, preview and send personalised emails in bulk.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadLeads(); loadTemplates(); loadOps(); }}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </header>

      <Tabs defaultValue="compose" className="space-y-4">
        <TabsList>
          <TabsTrigger value="compose"><MailIcon className="h-3.5 w-3.5 mr-1.5" />Compose</TabsTrigger>
          <TabsTrigger value="scheduled"><Clock className="h-3.5 w-3.5 mr-1.5" />Scheduled ({scheduled.filter(s => s.status === "pending").length})</TabsTrigger>
          <TabsTrigger value="suppressions"><ShieldOff className="h-3.5 w-3.5 mr-1.5" />Suppressions ({suppressions.length})</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Analytics</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="h-3.5 w-3.5 mr-1.5" />Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="compose">

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-5">
        {/* LEFT: recipients */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Recipients · {selected.size} selected of {filtered.length} shown
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                  <SelectTrigger className="w-[150px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_sent">Not contacted</SelectItem>
                    <SelectItem value="sent">Already sent</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 w-[220px]"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(l.id)}
                          onCheckedChange={() => toggleOne(l.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{l.agency_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {(l.trades ?? []).slice(0, 2).join(", ")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{l.contact_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{l.contact_email}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.hq_country ?? "—"} → {l.operating_eu_country ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={l.email_status === "sent" ? "default" : "outline"}>
                          {l.email_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setPreviewLead(l)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        {loading ? "Loading…" : "No recipients match"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: composer */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Compose
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
                  <Beaker className="h-3.5 w-3.5 mr-1" /> Send test
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save as template
                </Button>
                {activeTplId && (
                  <Button variant="ghost" size="sm" onClick={deleteTemplate}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Template</Label>
              <Select value={activeTplId} onValueChange={applyTemplate}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="— Choose a saved template —" />
                </SelectTrigger>
                <SelectContent>
                  {templates.length === 0 && (
                    <div className="text-xs text-muted-foreground p-2">No saved templates yet</div>
                  )}
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Body (plain text)</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Merge tags: <code>{"{{agency_name}}"}</code>, <code>{"{{first_name}}"}</code>,{" "}
              <code>{"{{eu_country}}"}</code>, <code>{"{{hq_country}}"}</code>,{" "}
              <code>{"{{trade}}"}</code>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" /> Schedule for later
                </Label>
                <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
              </div>
              {scheduleEnabled && (
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="h-9"
                />
              )}
            </div>

            {sending && (
              <div className="rounded-md border p-2 text-xs">
                Sending… {progress.done}/{progress.total}
                <div className="mt-1 h-1.5 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {results.length > 0 && !sending && (
              <div className="rounded-md border max-h-40 overflow-auto text-xs divide-y">
                {results.map((r) => (
                  <div key={r.leadId} className="flex items-center gap-2 px-2 py-1.5">
                    {r.ok
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    <span className="flex-1 truncate">{r.email}</span>
                    {!r.ok && <span className="text-destructive truncate max-w-[180px]">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => setDraftsOpen(true)}
                disabled={selected.size === 0}
                size="sm"
              >
                <Layers className="h-4 w-4 mr-1.5" />
                Preview {selected.size} draft{selected.size === 1 ? "" : "s"}
              </Button>
              <Button
                variant="outline"
                onClick={exportDraftsCsv}
                disabled={selected.size === 0}
                size="sm"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV
              </Button>
            </div>

            <Button
              onClick={sendBulk}
              disabled={sending || selected.size === 0}
              className="w-full"
              size="lg"
            >
              <Send className="h-4 w-4 mr-2" />
              {scheduleEnabled ? "Schedule" : "Send"} to {selected.size} recipient{selected.size === 1 ? "" : "s"}
            </Button>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="scheduled">
          <Card><CardContent className="pt-6">
            <div className="rounded-md border max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10"><TableRow>
                  <TableHead>Send at</TableHead><TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead><TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {scheduled.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{new Date(s.send_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{s.to_email}</TableCell>
                      <TableCell className="text-xs max-w-[420px] truncate">{s.subject}</TableCell>
                      <TableCell>
                        <Badge variant={
                          s.status === "sent" ? "default" :
                          s.status === "failed" ? "destructive" :
                          s.status === "cancelled" || s.status === "suppressed" ? "secondary" : "outline"
                        }>{s.status}</Badge>
                        {s.error && <div className="text-[10px] text-destructive mt-0.5 truncate max-w-[260px]">{s.error}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => cancelScheduled(s.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {scheduled.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No scheduled emails</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="suppressions">
          <Card><CardContent className="pt-6 space-y-3">
            <div className="flex gap-2">
              <Input placeholder="email@example.com" value={newSuppression}
                onChange={(e) => setNewSuppression(e.target.value)} className="max-w-sm" />
              <Button onClick={addSuppression}><Ban className="h-4 w-4 mr-1" />Suppress</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Bounces and spam complaints are added here automatically. Suppressed addresses will never receive future emails.
            </p>
            <div className="rounded-md border max-h-[500px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10"><TableRow>
                  <TableHead>Email</TableHead><TableHead>Reason</TableHead>
                  <TableHead>Source</TableHead><TableHead>Added</TableHead>
                  <TableHead className="text-right">Remove</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {suppressions.map((s) => (
                    <TableRow key={s.email}>
                      <TableCell className="text-xs font-mono">{s.email}</TableCell>
                      <TableCell><Badge variant="outline">{s.reason}</Badge></TableCell>
                      <TableCell className="text-xs">{s.source ?? "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => removeSuppression(s.email)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {suppressions.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No suppressed emails</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card><CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {analytics && [
                { k: "Sent", v: analytics.sent },
                { k: "Delivered", v: analytics.delivered },
                { k: "Opened", v: analytics.opened },
                { k: "Clicked", v: analytics.clicked },
                { k: "Bounced", v: analytics.bounced },
                { k: "Replied", v: analytics.replied },
                { k: "Suppressed", v: suppressions.length },
              ].map((s) => (
                <div key={s.k} className="rounded-md border p-3">
                  <div className="text-[11px] uppercase text-muted-foreground">{s.k}</div>
                  <div className="text-2xl font-semibold mt-1">{s.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              {analytics && (
                <>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Open rate</div>
                    <div className="text-lg font-medium">
                      {analytics.delivered ? Math.round((analytics.opened / analytics.delivered) * 100) : 0}%
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Click rate</div>
                    <div className="text-lg font-medium">
                      {analytics.opened ? Math.round((analytics.clicked / analytics.opened) * 100) : 0}%
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Reply rate</div>
                    <div className="text-lg font-medium">
                      {analytics.sent ? Math.round((analytics.replied / analytics.sent) * 100) : 0}%
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Last 30 days. Replies require Resend inbound webhook to be configured.</p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card><CardContent className="pt-6 space-y-4 max-w-xl">
            {settings && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Daily cap</Label>
                    <Input type="number" defaultValue={settings.daily_cap}
                      onBlur={(e) => saveSettings({ daily_cap: parseInt(e.target.value, 10) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Per-domain daily cap</Label>
                    <Input type="number" defaultValue={settings.per_domain_daily_cap}
                      onBlur={(e) => saveSettings({ per_domain_daily_cap: parseInt(e.target.value, 10) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Send window start hour</Label>
                    <Input type="number" min={0} max={23} defaultValue={settings.send_window_start_hour}
                      onBlur={(e) => saveSettings({ send_window_start_hour: parseInt(e.target.value, 10) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Send window end hour</Label>
                    <Input type="number" min={1} max={24} defaultValue={settings.send_window_end_hour}
                      onBlur={(e) => saveSettings({ send_window_end_hour: parseInt(e.target.value, 10) || 0 })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Timezone</Label>
                    <Input defaultValue={settings.send_window_timezone}
                      onBlur={(e) => saveSettings({ send_window_timezone: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">Respect send window</div>
                    <div className="text-xs text-muted-foreground">When off, scheduled emails go out 24/7.</div>
                  </div>
                  <Switch checked={settings.respect_send_window}
                    onCheckedChange={(v) => saveSettings({ respect_send_window: v })} />
                </div>
                <p className="text-xs text-muted-foreground">
                  These limits apply to <b>scheduled</b> emails processed by the background worker. Manual bulk sends from the Compose tab still respect suppression but ignore caps.
                </p>
              </>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Preview dialog */}
      <Dialog open={!!previewLead} onOpenChange={(o) => !o && setPreviewLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview · {previewLead?.agency_name}</DialogTitle>
          </DialogHeader>
          {previewLead && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">To</div>
                <div>{previewLead.contact_name ?? ""} &lt;{previewLead.contact_email}&gt;</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Subject</div>
                <div className="font-medium">{renderTemplate(subject, previewLead)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Body</div>
                <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/40 rounded-md p-3 border">
                  {renderTemplate(body, previewLead)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewLead(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save template dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Template name</Label>
            <Input
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="e.g. Cold intro — Greece HORECA"
            />
            <p className="text-xs text-muted-foreground">
              Saves the current subject and body. Merge tags are preserved.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate}><Plus className="h-4 w-4 mr-1" /> Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Send to</Label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@yourcompany.com"
            />
            <p className="text-xs text-muted-foreground">
              Renders the current subject and body using{" "}
              {leads.find((l) => selected.has(l.id))
                ? <>the first selected lead (<b>{leads.find((l) => selected.has(l.id))!.agency_name}</b>)</>
                : "sample data"}{" "}
              so you can verify merge tags before bulk sending. Subject is prefixed with <code>[TEST]</code> and no leads are updated.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)} disabled={testSending}>
              Cancel
            </Button>
            <Button onClick={sendTest} disabled={testSending}>
              <Send className="h-4 w-4 mr-1" /> {testSending ? "Sending…" : "Send test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Mail;
