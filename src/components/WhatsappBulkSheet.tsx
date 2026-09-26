import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { OutreachLead } from "@/hooks/use-outreach";

type Props = {
  leads: OutreachLead[];
  open: boolean;
  onClose: () => void;
  onDone: (id: string) => void;
  textFor: (lead: OutreachLead) => string;
};

const digits = (v: string) => v.replace(/[^\d]/g, "");

/**
 * Guided bulk WhatsApp: walks through selected leads one by one.
 * Each lead = open chat (user presses Send in WhatsApp) → confirm → next.
 * The browser cannot press Send, so confirmation is required before Contacted.
 */
export const WhatsappBulkSheet = ({ leads, open, onClose, onDone, textFor }: Props) => {
  const [idx, setIdx] = useState(0);
  const [opened, setOpened] = useState(false);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [result, setResult] = useState({ sent: 0, skipped: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setIdx(0);
      setOpened(false);
      setResult({ sent: 0, skipped: 0 });
    }
  }, [open]);

  const lead = leads[idx];
  const finished = idx >= leads.length;
  const text = lead ? edited[lead.id] ?? textFor(lead) : "";

  const next = () => {
    setOpened(false);
    setIdx((i) => i + 1);
  };

  const openChat = () => {
    if (!lead) return;
    const number = digits(lead.whatsapp ?? lead.phone ?? "");
    if (number.length < 8) {
      toast.error("Is lead ka number sahi nahi hai — skip karo.");
      return;
    }
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    setOpened(true);
  };

  const confirmSent = async () => {
    if (!lead) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from("outreach_sends").upsert(
        {
          lead_id: lead.id,
          channel: "whatsapp",
          to_address: digits(lead.whatsapp ?? lead.phone ?? ""),
          body: text,
          status: "sent",
          scheduled_for: now,
          sent_at: now,
          error: null,
        },
        { onConflict: "lead_id,channel" },
      );
      if (error) throw error;
      await supabase.from("leads").update({ stage: "contacted" }).eq("id", lead.id).eq("stage", "new");
      setResult((r) => ({ ...r, sent: r.sent + 1 }));
      onDone(lead.id);
      next();
    } catch {
      toast.error("Record save nahi hua, dobara try karo.");
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    setResult((r) => ({ ...r, skipped: r.skipped + 1 }));
    next();
  };

  // Enter = open chat, then Enter again = sent & next (outside the textarea).
  useEffect(() => {
    if (!open || finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement)?.tagName === "TEXTAREA" || busy) return;
      e.preventDefault();
      if (opened) void confirmSent();
      else openChat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>WhatsApp Bulk Send</SheetTitle>
          <SheetDescription>
            Har lead: "WhatsApp kholo" → WhatsApp me Send dabao → "Bhej diya, agla". Enter key se bhi chalta hai.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>{Math.min(idx, leads.length)} / {leads.length}</span>
            <span className="text-muted-foreground">Bheje {result.sent} · Skip {result.skipped}</span>
          </div>
          <Progress value={leads.length ? (idx / leads.length) * 100 : 0} />
        </div>

        {finished ? (
          <div className="mt-8 space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <p className="text-lg font-semibold">Ho gaya!</p>
            <p className="text-sm text-muted-foreground">{result.sent} bheje, {result.skipped} skip kiye.</p>
            <Button onClick={onClose}>Band karo</Button>
          </div>
        ) : lead ? (
          <div className="mt-6 space-y-4">
            <div>
              <p className="font-semibold">{lead.company}</p>
              <p className="text-sm text-muted-foreground">
                {[lead.city, lead.country].filter(Boolean).join(", ")} · {lead.whatsapp ?? lead.phone}
              </p>
            </div>
            <Textarea
              className="min-h-40 text-sm"
              value={text}
              onChange={(e) => setEdited((p) => ({ ...p, [lead.id]: e.target.value }))}
            />
            {!opened ? (
              <Button size="lg" className="w-full" onClick={openChat}>
                <MessageCircle className="mr-2 h-5 w-5" />WhatsApp kholo
              </Button>
            ) : (
              <div className="grid gap-2">
                <Button size="lg" onClick={confirmSent} disabled={busy}>
                  <CheckCircle2 className="mr-2 h-5 w-5" />Bhej diya, agla
                </Button>
                <Button variant="outline" onClick={openChat}>Chat dobara kholo</Button>
              </div>
            )}
            <Button variant="ghost" className="w-full" onClick={skip}>
              <SkipForward className="mr-2 h-4 w-4" />Skip
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
