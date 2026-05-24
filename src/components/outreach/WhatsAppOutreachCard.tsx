import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  MessageCircle, Loader2, Search, StopCircle, Send, SkipForward, Eye, ExternalLink,
} from "lucide-react";

type Stats = {
  total: number;
  with_whatsapp: number;
  enrichable: number;
  queued_today: number;
  sent_today: number;
  remaining_today: number;
  daily_cap: number;
};

type QueueRow = {
  id: string;
  lead_id: string;
  display_number: string;
  wa_link: string;
  message: string;
  status: string;
  queue_date: string;
  sent_at: string | null;
  lead?: {
    employer_name: string | null;
    role: string | null;
    country: string | null;
    city: string | null;
    contact_name: string | null;
  } | null;
};

const BATCH = 10;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function WhatsAppOutreachCard() {
  const qc = useQueryClient();
  const [enriching, setEnriching] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [found, setFound] = useState(0);
  const [target, setTarget] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => () => { stopRef.current = true; }, []);

  const statsQ = useQuery({
    queryKey: ["wa-stats"],
    queryFn: async (): Promise<Stats> => {
      const today = todayIso();
      const [total, withWa, enrichable, settings, queuedToday, sentToday] = await Promise.all([
        supabase.from("demand_leads").select("*", { head: true, count: "exact" }),
        supabase.from("demand_leads")
          .select("*", { head: true, count: "exact" })
          .not("whatsapp_number", "is", null)
          .neq("whatsapp_number", ""),
        supabase.from("demand_leads")
          .select("*", { head: true, count: "exact" })
          .is("whatsapp_number", null)
          .lte("whatsapp_enrich_attempts", 2)
          .or("phone_e164.not.is.null,source_url.not.is.null"),
        supabase.from("whatsapp_send_settings").select("daily_cap").eq("id", 1).maybeSingle(),
        supabase.from("whatsapp_outreach")
          .select("*", { head: true, count: "exact" })
          .eq("queue_date", today),
        supabase.from("whatsapp_outreach")
          .select("*", { head: true, count: "exact" })
          .eq("queue_date", today)
          .eq("status", "sent"),
      ]);
      const cap = settings.data?.daily_cap ?? 50;
      const sent = sentToday.count ?? 0;
      return {
        total: total.count ?? 0,
        with_whatsapp: withWa.count ?? 0,
        enrichable: enrichable.count ?? 0,
        queued_today: queuedToday.count ?? 0,
        sent_today: sent,
        remaining_today: Math.max(0, cap - sent),
        daily_cap: cap,
      };
    },
    refetchInterval: enriching ? 5_000 : 20_000,
  });

  const queueQ = useQuery({
    queryKey: ["wa-queue", todayIso()],
    queryFn: async (): Promise<QueueRow[]> => {
      const today = todayIso();
      const { data, error } = await supabase
        .from("whatsapp_outreach")
        .select(`
          id, lead_id, display_number, wa_link, message, status, queue_date, sent_at,
          lead:demand_leads ( employer_name, role, country, city, contact_name )
        `)
        .eq("queue_date", today)
        .order("status", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
    refetchInterval: 15_000,
  });

  // --- Enrichment loop
  async function runEnrichBatch() {
    const { data, error } = await supabase.functions.invoke("enrich-whatsapp-numbers", {
      body: { limit: BATCH, concurrency: 3, max_attempts: 2 },
    });
    if (error) throw error;
    return data as { processed: number; found: number };
  }

  async function startEnrich(maxLeads: number) {
    setEnriching(true);
    setProcessed(0);
    setFound(0);
    setTarget(maxLeads);
    stopRef.current = false;
    toast.info(`Enriching up to ${maxLeads} leads for WhatsApp numbers…`);
    try {
      let totalProc = 0;
      let totalFound = 0;
      while (!stopRef.current && totalProc < maxLeads) {
        const res = await runEnrichBatch();
        const p = res.processed ?? 0;
        const f = res.found ?? 0;
        totalProc += p;
        totalFound += f;
        setProcessed(totalProc);
        setFound(totalFound);
        if (p === 0) break;
        if (p < BATCH && (maxLeads - totalProc) <= BATCH) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      toast.success(`Done. Found ${totalFound} new WhatsApp numbers.`);
      qc.invalidateQueries({ queryKey: ["wa-stats"] });
    } catch (e: any) {
      toast.error(e?.message ?? "WhatsApp enrichment failed");
    } finally {
      setEnriching(false);
    }
  }

  function stopEnrich() {
    stopRef.current = true;
    toast.message("Stopping after current batch…");
  }

  // --- Queue outreach
  const dryRunMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("queue-whatsapp-outreach", {
        body: { dry_run: true },
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d) => {
      toast.success(
        `Preview: would queue ${d.would_queue} messages · ${d.daily_cap}/day · ~${d.estimated_days} days`,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Preview failed"),
  });

  const queueMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("queue-whatsapp-outreach", {
        body: {},
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d) => {
      toast.success(
        `Queued ${d.queued} WhatsApp messages · ${d.daily_cap}/day · ~${d.estimated_days} days`,
      );
      qc.invalidateQueries({ queryKey: ["wa-stats"] });
      qc.invalidateQueries({ queryKey: ["wa-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Queue failed"),
  });

  // --- Per-row actions
  async function openAndMarkSent(row: QueueRow) {
    // open in new tab
    window.open(row.wa_link, "_blank", "noopener,noreferrer");
    const { error } = await supabase
      .from("whatsapp_outreach")
      .update({ status: "sent", sent_at: new Date().toISOString(), opened_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      toast.error("Couldn't mark as sent: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["wa-queue"] });
    qc.invalidateQueries({ queryKey: ["wa-stats"] });
  }

  async function markSkipped(row: QueueRow) {
    const { error } = await supabase
      .from("whatsapp_outreach")
      .update({ status: "skipped" })
      .eq("id", row.id);
    if (error) {
      toast.error("Couldn't skip: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["wa-queue"] });
    qc.invalidateQueries({ queryKey: ["wa-stats"] });
  }

  const stats = statsQ.data;
  const queue = queueQ.data ?? [];
  const sentToday = stats?.sent_today ?? 0;
  const cap = stats?.daily_cap ?? 50;
  const dayPct = cap > 0 ? Math.min(100, Math.round((sentToday / cap) * 100)) : 0;
  const pct = target > 0 ? Math.min(100, Math.round((processed / target) * 100)) : 0;
  const preview = previewId ? queue.find((q) => q.id === previewId) ?? null : null;

  return (
    <Card className="p-5 border-green-500/30 bg-gradient-to-br from-green-500/5 to-emerald-500/5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            WhatsApp outreach
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Find WhatsApp numbers for demand leads (uses existing phones + scrapes
            company sites), then queue up to <b>{cap} personalized messages per day</b>.
            Each row opens WhatsApp with the message pre-filled — one click to send.
            Stays 100% compliant with WhatsApp's policy (no automated cold sends).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {enriching ? (
            <Button variant="destructive" onClick={stopEnrich}>
              <StopCircle className="h-4 w-4 mr-2" /> Stop
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => startEnrich(50)} disabled={!stats?.enrichable}>
                <Search className="h-4 w-4 mr-2" /> Enrich 50
              </Button>
              <Button variant="outline" onClick={() => startEnrich(250)} disabled={!stats?.enrichable}>
                Enrich 250
              </Button>
              <Button variant="outline" onClick={() => startEnrich(stats?.enrichable ?? 0)} disabled={!stats?.enrichable}>
                Enrich all ({stats?.enrichable ?? 0})
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => dryRunMut.mutate()}
            disabled={dryRunMut.isPending || !stats?.with_whatsapp}
          >
            {dryRunMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
            Preview queue
          </Button>
          <Button
            onClick={() => queueMut.mutate()}
            disabled={queueMut.isPending || !stats?.with_whatsapp}
            className="bg-green-600 hover:bg-green-700"
          >
            {queueMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Queue outreach
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        <Pill label="Total leads" value={stats?.total} />
        <Pill label="With WhatsApp" value={stats?.with_whatsapp} accent />
        <Pill label="Enrichable now" value={stats?.enrichable} />
        <Pill label="Queued today" value={stats?.queued_today} />
        <Pill label={`Sent today / ${cap}`} value={sentToday} accent />
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Today's progress</span>
          <span>{sentToday} / {cap}</span>
        </div>
        <Progress value={dayPct} className="h-2" />
      </div>

      {(enriching || processed > 0) && (
        <div className="mt-4 space-y-2 rounded-md border bg-background/60 p-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {enriching && <Loader2 className="h-4 w-4 animate-spin text-green-600" />}
              <span className="font-medium">Processed {processed} / {target}</span>
              <Badge variant="secondary">+{found} numbers found</Badge>
            </div>
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      )}

      {/* Today's queue */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">
            Today's WhatsApp queue ({queue.length})
          </h3>
          {preview && (
            <Button variant="ghost" size="sm" onClick={() => setPreviewId(null)}>
              Close preview
            </Button>
          )}
        </div>

        {preview && (
          <div className="mb-3 rounded-md border bg-background/80 p-3">
            <div className="text-xs text-muted-foreground mb-1">
              Preview · to <b>{preview.display_number}</b>
              {preview.lead?.employer_name ? <> · {preview.lead.employer_name}</> : null}
            </div>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed">{preview.message}</pre>
          </div>
        )}

        {queueQ.isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading queue…</div>
        ) : queue.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-background/40">
            Nothing queued for today yet. Click <b>Queue outreach</b> after enriching numbers.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto max-h-[480px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Employer</TableHead>
                  <TableHead>Role / Location</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((row) => (
                  <TableRow key={row.id} className={row.status === "sent" ? "opacity-60" : ""}>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.lead?.employer_name || "—"}
                      {row.lead?.contact_name && (
                        <div className="text-xs text-muted-foreground">{row.lead.contact_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.lead?.role || "—"}
                      <div className="text-muted-foreground">
                        {[row.lead?.city, row.lead?.country].filter(Boolean).join(", ") || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.display_number}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewId(previewId === row.id ? null : row.id)}
                          title="Preview message"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {row.status !== "sent" && row.status !== "skipped" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markSkipped(row)}
                              title="Skip"
                            >
                              <SkipForward className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 h-8"
                              onClick={() => openAndMarkSent(row)}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Send
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}

function Pill({ label, value, accent }: { label: string; value: number | undefined; accent?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${accent ? "border-green-500/40 bg-green-500/5" : "bg-background/60"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value ?? "—"}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    sent: "bg-green-500/15 text-green-700 dark:text-green-300",
    skipped: "bg-gray-500/15 text-gray-700 dark:text-gray-300",
    failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}