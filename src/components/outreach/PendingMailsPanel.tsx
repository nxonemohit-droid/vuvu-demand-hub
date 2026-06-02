import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Sparkles, Clock, AlertOctagon, FileEdit, Trash2, CalendarClock, UserCog, Loader2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  classifyPending,
  PendingMailRow,
  PendingBucket,
  REASON_LABEL,
} from "@/lib/outreach-status";
import { PendingMailsHealthBanner } from "./PendingMailsHealthBanner";

const BUCKET_META: Record<PendingBucket, { label: string; icon: typeof Sparkles; tone: string }> = {
  draft:               { label: "Drafts",              icon: FileEdit,    tone: "text-foreground" },
  scheduled:           { label: "Scheduled",           icon: Clock,       tone: "text-primary" },
  awaiting_enrichment: { label: "Awaiting enrichment", icon: Sparkles,    tone: "text-amber-600" },
  blocked:             { label: "Blocked / Failed",    icon: AlertOctagon, tone: "text-destructive" },
};

export function PendingMailsPanel() {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<PendingBucket>("draft");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedAt, setReschedAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });

  // ----- queries
  const rowsQ = useQuery({
    queryKey: ["pending-mails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_emails")
        .select("id,lead_id,to_email,subject,body,send_at,status,error,blocking_reason,created_at")
        .in("status", ["pending", "failed"])
        .order("send_at", { ascending: true, nullsFirst: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as PendingMailRow[];
    },
    refetchInterval: 15_000,
  });

  const ctxQ = useQuery({
    queryKey: ["pending-mails-ctx"],
    queryFn: async () => {
      const todayIso = new Date(); todayIso.setHours(0, 0, 0, 0);
      const [sup, settings, sentToday, leadIdsRows] = await Promise.all([
        supabase.from("email_suppressions").select("email").limit(5000),
        supabase.from("email_send_settings").select("daily_cap").eq("id", 1).maybeSingle(),
        supabase.from("scheduled_emails").select("id", { head: true, count: "exact" })
          .eq("status", "sent").gte("sent_at", todayIso.toISOString()),
        supabase.from("scheduled_emails").select("lead_id").in("status", ["pending", "failed"]).limit(2000),
      ]);
      const leadIds = Array.from(new Set((leadIdsRows.data ?? [])
        .map((r) => r.lead_id).filter(Boolean))) as string[];
      let leadEmailSource = new Map<string, string>();
      if (leadIds.length) {
        const { data: leads } = await supabase
          .from("recruiter_leads")
          .select("id,email_source")
          .in("id", leadIds);
        leadEmailSource = new Map((leads ?? []).map((l) => [l.id, l.email_source ?? ""]));
      }
      return {
        suppressedEmails: new Set((sup.data ?? []).map((s) => s.email.toLowerCase())),
        dailyCap: settings.data?.daily_cap ?? 200,
        sentTodayCount: sentToday.count ?? 0,
        leadEmailSource,
      };
    },
    refetchInterval: 30_000,
  });

  // ----- classify
  const classified = useMemo(() => {
    if (!rowsQ.data || !ctxQ.data) return [];
    return rowsQ.data.map((r) => ({
      row: r,
      ...classifyPending(r, ctxQ.data),
    }));
  }, [rowsQ.data, ctxQ.data]);

  const bucketCounts = useMemo(() => ({
    draft: classified.filter((c) => c.bucket === "draft").length,
    scheduled: classified.filter((c) => c.bucket === "scheduled").length,
    awaiting_enrichment: classified.filter((c) => c.bucket === "awaiting_enrichment").length,
    blocked: classified.filter((c) => c.bucket === "blocked").length,
  }), [classified]);

  const reasonCounts = useMemo(() => ({
    awaiting_enrichment: bucketCounts.awaiting_enrichment,
    over_daily_cap: classified.filter((c) => c.reason === "over_daily_cap").length,
    unresolved_template_var: classified.filter((c) => c.reason === "unresolved_template_var").length,
    provider_error: classified.filter((c) => c.reason === "provider_error").length,
  }), [classified, bucketCounts.awaiting_enrichment]);

  const visible = classified.filter((c) => c.bucket === bucket);
  const allSelected = visible.length > 0 && visible.every((v) => selected.has(v.row.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) visible.forEach((v) => next.delete(v.row.id));
    else visible.forEach((v) => next.add(v.row.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["pending-mails"] });
    qc.invalidateQueries({ queryKey: ["pending-mails-ctx"] });
  };

  // ----- bulk actions
  const selectedRows = () => classified.filter((c) => selected.has(c.row.id));

  const discard = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("scheduled_emails")
        .update({ status: "cancelled", error: "discarded by user" })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => { toast.success(`Discarded ${n}`); setSelected(new Set()); refetchAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reschedule = useMutation({
    mutationFn: async ({ ids, at }: { ids: string[]; at: string }) => {
      const iso = new Date(at).toISOString();
      const { error } = await supabase
        .from("scheduled_emails")
        .update({ status: "pending", send_at: iso, error: null, blocking_reason: null, blocked_at: null, attempts: 0 })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => { toast.success(`Rescheduled ${n}`); setSelected(new Set()); setReschedOpen(false); refetchAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const enrichNow = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (leadIds.length === 0) return { enriched: 0 };
      const { data, error } = await supabase.functions.invoke("enrich-email", {
        body: { mode: "bulk", lead_ids: leadIds, limit: leadIds.length },
      });
      if (error) throw error;
      return data as { enriched?: number };
    },
    onSuccess: (d) => { toast.success(`Enrichment started (${d.enriched ?? 0})`); refetchAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveAll = useMutation({
    mutationFn: async () => {
      const auto = classified.filter(
        (c) => c.reason === "missing_email" || c.reason === "unresolved_template_var",
      );
      // 1. Enrich missing-email rows that still have a lead_id
      const enrichLeadIds = Array.from(new Set(
        auto.filter((c) => c.reason === "missing_email" && c.row.lead_id)
            .map((c) => c.row.lead_id as string),
      ));
      if (enrichLeadIds.length) {
        await supabase.functions.invoke("enrich-email", {
          body: { mode: "bulk", lead_ids: enrichLeadIds, limit: enrichLeadIds.length },
        });
      }
      // 2. Discard rows with no lead at all and no email
      const discardIds = auto
        .filter((c) => c.reason === "missing_email" && !c.row.lead_id)
        .map((c) => c.row.id);
      if (discardIds.length) {
        await supabase.from("scheduled_emails")
          .update({ status: "cancelled", error: "auto-discarded: no lead, no email", blocking_reason: "lead_deleted", blocked_at: new Date().toISOString() })
          .in("id", discardIds);
      }
      // 3. Persist blocking_reason for unresolved-vars so they show up on subsequent loads
      const tagIds = auto
        .filter((c) => c.reason === "unresolved_template_var")
        .map((c) => c.row.id);
      if (tagIds.length) {
        await supabase.from("scheduled_emails")
          .update({ blocking_reason: "unresolved_template_var", blocked_at: new Date().toISOString() })
          .in("id", tagIds);
      }
      return { enriched: enrichLeadIds.length, discarded: discardIds.length, tagged: tagIds.length };
    },
    onSuccess: (r) => {
      toast.success(`Auto-resolve: enriched ${r.enriched}, discarded ${r.discarded}, tagged ${r.tagged}`);
      refetchAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <PendingMailsHealthBanner
          counts={reasonCounts}
          onResolveAll={() => resolveAll.mutate()}
          resolving={resolveAll.isPending}
        />

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Pending Mails</CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={refetchAll}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={bucket} onValueChange={(v) => { setBucket(v as PendingBucket); setSelected(new Set()); }}>
              <TabsList className="mb-3 flex-wrap h-auto">
                {(Object.keys(BUCKET_META) as PendingBucket[]).map((b) => {
                  const Icon = BUCKET_META[b].icon;
                  return (
                    <TabsTrigger key={b} value={b} className="gap-1.5">
                      <Icon className={`h-3.5 w-3.5 ${BUCKET_META[b].tone}`} />
                      {BUCKET_META[b].label}
                      <Badge variant="secondary" className="ml-1 tabular-nums">
                        {bucketCounts[b]}
                      </Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <BulkActionsBar
                selectedCount={selected.size}
                onEnrich={() => {
                  const leadIds = Array.from(new Set(
                    selectedRows().map((c) => c.row.lead_id).filter(Boolean) as string[],
                  ));
                  if (!leadIds.length) return toast.error("No selected rows have a lead to enrich");
                  enrichNow.mutate(leadIds);
                }}
                onReschedule={() => setReschedOpen(true)}
                onDiscard={() => {
                  if (!confirm(`Discard ${selected.size} pending mail(s)?`)) return;
                  discard.mutate(Array.from(selected));
                }}
                busy={enrichNow.isPending || discard.isPending}
              />

              {(Object.keys(BUCKET_META) as PendingBucket[]).map((b) => (
                <TabsContent key={b} value={b}>
                  <PendingTable
                    rows={visible}
                    selected={selected}
                    allSelected={allSelected}
                    onToggleAll={toggleAll}
                    onToggleOne={toggleOne}
                    loading={rowsQ.isLoading || ctxQ.isLoading}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={reschedOpen} onOpenChange={setReschedOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reschedule {selected.size} mail{selected.size === 1 ? "" : "s"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">New send time</label>
              <Input
                type="datetime-local"
                value={reschedAt}
                onChange={(e) => setReschedAt(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReschedOpen(false)}>Cancel</Button>
              <Button
                onClick={() => reschedule.mutate({ ids: Array.from(selected), at: reschedAt })}
                disabled={reschedule.isPending}
              >
                {reschedule.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5 mr-1.5" />}
                Reschedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function BulkActionsBar({
  selectedCount, onEnrich, onReschedule, onDiscard, busy,
}: {
  selectedCount: number;
  onEnrich: () => void;
  onReschedule: () => void;
  onDiscard: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md border bg-muted/30">
      <span className="text-xs text-muted-foreground mr-1">
        {selectedCount} selected
      </span>
      <Button size="sm" variant="outline" onClick={onEnrich} disabled={!selectedCount || busy}>
        <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Enrich now
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="outline" disabled>
              <UserCog className="h-3.5 w-3.5 mr-1.5" /> Reassign sender
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Single mailbox configured. Change in Settings → Email.</TooltipContent>
      </Tooltip>
      <Button size="sm" variant="outline" onClick={onReschedule} disabled={!selectedCount || busy}>
        <CalendarClock className="h-3.5 w-3.5 mr-1.5" /> Reschedule
      </Button>
      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"
        onClick={onDiscard} disabled={!selectedCount || busy}>
        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Discard
      </Button>
    </div>
  );
}

function PendingTable({
  rows, selected, allSelected, onToggleAll, onToggleOne, loading,
}: {
  rows: { row: PendingMailRow; bucket: PendingBucket; reason: string; detail?: string }[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-md border max-h-[600px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="w-8">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
            </TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Send at</TableHead>
            <TableHead>Blocking reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.row.id} data-state={selected.has(c.row.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={selected.has(c.row.id)}
                  onCheckedChange={() => onToggleOne(c.row.id)}
                />
              </TableCell>
              <TableCell className="text-xs">{c.row.to_email ?? <span className="text-muted-foreground italic">none</span>}</TableCell>
              <TableCell className="text-xs max-w-[360px] truncate">{c.row.subject}</TableCell>
              <TableCell className="text-xs">
                {c.row.send_at ? new Date(c.row.send_at).toLocaleString() : "—"}
              </TableCell>
              <TableCell>
                {c.reason === "none" ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <div>
                    <Badge variant="outline" className="text-[10px]">{REASON_LABEL[c.reason as keyof typeof REASON_LABEL] ?? c.reason}</Badge>
                    {c.detail && (
                      <div className="text-[10px] text-destructive mt-0.5 truncate max-w-[260px]" title={c.detail}>
                        {c.detail}
                      </div>
                    )}
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                {loading ? "Loading…" : "Nothing here. Good."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}