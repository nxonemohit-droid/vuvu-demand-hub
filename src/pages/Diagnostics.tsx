import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, Database, Mail, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";

function isoHoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}
function isoToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function Diagnostics() {
  const { isAdmin, loading: rolesLoading } = useRoles();

  const q = useQuery({
    queryKey: ["diagnostics"],
    enabled: isAdmin,
    refetchInterval: 30_000,
    queryFn: async () => {
      const last24 = isoHoursAgo(24);
      const today = isoToday();
      const [
        rawTotal, rawStructured,
        demandTotal, demandReview, demandNew, demandHot,
        recTotal, recActive, recEnriched, recMissing,
        candTotal,
        pendingEmails, sentToday, failedToday,
        scrapeTotal24, scrapeFailed24,
        hunterErrors24,
        waPending,
        lastScrape,
      ] = await Promise.all([
        supabase.from("raw_signals").select("id", { head: true, count: "exact" }),
        supabase.from("raw_signals").select("id", { head: true, count: "exact" }).eq("structured", true),
        supabase.from("demand_leads").select("id", { head: true, count: "exact" }),
        supabase.from("demand_leads").select("id", { head: true, count: "exact" }).eq("review_status", "reviewed"),
        supabase.from("demand_leads").select("id", { head: true, count: "exact" }).eq("review_status", "new"),
        supabase.from("demand_leads").select("id", { head: true, count: "exact" }).eq("tier", "hot"),
        supabase.from("recruiter_leads").select("id", { head: true, count: "exact" }),
        supabase.from("recruiter_leads").select("id", { head: true, count: "exact" }).eq("status", "active"),
        supabase.from("recruiter_leads").select("id", { head: true, count: "exact" }).eq("email_enriched", true),
        supabase.from("recruiter_leads").select("id", { head: true, count: "exact" }).eq("email_source", "missing"),
        supabase.from("candidates").select("id", { head: true, count: "exact" }),
        supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "pending"),
        supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "sent").gte("sent_at", today),
        supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "failed").gte("updated_at", today),
        supabase.from("scrape_jobs").select("id", { head: true, count: "exact" }).gte("started_at", last24),
        supabase.from("scrape_jobs").select("id", { head: true, count: "exact" }).eq("status", "failed").gte("started_at", last24),
        supabase.from("recruiter_leads").select("id", { head: true, count: "exact" }).not("last_enrichment_error", "is", null).gte("last_enrichment_at", last24),
        supabase.from("whatsapp_outreach" as any).select("id", { head: true, count: "exact" }).eq("status", "pending"),
        supabase.from("scrape_jobs").select("source,finished_at,status").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(50),
      ]);

      // last successful run per source
      const lastBySource = new Map<string, { at: string; status: string }>();
      for (const r of (lastScrape.data ?? []) as any[]) {
        if (!lastBySource.has(r.source)) {
          lastBySource.set(r.source, { at: r.finished_at, status: r.status });
        }
      }

      return {
        raw: { total: rawTotal.count ?? 0, structured: rawStructured.count ?? 0 },
        demand: {
          total: demandTotal.count ?? 0,
          reviewed: demandReview.count ?? 0,
          new: demandNew.count ?? 0,
          hot: demandHot.count ?? 0,
        },
        recruiters: {
          total: recTotal.count ?? 0,
          active: recActive.count ?? 0,
          enriched: recEnriched.count ?? 0,
          missing: recMissing.count ?? 0,
        },
        candidates: candTotal.count ?? 0,
        mail: {
          pending: pendingEmails.count ?? 0,
          sentToday: sentToday.count ?? 0,
          failedToday: failedToday.count ?? 0,
        },
        scrape24: {
          total: scrapeTotal24.count ?? 0,
          failed: scrapeFailed24.count ?? 0,
        },
        hunterErrors24: hunterErrors24.count ?? 0,
        waPending: waPending.error ? 0 : (waPending.count ?? 0),
        lastBySource: Array.from(lastBySource.entries()).map(([source, v]) => ({ source, ...v })),
      };
    },
  });

  if (rolesLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const d = q.data;
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Diagnostics
          </h1>
          <p className="text-sm text-muted-foreground">
            Pipeline health, queue depth, and error rates across the stack.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Database} label="Raw signals"        primary={d?.raw.total}        sub={`${d?.raw.structured ?? 0} structured`} />
        <Stat icon={Database} label="Demand leads"       primary={d?.demand.total}     sub={`${d?.demand.new ?? 0} new · ${d?.demand.hot ?? 0} hot`} />
        <Stat icon={Database} label="Recruiter leads"    primary={d?.recruiters.active} sub={`${d?.recruiters.enriched ?? 0} enriched · ${d?.recruiters.missing ?? 0} missing email`} />
        <Stat icon={Database} label="Candidates"         primary={d?.candidates}       sub={d?.candidates === 0 ? "Empty — reverse matching produces 0" : "ready to match"} warn={d?.candidates === 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> Mail queue
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <MiniStat label="Pending"       value={d?.mail.pending} />
            <MiniStat label="Sent today"    value={d?.mail.sentToday} />
            <MiniStat label="Failed today"  value={d?.mail.failedToday} tone={d && d.mail.failedToday > 0 ? "warn" : undefined} />
            <MiniStat label="WhatsApp pending" value={d?.waPending} />
            <MiniStat label="Hunter errors 24h" value={d?.hunterErrors24} tone={d && d.hunterErrors24 > 0 ? "warn" : undefined} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Scrape error rate (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d ? (
              <div className="space-y-2">
                <div className="text-2xl font-semibold tabular-nums">
                  {d.scrape24.failed}
                  <span className="text-muted-foreground text-sm font-normal"> / {d.scrape24.total} jobs</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.scrape24.total === 0 ? "No scrape jobs in last 24h" :
                    `${Math.round((d.scrape24.failed / d.scrape24.total) * 100)}% failure rate`}
                </div>
              </div>
            ) : <Skeleton className="h-16 w-full" />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" /> Last finished run per source
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!d ? (
            <Skeleton className="h-24 w-full" />
          ) : d.lastBySource.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed runs recorded yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {d.lastBySource.map((r) => (
                <div key={r.source} className="rounded-md border p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{r.source}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.at).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon, label, primary, sub, warn,
}: {
  icon: typeof Database;
  label: string;
  primary: number | undefined;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-amber-500/40 bg-amber-500/5" : ""}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {primary ?? <Skeleton className="h-7 w-16 inline-block" />}
        </div>
        {sub && <div className={`text-xs mt-0.5 ${warn ? "text-amber-700" : "text-muted-foreground"}`}>{sub}</div>}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number | undefined; tone?: "warn" }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${tone === "warn" ? "text-amber-700" : ""}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}