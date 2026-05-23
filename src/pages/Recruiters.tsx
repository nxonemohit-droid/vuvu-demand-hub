import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/lib/auth";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ExternalLink, Mail, Phone, Linkedin, Sparkles, Filter, RefreshCw, ShieldCheck, Beaker,
  CheckCircle2, XCircle, Loader2, Clock, Copy, Send, MailCheck, AlertTriangle,
  History, Eye, MousePointerClick, Inbox, AlertCircle, Plus, Trash2, FileText, Download,
} from "lucide-react";

type EmailEvent = {
  id: string;
  created_at: string;
  event_type: string;
  recipient: string | null;
  message_id: string | null;
  payload: Record<string, unknown> | null;
};

type SendHistoryEntry = {
  id: string;
  created_at: string;
  channel: string; // 'email_test' | 'email_resend' | 'email' | etc.
  note: string;
};

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
};

type RecruiterRow = {
  id: string;
  agency_name: string;
  hq_country: string | null;
  hq_city: string | null;
  operating_eu_country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_linkedin: string | null;
  recruitment_model: string[];
  license_number: string | null;
  license_verified: boolean;
  active_orders: Array<{
    role?: string; country?: string; headcount?: number;
    salary_min?: number; salary_max?: number; currency?: string;
  }>;
  worker_origin_focus: string[];
  trades: string[];
  source_url: string | null;
  source_posted_at: string | null;
  last_seen_at: string;
  status: string;
  excluded_reason: string | null;
  quality_score: number;
  email_status?: string;
  email_sent_at?: string | null;
  resend_message_id?: string | null;
  email_delivery_status?: string | null;
  email_last_event?: string | null;
  email_error?: string | null;
  discovery_tier?: number | null;
};

type DiscoveryJob = {
  id: string;
  kind: string;
  status: "queued" | "processing" | "completed" | "failed";
  params: Record<string, unknown> | null;
  result: {
    searched?: number; discovered?: number; scraped?: number;
    inserted?: number; updated?: number; excluded?: number; skipped?: number;
    breakdown?: Record<string, number>; auto_tune_tiers?: number[];
    progress?: {
      phase: "searching" | "scraping" | "done";
      searched: number;
      discovered: number;
      scraped: number;
      scrape_total: number;
      tiers_done: number[];
      by_country: Record<string, { candidates: number; scraped: number; inserted: number }>;
      updated_at: string;
    };
  } | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

const MODEL_LABELS: Record<string, string> = {
  no_advance_after_visa: "No Advance After Visa",
  no_advance_after_deployment: "No Advance After Deployment",
  free_recruitment: "Free Recruitment",
  company_recruitment: "Employer-Paid Recruitment",
};
const ORIGIN_LABELS: Record<string, string> = { NP: "Nepal", IN: "India", BD: "Bangladesh" };

function totalHeadcount(orders: RecruiterRow["active_orders"]) {
  return (orders ?? []).reduce((sum, o) => sum + (Number(o.headcount) || 0), 0);
}

function buildOutreachDraft(r: RecruiterRow) {
  const trades = (r.trades ?? []).slice(1, 3).join(", ") || "blue-collar workers";
  const euCountry = r.operating_eu_country || r.hq_country || "Europe";
  const hqCountry = r.hq_country || "your region";
  const firstName = r.contact_name ? r.contact_name.split(" ")[0] : "there";
  const subject = `Voynova \u00d7 {{agency_name}} \u2014 Strategic EU Blue-Collar Workforce Partnership`;
  const body = `Hi {{first_name}},<br><br>
I hope this message finds you well. My name is Mohit Gururani, Founder & Managing Director of Voynova Global Solutions \u2014 a compliance-first, AI-powered international workforce mobility company headquartered in Greater Noida, India.<br><br>
We specialise in end-to-end blue-collar and semi-skilled worker placements from India, Nepal, and Bangladesh into verified EU employers \u2014 covering Serbia, Romania, Croatia, Hungary, and expanding markets across the Balkans. We are currently operating with live employer orders in {{eu_country}}, and we are actively seeking credible, well-networked recruitment agencies in {{hq_country}} to partner with.<br><br>
When I came across {{agency_name}} and your expertise in the {{trade}} sector, I felt a genuine synergy. Here is what a partnership with Voynova would look like:<br><br>
\u2705 Pre-screened, trade-certified candidates ready for deployment<br>
\u2705 Full visa sponsorship coordination and work permit handling<br>
\u2705 End-to-end onboarding, documentation, and post-arrival support<br>
\u2705 Transparent, ethical recruitment \u2014 zero worker fees model<br>
\u2705 AI-powered candidate matching via our proprietary platform<br>
\u2705 Revenue-sharing model for referring agencies<br><br>
We are not a job board. We are a full-service global workforce mobility partner \u2014 from sourcing to visa to day-one arrival, we manage everything so your clients get workforce, not paperwork.<br><br>
To learn more about us before our call, here are our key resources:<br><br>
\ud83c\udf10 Website: https://www.voynovaglobal.com<br>
\ud83d\udcbc Company Profile (LinkedIn): https://in.linkedin.com/company/voynova-global-solutions-private-limited<br><br>
I would love to schedule a 20-minute discovery call this week to explore how we can collaborate on your active {{trade}} orders in {{eu_country}}. Even if you do not have an immediate need, I am confident that one conversation will open a long-term, recurring revenue stream for your agency.<br><br>
Looking forward to connecting.<br><br>
Warm regards,<br>
Mohit Gururani<br>
Founder & Managing Director<br>
Voynova Global Solutions Pvt. Ltd.<br>
\ud83d\udce7 mohit@voynovaglobal.com<br>
\ud83c\udf10 www.voynovaglobal.com<br>
\ud83d\udcbc LinkedIn: https://in.linkedin.com/company/voynova-global-solutions-private-limited`;
  return { subject, body };
}

function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const Recruiters = () => {
  const { isAdmin } = useRoles();
  const [rows, setRows] = useState<RecruiterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [hqFilter, setHqFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [licensedOnly, setLicensedOnly] = useState(false);
  const [recencyDays, setRecencyDays] = useState<string>("90");
  const [collarFilter, setCollarFilter] = useState<string>("non_white");
  const [showExcluded, setShowExcluded] = useState(false);
  const [selected, setSelected] = useState<RecruiterRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<"recruiters" | "jobs">("recruiters");
  const [jobs, setJobs] = useState<DiscoveryJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [sendHistory, setSendHistory] = useState<SendHistoryEntry[]>([]);
  const [sendHistoryLoading, setSendHistoryLoading] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<EmailTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ name: "", subject: "", body: "", description: "" });
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  // Prefill the QA test address with the signed-in user's email
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setTestEmail((cur) => cur || data.user!.email!);
    });
  }, []);

  // Reset the draft whenever a new recruiter is opened.
  useEffect(() => {
    if (selected) {
      const draft = buildOutreachDraft(selected);
      setEmailSubject(draft.subject);
      setEmailBody(draft.body);
    }
  }, [selected?.id]);

  // Load timeline + templates when a lead opens
  useEffect(() => {
    if (!selected?.id) { setEvents([]); return; }
    let cancelled = false;
    setEventsLoading(true);
    (async () => {
      const { data } = await supabase
        .from("email_events")
        .select("id, created_at, event_type, recipient, message_id, payload")
        .eq("lead_id", selected.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!cancelled) {
        setEvents((data ?? []) as EmailEvent[]);
        setEventsLoading(false);
      }
    })();
    // realtime: refresh on new event for this lead
    const channel = supabase
      .channel(`email_events:${selected.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "email_events",
        filter: `lead_id=eq.${selected.id}`,
      }, (payload) => {
        setEvents((prev) => [payload.new as EmailEvent, ...prev]);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [selected?.id]);

  // Load send history (test + real sends recorded in lead_outreach_log) for this lead
  useEffect(() => {
    if (!selected?.id) { setSendHistory([]); return; }
    let cancelled = false;
    setSendHistoryLoading(true);
    (async () => {
      const { data } = await supabase
        .from("lead_outreach_log")
        .select("id, created_at, channel, note")
        .eq("lead_id", selected.id)
        .in("channel", ["email_test", "email_resend", "email"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) {
        setSendHistory((data ?? []) as SendHistoryEntry[]);
        setSendHistoryLoading(false);
      }
    })();
    const channel = supabase
      .channel(`lead_outreach_log:${selected.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "lead_outreach_log",
        filter: `lead_id=eq.${selected.id}`,
      }, (payload) => {
        const row = payload.new as SendHistoryEntry;
        if (["email_test", "email_resend", "email"].includes(row.channel)) {
          setSendHistory((prev) => [row, ...prev]);
        }
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [selected?.id]);

  const logSend = async (
    leadId: string,
    channel: "email_test" | "email_resend",
    status: "ok" | "failed",
    to: string,
    subject: string,
    extra?: string,
  ) => {
    const note = `[${status.toUpperCase()}] To: ${to} — ${subject}${extra ? ` — ${extra}` : ""}`;
    await supabase.from("lead_outreach_log").insert({
      lead_id: leadId, channel, note,
    }).then(() => {}, () => {});
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("email_templates")
      .select("id, name, subject, body, description")
      .order("name");
    setTemplates((data ?? []) as EmailTemplate[]);
  };
  useEffect(() => { loadTemplates(); }, []);

  const buildVars = (r: RecruiterRow): Record<string, string> => {
    const trades = (r.trades ?? []).slice(0, 3).join(", ") || "blue-collar workers";
    const trade = (r.trades ?? [])[0] ?? "blue-collar workers";
    const country = r.operating_eu_country || r.hq_country || "Europe";
    const firstName = r.contact_name?.split(" ")[0] ?? "there";
    const sourceUrl = (r.source_url ?? "").trim();
    let website = sourceUrl;
    let websiteDomain = "";
    try {
      if (sourceUrl) {
        const u = new URL(sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`);
        website = `${u.protocol}//${u.host}`;
        websiteDomain = u.host.replace(/^www\./, "");
      }
    } catch { /* ignore */ }
    const phone = (r.contact_phone ?? "").trim();
    const linkedin = (r.contact_linkedin ?? "").trim();
    const recruiterName = (r.contact_name ?? "").trim() || firstName;
    return {
      first_name: firstName,
      contact_name: r.contact_name ?? "",
      contact_email: r.contact_email ?? "",
      contact_phone: phone,
      phone,
      contact_linkedin: linkedin,
      linkedin,
      recruiter_name: recruiterName,
      agency_website: website,
      website,
      website_domain: websiteDomain,
      source_url: sourceUrl,
      agency_name: r.agency_name,
      company_name: r.agency_name,
      country,
      eu_country: r.operating_eu_country ?? "Europe",
      operating_eu_country: r.operating_eu_country ?? "Europe",
      hq_country: r.hq_country ?? "",
      hq_city: r.hq_city ?? "",
      trades,
      trade,
    };
  };

  const fillTemplate = (s: string, r: RecruiterRow) => {
    const vars = buildVars(r);
    const extra = r as unknown as Record<string, unknown>;
    const lookup = (k: string): string => {
      const key = k.toLowerCase();
      if (key in vars) return vars[key];
      const v = extra?.[key];
      return v == null ? "" : String(v);
    };
    const truthy = (k: string) => {
      const v = lookup(k);
      return v !== "" && v !== "0" && v.toLowerCase() !== "false";
    };
    let out = s;
    // Conditional blocks: {{#if key}}...{{/if}} / {{#unless key}}...{{/unless}}
    for (let i = 0; i < 5; i++) {
      const before = out;
      out = out.replace(
        /\{\{\s*#if\s+([a-z_]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/gi,
        (_, k, inner) => (truthy(k) ? inner : ""),
      );
      out = out.replace(
        /\{\{\s*#unless\s+([a-z_]+)\s*\}\}([\s\S]*?)\{\{\s*\/unless\s*\}\}/gi,
        (_, k, inner) => (truthy(k) ? "" : inner),
      );
      if (out === before) break;
    }
    return out.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => lookup(k));
  };

  const applyTemplate = (tpl: EmailTemplate, r: RecruiterRow) => {
    setEmailSubject(fillTemplate(tpl.subject, r));
    setEmailBody(fillTemplate(tpl.body, r));
    toast.success(`Applied template "${tpl.name}"`);
  };

  const previewSubject = useMemo(
    () => (selected ? fillTemplate(emailSubject, selected) : emailSubject),
    [emailSubject, selected],
  );
  const previewBody = useMemo(
    () => (selected ? fillTemplate(emailBody, selected) : emailBody),
    [emailBody, selected],
  );

  // ----- HTML/plain-text safety -----
  // Treat the body as HTML only if it actually contains markup.
  const looksLikeHtml = (s: string) =>
    /<\/?[a-z][\s\S]*?>/i.test(s) || /&[a-z#0-9]+;/i.test(s);
  const isHtmlBody = useMemo(() => looksLikeHtml(previewBody), [previewBody]);

  // Sanitised HTML for safe rendering and outbound send.
  const safeHtml = useMemo(() => {
    if (!isHtmlBody) return "";
    return DOMPurify.sanitize(previewBody, {
      USE_PROFILES: { html: true },
      // Only allow safe link/image targets; block javascript:, data: etc.
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style"],
    });
  }, [isHtmlBody, previewBody]);

  // Plain-text fallback derived from sanitised HTML (entities decoded, tags stripped).
  const plainTextBody = useMemo(() => {
    if (!isHtmlBody) return previewBody;
    const tmp = document.createElement("div");
    tmp.innerHTML = safeHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ");
    return (tmp.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
  }, [isHtmlBody, safeHtml, previewBody]);

  // Validate merge tags used in the raw template against the selected lead.
  // Returns the list of tags that resolve to an empty value (or are unknown).
  const missingTags = useMemo(() => {
    if (!selected) return [] as string[];
    const vars = buildVars(selected);
    const extra = selected as unknown as Record<string, unknown>;
    const lookup = (k: string): string => {
      const key = k.toLowerCase();
      if (key in vars) return vars[key];
      const v = extra?.[key];
      return v == null ? "" : String(v);
    };
    const found = new Set<string>();
    const re = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;
    const reserved = new Set(["if", "unless"]);
    for (const src of [emailSubject, emailBody]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const tag = m[1].toLowerCase();
        if (reserved.has(tag)) continue;
        if (lookup(tag).trim() === "") found.add(tag);
      }
    }
    return Array.from(found).sort();
  }, [selected, emailSubject, emailBody]);

  const sendTestEmail = async () => {
    if (!selected) return;
    const to = testEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast.error("Enter a valid test email address");
      return;
    }
    setTestSending(true);
    const banner = `--- TEST SEND for ${selected.agency_name} ---`;
    const { data, error } = await supabase.functions.invoke("send-recruiter-email", {
      body: {
        to,
        subject: `[TEST] ${previewSubject}`,
        text: `${banner}\n\n${plainTextBody}`,
        ...(isHtmlBody
          ? {
              html:
                `<div style="font:12px/1.4 monospace;color:#666;margin-bottom:12px">` +
                `${banner}</div>${safeHtml}`,
            }
          : {}),
      },
    });
    setTestSending(false);
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error || error?.message || "Test send failed";
      await logSend(selected.id, "email_test", "failed", to, previewSubject, msg);
      toast.error(msg);
      return;
    }
    await logSend(selected.id, "email_test", "ok", to, previewSubject);
    toast.success(`Test email sent to ${to}`);
  };

  const saveTemplate = async () => {
    if (!tplForm.name.trim() || !tplForm.subject.trim() || !tplForm.body.trim()) {
      toast.error("Name, subject and body are required");
      return;
    }
    if (editingTpl) {
      const { error } = await supabase.from("email_templates")
        .update({ name: tplForm.name, subject: tplForm.subject, body: tplForm.body, description: tplForm.description || null })
        .eq("id", editingTpl.id);
      if (error) return toast.error(error.message);
      toast.success("Template updated");
    } else {
      const { error } = await supabase.from("email_templates")
        .insert({ name: tplForm.name, subject: tplForm.subject, body: tplForm.body, description: tplForm.description || null });
      if (error) return toast.error(error.message);
      toast.success("Template created");
    }
    setEditingTpl(null);
    setTplForm({ name: "", subject: "", body: "", description: "" });
    await loadTemplates();
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("email_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    await loadTemplates();
  };

  const copyDraft = async () => {
    const text = `Subject: ${previewSubject}\n\n${plainTextBody}`;
    try {
      // When the body is HTML, write both rich + plain so it pastes nicely
      // into Gmail/Outlook while remaining safe in plain-text editors.
      if (
        isHtmlBody &&
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard?.write
      ) {
        const html = `<div>${safeHtml}</div>`;
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast.success("Email copied to clipboard");
    } catch {
      toast.error("Could not copy — please select and copy manually");
    }
  };

  const markAsSent = async () => {
    if (!selected) return;
    setSavingEmail(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("recruiter_leads")
      .update({ email_status: "sent", email_sent_at: nowIso })
      .eq("id", selected.id);
    if (error) {
      toast.error(error.message);
      setSavingEmail(false);
      return;
    }
    // Also log to outreach history if the table exists; ignore failures.
    await supabase.from("lead_outreach_log").insert({
      lead_id: selected.id, channel: "email",
      note: `${emailSubject}\n\n${emailBody}`,
    }).then(() => {}, () => {});
    setRows((prev) => prev.map((r) =>
      r.id === selected.id ? { ...r, email_status: "sent", email_sent_at: nowIso } : r
    ));
    setSelected({ ...selected, email_status: "sent", email_sent_at: nowIso });
    toast.success("Marked as sent");
    setSavingEmail(false);
  };

  const sendViaResend = async () => {
    if (!selected) return;
    if (!selected.contact_email) {
      toast.error("No recipient email on this lead");
      return;
    }
    if (missingTags.length > 0) {
      const ok = window.confirm(
        `These merge tags are empty for this lead and will render as blank:\n\n${missingTags
          .map((t) => `{{${t}}}`)
          .join(", ")}\n\nSend anyway?`,
      );
      if (!ok) return;
    }
    setSendingEmail(true);
    const { data, error } = await supabase.functions.invoke("send-recruiter-email", {
      body: {
        leadId: selected.id,
        to: selected.contact_email,
        subject: previewSubject,
        text: plainTextBody,
        ...(isHtmlBody ? { html: safeHtml } : {}),
      },
    });
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error || error?.message || "Send failed";
      await logSend(selected.id, "email_resend", "failed", selected.contact_email, previewSubject, msg);
      toast.error(msg);
      setSendingEmail(false);
      return;
    }
    const nowIso = (data as any)?.sent_at ?? new Date().toISOString();
    await logSend(selected.id, "email_resend", "ok", selected.contact_email, previewSubject);
    setRows((prev) => prev.map((r) =>
      r.id === selected.id ? { ...r, email_status: "sent", email_sent_at: nowIso } : r
    ));
    setSelected({ ...selected, email_status: "sent", email_sent_at: nowIso });
    toast.success("Email sent via Resend");
    setSendingEmail(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const bulkSendPersonalized = async () => {
    const targets = rows.filter(
      (r) => selectedIds.has(r.id) && r.contact_email && r.email_status !== "sent"
    );
    if (targets.length === 0) {
      toast.error("No selected leads with a contact email and not already sent");
      return;
    }
    setBulkSending(true);
    setBulkProgress({ done: 0, total: targets.length });
    let ok = 0, fail = 0;
    for (const r of targets) {
      const draft = buildOutreachDraft(r);
      try {
        const { data, error } = await supabase.functions.invoke("send-recruiter-email", {
          body: { leadId: r.id, to: r.contact_email!, subject: draft.subject, text: draft.body },
        });
        if (error || (data as any)?.error) {
          fail++;
        } else {
          ok++;
          const nowIso = (data as any)?.sent_at ?? new Date().toISOString();
          setRows((prev) => prev.map((x) =>
            x.id === r.id
              ? { ...x, email_status: "sent", email_sent_at: nowIso,
                  resend_message_id: (data as any)?.id ?? null,
                  email_delivery_status: "sent", email_last_event: "email.sent" }
              : x
          ));
        }
      } catch {
        fail++;
      }
      setBulkProgress((p) => p ? { ...p, done: p.done + 1 } : p);
      // small pacing delay to be gentle on the gateway
      await new Promise((res) => setTimeout(res, 250));
    }
    setBulkSending(false);
    setBulkProgress(null);
    setSelectedIds(new Set());
    if (fail === 0) toast.success(`Sent ${ok} personalized emails`);
    else toast.warning(`Sent ${ok}, ${fail} failed`);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recruiter_leads")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as RecruiterRow[]);
    setLoading(false);
  };

  const loadJobs = async () => {
    const { data } = await supabase
      .from("discovery_jobs")
      .select("*")
      .eq("kind", "recruiter_discover")
      .order("created_at", { ascending: false })
      .limit(25);
    setJobs((data ?? []) as DiscoveryJob[]);
    // Auto-resume polling if a job is still running (e.g. after page reload).
    const running = (data ?? []).find(
      (j) => j.status === "queued" || j.status === "processing",
    );
    if (running) setActiveJobId((cur) => cur ?? running.id);
  };

  useEffect(() => { load(); loadJobs(); }, []);

  // Poll the active job until it finishes, then refresh the recruiter list.
  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    let ticks = 0;
    const tick = async () => {
      const { data } = await supabase
        .from("discovery_jobs").select("*").eq("id", activeJobId).maybeSingle();
      if (cancelled || !data) return;
      setJobs((prev) => {
        const others = prev.filter((j) => j.id !== data.id);
        return [data as DiscoveryJob, ...others];
      });
      // While the job is running, refresh the recruiter list every ~12s so the
      // per-country tally panel updates live as new leads land.
      if (data.status === "queued" || data.status === "processing") {
        ticks++;
        if (ticks % 4 === 0) await load();
      }
      if (data.status === "completed" || data.status === "failed") {
        setActiveJobId(null);
        if (data.status === "completed") {
          const r = (data as DiscoveryJob).result ?? {};
          toast.success(
            `Discovery complete: ${r.discovered ?? 0} found · ${r.inserted ?? 0} new · ${r.updated ?? 0} updated`
          );
          await load();
        } else {
          toast.error(`Discovery failed: ${(data as DiscoveryJob).error_message ?? "unknown error"}`);
        }
      }
    };
    const id = setInterval(tick, 3000);
    tick();
    return () => { cancelled = true; clearInterval(id); };
  }, [activeJobId]);

  const filtered = useMemo(() => {
    const cutoff = recencyDays === "all" ? 0 : Date.now() - Number(recencyDays) * 86400_000;
    return rows
      .filter((r) => (showExcluded ? true : r.status === "active"))
      .filter((r) => !search || r.agency_name.toLowerCase().includes(search.toLowerCase()))
      .filter((r) => hqFilter === "all" || r.hq_country === hqFilter)
      .filter((r) => modelFilter === "all" || (r.recruitment_model ?? []).includes(modelFilter))
      .filter((r) => originFilter === "all" || (r.worker_origin_focus ?? []).includes(originFilter))
      .filter((r) => !licensedOnly || r.license_verified)
      .filter((r) => {
        const c = ((r as any).worker_collar ?? "").toString().toLowerCase();
        if (collarFilter === "all") return true;
        if (collarFilter === "non_white") return c !== "white";
        if (collarFilter === "blue") return c === "blue";
        if (collarFilter === "mixed") return c === "mixed";
        if (collarFilter === "unknown") return !c || c === "unknown";
        if (collarFilter === "white") return c === "white";
        return true;
      })
      .filter((r) => {
        if (cutoff === 0) return true;
        const ts = r.source_posted_at ? Date.parse(r.source_posted_at) : Date.parse(r.last_seen_at);
        return ts >= cutoff;
      })
      .sort((a, b) => {
        const ta = Date.parse(a.last_seen_at), tb = Date.parse(b.last_seen_at);
        if (tb !== ta) return tb - ta;
        const ha = totalHeadcount(a.active_orders), hb = totalHeadcount(b.active_orders);
        if (hb !== ha) return hb - ha;
        return Number(b.license_verified) - Number(a.license_verified);
      });
  }, [rows, search, hqFilter, modelFilter, originFilter, licensedOnly, recencyDays, showExcluded, collarFilter]);

  const hqOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.hq_country).filter(Boolean))).sort() as string[],
    [rows]
  );

  // 9-country APIFY sweep tally — counts leads + leads with a valid contact email per target country.
  const SWEEP_COUNTRIES = [
    "Serbia", "Turkey", "Poland", "Austria", "Bosnia and Herzegovina",
    "North Macedonia", "Montenegro", "Moldova", "Belarus",
  ] as const;
  const VALID_EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  const sweepTally = useMemo(() => {
    const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
    return SWEEP_COUNTRIES.map((country) => {
      const matches = rows.filter((r) =>
        norm(r.hq_country) === country.toLowerCase() ||
        norm(r.operating_eu_country) === country.toLowerCase()
      );
      const withEmail = matches.filter((r) => {
        const e = (r.contact_email ?? "").trim().toLowerCase();
        return e && e !== "n/a" && VALID_EMAIL_RE.test(e);
      }).length;
      return { country, total: matches.length, withEmail };
    });
  }, [rows]);
  const sweepTotals = useMemo(() => ({
    total: sweepTally.reduce((a, b) => a + b.total, 0),
    withEmail: sweepTally.reduce((a, b) => a + b.withEmail, 0),
  }), [sweepTally]);

  // Tier-attribution breakdown — splits leads by their original discovery tier.
  // Tier 6 = email-intent boolean queries (highest-yield for contact emails).
  // Tiers 0-5 = earlier broader queries. Unknown = legacy leads pre-tier tracking.
  const tierBreakdown = useMemo(() => {
    const buckets = {
      tier6: { leads: 0, withEmail: 0 },
      earlier: { leads: 0, withEmail: 0 },
      unknown: { leads: 0, withEmail: 0 },
    };
    const perTier: Record<number, { leads: number; withEmail: number }> = {};
    for (const r of rows) {
      const e = (r.contact_email ?? "").trim().toLowerCase();
      const hasEmail = !!e && e !== "n/a" && VALID_EMAIL_RE.test(e);
      const t = r.discovery_tier;
      const bucket = t == null ? buckets.unknown : t === 6 ? buckets.tier6 : buckets.earlier;
      bucket.leads++;
      if (hasEmail) bucket.withEmail++;
      if (t != null) {
        const slot = (perTier[t] ??= { leads: 0, withEmail: 0 });
        slot.leads++;
        if (hasEmail) slot.withEmail++;
      }
    }
    return { ...buckets, perTier };
  }, [rows]);

  const activeJob = useMemo(
    () => jobs.find((j) => j.id === activeJobId) ?? null,
    [jobs, activeJobId],
  );
  const progress = activeJob?.result?.progress ?? null;

  // Build the export rows = leads in the 9 sweep countries, sorted by country.
  const sweepExportRows = useMemo(() => {
    const set = new Set(SWEEP_COUNTRIES.map((c) => c.toLowerCase()));
    const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
    return rows
      .filter((r) => set.has(norm(r.hq_country)) || set.has(norm(r.operating_eu_country)))
      .map((r) => ({
        country: r.hq_country ?? r.operating_eu_country ?? "",
        agency_name: r.agency_name,
        contact_name: r.contact_name ?? "",
        contact_email: r.contact_email ?? "",
        contact_phone: r.contact_phone ?? "",
        contact_linkedin: r.contact_linkedin ?? "",
        hq_city: r.hq_city ?? "",
        operating_eu_country: r.operating_eu_country ?? "",
        recruitment_model: (r.recruitment_model ?? []).join("|"),
        license_number: r.license_number ?? "",
        license_verified: r.license_verified ? "yes" : "no",
        worker_origin_focus: (r.worker_origin_focus ?? []).join("|"),
        trades: (r.trades ?? []).join("|"),
        status: r.status,
        excluded_reason: r.excluded_reason ?? "",
        source_url: r.source_url ?? "",
        source_posted_at: r.source_posted_at ?? "",
        last_seen_at: r.last_seen_at,
      }))
      .sort((a, b) =>
        a.country.localeCompare(b.country) || a.agency_name.localeCompare(b.agency_name),
      );
  }, [rows]);

  const triggerDownload = (filename: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportSweep = (format: "csv" | "json") => {
    if (sweepExportRows.length === 0) {
      toast.warning("No leads to export yet");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      triggerDownload(
        `recruiter-leads-${stamp}.json`,
        "application/json",
        JSON.stringify(sweepExportRows, null, 2),
      );
    } else {
      const headers = Object.keys(sweepExportRows[0]);
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [
        headers.join(","),
        ...sweepExportRows.map((r) =>
          headers.map((h) => escape((r as Record<string, unknown>)[h])).join(","),
        ),
      ].join("\n");
      triggerDownload(`recruiter-leads-${stamp}.csv`, "text/csv;charset=utf-8", csv);
    }
    toast.success(`Exported ${sweepExportRows.length} leads as ${format.toUpperCase()}`);
  };

  const runDiscovery = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-discover", {
        body: { recencyDays: Number(recencyDays) || 90, maxQueries: 20 },
      });
      if (error) throw error;
      const d = data as { jobId?: string; status?: string };
      if (d.jobId) {
        toast.success("Discovery queued — running in the background");
        setActiveJobId(d.jobId);
        await loadJobs();
        setTab("jobs");
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  };

  // Outreach priority blocks based on contact channels available.
  // Block 1 = email + phone + LinkedIn, Block 2 = email + (phone XOR LinkedIn), Block 3 = email only.
  const outreachBlocks = useMemo(() => {
    const b: { block1: RecruiterRow[]; block2: RecruiterRow[]; block3: RecruiterRow[]; noContact: number } =
      { block1: [], block2: [], block3: [], noContact: 0 };
    for (const r of rows) {
      const e = (r.contact_email ?? "").trim();
      const p = (r.contact_phone ?? "").trim();
      const l = (r.contact_linkedin ?? "").trim();
      const validEmail = e && e.toLowerCase() !== "n/a" && VALID_EMAIL_RE.test(e);
      if (!e && !p && !l) { b.noContact++; continue; }
      if (!validEmail) continue;
      if (p && l) b.block1.push(r);
      else if (p || l) b.block2.push(r);
      else b.block3.push(r);
    }
    return b;
  }, [rows]);
  const outreachTotal = outreachBlocks.block1.length + outreachBlocks.block2.length + outreachBlocks.block3.length;

  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const runCleanup = async () => {
    setCleanupRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-cleanup", { body: {} });
      if (error) throw error;
      const d = data as { ok?: boolean; deleted?: number; error?: string };
      if (!d?.ok) throw new Error(d?.error ?? "Cleanup failed");
      toast.success(`Deleted ${d.deleted ?? 0} no-contact leads`);
      setCleanupOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setCleanupRunning(false);
    }
  };

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleRunning, setScheduleRunning] = useState(false);
  const [scheduleBlocks, setScheduleBlocks] = useState<number[] | null>(null);
  const [scheduleDailyCap, setScheduleDailyCap] = useState(50);
  const [dryRunRunning, setDryRunRunning] = useState(false);
  type DryRunResult = {
    wouldSchedule: number;
    days: number;
    dailyCap: number;
    templateName: string | null;
    orderingValid: boolean;
    firstViolationIndex: number | null;
    sendAtMonotonic: boolean;
    blocks: { block1: number; block2: number; block3: number };
    previewSample: Array<{ position: number; block: number; agency_name: string | null; to_email: string; send_at: string }>;
    lastSample: Array<{ position: number; block: number; agency_name: string | null; to_email: string; send_at: string }>;
    windowStartIso: string | null;
    windowEndIso: string | null;
  };
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const openScheduleDialog = (blocks: number[] | null) => {
    setScheduleBlocks(blocks);
    setDryRunResult(null);
    setScheduleOpen(true);
  };
  const runDryRun = async () => {
    setDryRunRunning(true);
    setDryRunResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-schedule-outreach", {
        body: {
          dailyCap: scheduleDailyCap,
          dryRun: true,
          ...(scheduleBlocks ? { blocks: scheduleBlocks } : {}),
        },
      });
      if (error) throw error;
      const d = data as { ok?: boolean; error?: string } & Partial<DryRunResult>;
      if (!d?.ok) throw new Error(d?.error ?? "Dry run failed");
      setDryRunResult(d as DryRunResult);
      if (!d.orderingValid) {
        toast.error(`Block ordering violation at position ${(d.firstViolationIndex ?? 0) + 1}`);
      } else {
        toast.success(`Dry run OK — ${d.wouldSchedule ?? 0} emails across ${d.days ?? 0} day(s)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dry run failed");
    } finally {
      setDryRunRunning(false);
    }
  };
  const runSchedule = async () => {
    setScheduleRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-schedule-outreach", {
        body: {
          dailyCap: scheduleDailyCap,
          ...(scheduleBlocks ? { blocks: scheduleBlocks } : {}),
        },
      });
      if (error) throw error;
      const d = data as { ok?: boolean; scheduled?: number; days?: number; error?: string };
      if (!d?.ok) throw new Error(d?.error ?? "Schedule failed");
      toast.success(`Scheduled ${d.scheduled ?? 0} emails across ${d.days ?? 0} day(s)`);
      setScheduleOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Schedule failed");
    } finally {
      setScheduleRunning(false);
    }
  };

  return (
    <div className="container py-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recruiter Discovery</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Active recruiters & manpower agencies in the Balkans + EU hiring blue-collar workers from Nepal, India and Bangladesh.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { load(); loadJobs(); }} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          {isAdmin && (
            <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" title="Hard-delete leads with no email, phone, and no LinkedIn">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Clean no-contact
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete leads with no contact info?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  This permanently removes every recruiter lead that has no email, no phone, and no LinkedIn URL. There are <span className="font-medium">{outreachBlocks.noContact}</span> such leads in your current view (final count is computed server-side).
                </p>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCleanupOpen(false)} disabled={cleanupRunning}>Cancel</Button>
                  <Button variant="destructive" onClick={runCleanup} disabled={cleanupRunning}>
                    {cleanupRunning ? "Deleting…" : "Delete permanently"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Sparkles className="h-4 w-4 mr-1.5" /> Run discovery
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Run recruiter discovery</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Searches Firecrawl for recruitment agencies hiring NP / IN / BD workers across {`${hqOptions.length || 21}`} target countries. Up to 20 queries per run. The job runs in the background — you can keep using the app while it works.
                </p>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={running}>Cancel</Button>
                  <Button onClick={runDiscovery} disabled={running}>
                    {running ? "Queuing…" : "Start discovery"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {activeJobId && (
        <Card className="p-3 mb-4 flex items-center gap-3 border-primary/40">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <div className="flex-1">
            <div className="text-sm font-medium">
              {progress?.phase === "scraping"
                ? `Scraping ${progress.scraped}/${progress.scrape_total} candidate sites…`
                : progress?.phase === "searching"
                ? `Searching Google: ${progress.searched} queries · ${progress.discovered} candidates found`
                : "Discovery running in background…"}
            </div>
            <Progress
              value={
                progress?.phase === "scraping" && progress.scrape_total > 0
                  ? Math.round((progress.scraped / progress.scrape_total) * 100)
                  : undefined as unknown as number
              }
              className="h-1.5 mt-1.5"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setTab("jobs")}>View job</Button>
        </Card>
      )}

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">9-country APIFY sweep</div>
            <div className="text-xs text-muted-foreground">
              Leads with a valid contact email across the targeted countries.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportSweep("csv")}
                disabled={sweepExportRows.length === 0}
                title="Download all sweep leads as CSV"
              >
                <Download className="h-4 w-4 mr-1.5" /> CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportSweep("json")}
                disabled={sweepExportRows.length === 0}
                title="Download all sweep leads as JSON"
              >
                <Download className="h-4 w-4 mr-1.5" /> JSON
              </Button>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold leading-tight">
                {sweepTotals.withEmail}<span className="text-base text-muted-foreground"> / {sweepTotals.total}</span>
              </div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">with email / total</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {sweepTally.map((t) => {
            const pct = t.total > 0 ? Math.round((t.withEmail / t.total) * 100) : 0;
            const live = progress?.by_country?.[t.country];
            const liveStatus = !progress
              ? null
              : live
              ? progress.phase === "scraping"
                ? `${live.scraped}/${live.candidates} scraped`
                : `${live.candidates} found`
              : progress.phase === "searching"
              ? "searching…"
              : "pending";
            return (
              <button
                key={t.country}
                type="button"
                onClick={() => { setHqFilter(t.country); setTab("recruiters"); }}
                className="text-left rounded-lg border bg-card hover:bg-accent/40 transition p-2"
                title={`${t.country}: ${t.withEmail} of ${t.total} leads have a valid email`}
              >
                <div className="text-[11px] font-medium text-muted-foreground truncate">{t.country}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-bold leading-none">{t.withEmail}</span>
                  <span className="text-xs text-muted-foreground">/ {t.total}</span>
                </div>
                <Progress value={pct} className="h-1 mt-1.5" />
                {liveStatus && (
                  <div className="mt-1 text-[10px] text-muted-foreground truncate">
                    {liveStatus}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold">Outreach blocks</div>
            <div className="text-xs text-muted-foreground">
              Prioritized for the 50/day automated send. Block 1 → 2 → 3.
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => openScheduleDialog(null)} disabled={outreachTotal === 0}>
              <Send className="h-4 w-4 mr-1.5" />
              Schedule {scheduleDailyCap}/day outreach ({outreachTotal})
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { key: 1, label: "Block 1 — Email + Phone + LinkedIn", count: outreachBlocks.block1.length, tone: "border-emerald-500/40 bg-emerald-500/5" },
            { key: 2, label: "Block 2 — Email + Phone or LinkedIn", count: outreachBlocks.block2.length, tone: "border-amber-500/40 bg-amber-500/5" },
            { key: 3, label: "Block 3 — Email only", count: outreachBlocks.block3.length, tone: "border-muted bg-muted/30" },
          ] as const).map((b) => (
            <div key={b.key} className={`rounded-lg border p-3 ${b.tone}`}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{b.label}</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-bold leading-none">{b.count}</span>
                {isAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => openScheduleDialog([b.key])} disabled={b.count === 0}>
                    Schedule
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        {outreachBlocks.noContact > 0 && (
          <div className="mt-3 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3 inline mr-1 text-amber-500" />
            {outreachBlocks.noContact} lead(s) have no email, phone, or LinkedIn — use "Clean no-contact" to remove them.
          </div>
        )}
      </Card>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule automated outreach</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {scheduleBlocks
                ? `Scheduling Block ${scheduleBlocks.join(", ")} only.`
                : "Scheduling all 3 blocks in priority order (Block 1 → 2 → 3)."}{" "}
              Already-queued or already-sent leads, suppressed addresses, and duplicates are skipped automatically.
            </p>
            <div className="flex items-center gap-3">
              <Label className="text-xs w-24">Daily cap</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={scheduleDailyCap}
                onChange={(e) => setScheduleDailyCap(Math.max(1, Math.min(500, Number(e.target.value) || 50)))}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">emails per day</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Send window: 08:00–19:00 Europe/Belgrade. Emails are spaced evenly inside the window. The global 200/day cap stays in place — staggering only applies to this batch.
            </div>
            {dryRunResult && (
              <div className={`rounded-md border p-3 text-xs space-y-2 ${dryRunResult.orderingValid && dryRunResult.sendAtMonotonic ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/50 bg-destructive/5"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Dry run preview · nothing was written</span>
                  <span className="text-muted-foreground">{dryRunResult.wouldSchedule} emails · {dryRunResult.days} day(s)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-1.5"><div className="text-[10px] uppercase text-muted-foreground">Block 1</div><div className="font-semibold">{dryRunResult.blocks.block1}</div></div>
                  <div className="rounded border border-amber-500/40 bg-amber-500/5 p-1.5"><div className="text-[10px] uppercase text-muted-foreground">Block 2</div><div className="font-semibold">{dryRunResult.blocks.block2}</div></div>
                  <div className="rounded border border-muted bg-muted/30 p-1.5"><div className="text-[10px] uppercase text-muted-foreground">Block 3</div><div className="font-semibold">{dryRunResult.blocks.block3}</div></div>
                </div>
                <div className="space-y-0.5">
                  <div>{dryRunResult.orderingValid ? "✓ Block 1 → 2 → 3 ordering valid" : `✗ Ordering violation at position ${(dryRunResult.firstViolationIndex ?? 0) + 1}`}</div>
                  <div>{dryRunResult.sendAtMonotonic ? "✓ send_at is monotonically increasing" : "✗ send_at is not monotonic"}</div>
                  {dryRunResult.windowStartIso && (
                    <div className="text-muted-foreground">Window: {new Date(dryRunResult.windowStartIso).toLocaleString()} → {new Date(dryRunResult.windowEndIso ?? dryRunResult.windowStartIso).toLocaleString()}</div>
                  )}
                </div>
                {dryRunResult.previewSample.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-muted-foreground">First {dryRunResult.previewSample.length}:</div>
                    {dryRunResult.previewSample.map((p) => (
                      <div key={`f-${p.position}`} className="flex gap-2 font-mono text-[11px]"><span className="w-8 text-muted-foreground">#{p.position}</span><span className="w-6">B{p.block}</span><span className="flex-1 truncate">{p.agency_name ?? "—"} · {p.to_email}</span><span className="text-muted-foreground">{new Date(p.send_at).toLocaleString()}</span></div>
                    ))}
                    {dryRunResult.lastSample.length > 0 && <div className="text-muted-foreground pt-1">Last {dryRunResult.lastSample.length}:</div>}
                    {dryRunResult.lastSample.map((p) => (
                      <div key={`l-${p.position}`} className="flex gap-2 font-mono text-[11px]"><span className="w-8 text-muted-foreground">#{p.position}</span><span className="w-6">B{p.block}</span><span className="flex-1 truncate">{p.agency_name ?? "—"} · {p.to_email}</span><span className="text-muted-foreground">{new Date(p.send_at).toLocaleString()}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)} disabled={scheduleRunning}>Cancel</Button>
            <Button variant="outline" onClick={runDryRun} disabled={scheduleRunning || dryRunRunning}>
              {dryRunRunning ? "Validating…" : "Dry run"}
            </Button>
            <Button onClick={runSchedule} disabled={scheduleRunning || dryRunRunning}>
              {scheduleRunning ? "Scheduling…" : "Schedule now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "recruiters" | "jobs")} className="mb-4">
        <TabsList>
          <TabsTrigger value="recruiters">Recruiters ({filtered.length})</TabsTrigger>
          <TabsTrigger value="jobs">Discovery jobs ({jobs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="recruiters" className="mt-4 space-y-4">
      {selectedIds.size > 0 && (
        <Card className="p-3 flex items-center gap-3 border-primary/40 bg-primary/5">
          <MailCheck className="h-4 w-4 text-primary" />
          <div className="flex-1 text-sm">
            <span className="font-medium">{selectedIds.size}</span> selected
            {bulkProgress && (
              <span className="ml-2 text-muted-foreground">
                · sending {bulkProgress.done}/{bulkProgress.total}…
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={bulkSending}>
            Clear
          </Button>
          <Button size="sm" onClick={bulkSendPersonalized} disabled={bulkSending}>
            <Send className="h-4 w-4 mr-1.5" />
            {bulkSending ? "Sending…" : "Send personalized emails"}
          </Button>
        </Card>
      )}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Search agency</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter…" />
          </div>
          <div className="w-44">
            <Label className="text-xs">HQ country</Label>
            <Select value={hqFilter} onValueChange={setHqFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {hqOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <Label className="text-xs">Recruitment model</Label>
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All allowed models</SelectItem>
                {Object.entries(MODEL_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Label className="text-xs">Worker origin</Label>
            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="NP">Nepal</SelectItem>
                <SelectItem value="IN">India</SelectItem>
                <SelectItem value="BD">Bangladesh</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label className="text-xs">Posted within</Label>
            <Select value={recencyDays} onValueChange={setRecencyDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="all">Any time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs">Worker collar</Label>
            <Select value={collarFilter} onValueChange={setCollarFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="non_white">Hide white-collar</SelectItem>
                <SelectItem value="blue">Blue-collar only</SelectItem>
                <SelectItem value="mixed">Mixed only</SelectItem>
                <SelectItem value="unknown">Unknown only</SelectItem>
                <SelectItem value="white">White-collar only</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="lic" checked={licensedOnly} onCheckedChange={setLicensedOnly} />
            <Label htmlFor="lic" className="text-xs">Verified license only</Label>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="exc" checked={showExcluded} onCheckedChange={setShowExcluded} />
            <Label htmlFor="exc" className="text-xs">Show excluded</Label>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No recruiters match. Run discovery or relax filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={
                      filtered.length > 0 &&
                      filtered.every((r) => selectedIds.has(r.id))
                    }
                    onCheckedChange={(v) => {
                      setSelectedIds((prev) => {
                        const n = new Set(prev);
                        if (v) filtered.forEach((r) => n.add(r.id));
                        else filtered.forEach((r) => n.delete(r.id));
                        return n;
                      });
                    }}
                  />
                </TableHead>
                <TableHead>Agency</TableHead>
                <TableHead>HQ → Operating</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>License</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const headcount = totalHeadcount(r.active_orders);
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={() => toggleSelect(r.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.agency_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(r.worker_origin_focus ?? []).map((o) => ORIGIN_LABELS[o] ?? o).join(", ") || "—"}
                      </div>
                      {r.status === "excluded" && (
                        <Badge variant="destructive" className="mt-1 text-[10px]">
                          Excluded: {r.excluded_reason ?? "n/a"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{[r.hq_city, r.hq_country].filter(Boolean).join(", ") || "—"}</div>
                      <div className="text-xs text-muted-foreground">→ {r.operating_eu_country ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.contact_email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.contact_email}</div>}
                      {r.contact_phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.contact_phone}</div>}
                      {r.contact_linkedin && <div className="flex items-center gap-1"><Linkedin className="h-3 w-3" />profile</div>}
                      {!r.contact_email && !r.contact_phone && !r.contact_linkedin && <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.recruitment_model ?? []).map((m) => (
                          <Badge key={m} variant="secondary" className="text-[10px]">
                            {MODEL_LABELS[m] ?? m}
                          </Badge>
                        ))}
                        {(r.recruitment_model ?? []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{headcount > 0 ? `${headcount} workers` : "—"}</div>
                      <div className="text-xs text-muted-foreground">{(r.active_orders ?? []).length} orders</div>
                    </TableCell>
                    <TableCell>
                      {r.license_number ? (
                        <div className="flex items-center gap-1 text-xs">
                          {r.license_verified && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                          <span className="font-mono">{r.license_number}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.email_delivery_status ? (
                        <Badge
                          variant={
                            r.email_delivery_status === "delivered" || r.email_delivery_status === "opened" || r.email_delivery_status === "clicked"
                              ? "secondary"
                              : r.email_delivery_status === "bounced" || r.email_delivery_status === "complained" || r.email_delivery_status === "failed"
                              ? "destructive"
                              : "outline"
                          }
                          className="text-[10px]"
                        >
                          {(r.email_delivery_status === "bounced" || r.email_delivery_status === "complained") && (
                            <AlertTriangle className="h-3 w-3 mr-1" />
                          )}
                          {r.email_delivery_status}
                        </Badge>
                      ) : r.email_status === "sent" ? (
                        <span className="text-muted-foreground">sent</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(r.last_seen_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            {jobs.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No discovery jobs yet. Click "Run discovery" to queue one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Discovered</TableHead>
                    <TableHead>New / Updated</TableHead>
                    <TableHead>Excluded</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => {
                    const startMs = j.started_at ? Date.parse(j.started_at) : Date.parse(j.created_at);
                    const endMs = j.finished_at ? Date.parse(j.finished_at) : Date.now();
                    const durSec = Math.max(0, Math.round((endMs - startMs) / 1000));
                    const r = j.result ?? {};
                    const Icon = j.status === "completed" ? CheckCircle2
                      : j.status === "failed" ? XCircle
                      : j.status === "processing" ? Loader2
                      : Clock;
                    return (
                      <TableRow key={j.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Icon className={`h-4 w-4 ${j.status === "processing" ? "animate-spin text-primary" : j.status === "completed" ? "text-emerald-600" : j.status === "failed" ? "text-destructive" : "text-muted-foreground"}`} />
                            <span className="capitalize text-sm">{j.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(j.created_at)}</TableCell>
                        <TableCell className="text-xs">{durSec}s</TableCell>
                        <TableCell className="text-sm">{r.discovered ?? "—"}</TableCell>
                        <TableCell className="text-sm">{(r.inserted ?? 0)} / {(r.updated ?? 0)}</TableCell>
                        <TableCell className="text-sm">{r.excluded ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {j.error_message ?? (r.scraped !== undefined ? `${r.scraped} scraped · ${r.skipped ?? 0} skipped` : "—")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center justify-between gap-2">
                  <span className="truncate">{selected.agency_name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={sendTestEmail}
                    disabled={
                      testSending ||
                      !testEmail.trim() ||
                      !previewSubject ||
                      !previewBody
                    }
                    title={
                      testEmail
                        ? `Send a one-click QA copy to ${testEmail}`
                        : "Set a QA test address in the email panel below"
                    }
                  >
                    {testSending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Beaker className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    QA send
                  </Button>
                </SheetTitle>
                {testEmail && (
                  <p className="text-[11px] text-muted-foreground">
                    QA copy will be sent to <span className="font-mono">{testEmail}</span> via Resend
                  </p>
                )}
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Headquarters</div>
                  <div>{[selected.hq_city, selected.hq_country].filter(Boolean).join(", ") || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Operating EU country</div>
                  <div>{selected.operating_eu_country ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Contact</div>
                  <div>{selected.contact_name ?? "—"}</div>
                  {selected.contact_email && <div>{selected.contact_email}</div>}
                  {selected.contact_phone && <div>{selected.contact_phone}</div>}
                  {selected.contact_linkedin && (
                    <a className="text-primary inline-flex items-center gap-1" href={selected.contact_linkedin} target="_blank" rel="noreferrer">
                      LinkedIn <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">License</div>
                  <div className="font-mono text-xs">
                    {selected.license_number ?? "—"}{" "}
                    {selected.license_verified && <Badge variant="secondary" className="ml-1">verified</Badge>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Active orders</div>
                  {(selected.active_orders ?? []).length === 0 ? (
                    <div className="text-muted-foreground">None extracted</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Role</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Salary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.active_orders.map((o, i) => (
                          <TableRow key={i}>
                            <TableCell>{o.role ?? "—"}</TableCell>
                            <TableCell>{o.country ?? "—"}</TableCell>
                            <TableCell className="text-right">{o.headcount ?? "—"}</TableCell>
                            <TableCell className="text-right text-xs">
                              {o.salary_min || o.salary_max
                                ? `${o.salary_min ?? "?"}–${o.salary_max ?? "?"} ${o.currency ?? ""}`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Source</div>
                  {selected.source_url ? (
                    <a className="text-primary inline-flex items-center gap-1 break-all" href={selected.source_url} target="_blank" rel="noreferrer">
                      {selected.source_url} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "—"}
                  <div className="text-xs text-muted-foreground mt-1">
                    Posted {formatDate(selected.source_posted_at)} · Last seen {formatDate(selected.last_seen_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge>Quality {selected.quality_score}</Badge>
                  <Badge variant={selected.status === "active" ? "secondary" : "destructive"}>
                    {selected.status}
                  </Badge>
                  {selected.email_status === "sent" && (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                      Email sent {selected.email_sent_at ? `· ${formatDate(selected.email_sent_at)}` : ""}
                    </Badge>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Outreach email</h3>
                    <div className="flex items-center gap-2">
                      {templates.length > 0 && (
                        <Select onValueChange={(v) => {
                          const tpl = templates.find((t) => t.id === v);
                          if (tpl) applyTemplate(tpl, selected);
                        }}>
                          <SelectTrigger className="h-7 text-xs w-44">
                            <SelectValue placeholder="Apply template…" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((t) => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        size="sm" variant="ghost" className="h-7 px-2"
                        onClick={() => { setEditingTpl(null); setTplForm({ name: "", subject: emailSubject, body: emailBody, description: "" }); setTemplatesOpen(true); }}
                        title="Manage templates"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      <Badge variant="outline" className="text-[10px]">
                        {selected.email_status === "sent" ? "Already sent" : "Draft"}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-subject" className="text-xs">Subject</Label>
                    <Input
                      id="email-subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-body" className="text-xs">Body</Label>
                    <Textarea
                      id="email-body"
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={12}
                      maxLength={4000}
                      className="font-mono text-xs"
                    />
                    <div className="text-[10px] text-muted-foreground text-right">
                      {emailBody.length}/4000
                    </div>
                  </div>
                  <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5" /> Live preview · {selected.agency_name}
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        merge tags filled from this lead
                      </span>
                    </div>
                    {missingTags.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium">
                          {missingTags.length} empty merge tag{missingTags.length === 1 ? "" : "s"}:
                        </span>
                        {missingTags.map((t) => (
                          <Badge key={t} variant="destructive" className="text-[10px] font-mono">
                            {`{{${t}}}`}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      /\{\{\s*[a-z_]/i.test(`${emailSubject}\n${emailBody}`) && (
                        <div className="flex items-center gap-1.5 rounded-sm border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          All merge tags resolved for this lead
                        </div>
                      )
                    )}
                    <div className="text-xs">
                      <span className="text-muted-foreground">Subject: </span>
                      <span className="font-medium">{previewSubject || <em className="text-muted-foreground">—</em>}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      To: {selected.contact_name ?? "—"} &lt;{selected.contact_email ?? "no email"}&gt;
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>Format:</span>
                      <Badge variant={isHtmlBody ? "default" : "outline"} className="text-[10px]">
                        {isHtmlBody ? "HTML (sanitised)" : "Plain text"}
                      </Badge>
                    </div>
                    {isHtmlBody ? (
                      <div
                        className="prose prose-sm max-w-none text-xs leading-relaxed bg-background border rounded-sm p-2 max-h-64 overflow-auto"
                        // safeHtml has been run through DOMPurify with a strict allow-list
                        dangerouslySetInnerHTML={{ __html: safeHtml || "—" }}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans bg-background border rounded-sm p-2 max-h-64 overflow-auto">
{previewBody || "—"}
                      </pre>
                    )}
                  </div>
                  <div className="space-y-1.5 rounded-md border p-3">
                    <Label className="text-xs">Test send (sends preview to your address — no lead update)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="you@voynovaglobal.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={sendTestEmail}
                        disabled={testSending || !testEmail.trim() || !previewSubject || !previewBody}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        {testSending ? "Sending…" : "Test send"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={copyDraft}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy to clipboard
                    </Button>
                    {selected.contact_email && (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={`mailto:${encodeURIComponent(selected.contact_email)}?subject=${encodeURIComponent(previewSubject)}&body=${encodeURIComponent(plainTextBody)}`}
                        >
                          <Mail className="h-3.5 w-3.5 mr-1.5" /> Open in mail app
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={markAsSent}
                      disabled={savingEmail || selected.email_status === "sent"}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      {selected.email_status === "sent" ? "Already marked" : savingEmail ? "Saving…" : "Mark as sent"}
                    </Button>
                    {selected.contact_email && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={sendViaResend}
                        disabled={sendingEmail || !emailSubject || !emailBody}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        {sendingEmail ? "Sending…" : "Send via Resend"}
                      </Button>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <MailCheck className="h-4 w-4" /> Send history
                    </h3>
                    <span className="text-[10px] text-muted-foreground">
                      {sendHistory.length} {sendHistory.length === 1 ? "send" : "sends"}
                    </span>
                  </div>
                  {sendHistoryLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : sendHistory.length === 0 ? (
                    <div className="text-xs text-muted-foreground border rounded-md p-3 text-center">
                      No sends yet. Test sends and real sends to {selected.agency_name} will appear here.
                    </div>
                  ) : (
                    <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                      {sendHistory.map((s) => {
                        const isTest = s.channel === "email_test";
                        const m = s.note.match(/^\[(OK|FAILED)\] To: (\S+) — (.+?)(?: — (.+))?$/);
                        const status = (m?.[1] ?? "OK").toLowerCase();
                        const to = m?.[2] ?? "";
                        const subject = m?.[3] ?? s.note;
                        const errMsg = m?.[4];
                        const ok = status === "ok";
                        return (
                          <div key={s.id} className="p-2.5 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={
                                    isTest
                                      ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                                      : "border-primary/40 text-primary"
                                  }
                                >
                                  {isTest ? (
                                    <><Beaker className="h-3 w-3 mr-1" />Test</>
                                  ) : (
                                    <><Send className="h-3 w-3 mr-1" />Real send</>
                                  )}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={
                                    ok
                                      ? "border-emerald-500/40 text-emerald-600"
                                      : "border-destructive/40 text-destructive"
                                  }
                                >
                                  {ok ? (
                                    <><CheckCircle2 className="h-3 w-3 mr-1" />Sent</>
                                  ) : (
                                    <><XCircle className="h-3 w-3 mr-1" />Failed</>
                                  )}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(s.created_at).toLocaleString("en-GB", { hour12: false })}
                              </span>
                            </div>
                            {to && (
                              <div className="text-[11px] text-muted-foreground truncate">
                                to <span className="font-medium text-foreground">{to}</span>
                              </div>
                            )}
                            <div className="text-[11px] truncate" title={subject}>{subject}</div>
                            {errMsg && (
                              <div className="text-[11px] text-destructive break-words">{errMsg}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <History className="h-4 w-4" /> Delivery timeline
                    </h3>
                    <span className="text-[10px] text-muted-foreground">{events.length} events</span>
                  </div>
                  {eventsLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : events.length === 0 ? (
                    <div className="text-xs text-muted-foreground border rounded-md p-3 text-center">
                      No events yet. Send the email to start tracking delivery.
                    </div>
                  ) : (
                    <ol className="relative border-l border-border ml-2 space-y-3">
                      {events.map((ev) => {
                        const t = ev.event_type;
                        const Icon =
                          t === "email.delivered" ? Inbox :
                          t === "email.opened" ? Eye :
                          t === "email.clicked" ? MousePointerClick :
                          t === "email.bounced" || t === "email.complained" || t === "email.failed" ? AlertCircle :
                          t === "email.sent" ? Send :
                          Clock;
                        const tone =
                          t === "email.bounced" || t === "email.complained" || t === "email.failed" ? "text-destructive" :
                          t === "email.delivered" || t === "email.opened" || t === "email.clicked" ? "text-emerald-600" :
                          "text-primary";
                        const p = (ev.payload ?? {}) as any;
                        const errMsg = p?.data?.bounce?.message ?? p?.data?.reason ?? p?.bounce?.message;
                        const link = p?.data?.click?.link ?? p?.click?.link;
                        const ts = new Date(ev.created_at);
                        return (
                          <li key={ev.id} className="ml-4">
                            <span className={`absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background ring-1 ring-border ${tone}`}>
                              <Icon className="h-2.5 w-2.5" />
                            </span>
                            <div className="flex items-baseline gap-2">
                              <span className={`text-xs font-medium capitalize ${tone}`}>
                                {t.replace("email.", "").replace("_", " ")}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {ts.toLocaleString("en-GB", { hour12: false })}
                              </span>
                            </div>
                            {ev.recipient && (
                              <div className="text-[11px] text-muted-foreground">to {ev.recipient}</div>
                            )}
                            {errMsg && (
                              <div className="text-[11px] text-destructive mt-0.5 break-words">{String(errMsg)}</div>
                            )}
                            {link && (
                              <a href={link} target="_blank" rel="noreferrer" className="text-[11px] text-primary break-all inline-flex items-center gap-1">
                                {link} <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                            {ev.message_id && (
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{ev.message_id}</div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Templates manager */}
      <Dialog open={templatesOpen} onOpenChange={(o) => { setTemplatesOpen(o); if (!o) { setEditingTpl(null); setTplForm({ name: "", subject: "", body: "", description: "" }); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email templates</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Use placeholders: <code className="text-[10px]">{`{{first_name}}`}</code>, <code className="text-[10px]">{`{{agency_name}}`}</code>, <code className="text-[10px]">{`{{country}}`}</code>, <code className="text-[10px]">{`{{trades}}`}</code>, <code className="text-[10px]">{`{{contact_email}}`}</code>, <code className="text-[10px]">{`{{hq_city}}`}</code>, <code className="text-[10px]">{`{{hq_country}}`}</code>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Saved ({templates.length})</h4>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {templates.map((t) => (
                  <Card key={t.id} className={`p-3 cursor-pointer ${editingTpl?.id === t.id ? "border-primary" : ""}`}
                    onClick={() => { setEditingTpl(t); setTplForm({ name: t.name, subject: t.subject, body: t.body, description: t.description ?? "" }); }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{t.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{t.subject}</div>
                        {t.description && <div className="text-[10px] text-muted-foreground mt-1">{t.description}</div>}
                      </div>
                      {isAdmin && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete template "${t.name}"?`)) deleteTemplate(t.id); }}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
                {templates.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center p-4 border rounded-md">No templates yet.</div>
                )}
              </div>
              <Button size="sm" variant="outline" className="w-full"
                onClick={() => { setEditingTpl(null); setTplForm({ name: "", subject: "", body: "", description: "" }); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New template
              </Button>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                {editingTpl ? `Edit "${editingTpl.name}"` : "New template"}
              </h4>
              <Input placeholder="Template name" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} />
              <Input placeholder="Description (optional)" value={tplForm.description} onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })} />
              <Input placeholder="Subject" value={tplForm.subject} onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })} />
              <Textarea placeholder="Body" rows={12} className="font-mono text-xs" value={tplForm.body} onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })} />
              <DialogFooter>
                {editingTpl && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditingTpl(null); setTplForm({ name: "", subject: "", body: "", description: "" }); }}>
                    Cancel edit
                  </Button>
                )}
                <Button size="sm" onClick={saveTemplate}>
                  {editingTpl ? "Save changes" : "Create template"}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Recruiters;