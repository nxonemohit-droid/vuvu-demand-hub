import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  Briefcase, Users, Radar, AlertTriangle, Mail, Loader2, PlayCircle,
  RefreshCw, TrendingUp, Globe2, Sparkles, Activity, MapPin,
  Zap,
} from "lucide-react";
import { useRoles } from "@/lib/auth";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";
import { LeadCard } from "@/components/leads/LeadCard";
import { enrichMany, LEAD_SELECT_COLUMNS, type RawLead, type Lead } from "@/lib/lead-shape";

type Stats = { leads: number; highPriority: number; candidates: number; signals: number };
type RunRow = {
  id: string; source: string; country: string | null; keyword: string | null;
  status: string; items_found: number; items_structured: number; started_at: string; error: string | null;
};
const Index = () => {
  const { roles, user } = useRoles();
  const [stats, setStats] = useState<Stats | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [waveStatus, setWaveStatus] = useState<string>("");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allLeads, setAllLeads] = useState<Pick<LeadRow,"country"|"source"|"priority"|"created_at">[]>([]);

  const loadAll = async () => {
    const [leadsCount, high, candidates, signals, runsRes, leadsRes, allLeadsRes] = await Promise.all([
      supabase.from("demand_leads").select("id", { count: "exact", head: true }),
      supabase.from("demand_leads").select("id", { count: "exact", head: true }).eq("priority", "high"),
      supabase.from("candidates").select("id", { count: "exact", head: true }),
      supabase.from("raw_signals").select("id", { count: "exact", head: true }),
      supabase.from("scrape_jobs").select("id,source,country,keyword,status,items_found,items_structured,started_at,error").order("started_at", { ascending: false }).limit(6),
      supabase.from("demand_leads").select(LEAD_SELECT_COLUMNS).order("urgency_score", { ascending: false }).limit(6),
      supabase.from("demand_leads").select("country,source,priority,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    setStats({
      leads: leadsCount.count ?? 0, highPriority: high.count ?? 0,
      candidates: candidates.count ?? 0, signals: signals.count ?? 0,
    });
    setRuns((runsRes.data ?? []) as RunRow[]);
    setLeads(enrichMany(((leadsRes.data ?? []) as unknown) as RawLead[]));
    setAllLeads((allLeadsRes.data ?? []) as any);
  };

  useEffect(() => { loadAll(); }, []);

  const runPipeline = async (mode: "plan" | "bulk") => {
    const setLoading = mode === "bulk" ? setBulkRunning : setDiscovering;
    setLoading(true);
    setWaveStatus("Queueing jobs…");
    try {
      // Step 1: queue
      const { data: planData, error: planErr } = await supabase.functions.invoke("apify-discover", {
        body: { mode },
      });
      if (planErr) throw planErr;
      const queued = planData?.queued ?? 0;
      toast.success(
        mode === "bulk"
          ? `Bulk queued ${queued} jobs across full Balkans + EU`
          : `Queued ${queued} discovery jobs`,
      );
      loadAll();

      // Step 2: drain in waves of 4
      let waveNum = 0;
      let totalDone = 0;
      const totalQueued = queued;
      while (true) {
        waveNum++;
        setWaveStatus(`Wave ${waveNum} · running 4 actors…`);
        const { data: drainData, error: drainErr } = await supabase.functions.invoke("apify-discover", {
          body: { mode: "drain" },
        });
        if (drainErr) throw drainErr;
        const processed = drainData?.processed ?? 0;
        const remaining = drainData?.remaining ?? 0;
        totalDone += processed;
        setWaveStatus(`Wave ${waveNum} done · ${totalDone}/${totalQueued} processed · ${remaining} remaining`);
        loadAll();
        if (processed === 0 || remaining === 0) break;
      }

      // Step 3: structure with AI
      setWaveStatus("Gemini analysing & scoring leads…");
      await supabase.functions.invoke("structure-leads", { body: { limit: 200 } }).catch(() => {});

      // Step 4: enrich emails
      setWaveStatus("Enriching contact emails…");
      await supabase.functions.invoke("hunter-enrich", { body: { limit: 30 } }).catch(() => {});

      toast.success(`Discovery complete · ${totalDone} jobs processed`);
      setWaveStatus("");
      loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Discovery failed");
      setWaveStatus("");
    } finally {
      setLoading(false);
    }
  };

  const runDiscovery = () => runPipeline("plan");
  const runBulkDiscovery = () => runPipeline("bulk");

  const runHunter = async () => {
    setEnriching(true);
    toast.info("Hunter enrichment started…");
    const { data, error } = await supabase.functions.invoke("hunter-enrich", { body: { limit: 10 } });
    setEnriching(false);
    if (error) return toast.error(error.message);
    const found = (data?.results ?? []).filter((r: any) => r.email).length;
    toast.success(`Hunter · ${found} email(s) across ${data?.processed ?? 0} leads`);
    loadAll();
  };

  // Build charts from allLeads
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, { weekday: "short" });
    const count = allLeads.filter((l) => l.created_at?.slice(0, 10) === key).length;
    return { day: label, leads: count };
  });
  const byCountry = Object.entries(
    allLeads.reduce<Record<string, number>>((acc, l) => {
      const k = l.country || "Unknown"; acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {}),
  ).map(([country, leads]) => ({ country, leads }))
   .sort((a, b) => b.leads - a.leads).slice(0, 6);
  const bySource = Object.entries(
    allLeads.reduce<Record<string, number>>((acc, l) => {
      const k = l.source || "other"; acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {}),
  ).map(([source, leads]) => ({ source, leads })).sort((a, b) => b.leads - a.leads);

  const conversion = stats?.signals ? Math.round((stats.leads / stats.signals) * 100) : 0;
  const highShare = stats?.leads ? Math.round((stats.highPriority / stats.leads) * 100) : 0;

  return (
    <div className="min-h-full bg-gradient-to-br from-background via-background to-muted/30">
      {/* HERO */}
      <div className="border-b bg-background/60 backdrop-blur">
        <div className="px-8 py-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Demand Intelligence
            </div>
            <h1 className="text-3xl font-bold mt-1">Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live employer hiring signals across Europe — discovered, structured, and scored by AI.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {roles.map((r) => (
              <Badge key={r} variant="outline" className="capitalize">{r}</Badge>
            ))}
            <Button size="sm" variant="ghost" onClick={loadAll} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={runHunter} disabled={enriching}>
              {enriching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Enrich emails
            </Button>
            <Button size="sm" onClick={runDiscovery} disabled={discovering} className="shadow-md">
              {discovering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Run discovery now
            </Button>
            <Button
              size="sm"
              onClick={runBulkDiscovery}
              disabled={bulkRunning || discovering}
              className="shadow-md bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
              title="Sweep all priority countries × roles via Indeed + classifieds + career pages + Google"
            >
              {bulkRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Bulk discovery (Balkans + EU)
            </Button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {waveStatus && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 border rounded-lg px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>{waveStatus}</span>
          </div>
        )}
        {/* KPIs */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Demand Leads" value={stats?.leads ?? 0} icon={Briefcase} accent="primary"
            footer={`${stats?.signals ?? 0} raw signals captured`}
          />
          <KpiCard
            label="High Priority" value={stats?.highPriority ?? 0} icon={AlertTriangle} accent="destructive"
            footer={
              <div className="flex items-center gap-2">
                <Progress value={highShare} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground">{highShare}%</span>
              </div>
            }
          />
          <KpiCard
            label="Signal → Lead" value={`${conversion}%`} icon={TrendingUp} accent="accent"
            footer="AI structuring success rate"
          />
          <KpiCard
            label="Candidates" value={stats?.candidates ?? 0} icon={Users} accent="muted"
            footer="Ready for reverse-matching"
          />
        </section>

        {/* CHARTS */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 rounded-xl lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold">Lead flow · last 7 days</h2>
                <p className="text-xs text-muted-foreground">New structured demand leads per day</p>
              </div>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={last7Days} margin={{ left: -20, right: 5, top: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45}/>
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#lf)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold">By source</h2>
                <p className="text-xs text-muted-foreground">Where leads originate</p>
              </div>
              <Globe2 className="h-4 w-4 text-muted-foreground" />
            </div>
            {bySource.length === 0 ? (
              <EmptyMini label="No leads yet" />
            ) : (
              <div className="space-y-2.5">
                {bySource.map((s) => {
                  const pct = stats?.leads ? Math.round((s.leads / stats.leads) * 100) : 0;
                  return (
                    <div key={s.source}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize">{s.source}</span>
                        <span className="text-muted-foreground text-xs">{s.leads} · {pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5 mt-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

        {/* COUNTRY + RUNS */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold">Top countries</h2>
                <p className="text-xs text-muted-foreground">Demand concentration</p>
              </div>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="h-52">
              {byCountry.length === 0 ? <EmptyMini label="No data yet" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCountry} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                    <YAxis type="category" dataKey="country" stroke="hsl(var(--muted-foreground))" fontSize={12} width={70} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="leads" radius={[0, 6, 6, 0]}>
                      {byCountry.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? "hsl(var(--accent))" : "hsl(var(--primary))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="p-5 rounded-xl lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold">Recent discovery runs</h2>
                <p className="text-xs text-muted-foreground">APIFY actor activity</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" asChild className="h-8">
                  <Link to="/actor-health">
                    <Activity className="h-3.5 w-3.5 mr-1.5" /> Actor health
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild className="h-8">
                  <Link to="/keyword-audit">
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Keyword audit
                  </Link>
                </Button>
                <Radar className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            {runs.length === 0 ? (
              <EmptyState
                icon={PlayCircle}
                title="No discovery runs yet"
                hint="Click Run discovery now to fetch from APIFY across all sources."
              />
            ) : (
              <ul className="divide-y">
                {runs.map((r) => (
                  <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        <span className="capitalize">{r.source}</span>
                        <span className="text-muted-foreground"> · </span>
                        {r.country ?? "—"}
                        <span className="text-muted-foreground"> · </span>
                        {r.keyword ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.started_at).toLocaleString()} · found {r.items_found} · kept {r.items_structured}
                      </div>
                      {r.error && <div className="text-xs text-destructive truncate">{r.error}</div>}
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* TOP LEADS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Top opportunities</h2>
              <p className="text-xs text-muted-foreground">Highest-urgency employer leads ready for outreach</p>
            </div>
          </div>
          {leads.length === 0 ? (
            <Card className="p-10 rounded-xl">
              <EmptyState
                icon={Briefcase}
                title="No demand leads yet"
                hint="After a discovery run, AI will structure raw signals into prioritized leads here."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {leads.map((l) => (
                <Link
                  key={l.id}
                  to={`/leads/${l.id}`}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
                  aria-label={`Open lead ${l.employer_name ?? "Unknown employer"}`}
                >
                <Card className="p-5 rounded-xl hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5 transition-all group cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{l.employer_name ?? "Unknown employer"}</div>
                      <div className="text-sm text-muted-foreground capitalize truncate">{l.role}</div>
                    </div>
                    <Badge variant="outline" className={`capitalize ${PRIORITY_STYLES[l.priority] ?? ""}`}>
                      {l.priority}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <Progress value={l.urgency_score} className="h-1.5 flex-1" />
                    <span className="text-muted-foreground tabular-nums w-8 text-right">{l.urgency_score}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-xs">
                      <MapPin className="h-3 w-3 mr-1" />{l.country}{l.city ? ` · ${l.city}` : ""}
                    </Badge>
                    <Badge variant="secondary" className="text-xs capitalize">{l.source}</Badge>
                    {l.demand_size ? (
                      <Badge variant="secondary" className="text-xs">{l.demand_size} hires</Badge>
                    ) : null}
                    {l.visa_sponsorship && (
                      <Badge className="text-xs bg-accent/15 text-accent border border-accent/30">Visa OK</Badge>
                    )}
                  </div>

                  {(l.contact_email || l.contact_phone || l.source_url) && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-1 text-xs">
                        {l.contact_email && (
                          <div className="flex items-center gap-2 truncate">
                            <Mail className="h-3.5 w-3.5 text-accent shrink-0" />
                            <a
                              href={`mailto:${l.contact_email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate hover:underline"
                            >
                              {l.contact_email}
                            </a>
                          </div>
                        )}
                        {l.contact_phone && (
                          <div className="flex items-center gap-2 truncate">
                            <Phone className="h-3.5 w-3.5 text-accent shrink-0" />
                            <span className="truncate">{l.contact_phone}</span>
                          </div>
                        )}
                        {l.source_url && (
                          <a
                            href={l.source_url} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 text-muted-foreground hover:text-primary truncate"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{l.source_url}</span>
                          </a>
                        )}
                      </div>
                    </>
                  )}
                </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const KpiCard = ({
  label, value, icon: Icon, accent, footer,
}: { label: string; value: React.ReactNode; icon: any; accent: "primary"|"accent"|"destructive"|"muted"; footer: React.ReactNode }) => {
  const ring: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/15 text-accent",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="p-5 rounded-xl relative overflow-hidden">
      <div className="flex items-start justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`h-8 w-8 rounded-lg grid place-items-center ${ring[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-3xl font-semibold mt-3 tabular-nums">{value}</div>
      <div className="mt-3 text-xs text-muted-foreground">{footer}</div>
    </Card>
  );
};

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

const EmptyMini = ({ label }: { label: string }) => (
  <div className="h-full grid place-items-center text-xs text-muted-foreground">{label}</div>
);

const EmptyState = ({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) => (
  <div className="text-center py-6">
    <div className="h-12 w-12 rounded-xl bg-muted grid place-items-center mx-auto">
      <Icon className="h-5 w-5 text-muted-foreground" />
    </div>
    <div className="mt-3 font-medium">{title}</div>
    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{hint}</p>
  </div>
);

export default Index;
