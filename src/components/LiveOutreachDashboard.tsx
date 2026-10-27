import { Activity } from "lucide-react";
import { useLiveOutreach } from "@/hooks/use-live-outreach";
import { fmtDate } from "@/hooks/use-outreach";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const LABEL: Record<string, string> = { read: "Read", delivered: "Delivered", failed: "Failed by Meta", sent: "Sent by Meta · not delivered yet" };

export const LiveOutreachDashboard = () => {
  const q = useLiveOutreach();
  const d = q.data;
  const stats: [string, number | undefined][] = [
    ["Verified leads (source + evidence)", d?.verified], ["Leads with email", d?.withEmail], ["Leads with phone", d?.withPhone],
    ["WhatsApp accepted", d?.waSent], ["Delivered (receipt)", d?.delivered], ["Read (receipt)", d?.read], ["WhatsApp failed", d?.waFailed],
  ];
  return (
    <section aria-label="Live outreach dashboard" className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-5 w-5 text-primary" />Live dashboard<span className="h-2 w-2 animate-pulse rounded-full bg-success" /></h2>
      {q.isError && <p className="text-sm text-destructive">Dashboard could not load. It will retry.</p>}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        {stats.map(([l, v]) => <div key={l}><dt className="text-xs text-muted-foreground">{l}</dt><dd className="mt-1 text-xl font-semibold">{q.isLoading ? <Skeleton className="h-6 w-12" /> : v ?? "—"}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">Delivered/Read only counts when Meta sends a receipt. Without a receipt the message shows "Delivery unknown".</p>
      <div className="max-h-96 overflow-auto">
        {d?.rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
            <div><p className="font-medium">{r.leads?.company ?? r.to_address}</p><p className="text-xs text-muted-foreground">{r.to_address} · {fmtDate(r.sent_at)}</p></div>
            <Badge variant={r.receipt === "failed" ? "destructive" : r.receipt === "delivered" || r.receipt === "read" ? "default" : "secondary"}>{r.receipt ? LABEL[r.receipt] : "Accepted · delivery unknown"}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
};
