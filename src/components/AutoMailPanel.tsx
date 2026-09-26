import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pause, Play, Sparkles, Radio, Eye, Users, FileText, ListChecks, Send, CircleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type LeadKind = "employer" | "education" | "supply";

type AutoMailPanelProps = {
  /** Which audience this panel mails. Defaults to recruiter partners. */
  kinds?: LeadKind[];
  title?: string;
  description?: string;
  /** Quick "queue this country" buttons. */
  countries?: string[];
  /** Word used in toasts and labels, e.g. "partner" or "employer". */
  noun?: string;
};

const fmtTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Turns provider errors into a short, readable reason. */
const friendlyError = (err: string) => {
  if (/Invalid `to` field|non-ASCII/i.test(err)) return "Email address galat hai (format theek nahi).";
  if (/401|403/.test(err)) return "Mail service ne mana kiya — connection check karo.";
  if (/429/.test(err)) return "Bahut jaldi mail gaye — thodi der baad dobara try hoga.";
  if (/\s5\d\d:/.test(err)) return "Mail service me temporary dikkat — dobara try hoga.";
  return err.slice(0, 160);
};

/**
 * Auto-mail engine for one audience (recruiter partners, or employers & colleges).
 * One mail per minute, Mon–Fri 09:00–18:00 IST, with a visible start/pause switch.
 */
export const AutoMailPanel = ({
  kinds = ["supply"],
  title = "Recruiter auto-mail engine",
  description = "Sirf recruiter partners (India, Nepal, Bangladesh, Sri Lanka) ko mail — har 35 second me ek, 24x7.",
  countries = ["India", "Nepal", "Bangladesh", "Sri Lanka"],
  noun = "partner",
}: AutoMailPanelProps) => {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const audience = kinds.join("+");
  /** Each audience has its own on/off switch so pausing one never stops the other. */
  const flag = kinds.includes("supply") ? "recruiter_auto_enabled" : "employer_auto_enabled";

  const { data: sample } = useQuery({
    queryKey: ["auto-mail-sample", audience],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company, country, draft_subject, draft_body")
        .in("kind", kinds)
        .is("merged_into", null)
        .not("draft_body", "is", null)
        .order("drafted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["outreach-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 8000,
  });

  const { data: stats } = useQuery({
    queryKey: ["auto-mail-stats", audience],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: leadIds } = await supabase
        .from("leads")
        .select("id")
        .in("kind", kinds)
        .is("merged_into", null)
        .not("email", "is", null)
        .limit(5000);
      const ids = (leadIds ?? []).map((r) => r.id);

      const base = () =>
        supabase
          .from("outreach_sends")
          .select("id", { count: "exact", head: true })
          .eq("channel", "email")
          .in("lead_id", ids.slice(0, 1000));

      const countFor = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
        if (!ids.length) return 0;
        const { count } = await build(base());
        return count ?? 0;
      };

      const [pending, sentToday, failed] = await Promise.all([
        countFor((q) => q.eq("status", "pending")),
        countFor((q) => q.eq("status", "sent").gte("sent_at", today.toISOString())),
        countFor((q) => q.eq("status", "failed")),
      ]);

      const { data: next } = await supabase
        .from("outreach_sends")
        .select("scheduled_for")
        .eq("status", "pending")
        .eq("channel", "email")
        .order("scheduled_for", { ascending: true })
        .limit(1);

      const { count: drafted } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("kind", kinds)
        .is("merged_into", null)
        .not("email", "is", null)
        .not("draft_body", "is", null);

      return {
        partners: ids.length,
        drafted: drafted ?? 0,
        pending,
        sentToday,
        failed,
        nextAt: next?.[0]?.scheduled_for ?? null,
      };
    },
    refetchInterval: 8000,
  });

  /** Last sent/failed mails for this audience, with the fail reason. */
  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ["auto-mail-recent", audience],
    queryFn: async () => {
      const { data: leads, error: le } = await supabase
        .from("leads")
        .select("id, company, country")
        .in("kind", kinds)
        .is("merged_into", null)
        .not("email", "is", null)
        .limit(1000);
      if (le) throw le;
      const byId = new Map((leads ?? []).map((l) => [l.id, l]));
      if (!byId.size) return [];
      const { data, error } = await supabase
        .from("outreach_sends")
        .select("id, lead_id, to_address, status, sent_at, scheduled_for, error")
        .eq("channel", "email")
        .in("status", ["sent", "failed"])
        .in("lead_id", [...byId.keys()])
        .order("scheduled_for", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, lead: byId.get(r.lead_id) }));
    },
    refetchInterval: 15000,
  });

  const saveSettings = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("outreach_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["outreach-settings"] });
  };

  /** Draft missing mails for this audience, queue them 60s apart, start the engine. */
  const start = async () => {
    setBusy("start");
    try {
      let drafted = 0;
      for (let i = 0; i < 3; i++) {
        const { data, error } = await supabase.functions.invoke("draft-email", {
          body: { limit: 10, kinds },
        });
        if (error) break;
        drafted += data?.drafted ?? 0;
        if (!data?.drafted) break;
      }

      const { data: sched, error: schedErr } = await supabase.functions.invoke("schedule-outreach", {
        body: { channels: ["email"], kinds, gap_seconds: 35, daily_cap: 5000 },
      });
      if (schedErr) throw schedErr;

      await saveSettings({
        [flag]: true,
        status: "running",
        pause_reason: null,
        consecutive_failures: 0,
        gap_seconds: 60,
        daily_cap: 5000,
      });

      qc.invalidateQueries();
      toast.success(
        `Auto-mail chalu. ${drafted} naye drafts bane, ${sched?.email ?? 0} ${noun} mail queue me — har 60 second me ek jayega.`,
      );
    } catch (e) {
      toast.error("Auto-mail shuru nahi hui, dobara try karo.");
      console.error(e);
    }
    setBusy(null);
  };

  const pause = async () => {
    setBusy("pause");
    try {
      await saveSettings({
        [flag]: false,
      });
      toast.success("Auto-mail pause ho gaya — koi mail nahi jayega.");
    } catch {
      toast.error("Pause nahi hua.");
    }
    setBusy(null);
  };

  const queueCountry = async (country: string) => {
    setBusy(country);
    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .in("kind", kinds)
      .eq("country", country)
      .is("merged_into", null)
      .not("email", "is", null)
      .limit(1000);
    const ids = (leads ?? []).map((l) => l.id);
    if (!ids.length) {
      setBusy(null);
      toast.error(`${country} me email wale ${noun} nahi mile.`);
      return;
    }
    const { data, error } = await supabase.functions.invoke("schedule-outreach", {
      body: { channels: ["email"], kinds, lead_ids: ids, gap_seconds: 35, daily_cap: 5000 },
    });
    setBusy(null);
    if (error) {
      toast.error(`${country} queue nahi hua.`);
      return;
    }
    qc.invalidateQueries();
    toast.success(`${country}: ${data?.email ?? 0} ${noun} mail queue me.`);
  };

  const running =
    settings?.status === "running" &&
    Boolean((settings as Record<string, unknown> | null | undefined)?.[flag]);

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="border-b border-primary/10 bg-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription className="mt-1 max-w-3xl leading-5">
                {description}
              </CardDescription>
            </div>
          </div>
          <Badge variant={running ? "default" : "outline"} className="h-7 px-3">
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${running ? "bg-primary-foreground" : "bg-muted-foreground"}`} />
            {running ? "Chal raha hai" : "Band hai"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5 md:pt-6">
        {settings?.pause_reason && !running && (
          <Alert>
            <AlertTitle>Engine rukka hua hai</AlertTitle>
            <AlertDescription>{settings.pause_reason}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat icon={Users} label="Leads (email)" value={stats?.partners} />
          <Stat icon={FileText} label="Drafts ready" value={stats?.drafted} />
          <Stat icon={ListChecks} label="Queue me" value={stats?.pending} />
          <Stat icon={Send} label="Aaj gaye" value={stats?.sentToday} tone="success" />
          <Stat icon={CircleAlert} label="Fail" value={stats?.failed} tone="warning" />
        </div>

        <p className="text-xs text-muted-foreground">
          Agla mail: <span className="font-medium text-foreground">{fmtTime(stats?.nextAt)}</span>
          {settings?.last_sent_at ? ` · Pichla mail: ${fmtTime(settings.last_sent_at)}` : ""}
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Pichle mails ka status (har 15 second refresh)</p>
          {recentLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : !recent?.length ? (
            <p className="text-xs text-muted-foreground">Abhi tak koi mail nahi gaya.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {r.lead?.company ?? r.to_address}
                      {r.lead?.country ? <span className="text-muted-foreground"> · {r.lead.country}</span> : null}
                    </p>
                    <p className="truncate text-muted-foreground">{r.to_address}</p>
                    {r.status === "failed" && r.error && (
                      <p className="mt-1 text-destructive">Reason: {friendlyError(r.error)}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge variant={r.status === "sent" ? "default" : "destructive"}>
                      {r.status === "sent" ? "Gaya" : "Fail"}
                    </Badge>
                    <p className="mt-1 text-muted-foreground">{fmtTime(r.sent_at ?? r.scheduled_for)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <Button variant="outline" size="sm" onClick={() => setShowSample((s) => !s)} aria-expanded={showSample}>
            <Eye className="mr-2 h-3 w-3" />
            {showSample ? "Sample draft chhupao" : "Sample draft dekho — jo mail sabko jayega"}
          </Button>
          {showSample &&
            (sample ? (
              <div className="rounded-lg border border-primary/10 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">
                  Example: {sample.company} ({sample.country})
                </p>
                <p className="mt-1 text-sm font-semibold">Subject: {sample.draft_subject}</p>
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-card p-4 text-xs leading-relaxed">
                  {sample.draft_body}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Abhi koi draft ready nahi hai — "Auto-mail chalu karo" dabate hi Gemini drafts bana dega.
              </p>
            ))}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-primary/10 pt-5">
          <Button onClick={start} disabled={busy !== null} size="lg">
            {busy === "start" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {running ? `Aur ${noun} queue karo` : "Auto-mail chalu karo"}
          </Button>
          <Button onClick={pause} disabled={busy !== null || !running} variant="secondary">
            {busy === "pause" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
            Pause
          </Button>
        </div>

        {countries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Country ke hisaab se queue karo</p>
            <div className="flex flex-wrap gap-2">
              {countries.map((c) => (
                <Button key={c} size="sm" variant="outline" onClick={() => queueCountry(c)} disabled={busy !== null}>
                  {busy === c ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
                  {c}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: typeof Users;
  label: string;
  value?: number;
  tone?: "primary" | "success" | "warning";
}) => (
  <div className="rounded-lg border border-primary/10 bg-card p-3.5 shadow-sm">
    <div className="mb-3 flex items-center justify-between">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone === "success" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-0.5 text-2xl font-bold text-foreground">{value ?? "—"}</p>
  </div>
);
