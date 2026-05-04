import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Flame,
  Globe2,
  Briefcase,
  Radar,
  ExternalLink,
  Search,
  X,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Lead = {
  id: string;
  role: string;
  employer_name: string | null;
  country: string;
  city: string | null;
  source: string;
  source_url: string | null;
  priority: string;
  score: number | null;
  tier: string | null;
  visa_sponsorship: boolean;
  urgency_score: number;
  demand_size: number | null;
  created_at: string;
  matched_keywords: string[] | null;
  sector_tags: string[] | null;
};

const ALL = "__all__";

export default function DemandIntelligence() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<string>(ALL);
  const [role, setRole] = useState<string>(ALL);
  const [source, setSource] = useState<string>(ALL);
  const [pulse, setPulse] = useState(false);

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from("demand_leads")
      .select(
        "id, role, employer_name, country, city, source, source_url, priority, score, tier, visa_sponsorship, urgency_score, demand_size, created_at, matched_keywords, sector_tags"
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error && data) setLeads(data as Lead[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel("demand-intel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demand_leads" },
        (payload) => {
          setLeads((prev) => [payload.new as Lead, ...prev].slice(0, 500));
          setPulse(true);
          setTimeout(() => setPulse(false), 1500);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "demand_leads" },
        (payload) => {
          setLeads((prev) =>
            prev.map((l) => (l.id === (payload.new as Lead).id ? (payload.new as Lead) : l))
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const countries = useMemo(
    () => Array.from(new Set(leads.map((l) => l.country).filter(Boolean))).sort(),
    [leads]
  );
  const roles = useMemo(
    () => Array.from(new Set(leads.map((l) => l.role).filter(Boolean))).sort(),
    [leads]
  );
  const sources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source).filter(Boolean))).sort(),
    [leads]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (country !== ALL && l.country !== country) return false;
      if (role !== ALL && l.role !== role) return false;
      if (source !== ALL && l.source !== source) return false;
      if (
        s &&
        !`${l.role} ${l.employer_name ?? ""} ${l.city ?? ""} ${(l.matched_keywords ?? []).join(" ")}`
          .toLowerCase()
          .includes(s)
      )
        return false;
      return true;
    });
  }, [leads, search, country, role, source]);

  const last24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return filtered.filter((l) => new Date(l.created_at).getTime() >= cutoff);
  }, [filtered]);

  const topAlerts = useMemo(() => {
    return [...filtered]
      .sort((a, b) => {
        const sa = (a.score ?? 0) + a.urgency_score + (a.visa_sponsorship ? 10 : 0);
        const sb = (b.score ?? 0) + b.urgency_score + (b.visa_sponsorship ? 10 : 0);
        return sb - sa;
      })
      .slice(0, 6);
  }, [filtered]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((l) => m.set(l.country, (m.get(l.country) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filtered]);

  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((l) => m.set(l.source, (m.get(l.source) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filtered]);

  const clearFilters = () => {
    setSearch("");
    setCountry(ALL);
    setRole(ALL);
    setSource(ALL);
  };
  const hasFilters = search || country !== ALL || role !== ALL || source !== ALL;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" />
            Demand Intelligence
            <span
              className={cn(
                "inline-flex items-center gap-1.5 ml-2 text-xs font-normal text-muted-foreground",
                pulse && "text-green-600"
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full bg-green-500",
                  pulse ? "animate-ping" : "animate-pulse"
                )}
              />
              Live
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time discovered jobs across all sources. Auto-updates as new demand is found.
          </p>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={Activity} label="Active leads" value={filtered.length} />
        <KPI icon={TrendingUp} label="New (24h)" value={last24h.length} accent />
        <KPI
          icon={ShieldCheck}
          label="Visa-friendly"
          value={filtered.filter((l) => l.visa_sponsorship).length}
        />
        <KPI
          icon={Flame}
          label="High priority"
          value={filtered.filter((l) => l.priority === "high" || l.priority === "urgent").length}
        />
      </div>

      {/* Top alerts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Top opportunities
          </h2>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : topAlerts.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground text-center">
            No leads match these filters yet.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {topAlerts.map((l) => (
              <AlertCard key={l.id} lead={l} />
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="text-xs text-muted-foreground mb-1 block">Search</label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Role, employer, city, keyword…"
                className="pl-9"
              />
            </div>
          </div>
          <FilterSelect
            label="Country"
            value={country}
            onChange={setCountry}
            options={countries}
          />
          <FilterSelect label="Role" value={role} onChange={setRole} options={roles} />
          <FilterSelect label="Source" value={source} onChange={setSource} options={sources} />
          <div className="md:col-span-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Distribution + feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-1 space-y-4">
          <Distribution title="By country" icon={Globe2} data={byCountry} />
          <Distribution title="By source" icon={Briefcase} data={bySource} />
        </Card>

        <Card className="lg:col-span-2 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold">Live feed</h3>
            <span className="text-xs text-muted-foreground">{filtered.length} results</span>
          </div>
          <div className="divide-y max-h-[640px] overflow-auto">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No leads found.</div>
            ) : (
              filtered.slice(0, 100).map((l) => <FeedRow key={l.id} lead={l} />)
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center",
            accent ? "bg-primary/10 text-primary" : "bg-muted text-foreground/70"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold leading-tight">{value.toLocaleString()}</div>
        </div>
      </div>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="md:col-span-2">
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`All ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AlertCard({ lead }: { lead: Lead }) {
  return (
    <Link to={`/leads/${lead.id}`}>
      <Card className="p-4 hover:border-primary/50 hover:shadow-md transition-all h-full flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate">{lead.role}</div>
            <div className="text-sm text-muted-foreground truncate">
              {lead.employer_name ?? "Unknown employer"}
            </div>
          </div>
          <PriorityBadge priority={lead.priority} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="outline" className="gap-1">
            <Globe2 className="h-3 w-3" />
            {lead.country}
            {lead.city ? ` · ${lead.city}` : ""}
          </Badge>
          <Badge variant="secondary">{lead.source}</Badge>
          {lead.visa_sponsorship && (
            <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/20 border-green-500/20">
              Visa
            </Badge>
          )}
          {lead.tier && <Badge variant="outline">Tier {lead.tier}</Badge>}
        </div>
        <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
          <span className="inline-flex items-center gap-1 text-primary">
            View <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

function FeedRow({ lead }: { lead: Lead }) {
  return (
    <Link
      to={`/leads/${lead.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate text-sm">{lead.role}</div>
        <div className="text-xs text-muted-foreground truncate">
          {lead.employer_name ?? "—"} · {lead.country}
          {lead.city ? `, ${lead.city}` : ""} · {lead.source}
        </div>
      </div>
      <PriorityBadge priority={lead.priority} />
      <span className="text-xs text-muted-foreground whitespace-nowrap w-20 text-right">
        {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
      </span>
    </Link>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-500/15 text-red-700 border-red-500/20",
    high: "bg-orange-500/15 text-orange-700 border-orange-500/20",
    medium: "bg-blue-500/15 text-blue-700 border-blue-500/20",
    low: "bg-muted text-muted-foreground border-transparent",
  };
  return (
    <Badge variant="outline" className={cn("capitalize shrink-0", map[priority] ?? map.low)}>
      {priority}
    </Badge>
  );
}

function Distribution({
  title,
  icon: Icon,
  data,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  data: [string, number][];
}) {
  const max = Math.max(1, ...data.map(([, v]) => v));
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">No data</div>
      ) : (
        <ul className="space-y-1.5">
          {data.map(([name, count]) => (
            <li key={name} className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="truncate">{name}</span>
                <span className="text-muted-foreground tabular-nums">{count}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}