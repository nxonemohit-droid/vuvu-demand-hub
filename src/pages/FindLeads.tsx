import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Radar, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MARKETS, SECTORS, type LeadKind } from "@/lib/markets";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";


const FAST = MARKETS.filter((m) => m.speed === "fast").map((m) => m.country);
// Main focus corridor: less explored Europe markets with quick work visas.
const FOCUS = ["Latvia", "Serbia", "Cyprus", "Estonia"];
const ALL_COUNTRIES = MARKETS.map((m) => m.country);

const FindLeads = () => {
  const qc = useQueryClient();
  const [kind, setKind] = useState<LeadKind>("employer");
  const [countries, setCountries] = useState<string[]>(FOCUS);
  const [sectors, setSectors] = useState<string[]>(["construction", "hospitality"]);
  const [keywords, setKeywords] = useState("");
  const [starting, setStarting] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["latest-find-job"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("find_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 4000,
  });

  const { data: counts } = useQuery({
    queryKey: ["lead-counts"],
    queryFn: async () => {
      const total = await supabase.from("leads").select("id", { count: "exact", head: true });
      const withEmail = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("email", "is", null);
      const pending = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("enriched", false)
        .lt("enrich_attempts", 3);
      return {
        total: total.count ?? 0,
        withEmail: withEmail.count ?? 0,
        pending: pending.count ?? 0,
      };
    },
    refetchInterval: 5000,
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company, website, phone, address, opening_hours, city, country")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const startFind = async () => {
    if (!countries.length) {
      toast.error("Kam se kam ek country choose karo");
      return;
    }
    setStarting(true);
    const { error } = await supabase.functions.invoke("find-leads", {
      body: {
        kind,
        countries,
        sectors,
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      },
    });
    setStarting(false);
    if (error) {
      toast.error("Search shuru nahi hui. Thodi der baad try karo.");
      return;
    }
    toast.success("Search chalu — leads aate rahenge");
    qc.invalidateQueries({ queryKey: ["latest-find-job"] });
  };

  const enrichBatch = async () => {
    setEnriching(true);
    try {
      for (let i = 0; i < 12; i++) {
        const { data, error } = await supabase.functions.invoke("enrich-lead", { body: { limit: 4 } });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["lead-counts"] });
        if (!data?.processed || !data?.remaining) break;
      }
      toast.success("Contact details nikaal liye");
    } catch {
      toast.error("Details nikaalte waqt dikkat aayi");
    } finally {
      setEnriching(false);
      qc.invalidateQueries({ queryKey: ["lead-counts"] });
    }
  };

  const running = job?.status === "running";
  const progress = job?.urls_found ? Math.min(100, (job.leads_created / job.urls_found) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <PageHeader
        step={1}
        title="Find Leads"
        description="Europe ke un markets me employers dhundo jahan work visa 2 mahine ke andar lag jata hai."
      />


      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total leads" value={counts?.total} />
        <StatCard label="With email" value={counts?.withEmail} />
        <StatCard label="Waiting for details" value={counts?.pending} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New search</CardTitle>
          <CardDescription>Country aur sector chuno, baaki sab apne aap ho jayega.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Tabs value={kind} onValueChange={(v) => setKind(v as LeadKind)}>
            <TabsList>
              <TabsTrigger value="employer">Employers hiring workers</TabsTrigger>
              <TabsTrigger value="education">Colleges (learn &amp; earn)</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Countries</Label>
              <div className="flex flex-wrap gap-1">
                <Button variant="secondary" size="sm" onClick={() => setCountries(FOCUS)}>
                  Main focus (Latvia, Serbia, Cyprus, Estonia)
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCountries(FAST)}>
                  Fastest visa
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCountries(ALL_COUNTRIES)}>
                  All Europe
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {MARKETS.map((m) => {
                const active = countries.includes(m.country);
                return (
                  <button
                    key={m.country}
                    type="button"
                    onClick={() => toggle(countries, setCountries, m.country)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      active ? "border-primary bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <div className="font-medium">{m.country}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.days}
                      <Badge
                        variant={m.speed === "fast" ? "default" : "secondary"}
                        className="ml-2 px-1.5 py-0 text-[10px]"
                      >
                        {m.speed === "fast" ? "Fast" : "Medium"}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {kind === "employer" && (
            <div className="space-y-2">
              <Label>Sectors</Label>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map((s) => (
                  <Badge
                    key={s}
                    variant={sectors.includes(s) ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                    onClick={() => toggle(sectors, setSectors, s)}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="kw">Extra keywords (optional, comma separated)</Label>
            <Input
              id="kw"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="greenhouse workers, hotel housekeeping"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={startFind} disabled={starting || running} size="lg">
              {starting || running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Radar className="mr-2 h-4 w-4" />
              )}
              {running ? "Searching..." : "Find leads"}
            </Button>
            <Button onClick={enrichBatch} disabled={enriching} variant="secondary" size="lg">
              {enriching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Get contact details ({counts?.pending ?? 0})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last search</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !job ? (
            <p className="text-sm text-muted-foreground">Abhi tak koi search nahi chali.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={job.status === "running" ? "default" : "secondary"}>{job.status}</Badge>
                <span className="text-muted-foreground">{job.countries.join(", ")}</span>
              </div>
              <Progress value={progress} />
              <div className="text-sm text-muted-foreground">
                {job.urls_found} pages checked · {job.leads_created} new leads saved
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Just discovered</CardTitle>
          <CardDescription>Naam, website, phone, address aur opening hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!recent ? (
            <Skeleton className="h-40 w-full" />
          ) : !recent.length ? (
            <p className="text-sm text-muted-foreground">Abhi koi lead nahi mili.</p>
          ) : (
            recent.map((l) => (
              <div key={l.id} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{l.company}</div>
                <div className="text-xs text-muted-foreground">
                  {[l.city, l.country].filter(Boolean).join(", ")}
                </div>
                {l.website && (
                  <a
                    href={l.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {l.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <div className="mt-1 text-xs">{l.phone ?? "phone nahi mila"}</div>
                {l.address && <div className="text-xs text-muted-foreground">{l.address}</div>}
                {l.opening_hours && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Opening hours
                    </summary>
                    <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {l.opening_hours}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value?: number }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold">{value ?? "—"}</div>
    </CardContent>
  </Card>
);

export default FindLeads;
