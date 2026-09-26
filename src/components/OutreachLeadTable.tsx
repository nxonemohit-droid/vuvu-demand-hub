import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, MessageCircle, RotateCcw, X, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SendPreviewSheet } from "@/components/SendPreviewSheet";
import {
  PAGE_SIZE,
  fmtDate,
  friendlyError,
  pdfLabel,
  useAudienceCountries,
  useOutreachLeads,
  type Audience,
  type Channel,
  type OutreachLead,
  type SendRow,
  type StatusFilter,
} from "@/hooks/use-outreach";

type Props = { kind: Audience; initialStatus?: StatusFilter; initialChannel?: Channel | "any" };

const digits = (v: string) => v.replace(/[^\d]/g, "");

const waText = (lead: OutreachLead) => {
  const who = lead.contact_name?.split(" ")[0] ?? lead.company;
  return (
    lead.draft_whatsapp ??
    `Hello ${who}, this is Mohit from Voynova Global Solutions. We work on international workforce mobility between South Asia and Europe. Would you be open to a short conversation this week? More about us: https://voynovaglobal.com`
  );
};

const StatusCell = ({ send, onView }: { send?: SendRow; onView: () => void }) => {
  if (!send) return <span className="text-xs text-muted-foreground">Nahi bheja</span>;
  const label = send.status === "sent" ? "Bheja" : send.status === "pending" ? "Queue me" : send.status === "failed" ? "Fail" : "Chhoda";
  return (
    <button type="button" onClick={onView} className="text-left">
      <Badge variant={send.status === "sent" ? "default" : send.status === "failed" ? "destructive" : "secondary"}>{label}</Badge>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {send.status === "sent" ? fmtDate(send.sent_at) : send.status === "pending" ? fmtDate(send.scheduled_for) : ""}
      </div>
      {send.status === "failed" && <div className="max-w-48 truncate text-[11px] text-destructive">{friendlyError(send.error)}</div>}
    </button>
  );
};

/** Full lead list for one audience with email + WhatsApp status and actions. */
export const OutreachLeadTable = ({ kind, initialStatus = "all", initialChannel = "any" }: Props) => {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [channel, setChannel] = useState<Channel | "any">(initialChannel);
  const [country, setCountry] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<{ lead: OutreachLead; send: SendRow } | null>(null);
  const [confirmLead, setConfirmLead] = useState<OutreachLead | null>(null);

  useEffect(() => {
    setStatus(initialStatus);
    setChannel(initialChannel);
    setPage(0);
  }, [initialStatus, initialChannel]);

  const { data, isLoading } = useOutreachLeads({ kind, status, channel, country, search, page });
  const { data: countries } = useAudienceCountries(kind);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["outreach-leads"] });
    qc.invalidateQueries({ queryKey: ["outreach-audience-stats"] });
  };

  const retry = async (send: SendRow) => {
    const { error } = await supabase
      .from("outreach_sends")
      .update({ status: "pending", attempts: 0, error: null, scheduled_for: new Date().toISOString() })
      .eq("id", send.id);
    if (error) return toast.error("Dobara queue nahi hua, phir try karo.");
    toast.success("Dobara queue me daal diya.");
    refresh();
  };

  const remove = async (send: SendRow) => {
    const { error } = await supabase.from("outreach_sends").update({ status: "skipped", error: "Manually skipped" }).eq("id", send.id);
    if (error) return toast.error("Queue se nahi hata, phir try karo.");
    toast.success("Queue se hata diya.");
    refresh();
  };

  const openWhatsapp = (lead: OutreachLead) => {
    const number = digits(lead.whatsapp ?? lead.phone ?? "");
    if (number.length < 8) return toast.error("Is lead ka number sahi nahi hai.");
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(waText(lead))}`, "_blank", "noopener");
    setConfirmLead(lead);
  };

  const confirmSent = async () => {
    const lead = confirmLead;
    if (!lead) return;
    setConfirmLead(null);
    const now = new Date().toISOString();
    const { error } = await supabase.from("outreach_sends").upsert(
      {
        lead_id: lead.id,
        channel: "whatsapp",
        to_address: digits(lead.whatsapp ?? lead.phone ?? ""),
        body: waText(lead),
        status: "sent",
        scheduled_for: now,
        sent_at: now,
        error: null,
      },
      { onConflict: "lead_id,channel" },
    );
    if (error) return toast.error("Record save nahi hua, dobara try karo.");
    await supabase.from("leads").update({ stage: "contacted" }).eq("id", lead.id).eq("stage", "new");
    toast.success(`${lead.company} — Contacted mark ho gaya.`);
    refresh();
  };

  const statuses: Array<{ v: StatusFilter; l: string }> = [
    { v: "all", l: "Sab" },
    { v: "sent", l: "Bheja" },
    { v: "pending", l: "Queue me" },
    { v: "failed", l: "Fail" },
    { v: "none", l: "Abhi kuch nahi" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {statuses.map((s) => (
          <Button key={s.v} size="sm" variant={status === s.v ? "default" : "outline"} onClick={() => { setStatus(s.v); setPage(0); }}>
            {s.l}
          </Button>
        ))}
        {status !== "all" && status !== "none" && (
          <Select value={channel} onValueChange={(v) => { setChannel(v as Channel | "any"); setPage(0); }}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Email + WhatsApp</SelectItem>
              <SelectItem value="email">Sirf Email</SelectItem>
              <SelectItem value="whatsapp">Sirf WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={country || "all"} onValueChange={(v) => { setCountry(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sab countries</SelectItem>
            {countries?.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          className="h-9 w-full sm:w-56"
          placeholder="Company search karo"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <Badge variant="secondary" className="ml-auto">{data?.total ?? 0} leads</Badge>
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : !data?.rows.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Is filter me koi lead nahi mili.</p>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-primary/10">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((lead, i) => {
                const email = lead.outreach_sends.find((s) => s.channel === "email");
                const wa = lead.outreach_sends.find((s) => s.channel === "whatsapp");
                const failed = [email, wa].find((s) => s?.status === "failed");
                const queued = [email, wa].find((s) => s?.status === "pending");
                return (
                  <TableRow key={lead.id} className={i % 2 ? "bg-muted/30" : ""}>
                    <TableCell className="min-w-48">
                      <p className="font-medium">{lead.company}</p>
                      <p className="text-xs text-muted-foreground">
                        {[lead.city, lead.country].filter(Boolean).join(", ")}
                        {lead.contact_name ? ` · ${lead.contact_name}` : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{lead.email ?? "no email"} · {lead.whatsapp ?? lead.phone ?? "no phone"}</p>
                      {lead.stage !== "new" && <Badge variant="outline" className="mt-1 capitalize">{lead.stage}</Badge>}
                    </TableCell>
                    <TableCell><StatusCell send={email} onView={() => email && setPreview({ lead, send: email })} /></TableCell>
                    <TableCell><StatusCell send={wa} onView={() => wa && setPreview({ lead, send: wa })} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{email ? pdfLabel(lead.kind, lead.country) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        {email && (
                          <Button size="sm" variant="outline" onClick={() => setPreview({ lead, send: email })}>
                            <Eye className="mr-1 h-4 w-4" />Mail dekho
                          </Button>
                        )}
                        {(lead.whatsapp || lead.phone) && (
                          <Button size="sm" onClick={() => openWhatsapp(lead)}>
                            <MessageCircle className="mr-1 h-4 w-4" />WhatsApp bhejo
                          </Button>
                        )}
                        {failed && (
                          <Button size="sm" variant="secondary" onClick={() => retry(failed)}>
                            <RotateCcw className="mr-1 h-4 w-4" />Dobara bhejo
                          </Button>
                        )}
                        {queued && (
                          <Button size="sm" variant="ghost" onClick={() => remove(queued)} title="Queue se hatao">
                            <X className="mr-1 h-4 w-4" />Queue se hatao
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 text-sm">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>Page {page + 1} / {totalPages}</span>
        <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <SendPreviewSheet lead={preview?.lead ?? null} send={preview?.send ?? null} onClose={() => setPreview(null)} />

      <AlertDialog open={!!confirmLead} onOpenChange={(o) => !o && setConfirmLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kya aapne WhatsApp me Send dabaya?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmLead?.company} ka chat khul gaya hai. Send karne ke baad "Haan" dabao — tabhi lead Contacted mark hogi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Nahi, abhi nahi</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSent}>Haan, Contacted karo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
