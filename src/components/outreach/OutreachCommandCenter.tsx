import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Mail, MessageCircle, Send, Plus, Loader2, Info, RotateCcw, Trash2 } from "lucide-react";
import { EmailQueueStatusPanel } from "./EmailQueueStatusPanel";

function todayIso() { return new Date().toISOString().slice(0, 10); }

export function OutreachCommandCenter({ onJump }: { onJump: (tab: string) => void }) {
  const qc = useQueryClient();

  const stats = useQuery({
    queryKey: ["cmd-center-stats"],
    queryFn: async () => {
      const today = todayIso();
      const [emailPending, emailSentToday, waToday, waSentToday] = await Promise.all([
        supabase.from("scheduled_emails").select("*", { head: true, count: "exact" })
          .eq("status", "pending").eq("template_name", "voynova_demand_outreach"),
        supabase.from("scheduled_emails").select("*", { head: true, count: "exact" })
          .eq("status", "sent").gte("sent_at", `${today}T00:00:00Z`),
        supabase.from("whatsapp_outreach").select("*", { head: true, count: "exact" })
          .eq("queue_date", today),
        supabase.from("whatsapp_outreach").select("*", { head: true, count: "exact" })
          .eq("queue_date", today).eq("status", "sent"),
      ]);
      return {
        emailPending: emailPending.count ?? 0,
        emailSentToday: emailSentToday.count ?? 0,
        waToday: waToday.count ?? 0,
        waSentToday: waSentToday.count ?? 0,
      };
    },
    refetchInterval: 10_000,
  });

  const queueEmails = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("queue-demand-lead-outreach", { body: {} });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d) => { toast.success(`Queued ${d?.queued ?? 0} demand emails`); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e?.message ?? "Queue failed"),
  });

  const sendNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("process-scheduled-emails", { body: {} });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d) => { toast.success(`Processed: ${d?.sent ?? d?.processed ?? "ok"}`); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e?.message ?? "Send failed"),
  });

  const todayStart = `${todayIso()}T00:00:00Z`;

  const retryFailed = useMutation({
    mutationFn: async () => {
      const { data: em, error: e1 } = await supabase
        .from("scheduled_emails")
        .update({ status: "pending", attempts: 0, error: null, send_at: new Date().toISOString() })
        .eq("status", "failed")
        .gte("updated_at", todayStart)
        .select("id");
      if (e1) throw e1;
      const { data: wa, error: e2 } = await (supabase as any)
        .from("whatsapp_outreach")
        .update({ status: "pending", error: null })
        .eq("status", "failed")
        .eq("queue_date", todayIso())
        .select("id");
      if (e2 && e2.code !== "42P01") throw e2;
      return { emails: em?.length ?? 0, wa: wa?.length ?? 0 };
    },
    onSuccess: (d) => {
      toast.success(`Retrying ${d.emails} emails + ${d.wa} WhatsApp`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });

  const clearToday = useMutation({
    mutationFn: async () => {
      if (!confirm("Cancel ALL pending demand emails and WhatsApp queued today? This cannot be undone.")) {
        throw new Error("cancelled");
      }
      const { data: em, error: e1 } = await supabase
        .from("scheduled_emails")
        .update({ status: "cancelled", error: "cleared by user" })
        .eq("status", "pending")
        .eq("template_name", "voynova_demand_outreach")
        .gte("created_at", todayStart)
        .select("id");
      if (e1) throw e1;
      const { data: wa, error: e2 } = await (supabase as any)
        .from("whatsapp_outreach")
        .update({ status: "cancelled" })
        .eq("status", "pending")
        .eq("queue_date", todayIso())
        .select("id");
      if (e2 && e2.code !== "42P01") throw e2;
      return { emails: em?.length ?? 0, wa: wa?.length ?? 0 };
    },
    onSuccess: (d) => {
      toast.success(`Cleared ${d.emails} emails + ${d.wa} WhatsApp from today`);
      qc.invalidateQueries();
    },
    onError: (e: any) => { if (e?.message !== "cancelled") toast.error(e?.message ?? "Clear failed"); },
  });

  const s = stats.data;

  return (
    <TooltipProvider>
      <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-emerald-500/5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Outreach Control Center</h2>
            <p className="text-sm text-muted-foreground">Three buttons. Everything you need in one place.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 1. Queue today's emails */}
          <div className="rounded-lg border bg-background p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <div className="font-medium">1. Queue demand emails</div>
            </div>
            <div className="text-xs text-muted-foreground flex-1 space-y-1">
              <p>Scans all leads from Local Hiring and adds new, personalised cold emails to the queue.</p>
              <p>Skips duplicates, suppressed emails, and anyone already queued.</p>
            </div>
            <div className="text-2xl font-semibold">
              {s?.emailPending ?? "—"} <span className="text-xs text-muted-foreground font-normal">pending</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => queueEmails.mutate()} disabled={queueEmails.isPending}>
                  {queueEmails.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Queue now
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">What happens when I click this?</p>
                <p>The backend looks at every lead in Local Hiring, skips anyone who already got an email or is on the suppression list, and adds up to 200 fresh personalised emails to the pending queue.</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Press once. The number above will go up. If it says 0, everyone is already queued.</span>
            </div>
          </div>

          {/* 2. Send queue right now */}
          <div className="rounded-lg border bg-background p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              <div className="font-medium">2. Flush queue NOW</div>
            </div>
            <div className="text-xs text-muted-foreground flex-1 space-y-1">
              <p>Instantly sends every pending email that is inside its allowed send window and under the daily cap.</p>
              <p>Emails scheduled for the future stay in the queue and are not sent yet.</p>
            </div>
            <div className="text-2xl font-semibold">
              {s?.emailSentToday ?? "—"} <span className="text-xs text-muted-foreground font-normal">sent today</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="default" onClick={() => sendNow.mutate()} disabled={sendNow.isPending}>
                  {sendNow.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send now
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">What happens when I click this?</p>
                <p>All pending emails that are ready (inside the send window and under the daily limit) are sent immediately. Future-scheduled emails are left alone.</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Press once and wait for the toast. If nothing sends, check the status panel below.</span>
            </div>
          </div>

          {/* 3. WhatsApp dashboard */}
          <div className="rounded-lg border bg-background p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              <div className="font-medium">3. WhatsApp outreach</div>
            </div>
            <div className="text-xs text-muted-foreground flex-1 space-y-1">
              <p>Opens the WhatsApp queue so you can message leads one by one.</p>
              <p>Each row has a green button that launches WhatsApp Web with the message already filled in.</p>
            </div>
            <div className="text-2xl font-semibold">
              {s?.waSentToday ?? 0}/{s?.waToday ?? 0}{" "}
              <span className="text-xs text-muted-foreground font-normal">sent today</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => onJump("whatsapp")}>
                  <MessageCircle className="h-4 w-4 mr-2" /> Open WhatsApp queue
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">What happens when I click this?</p>
                <p>You are taken to the WhatsApp tab where you see a table of leads. Click the green WhatsApp icon on any row to open WhatsApp Web with that lead&apos;s prefilled message.</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Click here, then use the green icons in the table to message each lead individually.</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <EmailQueueStatusPanel />
        </div>

        <div className="mt-3 rounded-lg border border-dashed bg-background/60 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Stuck?</span> One-click recovery for today's queues.
            </div>
            <div className="flex flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={() => retryFailed.mutate()} disabled={retryFailed.isPending}>
                    {retryFailed.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-2" />}
                    Retry failed
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  Resets every email and WhatsApp message that failed today back to pending so the next send pass tries them again.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => clearToday.mutate()} disabled={clearToday.isPending}>
                    {clearToday.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-2" />}
                    Clear today's queue
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  Cancels every pending demand email and WhatsApp message queued today. Already-sent messages are not affected. Use this when something looks stuck and you want a clean slate.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}