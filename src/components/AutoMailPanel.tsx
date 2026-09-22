import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pause, Play, Sparkles, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const COUNTRIES = ["India", "Nepal", "Bangladesh", "Sri Lanka"] as const;

const fmtTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/**
 * Auto-mail engine for recruiter (supply) partners only.
 * One mail per minute, Mon–Fri 09:00–18:00 IST, with a visible start/pause switch.
 */
export const AutoMailPanel = () => {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

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
    queryKey: ["recruiter-mail-stats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: partnerIds } = await supabase
        .from("leads")
        .select("id")
        .eq("kind", "supply")
        .is("merged_into", null)
        .not("email", "is", null)
        .limit(5000);
      const ids = (partnerIds ?? []).map((r) => r.id);

      const countFor = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
        if (!ids.length) return 0;
        const { count } = await build(base());
        return count ?? 0;
      };
      const base = () =>
        supabase
          .from("outreach_sends")
          .select("id", { count: "exact", head: true })
          .eq("channel", "email")
          .in("lead_id", ids.slice(0, 1000));

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
        .eq("kind", "supply")
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

  const saveSettings = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("outreach_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["outreach-settings"] });
  };

  /** Draft missing partner mails, queue them 60s apart, start the engine. */
  const start = async () => {
    setBusy("start");
    try {
      let drafted = 0;
      for (let i = 0; i < 3; i++) {
        const { data, error } = await supabase.functions.invoke("draft-email", {
          body: { limit: 10, kinds: ["supply"] },
        });
        if (error) break;
        drafted += data?.drafted ?? 0;
        if (!data?.drafted) break;
      }

      const { data: sched, error: schedErr } = await supabase.functions.invoke("schedule-outreach", {
        body: { channels: ["email"], kinds: ["supply"], gap_seconds: 60, daily_cap: 150 },
      });
      if (schedErr) throw schedErr;

      await saveSettings({
        recruiter_auto_enabled: true,
        status: "running",
        pause_reason: null,
        consecutive_failures: 0,
        gap_seconds: 60,
        daily_cap: 150,
      });

      qc.invalidateQueries();
      toast.success(
        `Auto-mail chalu. ${drafted} naye drafts bane, ${sched?.email ?? 0} partner mail queue me — har 60 second me ek jayega.`,
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
        recruiter_auto_enabled: false,
        status: "paused",
        pause_reason: "Aapne manually pause kiya.",
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
      .eq("kind", "supply")
      .eq("country", country)
      .is("merged_into", null)
      .not("email", "is", null)
      .limit(1000);
    const ids = (leads ?? []).map((l) => l.id);
    if (!ids.length) {
      setBusy(null);
      toast.error(`${country} me email wale partner nahi mile.`);
      return;
    }
    const { data, error } = await supabase.functions.invoke("schedule-outreach", {
      body: { channels: ["email"], kinds: ["supply"], lead_ids: ids, gap_seconds: 60, daily_cap: 150 },
    });
    setBusy(null);
    if (error) {
      toast.error(`${country} queue nahi hua.`);
      return;
    }
    qc.invalidateQueries();
    toast.success(`${country}: ${data?.email ?? 0} partner mail queue me.`);
  };

  const running = settings?.status === "running";

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              Recruiter auto-mail engine
            </CardTitle>
            <CardDescription>
              Sirf recruiter partners (India, Nepal, Bangladesh, Sri Lanka) ko mail — har 60 second me ek,
              Mon–Fri 9:00–18:00 IST, roz max {settings?.daily_cap ?? 150}.
            </CardDescription>
          </div>
          <Badge variant={running ? "default" : "outline"}>{running ? "Chal raha hai" : "Band hai"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings?.pause_reason && !running && (
          <Alert>
            <AlertTitle>Engine rukka hua hai</AlertTitle>
            <AlertDescription>{settings.pause_reason}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-5">
          <Stat label="Partners (email)" value={stats?.partners} />
          <Stat label="Drafts ready" value={stats?.drafted} />
          <Stat label="Queue me" value={stats?.pending} />
          <Stat label="Aaj gaye" value={stats?.sentToday} />
          <Stat label="Fail" value={stats?.failed} />
        </div>

        <p className="text-xs text-muted-foreground">
          Agla mail: <span className="font-medium text-foreground">{fmtTime(stats?.nextAt)}</span>
          {settings?.last_sent_at ? ` · Pichla mail: ${fmtTime(settings.last_sent_at)}` : ""}
        </p>

        <div className="flex flex-wrap gap-3">
          <Button onClick={start} disabled={busy !== null} size="lg">
            {busy === "start" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {running ? "Aur partners queue karo" : "Auto-mail chalu karo"}
          </Button>
          <Button onClick={pause} disabled={busy !== null || !running} variant="secondary">
            {busy === "pause" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
            Pause
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Country ke hisaab se queue karo</p>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map((c) => (
              <Button key={c} size="sm" variant="outline" onClick={() => queueCountry(c)} disabled={busy !== null}>
                {busy === c ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
                {c}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value }: { label: string; value?: number }) => (
  <div className="rounded-lg border bg-muted/40 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-xl font-semibold">{value ?? "—"}</p>
  </div>
);
