import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Globe,
  Linkedin,
  ExternalLink,
  Calendar,
  Copy,
  Send,
  Sparkle,
  ChevronRight,
  ChevronDown,
  Activity,
  StickyNote,
  MessageCircle,
} from "lucide-react";
import { countryFlag } from "@/lib/country-flags";
import {
  audienceLabel,
  collectEmails,
  collectUrls,
  enrichSingle,
  priorityScoreClass,
  sectorLabel,
  LEAD_SELECT_COLUMNS,
  type Lead,
  type RawLead,
} from "@/lib/lead-shape";
import { buildOutreachTemplate } from "@/lib/lead-outreach";
import { LeadCrmCard } from "@/components/leads/LeadCrmCard";

type ContactLogEntry = {
  id: string;
  channel: string;
  note: string;
  created_at: string;
  user_id: string | null;
};

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "note", label: "Note" },
];

function channelIcon(channel: string) {
  switch (channel) {
    case "email":
      return <Mail className="h-3.5 w-3.5" />;
    case "phone":
      return <Phone className="h-3.5 w-3.5" />;
    case "linkedin":
      return <Linkedin className="h-3.5 w-3.5" />;
    case "whatsapp":
      return <MessageCircle className="h-3.5 w-3.5" />;
    case "meeting":
      return <MessageCircle className="h-3.5 w-3.5" />;
    default:
      return <StickyNote className="h-3.5 w-3.5" />;
  }
}

export default function LeadDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [logEntries, setLogEntries] = useState<ContactLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [newChannel, setNewChannel] = useState<string>("note");
  const [newNote, setNewNote] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  const loadLog = async () => {
    if (!id) return;
    setLogLoading(true);
    const { data, error } = await supabase
      .from("lead_outreach_log")
      .select("id, channel, note, created_at, user_id")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });
    if (!error) setLogEntries((data ?? []) as ContactLogEntry[]);
    setLogLoading(false);
  };

  useEffect(() => {
    loadLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addLogEntry = async () => {
    const note = newNote.trim();
    if (!note) {
      toast.error("Add a note before saving");
      return;
    }
    setSavingLog(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("lead_outreach_log").insert({
      lead_id: id,
      channel: newChannel,
      note,
      user_id: userData.user?.id ?? null,
    });
    setSavingLog(false);
    if (error) {
      toast.error("Failed to save log entry");
      return;
    }
    setNewNote("");
    setNewChannel("note");
    toast.success("Log entry saved");
    loadLog();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await supabase
        .from("demand_leads")
        .select(LEAD_SELECT_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error(error);
        toast.error("Failed to load lead");
        setLoading(false);
        return;
      }
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setLead(enrichSingle(data as unknown as RawLead));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const payload = (lead?.raw_signals?.payload ?? null) as Record<string, unknown> | null;
  const allEmails = useMemo(
    () =>
      lead
        ? Array.from(
            new Set(
              [lead.contact_email, ...collectEmails(payload)].filter(
                (e): e is string => !!e,
              ),
            ),
          )
        : [],
    [lead, payload],
  );
  const allUrls = useMemo(() => (lead ? collectUrls(payload) : []), [lead, payload]);
  const linkedinUrls = allUrls.filter((u) => /linkedin\.com\//i.test(u));

  const outreach = lead ? buildOutreachTemplate(lead) : null;
  const primaryEmail = allEmails[0] ?? lead?.enrichment?.email_patterns?.[0] ?? "";
  const mailtoHref =
    lead && outreach
      ? `mailto:${primaryEmail}?subject=${encodeURIComponent(outreach.subject)}&body=${encodeURIComponent(outreach.body)}`
      : "";

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const addToOutreach = async () => {
    if (!lead) return;
    const { error } = await supabase
      .from("demand_leads")
      .update({ review_status: "outreach" })
      .eq("id", lead.id);
    if (error) {
      toast.error("Failed to add to Outreach");
      console.error(error);
      return;
    }
    toast.success("Added to Outreach");
  };

  const primaryPhone = lead?.contact_phone ?? "";
  const waNumber = primaryPhone.replace(/[^\d]/g, "");
  const waText = outreach
    ? `${outreach.body}`.replace(/\n{2,}/g, "\n\n")
    : "";
  const waHref = waNumber && waText
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`
    : "";

  const [sendingEmail, setSendingEmail] = useState(false);
  const sendEmailDirect = async () => {
    if (!lead || !outreach || !primaryEmail) {
      toast.error("No email address for this lead");
      return;
    }
    setSendingEmail(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("scheduled_emails").insert({
        lead_id: lead.id,
        to_email: primaryEmail,
        subject: outreach.subject,
        body: outreach.body,
        send_at: new Date().toISOString(),
        status: "pending",
        template_name: "voynova_demand_outreach",
        created_by: userData.user?.id ?? null,
      });
      if (insErr) throw insErr;
      const { error: fnErr } = await supabase.functions.invoke("process-scheduled-emails", { body: {} });
      if (fnErr) throw fnErr;
      await supabase.from("lead_outreach_log").insert({
        lead_id: lead.id,
        channel: "email",
        note: `Sent direct from lead page → ${primaryEmail}`,
        user_id: userData.user?.id ?? null,
      });
      toast.success(`Email sent to ${primaryEmail}`);
      loadLog();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  const logWhatsappClick = async () => {
    if (!lead) return;
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("lead_outreach_log").insert({
      lead_id: lead.id,
      channel: "whatsapp",
      note: `Opened WhatsApp Web → +${waNumber}`,
      user_id: userData.user?.id ?? null,
    });
    loadLog();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <div className="px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (notFound || !lead) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <Card className="p-10 max-w-md text-center rounded-xl">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold mt-3">Lead not found</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This lead may have been removed or the link is incorrect.
          </p>
          <Button className="mt-4" onClick={() => navigate("/leads")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to leads
          </Button>
        </Card>
      </div>
    );
  }

  const score = lead.computed_score ?? lead.urgency_score ?? 0;
  const flag = countryFlag(lead.country);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Sticky header */}
      <div className="border-b bg-background/60 backdrop-blur sticky top-0 z-20">
        <div className="px-6 lg:px-8 py-5 max-w-5xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <Link to="/leads" className="hover:text-foreground">
              Leads
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground truncate max-w-[280px]">
              {lead.employer_name ?? "Unknown employer"}
            </span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="-ml-3 mb-1"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to leads
              </Button>
              <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-2">
                <Building2 className="h-6 w-6 text-accent shrink-0" />
                <span className="truncate">{lead.employer_name ?? "Unknown employer"}</span>
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden>{flag}</span>
                  {lead.country}
                  {lead.city ? ` · ${lead.city}` : ""}
                </span>
                {(lead.sector_tags ?? []).slice(0, 3).map((t) => (
                  <Badge key={t} variant="outline" className="text-[11px]">
                    {sectorLabel(t)}
                  </Badge>
                ))}
                <Badge
                  variant="outline"
                  className={`tabular-nums ${priorityScoreClass(score)}`}
                  title="Priority score"
                >
                  Score {Math.round(score)}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={sendEmailDirect}
                disabled={!primaryEmail || !outreach || sendingEmail}
                className="bg-primary"
              >
                <Mail className="h-4 w-4 mr-2" />
                {sendingEmail ? "Sending…" : "Send email now"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                asChild
                disabled={!waHref}
                className="border-emerald-500/50 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              >
                <a
                  href={waHref || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => waHref && logWhatsappClick()}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  {waNumber ? "Send WhatsApp" : "No phone"}
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => primaryEmail && copy(primaryEmail, "Email")}
                disabled={!primaryEmail}
              >
                <Copy className="h-4 w-4 mr-2" /> Copy email
              </Button>
              <Button size="sm" variant="outline" asChild disabled={!lead.website_url}>
                <a
                  href={lead.website_url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="h-4 w-4 mr-2" /> Open website
                </a>
              </Button>
              <Button size="sm" onClick={addToOutreach}>
                <Send className="h-4 w-4 mr-2" /> Add to Outreach
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
        {/* CRM */}
        <LeadCrmCard leadId={lead.id} />

        {/* Overview */}
        <Card className="p-5 rounded-xl">
          <SectionTitle>Overview</SectionTitle>
          <p className="text-sm text-foreground mt-2">{lead.role}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 text-sm">
            <Field label="Audience" value={audienceLabel(lead.target_audience_type)} />
            <Field
              label="Sectors"
              value={(lead.sector_tags ?? []).map(sectorLabel).join(", ") || "—"}
            />
            <Field
              label="Worker source"
              value={
                (lead.worker_origin_focus ?? []).length ? (
                  <span className="flex flex-wrap gap-1">
                    {(lead.worker_origin_focus ?? []).map((o) => (
                      <Badge
                        key={o}
                        variant="outline"
                        className="text-[10px] py-0 px-1.5 h-5 bg-accent/10 text-accent border-accent/30"
                      >
                        <span aria-hidden className="mr-0.5">
                          {countryFlag(o)}
                        </span>
                        {o}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Field
              label="Demand size"
              value={lead.demand_size ? `${lead.demand_size} hires` : "—"}
            />
            <Field
              label="Signal date"
              icon={<Calendar className="h-3.5 w-3.5" />}
              value={new Date(lead.created_at).toLocaleString("en-GB")}
            />
            <Field
              label="Source URL"
              value={
                lead.source_url ? (
                  <a
                    href={lead.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline break-all"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-[220px]">{lead.source_url}</span>
                  </a>
                ) : (
                  "—"
                )
              }
            />
          </div>
        </Card>

        {/* Contacts */}
        <Card className="p-5 rounded-xl">
          <SectionTitle>Contacts</SectionTitle>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allEmails.length === 0 &&
              !lead.contact_phone &&
              linkedinUrls.length === 0 &&
              !lead.website_url && (
                <p className="text-sm text-muted-foreground">
                  No direct contact details found.
                </p>
              )}
            {allEmails.map((e) => (
              <ContactButton key={e} href={`mailto:${e}`} icon={<Mail className="h-4 w-4" />}>
                {e}
              </ContactButton>
            ))}
            {lead.contact_phone && (
              <ContactButton
                href={`tel:${lead.contact_phone}`}
                icon={<Phone className="h-4 w-4" />}
              >
                {lead.contact_phone}
              </ContactButton>
            )}
            {lead.website_url && (
              <ContactButton
                href={lead.website_url}
                icon={<Globe className="h-4 w-4" />}
                external
              >
                {lead.website_url}
              </ContactButton>
            )}
            {linkedinUrls.map((u) => (
              <ContactButton
                key={u}
                href={u}
                icon={<Linkedin className="h-4 w-4" />}
                external
              >
                {u}
              </ContactButton>
            ))}
          </div>
        </Card>

        {/* Recommended outreach */}
        {outreach && (
          <Card className="p-5 rounded-xl">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle icon={<Sparkle className="h-4 w-4 text-accent" />}>
                Recommended outreach
              </SectionTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copy(`${outreach.subject}\n\n${outreach.body}`, "Email")
                  }
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                </Button>
                <Button size="sm" asChild disabled={!primaryEmail}>
                  <a href={mailtoHref || "#"}>
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    {primaryEmail ? "Open mailto" : "No email"}
                  </a>
                </Button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border bg-muted/30 p-4 space-y-3">
              <div>
                <Label>Subject</Label>
                <p className="text-sm font-medium">{outreach.subject}</p>
              </div>
              <Separator />
              <div>
                <Label>Body</Label>
                <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground">
                  {outreach.body}
                </pre>
              </div>
            </div>
          </Card>
        )}

        {/* Signals */}
        <Card className="p-5 rounded-xl">
          <SectionTitle>Signals</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
            <Field label="Priority tier" value={lead.priority} />
            <Field label="Score" value={`${Math.round(lead.computed_score)} / 100`} />
            <Field label="Urgency" value={String(lead.urgency_score ?? 0)} />
            <Field label="Company size" value={lead.company_size} />
          </div>
          <button
            type="button"
            onClick={() => setShowJson((v) => !v)}
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showJson ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Raw signal payload
          </button>
          {showJson && (
            <pre className="mt-2 text-xs bg-muted/50 border rounded-lg p-3 overflow-auto max-h-96 whitespace-pre-wrap break-all">
              {payload ? JSON.stringify(payload, null, 2) : "No raw payload available."}
            </pre>
          )}
        </Card>

        {/* Activity */}
        <Card className="p-5 rounded-xl">
          <SectionTitle icon={<Activity className="h-4 w-4 text-muted-foreground" />}>
            Contact log
          </SectionTitle>

          {/* Add entry */}
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <Select value={newChannel} onValueChange={setNewChannel}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="inline-flex items-center gap-2">
                        {channelIcon(c.value)} {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={addLogEntry}
                disabled={savingLog || !newNote.trim()}
                className="ml-auto"
              >
                {savingLog ? "Saving…" : "Add entry"}
              </Button>
            </div>
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="What happened? (e.g. Sent intro email, left voicemail, scheduled call for Friday)"
              rows={2}
              className="text-sm"
            />
          </div>

          <Separator className="my-4" />

          {/* Timeline */}
          <div className="space-y-0">
            {logLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : logEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No log entries yet. Lead created on{" "}
                <span className="text-foreground not-italic">
                  {new Date(lead.created_at).toLocaleString("en-GB")}
                </span>
                .
              </p>
            ) : (
              <ol className="relative border-l-2 border-border ml-2 space-y-4 pl-4">
                {logEntries.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[1.4rem] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-card border text-primary">
                      {channelIcon(entry.channel)}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="capitalize text-[10px] py-0">
                        {entry.channel}
                      </Badge>
                      <span>{new Date(entry.created_at).toLocaleString("en-GB")}</span>
                    </div>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
                      {entry.note}
                    </p>
                  </li>
                ))}
                <li className="relative">
                  <span className="absolute -left-[1.4rem] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted border text-muted-foreground">
                    <Sparkle className="h-3 w-3" />
                  </span>
                  <div className="text-xs text-muted-foreground">
                    Lead created · {new Date(lead.created_at).toLocaleString("en-GB")}
                  </div>
                </li>
              </ol>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
      {icon}
      {children}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-sm capitalize-first">{value}</div>
    </div>
  );
}

function ContactButton({
  href,
  icon,
  external,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:bg-muted/50 hover:border-primary/40 text-sm text-foreground transition-colors min-w-0"
    >
      <span className="text-primary shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
    </a>
  );
}