import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Activity, ArrowLeft, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { QuotaBanner } from "@/components/QuotaBanner";

type JobRow = {
  id: string;
  source: string;
  actor_id: string | null;
  status: string;
  items_found: number;
  items_structured: number;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

type ActorStat = {
  key: string;
  source: string;
  actorId: string;
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  queued: number;
  successRate: number;
  itemsFound: number;
  itemsStructured: number;
  avgDurationSec: number | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  topErrors: { reason: string; count: number; sample: string }[];
};

/** Bucket raw Apify error strings into human-readable categories. */
function classifyError(err: string): { reason: string; sample: string } {
  const sample = err.slice(0, 220);
  const lower = err.toLowerCase();
  if (lower.includes("timed-out") || lower.includes("timeout")) return { reason: "Actor timed out", sample };
  if (lower.includes("404") || lower.includes("record-not-found") || lower.includes("actor with this name was not found"))
    return { reason: "Actor not found (404)", sample };
  if (lower.includes("invalid-input") || lower.includes("input is not valid"))
    return { reason: "Invalid input to actor", sample };
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("token"))
    return { reason: "Auth / token error", sample };
  if (lower.includes("429") || lower.includes("rate"))
    return { reason: "Rate limited", sample };
  if (lower.includes("memory") || lower.includes("out of memory"))
    return { reason: "Out of memory", sample };
  if (lower.includes("network") || lower.includes("fetch failed") || lower.includes("aborted"))
    return { reason: "Network / aborted", sample };
  if (lower.startsWith("error: apify 5") || lower.includes("apify 50"))
    return { reason: "Apify server error (5xx)", sample };
  if (lower.startsWith("error: apify 4"))
    return { reason: "Apify client error (4xx)", sample };
  return { reason: "Other", sample };
}

function aggregate(jobs: JobRow[]): ActorStat[] {
  const byKey = new Map<string, JobRow[]>();
  for (const j of jobs) {
    const key = `${j.source}::${j.actor_id ?? "(no actor)"}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(j);
  }

  const stats: ActorStat[] = [];
  for (const [key, rows] of byKey) {
    const [source, actorId] = key.split("::");
    const total = rows.length;
    const succeeded = rows.filter((r) => r.status === "succeeded" || r.status === "succeeded_empty").length;
    const failed = rows.filter((r) => r.status === "failed" || r.status === "quota_exceeded").length;
    const running = rows.filter((r) => r.status === "running").length;
    const queued = rows.filter((r) => r.status === "queued").length;
    const completed = succeeded + failed;
    const successRate = completed > 0 ? Math.round((succeeded / completed) * 100) : 0;

    const itemsFound = rows.reduce((s, r) => s + (r.items_found ?? 0), 0);
    const itemsStructured = rows.reduce((s, r) => s + (r.items_structured ?? 0), 0);

    const durations = rows
      .filter((r) => r.finished_at && r.started_at)
      .map((r) => (new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime()) / 1000)
      .filter((d) => d >= 0 && d < 60 * 60);
    const avgDurationSec = durations.length
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : null;

    const sorted = [...rows].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
    const last = sorted[0];

    const errorBuckets = new Map<string, { count: number; sample: string }>();
    for (const r of rows) {
      if (!(r.status === "failed" || r.status === "quota_exceeded") || !r.error) continue;
      const { reason, sample } =
        r.status === "quota_exceeded"
          ? { reason: "Apify monthly quota exhausted (403)", sample: r.error.slice(0, 220) }
          : classifyError(r.error);
      const cur = errorBuckets.get(reason);
      if (cur) cur.count++;
      else errorBuckets.set(reason, { count: 1, sample });
    }
    const topErrors = Array.from(errorBuckets.entries())
      .map(([reason, v]) => ({ reason, count: v.count, sample: v.sample }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    stats.push({
      key, source, actorId, total, succeeded, failed, running, queued,
      successRate, itemsFound, itemsStructured, avgDurationSec,
      lastRunAt: last?.started_at ?? null,
      lastStatus: last?.status ?? null,
      topErrors,
    });
  }

  return stats.sort((a, b) => {
    if (a.successRate !== b.successRate) return a.successRate - b.successRate; // worst first
    return b.total - a.total;
  });
}

function healthBadge(rate: number, completed: number) {
  if (completed === 0) return { label: "No data", className: "bg-muted text-muted-foreground border-border" };
  if (rate >= 80) return { label: "Healthy", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
  if (rate >= 40) return { label: "Degraded", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
  return { label: "Failing", className: "bg-destructive/10 text-destructive border-destructive/30" };
}

function statusDot(status: string | null) {
  switch (status) {
    case "succeeded": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed": return <XCircle className="h-4 w-4 text-destructive" />;
    case "running": return <Activity className="h-4 w-4 text-primary animate-pulse" />;
    case "queued": return <Clock className="h-4 w-4 text-muted-foreground" />;
    default: return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  }
}

const ActorHealth = () => {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [windowDays, setWindowDays] = useState<number>(7);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("scrape_jobs")
      .select("id,source,actor_id,status,items_found,items_structured,started_at,finished_at,error")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(1000);
    if (error) {
      console.error(error);
      setJobs([]);
    } else {
      setJobs((data ?? []) as JobRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  const stats = useMemo(() => (jobs ? aggregate(jobs) : []), [jobs]);

  const summary = useMemo(() => {
    const total = jobs?.length ?? 0;
    const succeeded = jobs?.filter((j) => j.status === "succeeded" || j.status === "succeeded_empty").length ?? 0;
    const failed = jobs?.filter((j) => j.status === "failed" || j.status === "quota_exceeded").length ?? 0;
    const completed = succeeded + failed;
    const rate = completed ? Math.round((succeeded / completed) * 100) : 0;
    const failingActors = stats.filter((s) => s.successRate < 40 && (s.succeeded + s.failed) > 0).length;
    return { total, succeeded, failed, rate, failingActors };
  }, [jobs, stats]);

  return (
    <div className="min-h-screen bg-muted/20 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <QuotaBanner />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" /> Actor Health
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Per-actor reliability across the last {windowDays} days. Worst performers are listed first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border bg-background p-0.5">
              {[1, 7, 30].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={windowDays === d ? "default" : "ghost"}
                  className="h-8 px-3"
                  onClick={() => setWindowDays(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total runs</div>
            <div className="text-2xl font-bold mt-1">{summary.total}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Overall success rate</div>
            <div className="text-2xl font-bold mt-1">{summary.rate}%</div>
            <Progress value={summary.rate} className="h-1.5 mt-2" />
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Failed runs</div>
            <div className="text-2xl font-bold mt-1 text-destructive">{summary.failed}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Failing actors</div>
            <div className="text-2xl font-bold mt-1">{summary.failingActors}</div>
            <div className="text-xs text-muted-foreground mt-1">success rate &lt; 40%</div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Actors</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Grouped by source and actor ID. Failure reasons are bucketed from APIFY error responses.
            </p>
          </div>

          {loading && !jobs ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : stats.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No actor runs in the last {windowDays} days. Trigger a discovery run from the dashboard.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Actor</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Success</TableHead>
                    <TableHead className="text-right">Avg duration</TableHead>
                    <TableHead className="text-right">Items found</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead>Top failure reasons</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((s) => {
                    const completed = s.succeeded + s.failed;
                    const badge = healthBadge(s.successRate, completed);
                    return (
                      <TableRow key={s.key} className="align-top">
                        <TableCell>
                          <div className="font-medium capitalize">{s.source.replace(/_/g, " ")}</div>
                          <div className="text-xs text-muted-foreground font-mono break-all">{s.actorId}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div>{s.total}</div>
                          {(s.queued > 0 || s.running > 0) && (
                            <div className="text-xs text-muted-foreground">
                              {s.running > 0 && <>{s.running} running</>}
                              {s.running > 0 && s.queued > 0 && " · "}
                              {s.queued > 0 && <>{s.queued} queued</>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums w-[160px]">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-medium">{completed > 0 ? `${s.successRate}%` : "—"}</span>
                          </div>
                          <Progress value={s.successRate} className="h-1.5 mt-1" />
                          <div className="text-xs text-muted-foreground mt-1">
                            {s.succeeded} ok · {s.failed} fail
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.avgDurationSec !== null ? `${s.avgDurationSec}s` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div>{s.itemsFound}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.itemsStructured} kept
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {statusDot(s.lastStatus)}
                            <div className="text-xs">
                              <div className="capitalize">{s.lastStatus ?? "—"}</div>
                              <div className="text-muted-foreground">
                                {s.lastRunAt
                                  ? formatDistanceToNow(new Date(s.lastRunAt), { addSuffix: true })
                                  : "never"}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[320px]">
                          {s.topErrors.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No failures</span>
                          ) : (
                            <ul className="space-y-1.5">
                              {s.topErrors.map((e) => (
                                <li key={e.reason}>
                                  <div className="flex items-center gap-2 text-xs">
                                    <Badge variant="outline" className="bg-destructive/5 text-destructive border-destructive/20">
                                      {e.count}×
                                    </Badge>
                                    <span className="font-medium">{e.reason}</span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground font-mono truncate" title={e.sample}>
                                    {e.sample}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ActorHealth;