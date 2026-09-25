import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, MessageCircle, Play, CalendarClock, Handshake, Sparkles, Eye, Clock3, SendHorizontal, CheckCircle2, CircleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/PageHeader";
import { LeadMailDialog, type MailLead } from "@/components/LeadMailDialog";
import { AutoMailPanel } from "@/components/AutoMailPanel";
import { ManualWhatsappPanel } from "@/components/ManualWhatsappPanel";


const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const Outreach = () => {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [mailLead, setMailLead] = useState<MailLead | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "employer" | "education" | "supply">("all");

  const { data: stats } = useQuery({
    queryKey: ["outreach-stats"],
    queryFn: async () => {
      const get = async (filter: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
        const { count } = await filter(base());
        return count ?? 0;
      };
      const base = () => supabase.from("outreach_sends").select("id", { count: "exact", head: true });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [pending, sent, failed, sentToday] = await Promise.all([
        get((q) => q.eq("status", "pending")),
        get((q) => q.eq("status", "sent")),
        get((q) => q.eq("status", "failed")),
        get((q) => q.eq("status", "sent").gte("sent_at", today.toISOString())),
      ]);
      return { pending, sent, failed, sentToday };
    },
    refetchInterval: 5000,
  });

  const { data: queue, isLoading } = useQuery({
    queryKey: ["outreach-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sends")
        .select("*, leads(company, country, contact_name)")
        .order("scheduled_for", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 6000,
  });

  const { data: ready } = useQuery({
    queryKey: ["outreach-ready"],
    queryFn: async () => {
      const count = async (
        channel: "email" | "phone",
        kinds?: Array<"employer" | "education" | "supply">,
      ) => {
        let q = supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .not(channel, "is", null)
          .neq("stage", "rejected");
        if (kinds) q = q.in("kind", kinds);
        const { count: c } = await q;
        return c ?? 0;
      };
      const [email, whatsapp, supplyEmail, supplyWa] = await Promise.all([
        count("email"),
        count("phone"),
        count("email", ["supply"]),
        count("phone", ["supply"]),
      ]);
      return { email, whatsapp, supplyEmail, supplyWa };
    },
    refetchInterval: 8000,
  });

  const { data: draftCount } = useQuery({
    queryKey: ["outreach-draft-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("draft_body", "is", null)
        .is("merged_into", null)
        .neq("stage", "rejected");
      return count ?? 0;
    },
    refetchInterval: 10000,
  });

  const { data: drafts, isLoading: draftsLoading } = useQuery({
    queryKey: ["outreach-drafts", kindFilter],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select(
          "id, company, kind, country, city, email, contact_name, contact_role, profile_summary, programs, trades, draft_subject, draft_body, draft_whatsapp, ai_score, ai_reason, phone, whatsapp",
        )
        .not("draft_body", "is", null)
        .is("merged_into", null)
        .neq("stage", "rejected")
        .order("drafted_at", { ascending: false, nullsFirst: false })
        .limit(60);
      if (kindFilter !== "all") q = q.eq("kind", kindFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as MailLead[];
    },
  });

  const run = async (name: string, body: Record<string, unknown>, label: string) => {
    setBusy(label);
    const { data, error } = await supabase.functions.invoke(name, { body });
    setBusy(null);
    if (error) {
      toast.error("Kaam pura nahi hua, dobara try karo.");
      return;
    }
    qc.invalidateQueries();
    return data;
  };

  const schedule = async (channels: string[], kinds?: string[], label?: string) => {
    const data = await run(
      "schedule-outreach",
      kinds ? { channels, kinds } : { channels },
      label ?? channels.join("+"),
    );
    if (!data) return;
    const added = (data.email ?? 0) + (data.whatsapp ?? 0);
    toast.success(
      added
        ? `${added} message queue me add hue. Pehla: ${fmt(data.first_send)}`
        : "Naya kuch add nahi hua — sab already queued hain.",
    );
  };

  /** One click: queue every lead with an email and start sending the due ones. */
  const autoCampaign = async () => {
    setBusy("auto");
    const { data: sched, error } = await supabase.functions.invoke("schedule-outreach", {
      body: { channels: ["email"] },
    });
    if (error) {
      setBusy(null);
      toast.error("Campaign shuru nahi hui, dobara try karo.");
      return;
    }
    const { data: sent } = await supabase.functions.invoke("process-outreach", { body: {} });
    setBusy(null);
    qc.invalidateQueries();
    toast.success(
      `${sched?.email ?? 0} emails queue me, ${sent?.sent ?? 0} abhi bhej diye. Baaki apne aap jayenge.`,
    );
  };

  /** Supply-side campaign: only manpower agencies, agents and counsellors. */
  const supplyCampaign = async () => {
    setBusy("supply-auto");
    const { data: sched, error } = await supabase.functions.invoke("schedule-outreach", {
      body: { channels: ["email"], kinds: ["supply"] },
    });
    if (error) {
      setBusy(null);
      toast.error("Partner campaign shuru nahi hui, dobara try karo.");
      return;
    }
    const { data: sent } = await supabase.functions.invoke("process-outreach", { body: {} });
    setBusy(null);
    qc.invalidateQueries();
    toast.success(
      `${sched?.email ?? 0} partner emails queue me, ${sent?.sent ?? 0} abhi bhej diye.`,
    );
  };

  const flush = async () => {
    const data = await run("process-outreach", {}, "flush");
    if (!data) return;
    toast.success(`${data.sent} bheje, ${data.failed} fail, ${data.paused} rukay hue.`);
  };

  /** Gemini drafting: up to 5 batches of 10 = 50 personalised drafts per click. */
  const draftBatch = async () => {
    setBusy("draft-batch");
    let made = 0;
    let remaining = -1;
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabase.functions.invoke("draft-email", { body: { limit: 10 } });
      if (error) break;
      made += data?.drafted ?? 0;
      remaining = data?.remaining ?? remaining;
      if (!data?.drafted) break;
    }
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["outreach-drafts"] });
    qc.invalidateQueries({ queryKey: ["outreach-draft-count"] });
    toast.success(
      remaining === 0
        ? `Gemini ne ${made} naye drafts banaye — email wali sab leads covered.`
        : `Gemini ne ${made} naye drafts banaye. ${remaining > 0 ? `${remaining} baaki hain` : "Aur drafts bane hain"} — dobara dabao.`,
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        step={2}
        title="Outreach"
        description="Email aur WhatsApp — 50 per din, har message ke beech gap, Mon–Fri 9:00–18:00 IST."
      />

      <AutoMailPanel />

      <AutoMailPanel
        kinds={["employer", "education"]}
        noun="employer"
        title="Europe employers & colleges auto-mail"
        description="Europe ke employers aur colleges ko detailed proposal mail — sath me Voynova company profile PDF attach hoti hai. Har 60 second me ek mail, Mon–Fri 9:00–18:00 IST."
        countries={["Latvia", "Estonia", "Serbia", "Cyprus"]}
      />





      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Clock3} label="Waiting" value={stats?.pending} />
        <Stat icon={SendHorizontal} label="Sent today" value={stats?.sentToday} />
        <Stat icon={CheckCircle2} label="Sent total" value={stats?.sent} tone="success" />
        <Stat icon={CircleAlert} label="Failed" value={stats?.failed} tone="warning" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-primary/10 bg-primary/5">
          <CardTitle className="flex items-center gap-2"><SendHorizontal className="h-5 w-5 text-primary" />Start outreach</CardTitle>
          <CardDescription>
            Har lead ka message uske company, country aur sector ke hisaab se apne aap bharta hai.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-5 md:pt-6">
          <Button onClick={autoCampaign} disabled={busy !== null} size="lg">
            {busy === "auto" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Auto send campaign ({ready?.email ?? 0} emails)
          </Button>
          <Button onClick={() => schedule(["email"])} disabled={busy !== null} variant="outline">
            {busy === "email" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Queue emails ({ready?.email ?? 0})
          </Button>
          <Button onClick={() => schedule(["whatsapp"])} disabled={busy !== null} variant="secondary">
            {busy === "whatsapp" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
            Queue WhatsApp ({ready?.whatsapp ?? 0})
          </Button>
          <Button onClick={flush} disabled={busy !== null} variant="outline">
            {busy === "flush" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Send due messages now
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b border-primary/10 bg-primary/5">
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            Supply partners outreach
          </CardTitle>
          <CardDescription>
            Manpower agencies, recruitment agents aur study abroad / visa counsellors ko alag
            partnership mail jata hai — hamare Europe job orders aur college seats ke saath.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-5 md:pt-6">
          <Button onClick={supplyCampaign} disabled={busy !== null} size="lg">
            {busy === "supply-auto" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Auto send to partners ({ready?.supplyEmail ?? 0} emails)
          </Button>
          <Button
            onClick={() => schedule(["email"], ["supply"], "supply-email")}
            disabled={busy !== null}
            variant="outline"
          >
            {busy === "supply-email" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Queue partner emails ({ready?.supplyEmail ?? 0})
          </Button>
          <Button
            onClick={() => schedule(["whatsapp"], ["supply"], "supply-wa")}
            disabled={busy !== null}
            variant="secondary"
          >
            {busy === "supply-wa" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="mr-2 h-4 w-4" />
            )}
            Queue partner WhatsApp ({ready?.supplyWa ?? 0})
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-primary/10 bg-primary/5">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gemini mail drafts
          </CardTitle>
          <CardDescription>
            Har lead ka personalised email + WhatsApp message, AI score ke saath. Preview karo,
            chaho to edit karo, phir seedha queue kar do.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5 md:pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={draftBatch} disabled={busy !== null} size="sm">
              {busy === "draft-batch" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Gemini se naye drafts banao
            </Button>
            {(["all", "employer", "education", "supply"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={kindFilter === k ? "default" : "outline"}
                onClick={() => setKindFilter(k)}
              >
                {k === "all"
                  ? "Sab"
                  : k === "employer"
                    ? "Employers"
                    : k === "education"
                      ? "Colleges"
                      : "Partners"}
              </Button>
            ))}
            <span className="text-sm text-muted-foreground">{draftCount ?? 0} drafts ready</span>
          </div>
          {draftsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !drafts?.length ? (
            <p className="text-sm text-muted-foreground">
              Abhi koi draft nahi — upar "Gemini se naye drafts banao" dabao.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-primary/10">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/70">
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Draft</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((row, i) => (
                    <TableRow key={row.id} className={i % 2 ? "bg-muted/30 hover:bg-primary/5" : "hover:bg-primary/5"}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {row.company}
                          <Badge
                            variant={
                              row.kind === "education"
                                ? "secondary"
                                : row.kind === "supply"
                                  ? "outline"
                                  : "default"
                            }
                          >
                            {row.kind === "education"
                              ? "College"
                              : row.kind === "supply"
                                ? "Partner"
                                : "Company"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[row.country, row.email].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.ai_score !== null ? (
                          <Badge
                            variant={
                              row.ai_score >= 70
                                ? "default"
                                : row.ai_score >= 45
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {row.ai_score}/100
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-72 truncate">
                        {row.draft_subject ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setMailLead(row)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Preview
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert className="border-primary/15 bg-primary/5">
        <CalendarClock className="h-4 w-4" />
        <AlertTitle>WhatsApp automatic sending</AlertTitle>
        <AlertDescription>
          WhatsApp messages queue ho jate hain. Business-initiated messages approved Meta template se
          connector ke through jayenge; connection hone tak WhatsApp queue paused rahegi.
        </AlertDescription>
      </Alert>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-primary/10 bg-primary/5">
          <CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" />Queue</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 md:pt-6">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !queue?.length ? (
            <p className="text-sm text-muted-foreground">Queue khali hai.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-primary/10">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/70">
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((row, i) => (
                    <TableRow key={row.id} className={i % 2 ? "bg-muted/30 hover:bg-primary/5" : "hover:bg-primary/5"}>
                      <TableCell className="font-medium">
                        {row.leads?.company ?? "—"}
                        <div className="text-xs text-muted-foreground">{row.leads?.country}</div>
                      </TableCell>
                      <TableCell className="capitalize">{row.channel}</TableCell>
                      <TableCell className="text-xs">{row.to_address}</TableCell>
                      <TableCell className="text-xs">{fmt(row.scheduled_for)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "sent" ? "default" : row.status === "failed" ? "destructive" : "secondary"
                          }
                        >
                          {row.status}
                        </Badge>
                        {row.error && (
                          <div className="text-[11px] text-destructive mt-1 max-w-64 truncate">{row.error}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <LeadMailDialog
        lead={mailLead}
        onClose={() => setMailLead(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["outreach-drafts"] });
          qc.invalidateQueries({ queryKey: ["outreach-draft-count"] });
        }}
      />
    </div>
  );
};

const Stat = ({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: typeof Clock3;
  label: string;
  value?: number;
  tone?: "primary" | "success" | "warning";
}) => (
  <Card className="transition-all duration-200 hover:border-primary/25 hover:shadow-md">
    <CardContent className="flex items-center gap-4 pt-6">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone === "success" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-2xl font-bold text-foreground">{value ?? "—"}</div>
      </div>
    </CardContent>
  </Card>
);

export default Outreach;
