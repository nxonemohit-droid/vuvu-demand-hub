import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Search, StopCircle } from "lucide-react";

type Stats = {
  total: number;
  with_email: number;
  without_email: number;
  enrichable: number;
};

const BATCH = 10;

export function EnrichEmailsCard() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [found, setFound] = useState(0);
  const [target, setTarget] = useState(0);
  const stopRef = useRef(false);

  const statsQ = useQuery({
    queryKey: ["enrich-emails-stats"],
    queryFn: async (): Promise<Stats> => {
      const [total, withEmail, enrichable] = await Promise.all([
        supabase.from("demand_leads").select("*", { head: true, count: "exact" }),
        supabase
          .from("demand_leads")
          .select("*", { head: true, count: "exact" })
          .not("contact_email", "is", null)
          .neq("contact_email", ""),
        supabase
          .from("demand_leads")
          .select("*", { head: true, count: "exact" })
          .or("contact_email.is.null,contact_email.eq.")
          .or("employer_name.not.is.null,source_url.not.is.null,discovered_board_domain.not.is.null")
          .lte("enrichment_attempts", 2),
      ]);
      const t = total.count ?? 0;
      const w = withEmail.count ?? 0;
      return { total: t, with_email: w, without_email: t - w, enrichable: enrichable.count ?? 0 };
    },
    refetchInterval: running ? 5_000 : 30_000,
  });

  useEffect(() => {
    return () => { stopRef.current = true; };
  }, []);

  async function runBatch() {
    const { data, error } = await supabase.functions.invoke("enrich-contacts", {
      body: { email_only: true, limit: BATCH, max_attempts: 2, concurrency: 6 },
    });
    if (error) throw error;
    return data as { processed: number; emails_found: number };
  }

  async function start(maxLeads: number) {
    setRunning(true);
    setProcessed(0);
    setFound(0);
    setTarget(maxLeads);
    stopRef.current = false;
    toast.info(`Enriching up to ${maxLeads} leads…`);
    try {
      while (!stopRef.current && processed < maxLeads) {
        const remaining = maxLeads - processed;
        const res = await runBatch();
        const p = res.processed ?? 0;
        const f = res.emails_found ?? 0;
        setProcessed((x) => x + p);
        setFound((x) => x + f);
        if (p === 0) break; // nothing left to do
        if (p < BATCH && remaining <= BATCH) break;
        // small delay so we don't hammer Firecrawl/Hunter
        await new Promise((r) => setTimeout(r, 1500));
      }
      toast.success(`Enrichment done. Found ${found} new emails.`);
      qc.invalidateQueries({ queryKey: ["enrich-emails-stats"] });
      qc.invalidateQueries({ queryKey: ["demand-outreach-stats"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Enrichment failed");
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    stopRef.current = true;
    toast.message("Stopping after current batch…");
  }

  const stats = statsQ.data;
  const pct = target > 0 ? Math.min(100, Math.round((processed / target) * 100)) : 0;

  return (
    <Card className="p-5 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-primary/5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Search className="h-5 w-5 text-emerald-600" />
            Email enrichment
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Find missing contact emails for demand leads. Each lead is scraped via the company
            site (Firecrawl), falls back to Hunter.io domain search, then a safe{" "}
            <code className="text-xs">info@domain</code> guess. Enriched leads automatically
            become eligible for the outreach campaign.
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="destructive" onClick={stop}>
              <StopCircle className="h-4 w-4 mr-2" /> Stop
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => start(50)} disabled={!stats?.enrichable}>
                Enrich 50
              </Button>
              <Button variant="outline" onClick={() => start(250)} disabled={!stats?.enrichable}>
                Enrich 250
              </Button>
              <Button onClick={() => start(stats?.enrichable ?? 0)} disabled={!stats?.enrichable}>
                <Search className="h-4 w-4 mr-2" />
                Enrich all ({stats?.enrichable ?? 0})
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Pill label="Total leads" value={stats?.total} />
        <Pill label="With email" value={stats?.with_email} accent />
        <Pill label="Missing email" value={stats?.without_email} />
        <Pill label="Enrichable now" value={stats?.enrichable} accent />
      </div>

      {(running || processed > 0) && (
        <div className="mt-4 space-y-2 rounded-md border bg-background/60 p-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {running && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
              <span className="font-medium">
                Processed {processed} / {target}
              </span>
              <Badge variant="secondary">+{found} emails found</Badge>
            </div>
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      )}
    </Card>
  );
}

function Pill({ label, value, accent }: { label: string; value: number | undefined; accent?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${accent ? "border-emerald-500/40 bg-emerald-500/5" : "bg-background/60"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value ?? "—"}</div>
    </div>
  );
}
