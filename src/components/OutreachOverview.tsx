import { Mail, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOutreachStats, type Audience, type Channel, type StatusFilter } from "@/hooks/use-outreach";

export const AUDIENCE_LABEL: Record<Audience, string> = {
  employer: "Employers",
  supply: "Recruiters",
  education: "Colleges",
};

type Props = { onOpen: (kind: Audience, status: StatusFilter, channel: Channel) => void };

/** One-glance summary: how many mails/WhatsApps went to each audience. */
export const OutreachOverview = ({ onOpen }: Props) => {
  const { data, isLoading } = useOutreachStats();

  const cell = (kind: Audience, channel: Channel, status: StatusFilter, value: number, tone = "") => (
    <Button variant="ghost" size="sm" className={`h-8 px-2 font-semibold ${tone}`} onClick={() => onOpen(kind, status, channel)}>
      {value}
    </Button>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-primary/10 bg-primary/5">
        <CardTitle>Kisko kya gaya — summary</CardTitle>
        <CardDescription>Kisi bhi number pe click karo, us list ki leads khul jayengi. Har 30 second me update.</CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        {isLoading || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-primary/10">
            <Table>
              <TableHeader className="bg-muted/70">
                <TableRow>
                  <TableHead>Audience</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Bheja</TableHead>
                  <TableHead>Aaj bheje</TableHead>
                  <TableHead>Queue me</TableHead>
                  <TableHead>Fail</TableHead>
                  <TableHead>Reply</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).flatMap((kind, i) =>
                  (["email", "whatsapp"] as Channel[]).map((ch) => {
                    const s = data[kind][ch];
                    return (
                      <TableRow key={kind + ch} className={i % 2 ? "bg-muted/30" : ""}>
                        <TableCell className="font-medium">{ch === "email" ? AUDIENCE_LABEL[kind] : ""}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5 text-sm">
                            {ch === "email" ? <Mail className="h-4 w-4 text-primary" /> : <MessageCircle className="h-4 w-4 text-primary" />}
                            {ch === "email" ? "Email" : "WhatsApp"}
                          </span>
                        </TableCell>
                        <TableCell>{cell(kind, ch, "sent", s.sent, "text-primary")}</TableCell>
                        <TableCell className="px-4">{s.today}</TableCell>
                        <TableCell>{cell(kind, ch, "pending", s.pending)}</TableCell>
                        <TableCell>{cell(kind, ch, "failed", s.failed, s.failed ? "text-destructive" : "")}</TableCell>
                        <TableCell className="px-4">{ch === "email" ? data[kind].replied : ""}</TableCell>
                      </TableRow>
                    );
                  }),
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
