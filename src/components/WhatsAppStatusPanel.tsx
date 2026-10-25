import { MessageCircle, RefreshCw, CircleAlert } from "lucide-react";
import { useWhatsAppStatus, useWhatsAppFailures } from "@/hooks/use-whatsapp-status";
import { useOutreachStats, fmtDate } from "@/hooks/use-outreach";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const WhatsAppStatusPanel = () => {
  const status = useWhatsAppStatus();
  const failures = useWhatsAppFailures();
  const stats = useOutreachStats();
  const state = status.data;
  const totals = stats.data ? Object.values(stats.data).reduce((a, s) => ({ pending: a.pending + s.whatsapp.pending, sent: a.sent + s.whatsapp.sent, failed: a.failed + s.whatsapp.failed }), { pending: 0, sent: 0, failed: 0 }) : null;
  return (
    <section aria-label="WhatsApp template status" className="space-y-4 border-y border-border py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><MessageCircle className="h-5 w-5 text-primary" />WhatsApp outreach</h2>
        <Button size="sm" variant="outline" disabled={status.isFetching || failures.isFetching} onClick={() => { void status.refetch(); void failures.refetch(); void stats.refetch(); }}>
          <RefreshCw className={`mr-2 h-4 w-4 ${status.isFetching ? "animate-spin" : ""}`} />Refresh status
        </Button>
      </div>
      {status.isLoading ? <Skeleton className="h-20 w-full" /> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="break-all font-medium">{state?.name ?? "WhatsApp template"}</span>
            <Badge variant={status.isError || state?.status === "FAILED" ? "destructive" : state?.status === "APPROVED" ? "default" : "secondary"}>{status.isError ? "FAILED" : state?.status ?? "PENDING"}</Badge>
            {state && <span className="text-xs text-muted-foreground">Checked {fmtDate(state.checked_at)}</span>}
          </div>
          <p className="text-sm text-muted-foreground">{status.isError ? "Status unavailable — automatic messages are held until approval can be verified." : state?.can_send ? "Meta approved. Queued messages are eligible to send while the audience engine is running." : state?.reason}</p>
          {state && state.provider_status !== state.status && <p className="text-xs text-muted-foreground">Meta status: {state.provider_status}</p>}
          {status.isError && <p className="break-words text-sm text-destructive">{status.error.message}</p>}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-4 text-sm">
        {[ ["Queued", totals?.pending], ["Accepted / recorded sent", totals?.sent], ["Failed", totals?.failed] ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold">{value ?? "—"}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">Provider acceptance is not delivery confirmation.</p>
      {failures.isError ? <Alert variant="destructive"><CircleAlert className="h-4 w-4" /><AlertTitle>Failure report unavailable</AlertTitle><AlertDescription>{failures.error.message}</AlertDescription></Alert> : failures.isLoading ? <Skeleton className="h-12 w-full" /> : failures.data?.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recent failed messages</h3>
          {failures.data.map((row) => <details key={row.id} className="border-b border-border py-2 text-sm"><summary className="cursor-pointer break-words font-medium">{row.leads?.company ?? row.to_address} · {row.to_address} · FAILED</summary><p className="mt-2 whitespace-pre-wrap break-words text-destructive">{row.error ?? "Provider returned no failure reason."}</p><p className="mt-1 text-xs text-muted-foreground">{fmtDate(row.scheduled_for)} · Attempts: {row.attempts}</p></details>)}
        </div>
      ) : <p className="text-sm text-muted-foreground">No failed WhatsApp messages.</p>}
    </section>
  );
};