import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, MessageCircle, Play, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/PageHeader";


const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const Outreach = () => {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["outreach-stats"],
    queryFn: async () => {
      const get = async (filter: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
        const { count } = await filter(base());
        return count ?? 0;
      };
      const base = () => supabase.from("outreach_sends").select("id", { count: "exact", head: true });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [pending, sent, failed, sentToday] = await Promise.all([
        get((q) => q.eq("status", "pending")),
        get((q) => q.eq("status", "sent")),
        get((q) => q.eq("status", "failed")),
        get((q) => q.eq("status", "sent").gte("sent_at", today.toISOString())),
      ]);
      return { pending, sent, failed, sentToday };
    },
    refetchInterval: 5000,
  });

  const { data: queue, isLoading } = useQuery({
    queryKey: ["outreach-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sends")
        .select("*, leads(company, country, contact_name)")
        .order("scheduled_for", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 6000,
  });

  const { data: ready } = useQuery({
    queryKey: ["outreach-ready"],
    queryFn: async () => {
      const email = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("email", "is", null)
        .neq("stage", "rejected");
      const wa = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("phone", "is", null)
        .neq("stage", "rejected");
      return { email: email.count ?? 0, whatsapp: wa.count ?? 0 };
    },
    refetchInterval: 8000,
  });

  const run = async (name: string, body: Record<string, unknown>, label: string) => {
    setBusy(label);
    const { data, error } = await supabase.functions.invoke(name, { body });
    setBusy(null);
    if (error) {
      toast.error("Kaam pura nahi hua, dobara try karo.");
      return;
    }
    qc.invalidateQueries();
    return data;
  };

  const schedule = async (channels: string[]) => {
    const data = await run("schedule-outreach", { channels }, channels.join("+"));
    if (!data) return;
    const added = (data.email ?? 0) + (data.whatsapp ?? 0);
    toast.success(
      added
        ? `${added} message queue me add hue. Pehla: ${fmt(data.first_send)}`
        : "Naya kuch add nahi hua — sab already queued hain.",
    );
  };

  /** One click: queue every lead with an email and start sending the due ones. */
  const autoCampaign = async () => {
    setBusy("auto");
    const { data: sched, error } = await supabase.functions.invoke("schedule-outreach", {
      body: { channels: ["email"] },
    });
    if (error) {
      setBusy(null);
      toast.error("Campaign shuru nahi hui, dobara try karo.");
      return;
    }
    const { data: sent } = await supabase.functions.invoke("process-outreach", { body: {} });
    setBusy(null);
    qc.invalidateQueries();
    toast.success(
      `${sched?.email ?? 0} emails queue me, ${sent?.sent ?? 0} abhi bhej diye. Baaki apne aap jayenge.`,
    );
  };

  const flush = async () => {
    const data = await run("process-outreach", {}, "flush");
    if (!data) return;
    toast.success(`${data.sent} bheje, ${data.failed} fail, ${data.paused} rukay hue.`);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <PageHeader
        step={2}
        title="Outreach"
        description="Email aur WhatsApp — 50 per din, har message ke beech gap, Mon–Fri 9:00–18:00 IST."
      />


      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Waiting" value={stats?.pending} />
        <Stat label="Sent today" value={stats?.sentToday} />
        <Stat label="Sent total" value={stats?.sent} />
        <Stat label="Failed" value={stats?.failed} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start outreach</CardTitle>
          <CardDescription>
            Har lead ka message uske company, country aur sector ke hisaab se apne aap bharta hai.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => schedule(["email"])} disabled={busy !== null}>
            {busy === "email" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Queue emails ({ready?.email ?? 0})
          </Button>
          <Button onClick={() => schedule(["whatsapp"])} disabled={busy !== null} variant="secondary">
            {busy === "whatsapp" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
            Queue WhatsApp ({ready?.whatsapp ?? 0})
          </Button>
          <Button onClick={flush} disabled={busy !== null} variant="outline">
            {busy === "flush" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Send due messages now
          </Button>
        </CardContent>
      </Card>

      <Alert>
        <CalendarClock className="h-4 w-4" />
        <AlertTitle>WhatsApp automatic sending</AlertTitle>
        <AlertDescription>
          WhatsApp messages queue ho jate hain, par bhejna tab shuru hoga jab tera WhatsApp Business
          account jud jayega. Tab tak email poora chalta rahega.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !queue?.length ? (
            <p className="text-sm text-muted-foreground">Queue khali hai.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((row, i) => (
                    <TableRow key={row.id} className={i % 2 ? "bg-muted/40" : undefined}>
                      <TableCell className="font-medium">
                        {row.leads?.company ?? "—"}
                        <div className="text-xs text-muted-foreground">{row.leads?.country}</div>
                      </TableCell>
                      <TableCell className="capitalize">{row.channel}</TableCell>
                      <TableCell className="text-xs">{row.to_address}</TableCell>
                      <TableCell className="text-xs">{fmt(row.scheduled_for)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "sent" ? "default" : row.status === "failed" ? "destructive" : "secondary"
                          }
                        >
                          {row.status}
                        </Badge>
                        {row.error && (
                          <div className="text-[11px] text-destructive mt-1 max-w-64 truncate">{row.error}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value?: number }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold">{value ?? "—"}</div>
    </CardContent>
  </Card>
);

export default Outreach;
