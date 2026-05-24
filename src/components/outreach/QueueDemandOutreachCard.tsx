import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Mail, Send, ExternalLink } from "lucide-react";

type QueueResult = {
  ok?: boolean;
  dry_run?: boolean;
  candidates: number;
  queued?: number;
  would_queue?: number;
  skipped_suppressed: number;
  skipped_duplicate: number;
  skipped_same_email_dedup: number;
  first_send_at: string | null;
  last_send_at: string | null;
  samples?: Array<{ to_email: string; subject: string; body: string; send_at: string }>;
};

export function QueueDemandOutreachCard() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<QueueResult | null>(null);

  // Live stats
  const statsQ = useQuery({
    queryKey: ["demand-outreach-stats"],
    queryFn: async () => {
      const [contactable, scheduled] = await Promise.all([
        supabase
          .from("demand_leads")
          .select("*", { head: true, count: "exact" })
          .not("contact_email", "is", null)
          .neq("contact_email", ""),
        supabase
          .from("scheduled_emails")
          .select("status", { count: "exact" })
          .eq("template_name", "voynova_demand_outreach"),
      ]);
      const byStatus: Record<string, number> = {};
      (scheduled.data ?? []).forEach((r: any) => {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      });
      return {
        contactable: contactable.count ?? 0,
        total: scheduled.count ?? 0,
        pending: byStatus["pending"] ?? 0,
        sending: byStatus["sending"] ?? 0,
        sent: byStatus["sent"] ?? 0,
        failed: byStatus["failed"] ?? 0,
        suppressed: byStatus["suppressed"] ?? 0,
      };
    },
    refetchInterval: 15_000,
  });

  const dry = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("queue-demand-lead-outreach", {
        body: { dry_run: true },
      });
      if (error) throw error;
      return data as QueueResult;
    },
    onSuccess: (data) => {
      setPreview(data);
      toast.success(`Preview ready: ${data.would_queue ?? 0} emails would be queued`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Preview failed"),
  });

  const queue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("queue-demand-lead-outreach", {
        body: {},
      });
      if (error) throw error;
      return data as QueueResult;
    },
    onSuccess: (data) => {
      toast.success(`Queued ${data.queued ?? 0} emails`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["demand-outreach-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Queue failed"),
  });

  const stats = statsQ.data;

  return (
    <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-emerald-500/5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Demand-Lead Outreach Campaign
          </h2>
          <p className="text-sm text-muted-foreground">
            Personalised cold emails to every demand lead with a contact email. Each message
            references the employer, role, city, and trade, and embeds links to{" "}
            <a href="https://voynovaglobal.com" target="_blank" rel="noreferrer" className="underline">
              voynovaglobal.com
            </a>{" "}
            and the{" "}
            <a href="https://voy-nova-profiles.live/company-profile" target="_blank" rel="noreferrer" className="underline">
              company profile
            </a>. Signed by{" "}
            <strong>Mohit Gururani, Founder & CEO</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => dry.mutate()} disabled={dry.isPending}>
            {dry.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
            Preview
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button>
                <Send className="h-4 w-4 mr-2" />
                Queue all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Queue personalised outreach?</AlertDialogTitle>
                <AlertDialogDescription>
                  This queues one personalised email per demand lead with a contact email
                  ({stats?.contactable ?? "—"} candidates). Sending respects the daily cap
                  (200/day) and per-domain cap (25/day). Already-queued leads and suppressed
                  addresses are skipped automatically. You can run "Preview" first to see the
                  exact count without queuing.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => queue.mutate()} disabled={queue.isPending}>
                  {queue.isPending ? "Queuing…" : "Queue now"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
        <StatPill label="Contactable" value={stats?.contactable} />
        <StatPill label="Queued total" value={stats?.total} />
        <StatPill label="Pending" value={stats?.pending} accent />
        <StatPill label="Sent" value={stats?.sent} accent />
        <StatPill label="Failed" value={stats?.failed} />
        <StatPill label="Suppressed" value={stats?.suppressed} />
      </div>

      {preview && (
        <div className="mt-4 rounded-md border border-primary/30 bg-background/60 p-3 text-sm space-y-1">
          <div className="font-medium flex items-center gap-2">
            <Badge variant="secondary">Preview</Badge>
            Would queue <strong>{preview.would_queue}</strong> emails from{" "}
            <strong>{preview.candidates}</strong> candidates.
          </div>
          <div className="text-muted-foreground">
            Skipped — suppressed: {preview.skipped_suppressed}, already queued:{" "}
            {preview.skipped_duplicate}, dedup same-email: {preview.skipped_same_email_dedup}
          </div>
          {preview.first_send_at && (
            <div className="text-muted-foreground">
              First send: {new Date(preview.first_send_at).toLocaleString()} · Last send:{" "}
              {preview.last_send_at ? new Date(preview.last_send_at).toLocaleString() : "—"}
            </div>
          )}
        </div>
      )}

      {preview?.samples && preview.samples.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <Badge variant="outline">Personalisation preview</Badge>
            <span className="text-muted-foreground">
              {preview.samples.length} sample email{preview.samples.length === 1 ? "" : "s"} (first / middle / last)
            </span>
          </div>
          <div className="grid gap-3">
            {preview.samples.map((s, i) => (
              <div key={i} className="rounded-md border bg-background/80 p-3 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-mono text-xs text-muted-foreground truncate">
                    To: {s.to_email}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.send_at).toLocaleString()}
                  </div>
                </div>
                <div className="font-semibold mb-2">{s.subject}</div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90 max-h-72 overflow-auto">
                  {s.body}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function StatPill({ label, value, accent }: { label: string; value: number | undefined; accent?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${accent ? "border-primary/40 bg-primary/5" : "bg-background/60"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value ?? "—"}</div>
    </div>
  );
}