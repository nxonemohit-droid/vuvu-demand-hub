import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, Users, Radar, AlertCircle, Mail, Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { useRoles } from "@/lib/auth";
import { toast } from "sonner";

type Stats = {
  leads: number;
  highPriority: number;
  candidates: number;
  signals: number;
};

type RunRow = {
  id: string;
  source: string;
  country: string | null;
  keyword: string | null;
  status: string;
  items_found: number;
  items_structured: number;
  started_at: string;
  error: string | null;
};
type LeadRow = {
  id: string;
  employer_name: string | null;
  role: string;
  country: string;
  city: string | null;
  source: string;
  priority: string;
  urgency_score: number;
  contact_email: string | null;
  contact_phone: string | null;
  source_url: string | null;
  created_at: string;
};

const Index = () => {
  const { roles } = useRoles();
  const [stats, setStats] = useState<Stats | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  const loadAll = async () => {
    const [leadsCount, high, candidates, signals, runsRes, leadsRes] = await Promise.all([
      supabase.from("demand_leads").select("id", { count: "exact", head: true }),
      supabase.from("demand_leads").select("id", { count: "exact", head: true }).eq("priority", "high"),
      supabase.from("candidates").select("id", { count: "exact", head: true }),
      supabase.from("raw_signals").select("id", { count: "exact", head: true }),
      supabase.from("scrape_jobs").select("id,source,country,keyword,status,items_found,items_structured,started_at,error").order("started_at", { ascending: false }).limit(8),
      supabase.from("demand_leads").select("id,employer_name,role,country,city,source,priority,urgency_score,contact_email,contact_phone,source_url,created_at").order("created_at", { ascending: false }).limit(8),
    ]);
    setStats({
      leads: leadsCount.count ?? 0,
      highPriority: high.count ?? 0,
      candidates: candidates.count ?? 0,
      signals: signals.count ?? 0,
    });
    setRuns((runsRes.data ?? []) as RunRow[]);
    setLeads((leadsRes.data ?? []) as LeadRow[]);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const runDiscovery = async () => {
    setDiscovering(true);
    toast.info("Discovery started — this can take 1–2 minutes.");
    const { data, error } = await supabase.functions.invoke("apify-discover", { body: {} });
    setDiscovering(false);
    if (error) return toast.error(error.message);
    toast.success(`Discovery: ran ${data?.ran ?? 0} jobs`);
    loadAll();
  };

  const runHunter = async () => {
    setEnriching(true);
    toast.info("Hunter enrichment started…");
    const { data, error } = await supabase.functions.invoke("hunter-enrich", {
      body: { limit: 10 },
    });
    setEnriching(false);
    if (error) return toast.error(error.message);
    const found = (data?.results ?? []).filter((r: any) => r.email).length;
    toast.success(`Hunter: ${found} email(s) found across ${data?.processed ?? 0} leads`);
    loadAll();
  };

  const cards = [
    { label: "Demand Leads", value: stats?.leads, icon: Briefcase },
    { label: "High Priority", value: stats?.highPriority, icon: AlertCircle },
    { label: "Candidates", value: stats?.candidates, icon: Users },
    { label: "Raw Signals", value: stats?.signals, icon: Radar },
  ];

  return (
    <div className="p-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back. Here is your demand intelligence overview.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          <Button size="sm" onClick={runDiscovery} disabled={discovering}>
            {discovering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Run discovery now
          </Button>
          <Button size="sm" variant="outline" onClick={runHunter} disabled={enriching}>
            {enriching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Enrich emails (Hunter)
          </Button>
          <Button size="sm" variant="ghost" onClick={loadAll} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {roles.map((r) => (
            <Badge key={r} variant="outline" className="capitalize">
              {r}
            </Badge>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="text-3xl font-semibold mt-3">
              {c.value ?? "—"}
            </div>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent Discovery Runs</h2>
            <Badge variant="secondary">{runs.length}</Badge>
          </div>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No runs yet. Click <b>Run discovery now</b> to fetch the first batch from APIFY.
            </p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="text-sm flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {r.source} · {r.country ?? "—"} · {r.keyword ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString()} · found {r.items_found}, kept {r.items_structured}
                    </div>
                    {r.error && <div className="text-xs text-destructive truncate">{r.error}</div>}
                  </div>
                  <Badge
                    variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "secondary"}
                    className="ml-2 capitalize"
                  >
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Latest Demand Leads</h2>
            <Badge variant="secondary">{leads.length}</Badge>
          </div>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No leads yet. After a discovery run, AI structuring will populate this list.
            </p>
          ) : (
            <ul className="space-y-2">
              {leads.map((l) => (
                <li key={l.id} className="text-sm border-b pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">
                      {l.employer_name ?? "Unknown employer"} — {l.role}
                    </div>
                    <Badge
                      variant={l.priority === "high" ? "destructive" : l.priority === "medium" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {l.priority} · {l.urgency_score}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.country}{l.city ? `, ${l.city}` : ""} · source: {l.source}
                  </div>
                  {(l.contact_email || l.contact_phone) && (
                    <div className="text-xs mt-1">
                      {l.contact_email && <span className="mr-3">✉ {l.contact_email}</span>}
                      {l.contact_phone && <span>☎ {l.contact_phone}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
};

export default Index;