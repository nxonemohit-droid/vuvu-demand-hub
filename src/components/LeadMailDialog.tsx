import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle, Sparkles, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MailLead = {
  id: string;
  company: string;
  kind: string;
  country: string;
  city: string | null;
  email: string | null;
  contact_name: string | null;
  contact_role: string | null;
  profile_summary: string | null;
  programs: string | null;
  trades: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  draft_whatsapp: string | null;
  ai_score: number | null;
  ai_reason: string | null;
  phone: string | null;
  whatsapp: string | null;
};

type Props = {
  lead: MailLead | null;
  onClose: () => void;
  onSaved: () => void;
};

/** Preview, edit and queue the personalised mail for one lead. */
export const LeadMailDialog = ({ lead, onClose, onSaved }: Props) => {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "save" | "queue" | "whatsapp" | null>(null);

  useEffect(() => {
    setSubject(lead?.draft_subject ?? "");
    setBody(lead?.draft_body ?? "");
    setWhatsapp(lead?.draft_whatsapp ?? "");
    setScore(lead?.ai_score ?? null);
    setReason(lead?.ai_reason ?? null);
  }, [lead]);

  if (!lead) return null;

  const generate = async () => {
    setBusy("draft");
    const { data, error } = await supabase.functions.invoke("draft-email", {
      body: { lead_ids: [lead.id], preview: true },
    });
    setBusy(null);
    if (error || !data?.drafts?.length) {
      toast.error("Mail draft nahi ban paya, dobara try karo.");
      return;
    }
    setSubject(data.drafts[0].subject);
    setBody(data.drafts[0].body);
    setWhatsapp(data.drafts[0].whatsapp ?? "");
    setScore(data.drafts[0].score ?? null);
    setReason(data.drafts[0].reason ?? null);
    toast.success("Score, email aur WhatsApp draft ready hain.");
  };

  const save = async () => {
    setBusy("save");
    const { error } = await supabase
      .from("leads")
      .update({
        draft_subject: subject,
        draft_body: body,
        draft_whatsapp: whatsapp,
        ai_score: score,
        ai_reason: reason,
        drafted_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    setBusy(null);
    if (error) {
      toast.error("Save nahi hua.");
      return;
    }
    toast.success("Draft save ho gaya.");
    onSaved();
  };

  const queue = async () => {
    if (!lead.email) {
      toast.error("Is lead pe email nahi hai.");
      return;
    }
    setBusy("queue");
    const { error: saveErr } = await supabase
      .from("leads")
      .update({ draft_subject: subject, draft_body: body, draft_whatsapp: whatsapp, ai_score: score, ai_reason: reason, drafted_at: new Date().toISOString() })
      .eq("id", lead.id);
    if (saveErr) {
      setBusy(null);
      toast.error("Save nahi hua.");
      return;
    }
    const { error } = await supabase.functions.invoke("schedule-outreach", {
      body: { lead_ids: [lead.id], channels: ["email"] },
    });
    setBusy(null);
    if (error) {
      toast.error("Queue nahi hua.");
      return;
    }
    toast.success("Mail queue me add ho gaya.");
    onSaved();
    onClose();
  };

  const queueWhatsapp = async () => {
    if (!(lead.whatsapp ?? lead.phone)) {
      toast.error("Is lead pe WhatsApp number nahi hai.");
      return;
    }
    if (!whatsapp) {
      toast.error("Pehle personalised message banao.");
      return;
    }
    setBusy("whatsapp");
    const { error: saveErr } = await supabase
      .from("leads")
      .update({ draft_whatsapp: whatsapp, ai_score: score, ai_reason: reason, drafted_at: new Date().toISOString() })
      .eq("id", lead.id);
    if (saveErr) {
      setBusy(null);
      toast.error("WhatsApp draft save nahi hua.");
      return;
    }
    const { error } = await supabase.functions.invoke("schedule-outreach", {
      body: { lead_ids: [lead.id], channels: ["whatsapp"] },
    });
    setBusy(null);
    if (error) {
      toast.error("WhatsApp queue nahi hua.");
      return;
    }
    toast.success("WhatsApp message queue me add ho gaya.");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.company}
            <Badge variant={lead.kind === "education" ? "secondary" : "default"}>
              {lead.kind === "education" ? "College" : "Company"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {[lead.contact_name, lead.contact_role, lead.email].filter(Boolean).join(" · ") ||
              "Koi contact person nahi mila"}
          </DialogDescription>
        </DialogHeader>

        {(lead.profile_summary || lead.programs || lead.trades) && (
          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
            {lead.profile_summary && <p>{lead.profile_summary}</p>}
            {lead.programs && <p><span className="font-medium">Courses:</span> {lead.programs}</p>}
            {lead.trades && <p><span className="font-medium">Trades:</span> {lead.trades}</p>}
          </div>
        )}

        {score !== null && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
            <Badge variant={score >= 70 ? "default" : score >= 45 ? "secondary" : "outline"}>
              AI score {score}/100
            </Badge>
            {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mail-subject">Subject</Label>
            <Input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Abhi koi draft nahi — Generate dabao"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp-body">WhatsApp message</Label>
            <Textarea
              id="whatsapp-body"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              rows={5}
              placeholder="Generate dabao — personalised WhatsApp message yahan aayega"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-body">Mail</Label>
            <Textarea
              id="mail-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="font-normal text-sm"
              placeholder="Abhi koi draft nahi — Generate dabao"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={generate} disabled={busy !== null}>
            {busy === "draft" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {lead.draft_body ? "Dobara likho" : "Personalised mail banao"}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={save} disabled={busy !== null || !body}>
              {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save draft
            </Button>
            <Button onClick={queue} disabled={busy !== null || !body || !lead.email}>
              {busy === "queue" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Queue mail
            </Button>
            <Button variant="secondary" onClick={queueWhatsapp} disabled={busy !== null || !whatsapp || !(lead.whatsapp ?? lead.phone)}>
              {busy === "whatsapp" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
              Queue WhatsApp
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
