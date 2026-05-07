import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PlayCircle, RefreshCw, Activity, CheckCircle2, XCircle, Clock, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QuotaBanner } from "@/components/QuotaBanner";

type RunRow = {
  id: string;
  source: string;
  country: string | null;
  keyword: string | null;
  status: string;
  items_found: number;
  items_structured: number;
  cost_usd: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

const PAGE_SIZE = 100;

const DiscoveryRuns = () => {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryQuery, setCountryQuery] = useState("");

  const fetchPage = async (from: number, append = false) => {
    const { data, error } = await supabase
      .from("scrape_jobs")
      .select("id,source,country,keyword,status,items_found,items_structured,cost_usd,started_at,finished_at,error")
      .order("started_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      toast.error("Failed to load discovery runs", { description: error.message });
      return;
    }
    const next = (data ?? []) as RunRow[];
    setHasMore(next.length === PAGE_SIZE);
    setRows((prev) => (append ? [...prev, ...next] : next));
  };

  const refresh = async () => {
    setLoading(true);
    await fetchPage(0, false);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const sources = useMemo(
    () => Array.from(new Set(rows.map((r) => r.source).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !(r.country ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, sourceFilter, statusFilter, countryQuery]);

  const counts = useMemo(() => {
    const c = {
      total: rows.length, succeeded: 0, failed: 0, running: 0, queued: 0,
      found: 0, kept: 0, cost: 0, costRuns: 0,
    };
    for (const r of rows) {
      if (r.status === "succeeded" || r.status === "succeeded_empty") c.succeeded++;
      else if (r.status === "failed" || r.status === "quota_exceeded") c.failed++;
      else if (r.status === "running") c.running++;
      else if (r.status === "queued") c.queued++;
      c.found += r.items_found ?? 0;
      c.kept += r.items_structured ?? 0;
      if (typeof r.cost_usd === "number") { c.cost += r.cost_usd; c.costRuns++; }
    }
    return c;
  }, [rows]);

  const costPerLead = counts.kept > 0 ? counts.cost / counts.kept : null;
  const avgCostRun = counts.costRuns > 0 ? counts.cost / counts.costRuns : null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <QuotaBanner showRetry />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Discovery Runs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            APIFY actor activity across all sources. Showing the latest {rows.length} runs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild className="h-9">
            <Link to="/actor-health">
              <Activity className="h-4 w-4 mr-1.5" /> Actor health
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={counts.total} icon={PlayCircle} tone="bg-primary/10 text-primary border-primary/30" />
        <StatCard label="Succeeded" value={counts.succeeded} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600 border-emerald-500/30" />
        <StatCard label="Failed" value={counts.failed} icon={XCircle} tone="bg-destructive/10 text-destructive border-destructive/30" />
        <StatCard
          label="Cost / lead"
          value={costPerLead !== null ? `$${costPerLead.toFixed(3)}` : "—"}
          icon={Activity}
          tone="bg-accent/10 text-accent border-accent/30"
        />
        <StatCard
          label={avgCostRun !== null ? `Avg $${avgCostRun.toFixed(3)}/run` : "Items kept/found"}
          value={`${counts.kept} / ${counts.found}`}
          icon={Clock}
          tone="bg-amber-500/10 text-amber-600 border-amber-500/30"
        />
      </div>

      <Card className="rounded-xl">
        <div className="p-4 flex flex-wrap items-center gap-2 border-b">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by country…"
            value={countryQuery}
            onChange={(e) => setCountryQuery(e.target.value)}
            className="w-56 h-9"
          />
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {rows.length} shown
          </div>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="h-12 w-12 rounded-xl bg-muted grid place-items-center mx-auto">
              <PlayCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-3 font-medium">No discovery runs yet</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Trigger a run from the dashboard to fetch fresh signals from APIFY.
            </p>
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                  <TableHead className="text-right">Kept</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={r.id} className={i % 2 ? "bg-muted/30" : undefined}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(r.started_at)}
                    </TableCell>
                    <TableCell className="capitalize">{r.source}</TableCell>
                    <TableCell>{r.country ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={r.keyword ?? ""}>
                      {r.keyword ?? "—"}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{r.items_found ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.items_structured ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {typeof r.cost_usd === "number" ? `$${r.cost_usd.toFixed(3)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {formatDuration(r.started_at, r.finished_at)}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs text-destructive" title={r.error ?? ""}>
                      {r.error ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && hasMore && (
          <div className="p-4 border-t flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await fetchPage(rows.length, true);
                setLoadingMore(false);
              }}
            >
              {loadingMore ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DiscoveryRuns;

const StatCard = ({
  label, value, icon: Icon, tone,
}: { label: string; value: number | string; icon: any; tone: string }) => (
  <div className={`rounded-xl border p-4 ${tone}`}>
    <div className="flex items-center justify-between">
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <Icon className="h-4 w-4 opacity-70" />
    </div>
    <div className="text-2xl font-semibold tabular-nums mt-2">{value}</div>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { v: any; label: string }> = {
    succeeded: { v: "default", label: "Succeeded" },
    running: { v: "secondary", label: "Running" },
    queued: { v: "secondary", label: "Queued" },
    failed: { v: "destructive", label: "Failed" },
  };
  const m = map[status] ?? { v: "outline", label: status };
  return <Badge variant={m.v}>{m.label}</Badge>;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}