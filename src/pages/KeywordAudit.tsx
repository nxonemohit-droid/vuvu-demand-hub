import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, RefreshCw, Search, Briefcase, Users, Globe2, FileSearch,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keywords that target staffing agencies / recruiters rather than end-employers.
 * Kept in sync with PRIORITY_KEYWORDS in supabase/functions/apify-discover/index.ts.
 */
const RECRUITER_KEYWORDS = new Set<string>([
  "blue collar recruiter",
  "staffing agency blue collar",
  "manpower recruiter",
  "construction recruiter",
  "warehouse recruiter",
  "hospitality recruiter",
  "facility management recruiter",
  "security agency recruiter",
  "housekeeping agency",
  "agriculture recruiter",
  "logistics recruiter",
  "manpower supply company",
  "workforce solutions",
  "contract staffing",
  "overseas recruitment",
]);

type JobRow = {
  id: string;
  source: string;
  country: string | null;
  keyword: string | null;
  status: string;
  items_found: number;
  items_structured: number;
  started_at: string;
};

type SignalRow = { id: string; job_id: string | null };
type LeadRow = { id: string; raw_signal_id: string | null; country: string };

type KeywordStat = {
  keyword: string;
  isRecruiter: boolean;
  totalJobs: number;
  succeededJobs: number;
  failedJobs: number;
  itemsFound: number;
  signalsKept: number;
  uniqueLeads: number;
  countries: { country: string; jobs: number; leads: number }[];
};

const KeywordAudit = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [filter, setFilter] = useState("");
  const [showRecruiterOnly, setShowRecruiterOnly] = useState(false);

  const load = async () => {
    setRefreshing(true);
    // Indeed is the only source where keyword maps cleanly to a recruiter Boolean query.
    const [jobsRes, signalsRes, leadsRes] = await Promise.all([
      supabase
        .from("scrape_jobs")
        .select("id, source, country, keyword, status, items_found, items_structured, started_at")
        .eq("source", "indeed")
        .order("started_at", { ascending: false })
        .limit(1000),
      supabase
        .from("raw_signals")
        .select("id, job_id")
        .not("job_id", "is", null)
        .limit(5000),
      supabase
        .from("demand_leads")
        .select("id, raw_signal_id, country")
        .not("raw_signal_id", "is", null)
        .limit(5000),
    ]);
    setJobs((jobsRes.data ?? []) as JobRow[]);
    setSignals((signalsRes.data ?? []) as SignalRow[]);
    setLeads((leadsRes.data ?? []) as LeadRow[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const stats: KeywordStat[] = useMemo(() => {
    // signal_id -> job_id
    const signalToJob = new Map<string, string>();
    for (const s of signals) {
      if (s.job_id) signalToJob.set(s.id, s.job_id);
    }
    // job_id -> set of unique lead ids
    const jobLeads = new Map<string, Set<string>>();
    for (const l of leads) {
      if (!l.raw_signal_id) continue;
      const jid = signalToJob.get(l.raw_signal_id);
      if (!jid) continue;
      if (!jobLeads.has(jid)) jobLeads.set(jid, new Set());
      jobLeads.get(jid)!.add(l.id);
    }

    const byKeyword = new Map<string, KeywordStat>();
    for (const j of jobs) {
      const kw = j.keyword ?? "(no keyword)";
      if (!byKeyword.has(kw)) {
        byKeyword.set(kw, {
          keyword: kw,
          isRecruiter: RECRUITER_KEYWORDS.has(kw),
          totalJobs: 0, succeededJobs: 0, failedJobs: 0,
          itemsFound: 0, signalsKept: 0, uniqueLeads: 0,
          countries: [],
        });
      }
      const stat = byKeyword.get(kw)!;
      stat.totalJobs++;
      if (j.status === "succeeded") stat.succeededJobs++;
      if (j.status === "failed") stat.failedJobs++;
      stat.itemsFound += j.items_found ?? 0;
      stat.signalsKept += j.items_structured ?? 0;
      const leadIds = jobLeads.get(j.id);
      const leadCount = leadIds ? leadIds.size : 0;
      stat.uniqueLeads += leadCount;

      const country = j.country ?? "Unknown";
      const existing = stat.countries.find((c) => c.country === country);
      if (existing) {
        existing.jobs++;
        existing.leads += leadCount;
      } else {
        stat.countries.push({ country, jobs: 1, leads: leadCount });
      }
    }
    for (const s of byKeyword.values()) {
      s.countries.sort((a, b) => b.leads - a.leads || b.jobs - a.jobs);
    }
    return Array.from(byKeyword.values()).sort((a, b) => {
      // Recruiter keywords first within each yield bucket
      if (b.uniqueLeads !== a.uniqueLeads) return b.uniqueLeads - a.uniqueLeads;
      return b.totalJobs - a.totalJobs;
    });
  }, [jobs, signals, leads]);

  const filtered = useMemo(() => {
    return stats.filter((s) => {
      if (showRecruiterOnly && !s.isRecruiter) return false;
      if (!filter.trim()) return true;
      const f = filter.toLowerCase();
      return s.keyword.toLowerCase().includes(f)
        || s.countries.some((c) => c.country.toLowerCase().includes(f));
    });
  }, [stats, filter, showRecruiterOnly]);

  const totals = useMemo(() => ({
    keywords: stats.length,
    recruiterKeywords: stats.filter((s) => s.isRecruiter).length,
    jobs: stats.reduce((a, b) => a + b.totalJobs, 0),
    leads: stats.reduce((a, b) => a + b.uniqueLeads, 0),
    deadKeywords: stats.filter((s) => s.totalJobs > 0 && s.uniqueLeads === 0).length,
  }), [stats]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><ArrowLeft className="h-4 w-4 mr-1.5" />Dashboard</Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <FileSearch className="h-5 w-5 text-primary" /> Keyword audit
              </h1>
              <p className="text-xs text-muted-foreground">
                Which Indeed queries actually run, and how many unique leads each one delivers.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryTile icon={Briefcase} label="Keywords used" value={totals.keywords} />
          <SummaryTile icon={Users} label="Recruiter keywords" value={totals.recruiterKeywords} accent />
          <SummaryTile icon={Globe2} label="Indeed jobs run" value={totals.jobs} />
          <SummaryTile icon={Users} label="Unique leads produced" value={totals.leads} />
          <SummaryTile icon={Briefcase} label="Dead keywords (0 leads)" value={totals.deadKeywords} warn={totals.deadKeywords > 0} />
        </div>

        {/* Filters */}
        <Card className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by keyword or country…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showRecruiterOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowRecruiterOnly((v) => !v)}
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {showRecruiterOnly ? "Showing recruiter keywords" : "All keywords"}
          </Button>
        </Card>

        {/* Table */}
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No keyword activity yet. Run a Bulk discovery from the dashboard.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                  <TableHead className="text-right">Items found</TableHead>
                  <TableHead className="text-right">Signals kept</TableHead>
                  <TableHead className="text-right">Unique leads</TableHead>
                  <TableHead className="text-right">Yield</TableHead>
                  <TableHead>Top countries (leads)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const yieldPct = s.itemsFound > 0
                    ? Math.round((s.uniqueLeads / s.itemsFound) * 100)
                    : 0;
                  return (
                    <TableRow key={s.keyword}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.keyword}</span>
                          {s.isRecruiter && (
                            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                              recruiter
                            </Badge>
                          )}
                          {s.totalJobs > 0 && s.uniqueLeads === 0 && (
                            <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                              0 leads
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.totalJobs}
                        {s.failedJobs > 0 && (
                          <span className="text-destructive text-xs ml-1">({s.failedJobs} fail)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.itemsFound}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.signalsKept}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {s.uniqueLeads}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {s.itemsFound > 0 ? `${yieldPct}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {s.countries.slice(0, 6).map((c) => (
                            <Badge
                              key={c.country}
                              variant="outline"
                              className={`text-[10px] ${c.leads > 0 ? "border-primary/30" : "border-border text-muted-foreground"}`}
                            >
                              {c.country} · {c.leads}/{c.jobs}
                            </Badge>
                          ))}
                          {s.countries.length > 6 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{s.countries.length - 6} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <p className="text-xs text-muted-foreground">
          Audit covers the latest 1,000 Indeed jobs. "Yield" = unique leads ÷ raw items returned.
          Recruiter keywords use Boolean syntax (e.g. <code className="text-foreground">"staffing agency" AND "blue collar"</code>) and are passed verbatim to Indeed.
        </p>
      </main>
    </div>
  );
};

function SummaryTile({
  icon: Icon, label, value, accent, warn,
}: { icon: any; label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <Card className={`p-3 ${accent ? "border-primary/40 bg-primary/5" : ""} ${warn ? "border-destructive/40 bg-destructive/5" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${warn ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}

export default KeywordAudit;