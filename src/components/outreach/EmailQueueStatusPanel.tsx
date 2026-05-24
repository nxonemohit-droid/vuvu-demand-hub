import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, AlertCircle, CheckCircle2, Clock, Info } from "lucide-react";
import { useState } from "react";

function todayStartIso() {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString();
}

function hourInTz(tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
  return parseInt(fmt.format(new Date()), 10);
}

export function EmailQueueStatusPanel() {
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["email-queue-status"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const dayIso = todayStartIso();

      const [settingsRes, readyRes, futureRes, sentTodayRes, suppressedRes, failedRes, nextRes] = await Promise.all([
        supabase.from("email_send_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("scheduled_emails").select("*", { head: true, count: "exact" })
          .eq("status", "pending").lte("send_at", nowIso),
        supabase.from("scheduled_emails").select("*", { head: true, count: "exact" })
          .eq("status", "pending").gt("send_at", nowIso),
        supabase.from("scheduled_emails").select("*", { head: true, count: "exact" })
          .eq("status", "sent").gte("sent_at", dayIso),
        supabase.from("scheduled_emails").select("*", { head: true, count: "exact" })
          .eq("status", "suppressed").gte("updated_at", dayIso),
        supabase.from("scheduled_emails").select("*", { head: true, count: "exact" })
          .eq("status", "failed").gte("updated_at", dayIso),
        supabase.from("scheduled_emails").select("send_at, to_email, subject")
          .eq("status", "pending").order("send_at", { ascending: true }).limit(1),
      ]);

      const settings = settingsRes.data ?? {
        daily_cap: 200, per_domain_daily_cap: 25,
        send_window_start_hour: 8, send_window_end_hour: 19,
        send_window_timezone: "Europe/Belgrade", respect_send_window: true,
      };
      return {
        settings,
        ready: readyRes.count ?? 0,
        future: futureRes.count ?? 0,
        sentToday: sentTodayRes.count ?? 0,
        suppressedToday: suppressedRes.count ?? 0,
        failedToday: failedRes.count ?? 0,
        nextRow: nextRes.data?.[0] ?? null,
      };
    },
  });

  const d = q.data;
  const s = d?.settings;
  const tz = s?.send_window_timezone ?? "Europe/Belgrade";
  const localHour = s ? hourInTz(tz) : 0;
  const inWindow = !s?.respect_send_window
    || (localHour >= (s?.send_window_start_hour ?? 0) && localHour < (s?.send_window_end_hour ?? 24));
  const capRemaining = Math.max(0, (s?.daily_cap ?? 0) - (d?.sentToday ?? 0));
  const capHit = capRemaining === 0 && (d?.sentToday ?? 0) > 0;

  // Primary reason
  const reasons: Array<{ icon: any; tone: "ok" | "warn" | "block"; title: string; detail: string }> = [];
  if (!s) {
    reasons.push({ icon: Info, tone: "warn", title: "Loading status…", detail: "Fetching queue state." });
  } else {
    if (!inWindow) reasons.push({
      icon: Clock, tone: "block",
      title: `Outside send window (${s.send_window_start_hour}:00–${s.send_window_end_hour}:00 ${tz})`,
      detail: `Local time is ${localHour}:00. The cron skips sends until ${s.send_window_start_hour}:00.`,
    });
    if (capHit) reasons.push({
      icon: AlertCircle, tone: "block",
      title: `Daily cap reached (${s.daily_cap}/day)`,
      detail: `Already sent ${d.sentToday} today. Resets at 00:00 UTC.`,
    });
    if ((d?.ready ?? 0) === 0 && (d?.future ?? 0) > 0) reasons.push({
      icon: Clock, tone: "warn",
      title: `${d.future} emails scheduled for the future`,
      detail: d.nextRow ? `Next send_at: ${new Date(d.nextRow.send_at).toLocaleString()} → ${d.nextRow.to_email}` : "Waiting for send_at to be reached.",
    });
    if ((d?.ready ?? 0) > 0 && inWindow && !capHit) reasons.push({
      icon: CheckCircle2, tone: "ok",
      title: `${d.ready} ready to send`,
      detail: `Cron processes 20/min. Or click "Send now" to flush immediately (${capRemaining} left in daily cap).`,
    });
    if ((d?.ready ?? 0) === 0 && (d?.future ?? 0) === 0) reasons.push({
      icon: Info, tone: "warn",
      title: "Queue is empty",
      detail: "Click \"Queue demand emails\" to add personalised cold emails to the queue.",
    });
  }

  const toneClass = (t: "ok" | "warn" | "block") =>
    t === "ok" ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/5"
      : t === "warn" ? "text-amber-600 border-amber-500/30 bg-amber-500/5"
      : "text-red-600 border-red-500/30 bg-red-500/5";

  return (
    <Card className="p-0 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors text-left">
          <div className="flex items-center gap-3 min-w-0">
            <Info className="h-4 w-4 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Why aren't my pending emails sending?</div>
              <div className="text-xs text-muted-foreground truncate">
                {reasons[0]?.title ?? "Tap to see send-queue diagnostics"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className="text-xs">
              {d?.ready ?? 0} ready · {d?.future ?? 0} scheduled
            </Badge>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="border-t">
          <div className="p-4 space-y-4">
            {/* Reason cards */}
            <div className="space-y-2">
              {reasons.map((r, i) => {
                const Icon = r.icon;
                return (
                  <div key={i} className={`flex gap-3 rounded-md border p-3 ${toneClass(r.tone)}`}>
                    <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{r.title}</div>
                      <div className="text-xs opacity-80 mt-0.5">{r.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live counters */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
              {[
                { label: "Ready now", value: d?.ready ?? 0 },
                { label: "Future-scheduled", value: d?.future ?? 0 },
                { label: "Sent today", value: d?.sentToday ?? 0 },
                { label: "Suppressed", value: d?.suppressedToday ?? 0 },
                { label: "Failed", value: d?.failedToday ?? 0 },
              ].map((m) => (
                <div key={m.label} className="rounded border bg-background p-2">
                  <div className="text-lg font-semibold">{m.value}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Rules explainer */}
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
              <div className="font-medium text-sm mb-1">What controls these numbers</div>
              <ul className="space-y-1.5 text-muted-foreground">
                <li><b className="text-foreground">Send window</b> — only sends between {s?.send_window_start_hour ?? 8}:00 and {s?.send_window_end_hour ?? 19}:00 {tz}. Currently {localHour}:00 → {inWindow ? "inside window ✓" : "outside window ✗"}.</li>
                <li><b className="text-foreground">Daily cap</b> — max {s?.daily_cap ?? 200} sends/24h. Today: {d?.sentToday ?? 0}/{s?.daily_cap ?? 200} ({capRemaining} left).</li>
                <li><b className="text-foreground">Per-domain cap</b> — max {s?.per_domain_daily_cap ?? 25}/day to the same domain. Extras stay pending and retry next day.</li>
                <li><b className="text-foreground">Schedule time</b> — each row has a <code>send_at</code>. Cron only picks rows whose <code>send_at</code> is in the past.</li>
                <li><b className="text-foreground">Suppression</b> — recipients on the suppression list are skipped and marked <i>suppressed</i>.</li>
                <li><b className="text-foreground">Retries</b> — fails go back to <i>pending</i>, then to <i>failed</i> after 3 attempts.</li>
                <li><b className="text-foreground">Cron cadence</b> — runs every minute, sends up to 20 per run. Use "Send now" to flush immediately.</li>
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}