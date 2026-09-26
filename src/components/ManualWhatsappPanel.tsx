import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MessageCircle, SkipForward, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Kind = "all" | "employer" | "education" | "supply";

type WaLead = {
  id: string;
  company: string | null;
  country: string | null;
  city: string | null;
  kind: string | null;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  draft_whatsapp: string | null;
  ai_score: number | null;
};

/** Keep only digits — wa.me needs a plain international number. */
const digits = (value: string) => value.replace(/[^\d]/g, "");

/** Fallback message when Gemini has not drafted a WhatsApp text yet. */
const defaultText = (lead: WaLead) => {
  const who = lead.contact_name ? lead.contact_name.split(" ")[0] : lead.company ?? "there";
  return `Hello ${who}, this is Mohit from Voynova Global Solutions. We work on international workforce mobility between South Asia and Europe. Would you be open to a short conversation this week? More about us: https://voynovaglobal.com`;
};

const kinds: Array<{ value: Kind; label: string }> = [
  { value: "all", label: "Sab" },
  { value: "employer", label: "Employers" },
  { value: "education", label: "Colleges" },
  { value: "supply", label: "Recruiters" },
];

/**
 * Manual, one-click WhatsApp outreach: opens WhatsApp with the message already
 * typed for that lead. Nothing is sent automatically — the user presses send in
 * WhatsApp itself, so there is no template approval or ban risk.
 */
export const ManualWhatsappPanel = () => {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("employer");
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: doneIds } = useQuery({
    queryKey: ["manual-wa-done"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sends")
        .select("lead_id")
        .eq("channel", "whatsapp")
        .in("status", ["sent", "skipped"])
        .limit(5000);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.lead_id));
    },
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ["manual-wa-leads", kind],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id, company, country, city, kind, contact_name, phone, whatsapp, draft_whatsapp, ai_score")
        .or("phone.not.is.null,whatsapp.not.is.null")
        .is("merged_into", null)
        .neq("stage", "rejected")
        .order("ai_score", { ascending: false, nullsFirst: false })
        .limit(200);
      if (kind !== "all") q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as WaLead[];
    },
  });

  const list = useMemo(
    () => (leads ?? []).filter((l) => !doneIds?.has(l.id)).slice(0, 40),
    [leads, doneIds],
  );

  const textFor = (lead: WaLead) => edited[lead.id] ?? lead.draft_whatsapp ?? defaultText(lead);

  const mark = async (lead: WaLead, status: "sent" | "skipped") => {
    const number = digits(lead.whatsapp ?? lead.phone ?? "");
    const now = new Date().toISOString();
    // One row per lead+channel (unique index), so upsert instead of insert —
    // a lead that already has a queued WhatsApp row gets it marked sent/skipped.
    const { error } = await supabase.from("outreach_sends").upsert(
      {
        lead_id: lead.id,
        channel: "whatsapp",
        to_address: number,
        body: textFor(lead),
        status,
        scheduled_for: now,
        sent_at: status === "sent" ? now : null,
        error: status === "skipped" ? "Manually skipped" : null,
      },
      { onConflict: "lead_id,channel" },
    );
    if (error) {
      toast.error("Record save nahi hua, dobara try karo.");
      return false;
    }
    if (status === "sent") {
      await supabase.from("leads").update({ stage: "contacted" }).eq("id", lead.id).eq("stage", "new");
    }
    qc.invalidateQueries({ queryKey: ["manual-wa-done"] });
    qc.invalidateQueries({ queryKey: ["outreach-stats"] });
    return true;
  };

  const send = async (lead: WaLead) => {
    const number = digits(lead.whatsapp ?? lead.phone ?? "");
    if (number.length < 8) {
      toast.error("Is lead ka number sahi nahi hai.");
      return;
    }
    // Open first so the browser treats it as a direct click (no popup block).
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(textFor(lead))}`, "_blank", "noopener");
    setBusy(lead.id);
    const ok = await mark(lead, "sent");
    setBusy(null);
    if (ok) toast.success(`${lead.company ?? "Lead"} — WhatsApp khul gaya, wahan Send dabao.`);
  };

  const skip = async (lead: WaLead) => {
    setBusy(lead.id);
    await mark(lead, "skipped");
    setBusy(null);
  };

  const copy = async (lead: WaLead) => {
    await navigator.clipboard.writeText(textFor(lead));
    toast.success("Message copy ho gaya.");
  };

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="border-b border-primary/10 bg-primary/5">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Manual WhatsApp — ek click me bhejo
        </CardTitle>
        <CardDescription>
          Button dabao, aapka WhatsApp message ke saath khul jayega, bas Send dabana hai. Koi
          automatic message nahi jata, isliye number par koi risk nahi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5 md:pt-6">
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Button
              key={k.value}
              size="sm"
              variant={kind === k.value ? "default" : "outline"}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </Button>
          ))}
          <Badge variant="secondary" className="ml-auto self-center">
            {list.length} baaki
          </Badge>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Is category me koi number baaki nahi hai.
          </p>
        ) : (
          <div className="space-y-3">
            {list.map((lead) => (
              <div key={lead.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{lead.company ?? "—"}</p>
                    <p className="text-sm text-muted-foreground">
                      {[lead.city, lead.country].filter(Boolean).join(", ") || "—"} ·{" "}
                      {lead.whatsapp ?? lead.phone}
                    </p>
                  </div>
                  {typeof lead.ai_score === "number" && (
                    <Badge variant="outline">Score {lead.ai_score}</Badge>
                  )}
                </div>
                <Textarea
                  className="mt-3 min-h-24 text-sm"
                  value={textFor(lead)}
                  onChange={(e) => setEdited((p) => ({ ...p, [lead.id]: e.target.value }))}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => send(lead)} disabled={busy === lead.id}>
                    {busy === lead.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <MessageCircle className="mr-2 h-4 w-4" />
                    )}
                    WhatsApp me bhejo
                  </Button>
                  <Button variant="outline" onClick={() => copy(lead)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button variant="ghost" onClick={() => skip(lead)} disabled={busy === lead.id}>
                    <SkipForward className="mr-2 h-4 w-4" />
                    Chhod do
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
