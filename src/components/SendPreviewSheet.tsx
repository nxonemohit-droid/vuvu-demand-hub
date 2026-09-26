import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { fmtDate, friendlyError, pdfLabel, type OutreachLead, type SendRow } from "@/hooks/use-outreach";

type Props = { lead: OutreachLead | null; send: SendRow | null; onClose: () => void };

/** Side panel showing exactly what was (or will be) sent to a lead. */
export const SendPreviewSheet = ({ lead, send, onClose }: Props) => (
  <Sheet open={!!send} onOpenChange={(o) => !o && onClose()}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      {send && lead && (
        <>
          <SheetHeader>
            <SheetTitle>{lead.company}</SheetTitle>
            <SheetDescription>
              {send.channel === "email" ? "Email" : "WhatsApp"} → {send.to_address}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant={send.status === "sent" ? "default" : send.status === "failed" ? "destructive" : "secondary"}>
                {send.status}
              </Badge>
              <span className="text-muted-foreground">
                {send.sent_at ? `Bheja: ${fmtDate(send.sent_at)}` : `Scheduled: ${fmtDate(send.scheduled_for)}`}
              </span>
            </div>
            {send.error && <p className="rounded-lg bg-destructive/10 p-3 text-destructive">{friendlyError(send.error)}</p>}
            {send.channel === "email" && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="font-medium">{send.subject ?? "—"}</p>
                </div>
                <p className="text-xs text-muted-foreground">Attachment: {pdfLabel(lead.kind, lead.country)}</p>
              </>
            )}
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4">{send.body}</div>
          </div>
        </>
      )}
    </SheetContent>
  </Sheet>
);
