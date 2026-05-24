import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Mail, MessageCircle, Users, Send, Clock, CheckCircle2, XCircle, Ban, ArrowRight } from "lucide-react";

const todayIso = () => new Date().toISOString().slice(0, 10);
const startOfTodayIso = () => `${todayIso()}T00:00:00Z`;

async function headCount(q: any): Promise<number> {
  const { count } = await q;
  return count ?? 0;
}

export function OutreachOverview() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dashboard-outreach-overview"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const today = todayIso();
      const todayStart = startOfTodayIso();
      const tmpl = "voynova_demand_outreach";

      const [
        leadsTotal,
        leadsWithEmail,
        leadsWithPhone,
        leadsQueued,
        emailPendingTotal,
        emailSentTotal,
        emailFailedTotal,
        emailCancelledTotal,
        emailSentToday,
        emailFailedToday,
        emailPendingToday,
        waTotalAll,
        waSentTotal,
        waPendingTotal,
        waFailedTotal,
        waToday,
        waSentToday,
        waPendingToday,
        waFailedToday,
      ] = await Promise.all([
        headCount(supabase.from("demand_leads").select("id", { head: true, count: "exact" })),
        headCount(supabase.from("demand_leads").select("id", { head: true, count: "exact" }).not("contact_email", "is", null).neq("contact_email", "")),
        headCount(supabase.from("demand_leads").select("id", { head: true, count: "exact" }).not("contact_phone", "is", null).neq("contact_phone", "")),
        headCount(supabase.from("demand_leads").select("id", { head: true, count: "exact" }).eq("outreach_queued", true)),
        headCount(supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "pending").eq("template_name", tmpl)),
        headCount(supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "sent").eq("template_name", tmpl)),
        headCount(supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "failed").eq("template_name", tmpl)),
        headCount(supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "cancelled").eq("template_name", tmpl)),
        headCount(supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "sent").eq("template_name", tmpl).gte("sent_at", todayStart)),
        headCount(supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "failed").eq("template_name", tmpl).gte("updated_at", todayStart)),
        headCount(supabase.from("scheduled_emails").select("id", { head: true, count: "exact" }).eq("status", "pending").eq("template_name", tmpl).gte("send_at", todayStart).lt("send_at", `${today}T23:59:59Z`)),
        headCount((supabase as any).from("whatsapp_outreach").select("id", { head: true, count: "exact" })),
        headCount((supabase as any).from("whatsapp_outreach").select("id", { head: true, count: "exact" }).eq("status", "sent")),
        headCount((supabase as any).from("whatsapp_outreach").select("id", { head: true, count: "exact" }).eq("status", "pending")),
        headCount((supabase as any).from("whatsapp_outreach").select("id", { head: true, count: "exact" }).eq("status", "failed")),
        headCount((supabase as any).from("whatsapp_outreach").select("id", { head: true, count: "exact" }).eq("queue_date", today)),
        headCount((supabase as any).from("whatsapp_outreach").select("id", { head: true, count: "exact" }).eq("queue_date", today).eq("status", "sent")),
        headCount((supabase as any).from("whatsapp_outreach").select("id", { head: true, count: "exact" }).eq("queue_date", today).eq("status", "pending")),
        headCount((supabase as any).from("whatsapp_outreach").select("id", { head: true, count: "exact" }).eq("queue_date", today).eq("status", "failed")),
      ]);

      return {
        leadsTotal, leadsWithEmail, leadsWithPhone, leadsQueued,
        email: {
          pending: emailPendingTotal, sent: emailSentTotal, failed: emailFailedTotal, cancelled: emailCancelledTotal,
          sentToday: emailSentToday, failedToday: emailFailedToday, pendingToday: emailPendingToday,
          coverage: leadsWithEmail ? Math.round(((emailSentTotal + emailPendingTotal) / leadsWithEmail) * 100) : 0,
          notQueued: Math.max(0, leadsWithEmail - emailSentTotal - emailPendingTotal),
        },
        wa: {
          total: waTotalAll, sent: waSentTotal, pending: waPendingTotal, failed: waFailedTotal,
          today: waToday, sentToday: waSentToday, pendingToday: waPendingToday, failedToday: waFailedToday,
          coverage: leadsWithPhone ? Math.round(((waSentTotal + waPendingTotal) / leadsWithPhone) * 100) : 0,
          notQueued: Math.max(0, leadsWithPhone - waSentTotal - waPendingTotal),
        },
      };
    },
  });

  const d = data;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Outreach overview</h2>
          <p className="text-xs text-muted-foreground">Live snapshot of email + WhatsApp delivery across every lead.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>Refresh</Button>
      </div>

      {/* Lead coverage */}
      <Card className="p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Lead coverage</h3>
          {isLoading && <Badge variant="outline" className="ml-auto">loading…</Badge>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total leads" value={d?.leadsTotal} />
          <Stat label="With email" value={d?.leadsWithEmail} hint={d ? `${pct(d.leadsWithEmail, d.leadsTotal)}% of leads` : "—"} />
          <Stat label="With phone" value={d?.leadsWithPhone} hint={d ? `${pct(d.leadsWithPhone, d.leadsTotal)}% of leads` : "—"} />
          <Stat label="Already queued" value={d?.leadsQueued} hint="outreach_queued=true" />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Email */}
        <Card className="p-5 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Email outreach</h3>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/mail">Open mail <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Sent (all time)" value={d?.email.sent} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} />
            <Stat label="Pending" value={d?.email.pending} icon={<Clock className="h-3.5 w-3.5 text-amber-600" />} />
            <Stat label="Failed" value={d?.email.failed} icon={<XCircle className="h-3.5 w-3.5 text-destructive" />} />
            <Stat label="Cancelled" value={d?.email.cancelled} icon={<Ban className="h-3.5 w-3.5 text-muted-foreground" />} />
          </div>

          <div className="mt-4 rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <MiniStat label="Sent" value={d?.email.sentToday} tone="emerald" />
              <MiniStat label="Scheduled" value={d?.email.pendingToday} tone="amber" />
              <MiniStat label="Failed" value={d?.email.failedToday} tone="destructive" />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Email coverage of leads-with-email</span>
              <span className="font-medium">{d?.email.coverage ?? 0}%</span>
            </div>
            <Progress value={d?.email.coverage ?? 0} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1">
              {d?.email.notQueued ?? 0} emailable leads still not queued.
            </p>
          </div>
        </Card>

        {/* WhatsApp */}
        <Card className="p-5 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-green-600" />
              <h3 className="font-semibold">WhatsApp outreach</h3>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/mail?tab=whatsapp">Open queue <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Sent (all time)" value={d?.wa.sent} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} />
            <Stat label="Pending" value={d?.wa.pending} icon={<Clock className="h-3.5 w-3.5 text-amber-600" />} />
            <Stat label="Failed" value={d?.wa.failed} icon={<XCircle className="h-3.5 w-3.5 text-destructive" />} />
            <Stat label="In queue" value={d?.wa.total} icon={<Send className="h-3.5 w-3.5 text-muted-foreground" />} />
          </div>

          <div className="mt-4 rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <MiniStat label="Sent" value={d?.wa.sentToday} tone="emerald" />
              <MiniStat label="Pending" value={d?.wa.pendingToday} tone="amber" />
              <MiniStat label="Failed" value={d?.wa.failedToday} tone="destructive" />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">WhatsApp coverage of leads-with-phone</span>
              <span className="font-medium">{d?.wa.coverage ?? 0}%</span>
            </div>
            <Progress value={d?.wa.coverage ?? 0} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1">
              {d?.wa.notQueued ?? 0} phone-reachable leads still not queued.
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function Stat({ label, value, hint, icon }: { label: string; value?: number; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value ?? "—"}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value?: number; tone: "emerald" | "amber" | "destructive" }) {
  const color =
    tone === "emerald" ? "text-emerald-600" :
    tone === "amber" ? "text-amber-600" :
    "text-destructive";
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value ?? "—"}</div>
    </div>
  );
}