import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

type QuotaState = {
  provider: string;
  monthly_usage_usd: number | null;
  monthly_limit_usd: number | null;
  usage_pct: number | null;
  cycle_end_at: string | null;
  exhausted_at: string | null;
  last_checked_at: string;
};

export function QuotaBanner({ showRetry = false }: { showRetry?: boolean }) {
  const [state, setState] = useState<QuotaState | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("provider_quota_state")
      .select("*")
      .eq("provider", "apify")
      .maybeSingle();
    if (data) setState(data as unknown as QuotaState);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("apify-quota-check");
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any)?.error ?? "Failed");
      toast.success("Apify quota refreshed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh quota");
    } finally {
      setLoading(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke("retry-failed-runs", {
        body: { max: 200 },
      });
      if (error) throw error;
      const r = data as any;
      if (r?.blocked) {
        toast.error(`Cannot retry: ${r.reason}`);
      } else if (r?.ok) {
        toast.success(`Re-queued ${r.requeued} run${r.requeued === 1 ? "" : "s"}`);
      } else {
        toast.error(r?.error ?? "Retry failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  if (!state) return null;

  const pct = Math.round(state.usage_pct ?? 0);
  const exhausted = !!state.exhausted_at;
  const warning = !exhausted && pct >= 80;
  const cycleEnd = state.cycle_end_at ? new Date(state.cycle_end_at) : null;

  const tone = exhausted
    ? "border-destructive/40 bg-destructive/5"
    : warning
    ? "border-amber-500/40 bg-amber-500/5"
    : "border-border";

  const Icon = exhausted || warning ? AlertTriangle : CheckCircle2;
  const iconClass = exhausted
    ? "text-destructive"
    : warning
    ? "text-amber-600"
    : "text-emerald-600";

  return (
    <Card className={`p-4 ${tone}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">Apify monthly budget</h3>
            {exhausted && <Badge variant="destructive">Exhausted</Badge>}
            {warning && <Badge variant="outline" className="border-amber-500 text-amber-700">Warning</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {exhausted ? (
              <>
                Discovery is paused — Apify rejected runs since{" "}
                {formatDistanceToNow(new Date(state.exhausted_at!), { addSuffix: true })}.{" "}
                {cycleEnd && <>Quota resets {format(cycleEnd, "dd/MM/yyyy")}.</>}
              </>
            ) : warning ? (
              <>Approaching monthly cap. New runs will be paused at 95%.</>
            ) : (
              <>Healthy. Discovery dispatcher is allowed to run.</>
            )}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={pct} className="h-2 flex-1 max-w-md" />
            <span className="text-xs tabular-nums whitespace-nowrap">
              ${(state.monthly_usage_usd ?? 0).toFixed(2)} / ${(state.monthly_limit_usd ?? 0).toFixed(2)} ({pct}%)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Checked {formatDistanceToNow(new Date(state.last_checked_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Check now
          </Button>
          {showRetry && (
            <Button size="sm" variant="default" onClick={retry} disabled={retrying || exhausted}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? "animate-spin" : ""}`} />
              Retry failed
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}