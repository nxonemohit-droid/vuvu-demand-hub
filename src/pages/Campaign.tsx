import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  MailCheck, Send, MousePointerClick, Eye, AlertTriangle, MessageCircle,
  CheckCircle2, Clock, Reply, Trophy,
} from "lucide-react";

type Lead = {
  id: string;
  agency_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  hq_country: string | null;
  operating_eu_country: string | null;
  trades: string[] | null;
  quality_score: number | null;
  email_status: string;
  email_sent_at: string | null;
  email_delivery_status: string | null;
  email_last_event: string | null;
  email_error: string | null;
  replied_at: string | null;
  converted_at: string | null;
  whatsapp_followup_at: string | null;
  whatsapp_status: string | null;
};

const STAT_CARDS: Array<{
  key: string;
  label: string;
  icon: typeof MailCheck;
  filter: (l: Lead) => boolean;
  tone: string;
}> = [
  { key: "sent", label: "Sent", icon: Send, tone: "text-foreground",
    filter: (l) => l.email_status === "sent" },
  { key: "delivered", label: "Delivered", icon: MailCheck, tone: "text-emerald-600",
    filter: (l) => ["delivered", "opened", "clicked"].includes(l.email_delivery_status ?? "") },
  { key: "opened", label: "Opened", icon: Eye, tone: "text-blue-600",
    filter: (l) => ["opened", "clicked"].includes(l.email_delivery_status ?? "") },
  { key: "clicked", label: "Clicked", icon: MousePointerClick, tone: "text-violet-600",
    filter: (l) => l.email_delivery_status === "clicked" },
  { key: "bounced", label: "Bounced / Failed", icon: AlertTriangle, tone: "text-destructive",
    filter: (l) => ["bounced", "failed", "complained"].includes(l.email_delivery_status ?? "") },
  { key: "replied", label: "Replied", icon: Reply, tone: "text-amber-600",
    filter: (l) => !!l.replied_at },
  { key: "converted", label: "Converted", icon: Trophy, tone: "text-primary",
    filter: (l) => !!l.converted_at },
];

const buildWhatsappText = (l: Lead) => {
  const first = (l.contact_name ?? "").split(" ")[0] || "there";
  const trade = (l.trades ?? [])[0] ?? "your placements";
  const eu = l.operating_eu_country ?? "Europe";
  return (
    `Hi ${first}, this is Mohit from Voynova Global Solutions. ` +
    `I emailed you earlier about a partnership for ${trade} placements into ${eu}. ` +
    `We have live EU employer orders ready and are looking for a sourcing partner like ${l.agency_name}. ` +
    `Would a 20-minute call this week work? — mohit@voynovaglobal.com`
  );
};

const waLink = (phone: string, text: string) => {
  const clean = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB") : "—";

const Campaign = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recruiter_leads")
      .select(
        "id,agency_name,contact_name,contact_email,contact_phone,hq_country,operating_eu_country,trades,quality_score,email_status,email_sent_at,email_delivery_status,email_last_event,email_error,replied_at,converted_at,whatsapp_followup_at,whatsapp_status",
      )
      .eq("status", "active")
      .order("email_sent_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) toast.error(error.message);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("campaign-leads")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "recruiter_leads" },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sentLeads = useMemo(() => leads.filter((l) => l.email_status === "sent"), [leads]);
  const pendingLeads = useMemo(
    () => leads.filter((l) => l.email_status !== "sent" && !!l.contact_email),
    [leads],
  );

  const stats = useMemo(() => {
    const s: Record<string, number> = {};
    for (const c of STAT_CARDS) s[c.key] = sentLeads.filter(c.filter).length;
    return s;
  }, [sentLeads]);

  const filteredSent = useMemo(() => {
    let rows = sentLeads;
    if (activeFilter) {
      const card = STAT_CARDS.find((c) => c.key === activeFilter);
      if (card) rows = rows.filter(card.filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((l) =>
        [l.agency_name, l.contact_name, l.contact_email, l.hq_country, l.operating_eu_country]
          .filter(Boolean).some((x) => (x as string).toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [sentLeads, activeFilter, search]);

  const filteredPending = useMemo(() => {
    if (!search.trim()) return pendingLeads;
    const q = search.toLowerCase();
    return pendingLeads.filter((l) =>
      [l.agency_name, l.contact_name, l.contact_email, l.hq_country]
        .filter(Boolean).some((x) => (x as string).toLowerCase().includes(q)),
    );
  }, [pendingLeads, search]);

  const markReplied = async (l: Lead) => {
    const { error } = await supabase.from("recruiter_leads")
      .update({ replied_at: l.replied_at ? null : new Date().toISOString() })
      .eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(l.replied_at ? "Reply unmarked" : "Marked as replied");
  };

  const markConverted = async (l: Lead) => {
    const { error } = await supabase.from("recruiter_leads")
      .update({ converted_at: l.converted_at ? null : new Date().toISOString() })
      .eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(l.converted_at ? "Conversion unmarked" : "Marked as converted");
  };

  const sendWhatsapp = async (l: Lead) => {
    if (!l.contact_phone) return toast.error("No phone number on file");
    const text = buildWhatsappText(l);
    window.open(waLink(l.contact_phone, text), "_blank", "noopener");
    const nowIso = new Date().toISOString();
    await supabase.from("recruiter_leads")
      .update({ whatsapp_followup_at: nowIso, whatsapp_status: "queued" })
      .eq("id", l.id);
    await supabase.from("lead_outreach_log").insert({
      lead_id: l.id, channel: "whatsapp",
      note: `[whatsapp] ${text.slice(0, 280)}`,
    });
    toast.success("WhatsApp opened — message prefilled");
  };

  const replyRate = sentLeads.length
    ? Math.round((stats.replied / sentLeads.length) * 100) : 0;
  const conversionRate = sentLeads.length
    ? Math.round((stats.converted / sentLeads.length) * 100) : 0;

  const funnel = useMemo(() => {
    const discovered = leads.length;
    const sent = sentLeads.length;
    const replied = sentLeads.filter((l) => !!l.replied_at).length;
    const converted = sentLeads.filter((l) => !!l.converted_at).length;
    const max = Math.max(discovered, 1);
    const stage = (label: string, value: number, prev: number, tone: string) => ({
      label,
      value,
      pct: Math.round((value / max) * 100),
      conv: prev ? Math.round((value / prev) * 100) : 0,
      tone,
    });
    return [
      stage("Discovered", discovered, discovered, "bg-slate-500"),
      stage("Sent", sent, discovered, "bg-blue-500"),
      stage("Replied", replied, sent, "bg-amber-500"),
      stage("Converted", converted, replied || sent, "bg-emerald-600"),
    ];
  }, [leads, sentLeads]);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach Campaign</h1>
          <p className="text-sm text-muted-foreground">
            Performance of recruiter outreach. Click any stat to filter the table below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Reply rate</div>
            <div className="text-lg font-semibold">{replyRate}%</div>
          </div>
          <div className="text-right pl-4 border-l">
            <div className="text-xs text-muted-foreground">Conversion rate</div>
            <div className="text-lg font-semibold">{conversionRate}%</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {STAT_CARDS.map((c) => {
          const Icon = c.icon;
          const active = activeFilter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setActiveFilter(active ? null : c.key)}
              className={`text-left rounded-xl border bg-card p-4 transition hover:shadow-sm ${
                active ? "ring-2 ring-primary border-primary" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </span>
                <Icon className={`h-4 w-4 ${c.tone}`} />
              </div>
              <div className="mt-2 text-2xl font-semibold">{stats[c.key] ?? 0}</div>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Campaign details</CardTitle>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : `${sentLeads.length} sent · ${pendingLeads.length} pending contact`}
            </p>
          </div>
          <Input
            placeholder="Search agency, contact, country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sent">
            <TabsList>
              <TabsTrigger value="sent">Sent ({filteredSent.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending contact ({filteredPending.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="sent" className="mt-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agency</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Reply / Conv.</TableHead>
                      <TableHead className="text-right">Follow up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSent.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="font-medium">{l.agency_name}</div>
                          <div className="text-xs text-muted-foreground">
                            Quality {l.quality_score ?? 0}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{l.contact_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{l.contact_email}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {l.hq_country ?? "—"}
                          <div className="text-xs text-muted-foreground">
                            → {l.operating_eu_country ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(l.email_sent_at)}</TableCell>
                        <TableCell>
                          <DeliveryBadge lead={l} />
                          {l.email_error && (
                            <div className="text-xs text-destructive mt-1 max-w-[180px] truncate">
                              {l.email_error}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={l.replied_at ? "default" : "outline"}
                              className="w-fit cursor-pointer"
                              onClick={() => markReplied(l)}
                            >
                              <Reply className="h-3 w-3 mr-1" />
                              {l.replied_at ? `Replied ${fmtDate(l.replied_at)}` : "Mark replied"}
                            </Badge>
                            <Badge
                              variant={l.converted_at ? "default" : "outline"}
                              className="w-fit cursor-pointer"
                              onClick={() => markConverted(l)}
                            >
                              <Trophy className="h-3 w-3 mr-1" />
                              {l.converted_at ? `Won ${fmtDate(l.converted_at)}` : "Mark converted"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={l.whatsapp_followup_at ? "secondary" : "default"}
                            disabled={!l.contact_phone}
                            onClick={() => sendWhatsapp(l)}
                            title={l.contact_phone ? "Open WhatsApp with prefilled message" : "No phone number"}
                          >
                            <MessageCircle className="h-3.5 w-3.5 mr-1" />
                            {l.whatsapp_followup_at ? "WA again" : "WhatsApp"}
                          </Button>
                          {l.whatsapp_followup_at && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                              last {fmtDate(l.whatsapp_followup_at)}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredSent.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                          {loading ? "Loading…" : "No matching sent emails"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="pending" className="mt-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agency</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>HQ</TableHead>
                      <TableHead>EU focus</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPending.slice(0, 200).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.agency_name}</TableCell>
                        <TableCell>
                          <div className="text-sm">{l.contact_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{l.contact_email}</div>
                        </TableCell>
                        <TableCell className="text-sm">{l.hq_country ?? "—"}</TableCell>
                        <TableCell className="text-sm">{l.operating_eu_country ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{l.quality_score ?? 0}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <a href={`/recruiters?focus=${l.id}`}>
                              <Clock className="h-3.5 w-3.5 mr-1" /> Open
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPending.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                          Everyone with a valid email has been contacted.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {filteredPending.length > 200 && (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    Showing first 200 of {filteredPending.length}.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

const DeliveryBadge = ({ lead }: { lead: Lead }) => {
  const s = lead.email_delivery_status ?? lead.email_status;
  const map: Record<string, { label: string; cls: string; Icon: typeof MailCheck }> = {
    sent: { label: "Sent", cls: "bg-muted text-foreground", Icon: Send },
    delivered: { label: "Delivered", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", Icon: MailCheck },
    opened: { label: "Opened", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200", Icon: Eye },
    clicked: { label: "Clicked", cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200", Icon: MousePointerClick },
    bounced: { label: "Bounced", cls: "bg-destructive/15 text-destructive", Icon: AlertTriangle },
    failed: { label: "Failed", cls: "bg-destructive/15 text-destructive", Icon: AlertTriangle },
    complained: { label: "Complained", cls: "bg-destructive/15 text-destructive", Icon: AlertTriangle },
  };
  const m = map[s] ?? { label: s ?? "Unknown", cls: "bg-muted", Icon: CheckCircle2 };
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
};

export default Campaign;