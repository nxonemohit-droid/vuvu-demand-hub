import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Mail, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MARKETS, STAGES, STAGE_LABELS, marketFor, type Stage } from "@/lib/markets";
import { PageHeader } from "@/components/PageHeader";
import { LeadMailDialog, type MailLead } from "@/components/LeadMailDialog";


const Pipeline = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [stage, setStage] = useState("all");
  const [mailLead, setMailLead] = useState<MailLead | null>(null);
  const [drafting, setDrafting] = useState(false);

  /** Draft personalised mails for the next batch of leads that have an email. */
  const draftBatch = async () => {
    setDrafting(true);
    let total = 0;
    for (let i = 0; i < 6; i++) {
      const { data, error } = await supabase.functions.invoke("draft-email", { body: { limit: 5 } });
      if (error) break;
      total += data?.drafted ?? 0;
      if (!data?.drafted) break;
    }
    setDrafting(false);
    qc.invalidateQueries({ queryKey: ["pipeline-leads"] });
    toast[total ? "success" : "info"](
      total ? `${total} personalised mail draft ban gaye.` : "Sab leads ke draft pehle se ready hain.",
    );
  };

  const { data: leads, isLoading } = useQuery({
    queryKey: ["pipeline-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("ai_score", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (leads ?? []).filter((l) => {
      if (country !== "all" && l.country !== country) return false;
      if (stage !== "all" && l.stage !== stage) return false;
      if (!q) return true;
      return [l.company, l.contact_name, l.email, l.city, l.sector]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [leads, search, country, stage]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of STAGES) m[s] = 0;
    for (const l of leads ?? []) m[l.stage] = (m[l.stage] ?? 0) + 1;
    return m;
  }, [leads]);

  const setStageFor = async (id: string, value: Stage) => {
    const { error } = await supabase.from("leads").update({ stage: value }).eq("id", id);
    if (error) {
      toast.error("Stage change nahi hua");
      return;
    }
    qc.invalidateQueries({ queryKey: ["pipeline-leads"] });
  };

  const exportCsv = () => {
    const cols = [
      "company", "country", "city", "sector", "role", "contact_name", "contact_role",
      "email", "email_source", "phone", "whatsapp", "website", "address", "opening_hours",
      "visa_speed", "visa_fit_score", "ai_score", "ai_reason", "draft_whatsapp", "stage",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cols.join(","),
      ...filtered.map((l) => cols.map((c) => esc((l as Record<string, unknown>)[c])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `voynova-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        step={3}
        title="Pipeline"
        description="Gemini score dekho aur har lead ke liye personalised email aur WhatsApp message banao."
        action={
          <div className="flex gap-2">
            <Button onClick={draftBatch} disabled={drafting}>
              {drafting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Score + drafts banao
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />


      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {STAGES.map((s) => (
          <Card key={s}>
            <CardContent className="pt-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {STAGE_LABELS[s]}
              </div>
              <div className="text-2xl font-bold">{counts[s] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Leads ({filtered.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search company, contact, email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {MARKETS.map((m) => (
                  <SelectItem key={m.country} value={m.country}>{m.country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !filtered.length ? (
            <p className="text-sm text-muted-foreground">Koi lead nahi mili.</p>
          ) : (
            <div className="rounded-lg border overflow-auto max-h-[70vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-muted z-10">
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Contact person</TableHead>
                    <TableHead>Address &amp; hours</TableHead>
                    <TableHead>Visa</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Mail</TableHead>
                    <TableHead>Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l, i) => {
                    const m = marketFor(l.country);
                    return (
                      <TableRow key={l.id} className={i % 2 ? "bg-muted/40" : undefined}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{l.company}</span>
                            <Badge variant={l.kind === "education" ? "secondary" : "outline"}>
                              {l.kind === "education" ? "College" : "Company"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[l.city, l.sector].filter(Boolean).join(" · ")}
                          </div>
                          {(l.trades || l.programs) && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {l.trades ?? l.programs}
                            </div>
                          )}
                          {l.website && (
                            <a
                              href={l.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              {l.website.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{l.country}</TableCell>
                        <TableCell className="text-xs">
                          <div>{l.contact_name ?? "—"}</div>
                          {l.contact_role && (
                            <div className="text-muted-foreground">{l.contact_role}</div>
                          )}
                          <div className="text-muted-foreground">{l.email ?? "no email"}</div>
                          <div className="text-muted-foreground">{l.whatsapp ?? l.phone ?? ""}</div>
                        </TableCell>
                        <TableCell className="text-xs max-w-64">
                          <div className="text-muted-foreground">{l.address ?? "—"}</div>
                          {l.opening_hours && (
                            <details>
                              <summary className="cursor-pointer text-muted-foreground">Hours</summary>
                              <pre className="whitespace-pre-wrap text-[11px]">{l.opening_hours}</pre>
                            </details>
                          )}
                        </TableCell>
                        <TableCell>
                          {m && (
                            <Badge variant={m.speed === "fast" ? "default" : "secondary"}>
                              {m.days}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{l.ai_score ?? l.visa_fit_score}</div>
                          {l.ai_reason && <div className="max-w-40 text-[11px] text-muted-foreground">{l.ai_reason}</div>}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={l.draft_body ? "secondary" : "outline"}
                            onClick={() => setMailLead(l as unknown as MailLead)}
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            {l.draft_body ? "Drafts dekho" : "Drafts banao"}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Select value={l.stage} onValueChange={(v) => setStageFor(l.id, v as Stage)}>
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STAGES.map((s) => (
                                <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <LeadMailDialog
        lead={mailLead}
        onClose={() => setMailLead(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["pipeline-leads"] })}
      />
    </div>
  );
};

export default Pipeline;
