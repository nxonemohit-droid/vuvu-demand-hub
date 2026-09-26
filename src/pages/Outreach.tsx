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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutreachOverview } from "@/components/OutreachOverview";
import { OutreachLeadTable } from "@/components/OutreachLeadTable";
import { useOutreachStats, type Audience, type Channel, type StatusFilter } from "@/hooks/use-outreach";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const Outreach = () => {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [mailLead, setMailLead] = useState<MailLead | null>(null);
  const [tab, setTab] = useState<string>("overview");
  const [listFilter, setListFilter] = useState<{ status: StatusFilter; channel: Channel | "any" }>({ status: "all", channel: "any" });
  const kindFilter: "all" | Audience = tab === "overview" ? "all" : (tab as Audience);
  const { data: aStats } = useOutreachStats();

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

  const openList = (kind: Audience, status: StatusFilter, channel: Channel) => {
    setListFilter({ status, channel });
    setTab(kind);
  };

  const draftsCard = (
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
              {busy === "draft-batch" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Gemini se naye drafts banao
            </Button>
            <span className="text-sm text-muted-foreground">{draftCount ?? 0} drafts ready</span>
          </div>
          {draftsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !drafts?.length ? (
            <p className="text-sm text-muted-foreground">Abhi koi draft nahi — upar "Gemini se naye drafts banao" dabao.</p>
          ) : (
            <div className="max-h-96 overflow-auto rounded-lg border border-primary/10">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Draft</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((row, i) => (
                    <TableRow key={row.id} className={i % 2 ? "bg-muted/30" : ""}>
                      <TableCell className="font-medium">
                        {row.company}
                        <div className="text-xs text-muted-foreground">{[row.country, row.email].filter(Boolean).join(" · ")}</div>
                      </TableCell>
                      <TableCell>{row.ai_score !== null ? <Badge variant="outline">{row.ai_score}/100</Badge> : "—"}</TableCell>
                      <TableCell className="max-w-72 truncate text-xs">{row.draft_subject ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setMailLead(row)}>
                          <Eye className="mr-2 h-4 w-4" />Preview
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
  );

  const queueButtons = (kinds: Audience[], label: string) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => schedule(["email"], kinds, `${label}-email`)}>
        {busy === `${label}-email` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
        Nayi leads email queue me daalo
      </Button>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={flush}>
        {busy === "flush" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        Due messages abhi bhejo
      </Button>
    </div>
  );

  const counters = (kind: Audience) => {
    const s = aStats?.[kind];
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CheckCircle2} label="Email bheja" value={s?.email.sent} tone="success" />
        <Stat icon={Clock3} label="Email queue me" value={s?.email.pending} />
        <Stat icon={CircleAlert} label="Fail (email + WhatsApp)" value={s ? s.email.failed + s.whatsapp.failed : undefined} tone="warning" />
        <Stat icon={MessageCircle} label="WhatsApp bheja" value={s?.whatsapp.sent} />
      </div>
    );
  };

  const leadCard = (kind: Audience) => (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-primary/10 bg-primary/5">
        <CardTitle className="flex items-center gap-2"><SendHorizontal className="h-5 w-5 text-primary" />Saari leads — kisko kya gaya</CardTitle>
        <CardDescription>Status pe click karo to pura mail/message dikhega. WhatsApp button se chat khulta hai, Send aapko WhatsApp me dabana hai.</CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <OutreachLeadTable
          kind={kind}
          initialStatus={tab === kind ? listFilter.status : "all"}
          initialChannel={tab === kind ? listFilter.channel : "any"}
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        step={2}
        title="Outreach"
        description="Employers, recruiters aur colleges — kisko mail gaya, kya queue me hai, kya fail hua, sab yahan."
      />

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setListFilter({ status: "all", channel: "any" }); }}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="employer">Employers</TabsTrigger>
          <TabsTrigger value="supply">Recruiters</TabsTrigger>
          <TabsTrigger value="education">Colleges</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OutreachOverview onOpen={openList} />
          <Alert className="border-primary/15 bg-primary/5">
            <CalendarClock className="h-4 w-4" />
            <AlertTitle>Automatic WhatsApp abhi band hai</AlertTitle>
            <AlertDescription>
              WhatsApp bhejne ke liye kisi bhi tab me lead ke saamne "WhatsApp bhejo" dabao — aapka WhatsApp message ke saath
              khulega. Send dabane ke baad "Haan, Contacted karo" dabao.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="employer" className="space-y-6">
          <AutoMailPanel
            kinds={["employer", "education"]}
            noun="employer"
            title="Europe employers & colleges auto-mail"
            description="Europe ke employers aur colleges ko proposal mail — country ke hisaab se PDF attach hoti hai."
            countries={["Latvia", "Estonia", "Serbia", "Cyprus"]}
          />
          {counters("employer")}
          {queueButtons(["employer"], "employer")}
          {leadCard("employer")}
          {draftsCard}
        </TabsContent>

        <TabsContent value="supply" className="space-y-6">
          <AutoMailPanel />
          {counters("supply")}
          {queueButtons(["supply"], "supply")}
          {leadCard("supply")}
          {draftsCard}
        </TabsContent>

        <TabsContent value="education" className="space-y-6">
          <Alert className="border-primary/15 bg-primary/5">
            <AlertTitle>Colleges ka mail engine Employers tab me hai</AlertTitle>
            <AlertDescription>Employers aur colleges ek hi engine se jaate hain — Start/Pause wahan se karo.</AlertDescription>
          </Alert>
          {counters("education")}
          {queueButtons(["education"], "education")}
          {leadCard("education")}
          {draftsCard}
        </TabsContent>
      </Tabs>


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
