import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Counts = {
  awaiting_enrichment: number;
  over_daily_cap: number;
  unresolved_template_var: number;
  provider_error: number;
};

export function PendingMailsHealthBanner({
  counts,
  onResolveAll,
  resolving,
}: {
  counts: Counts;
  onResolveAll: () => void;
  resolving: boolean;
}) {
  const total =
    counts.awaiting_enrichment +
    counts.over_daily_cap +
    counts.unresolved_template_var +
    counts.provider_error;
  const autoFixable = counts.awaiting_enrichment + counts.unresolved_template_var;

  return (
    <Card
      className={cn(
        "p-4 flex flex-col md:flex-row md:items-center gap-3 border",
        total === 0 ? "bg-emerald-500/5 border-emerald-500/30" : "bg-amber-500/5 border-amber-500/40",
      )}
    >
      <div className="flex items-center gap-2 flex-1">
        <AlertTriangle
          className={cn("h-4 w-4", total === 0 ? "text-emerald-600" : "text-amber-600")}
        />
        <div className="text-sm">
          {total === 0 ? (
            <span className="text-emerald-800 dark:text-emerald-300">
              No blocked pending mails. Queue is healthy.
            </span>
          ) : (
            <span>
              <span className="font-semibold">{total} pending mail{total === 1 ? "" : "s"}</span>{" "}
              need attention.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill label="Awaiting enrichment" value={counts.awaiting_enrichment} tone="amber" />
        <Pill label="Sender cap"          value={counts.over_daily_cap}          tone="rose" />
        <Pill label="Unresolved vars"     value={counts.unresolved_template_var} tone="amber" />
        <Pill label="Provider error"      value={counts.provider_error}          tone="rose" />
      </div>

      <Button
        size="sm"
        onClick={onResolveAll}
        disabled={resolving || autoFixable === 0}
        className="shrink-0"
      >
        {resolving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
        Resolve {autoFixable} auto-fixable
      </Button>
    </Card>
  );
}

function Pill({ label, value, tone }: { label: string; value: number; tone: "amber" | "rose" }) {
  const cls =
    value === 0
      ? "bg-muted text-muted-foreground border-border"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
        : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs", cls)}>
      <span className="tabular-nums font-medium">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}