import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Handshake, Loader2, Radar, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import {
  EXTRA_RECRUITER_COUNTRIES,
  RECRUITER_COUNTRIES,
  RECRUITER_TYPES,
} from "@/lib/markets";
import { cn } from "@/lib/utils";
import { RecruiterPipeline } from "@/components/RecruiterPipeline";
import { RecruiterDuplicates } from "@/components/RecruiterDuplicates";

type CountryStat = {
  country: string;
  total: number;
  withEmail: number;
  withPhone: number;
  pending: number;
};

const ALL_COUNTRIES = [...RECRUITER_COUNTRIES, ...EXTRA_RECRUITER_COUNTRIES];

/** Recruiter engine: partners in South Asia who supply workers and students. */
const Recruiters = () => {
  const qc = useQueryClient();
  const [types, setTypes] = useState<string[]>(RECRUITER_TYPES.map((t) => t.id));
  const [busyCountry, setBusyCountry] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["recruiter-stats"],
    queryFn: async (): Promise<CountryStat[]> => {
      const rows = await Promise.all(
        ALL_COUNTRIES.map(async (country) => {
          const base = () =>
            supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("kind", "supply")
              .is("merged_into", null)
              .eq("country", country);
          const total = await base();
          const withEmail = await base().not("email", "is", null);
          const withPhone = await base().not("phone", "is", null);
          const pending = await base().eq("enriched", false).lt("enrich_attempts", 3);
          return {
            country,
            total: total.count ?? 0,
            withEmail: withEmail.count ?? 0,
            withPhone: withPhone.count ?? 0,
            pending: pending.count ?? 0,
          };
        }),
      );
      return rows;
    },
    refetchInterval: 6000,
  });

  const { data: job } = useQuery({
    queryKey: ["recruiter-job"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("find_jobs")
        .select("*")
        .eq("kind", "supply")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const keywords = () =>
    RECRUITER_TYPES.filter((t) => types.includes(t.id)).flatMap((t) => t.keywords);

  const toggleType = (id: string) =>
    setTypes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const findFor = async (countries: string[], label: string) => {
    if (!types.length) {
      toast.error("Kam se kam ek partner type chuno");
      return;
    }
    setBusyCountry(label);
    try {
      const { error } = await supabase.functions.invoke("find-leads", {
        body: { kind: "supply", countries, sectors: [], keywords: keywords() },
      });
      if (error) throw error;
      toast.success(`${label} ki search chalu — partners aate rahenge`);
      qc.invalidateQueries({ queryKey: ["recruiter-job"] });
    } catch {
      toast.error("Search shuru nahi hui. Thodi der baad try karo.");
    } finally {
      setBusyCountry(null);
    }
  };

  const enrichPartners = async () => {
    setEnriching(true);
    try {
      for (let i = 0; i < 12; i++) {
        const { data, error } = await supabase.functions.invoke("enrich-lead", {
          body: { limit: 4, kinds: ["supply"] },
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["recruiter-stats"] });
        if (!data?.processed) break;
      }
      toast.success("Partners ke contact details nikaal liye");
    } catch {
      toast.error("Details nikaalte waqt dikkat aayi");
    } finally {
      setEnriching(false);
      qc.invalidateQueries({ queryKey: ["recruiter-stats"] });
    }
  };

  const totals = (stats ?? []).reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      withEmail: acc.withEmail + s.withEmail,
      pending: acc.pending + s.pending,
    }),
    { total: 0, withEmail: 0, pending: 0 },
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <PageHeader
        step={1}
        title="Recruiter Engine"
        description="South Asia ke partners — manpower agencies, agents aur study/visa counsellors. Ye engine Europe employer aur college search se bilkul alag hai."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Partner leads" value={totals.total} />
        <StatCard label="With email" value={totals.withEmail} />
        <StatCard label="Waiting for details" value={totals.pending} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Partner types</CardTitle>
          <CardDescription>Kis tarah ke partners dhundne hain, wo chuno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {RECRUITER_TYPES.map((t) => {
              const active = types.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    active ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground">{t.hint}</div>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => findFor(RECRUITER_COUNTRIES, "Poora South Asia")}
              disabled={busyCountry !== null}
            >
              {busyCountry === "Poora South Asia" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Radar className="mr-2 h-4 w-4" />
              )}
              Search all South Asia
            </Button>
            <Button size="lg" variant="secondary" onClick={enrichPartners} disabled={enriching}>
              {enriching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Get contact details ({totals.pending})
            </Button>
          </div>
          {job && (
            <p className="text-xs text-muted-foreground">
              Last partner search: {job.status} · {job.countries.join(", ")} · {job.leads_created}{" "}
              new partners
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Label className="text-base">Country blocks</Label>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(stats ?? []).map((s) => (
              <CountryBlock
                key={s.country}
                stat={s}
                busy={busyCountry === s.country}
                disabled={busyCountry !== null}
                onFind={() => findFor([s.country], s.country)}
                main={RECRUITER_COUNTRIES.includes(s.country)}
              />
            ))}
          </div>
        )}
      </div>

      <RecruiterDuplicates />

      <RecruiterPipeline countries={ALL_COUNTRIES} />
    </div>
  );
};

const CountryBlock = ({
  stat,
  busy,
  disabled,
  onFind,
  main,
}: {
  stat: CountryStat;
  busy: boolean;
  disabled: boolean;
  onFind: () => void;
  main: boolean;
}) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake className="h-4 w-4 text-primary" />
          {stat.country}
        </CardTitle>
        <Badge variant={main ? "default" : "secondary"}>{main ? "Main corridor" : "Extra"}</Badge>
      </div>
      <CardDescription>Recruiters, agents aur counsellors {stat.country} me.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Mini label="Partners" value={stat.total} />
        <Mini label="Email" value={stat.withEmail} />
        <Mini label="Phone" value={stat.withPhone} />
      </div>
      <Button className="w-full" variant="outline" onClick={onFind} disabled={disabled}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
        Find {stat.country} partners
      </Button>
    </CardContent>
  </Card>
);

const Mini = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-muted/50 py-2">
    <div className="text-lg font-semibold">{value}</div>
    <div className="text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const StatCard = ({ label, value }: { label: string; value?: number }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold">{value ?? "—"}</div>
    </CardContent>
  </Card>
);

export default Recruiters;
