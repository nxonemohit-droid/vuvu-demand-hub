import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gauge, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  PARTNER_TYPE_LABELS,
  RECRUITER_STAGES,
  STAGE_LABELS,
  type Stage,
} from "@/lib/markets";

const STAGE_OPTIONS: Stage[] = [...RECRUITER_STAGES, "rejected"];

type Props = { countries: string[] };

/** Partner pipeline: stage tracking and 0-100 priority for recruiter leads. */
export const RecruiterPipeline = ({ countries }: Props) => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [stage, setStage] = useState("all");
  const [scoring, setScoring] = useState(false);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["recruiter-pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("kind", "supply")
        .is("merged_into", null)
        .order("priority_score", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (leads ?? []).filter((l) => {
      if (country !== "all" && l.country !== country) return false;
      if (stage !== "all" && l.stage !== stage) return false;
      if (!q) return true;
      return [l.company, l.contact_name, l.email, l.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [leads, search, country, stage]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of RECRUITER_STAGES) m[s] = 0;
    for (const l of leads ?? []) if (l.stage in m) m[l.stage] += 1;
    return m;
  }, [leads]);

  const setStageFor = async (id: string, value: Stage) => {
    const { error } = await supabase.from("leads").update({ stage: value }).eq("id", id);
    if (error) {
      toast.error("Stage change nahi hua");
      return;
    }
    qc.invalidateQueries({ queryKey: ["recruiter-pipeline"] });
  };

  const scoreAll = async () => {
    setScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-tools", {
        body: { action: "score" },
      });
      if (error) throw error;
      toast.success(`${data?.scored ?? 0} partners ko priority score mil gaya`);
      qc.invalidateQueries({ queryKey: ["recruiter-pipeline"] });
    } catch {
      toast.error("Scoring nahi ho payi. Thodi der baad try karo.");
    } finally {
      setScoring(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Partner pipeline</CardTitle>
            <CardDescription>
              Har partner ka stage track karo aur priority score dekho (country, partner type,
              contact quality aur supply capacity par based).
            </CardDescription>
          </div>
          <Button onClick={scoreAll} disabled={scoring}>
            {scoring ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Gauge className="mr-2 h-4 w-4" />
            )}
            Score partners
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          {RECRUITER_STAGES.map((s) => (
            <div key={s} className="rounded-lg bg-muted/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {STAGE_LABELS[s]}
              </div>
              <div className="text-xl font-bold">{counts[s] ?? 0}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search agency, contact, email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !filtered.length ? (
          <p className="text-sm text-muted-foreground">Koi partner nahi mila.</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l, i) => (
                  <TableRow key={l.id} className={i % 2 ? "bg-muted/40" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.company}</span>
                        {l.partner_type && (
                          <Badge variant="secondary">
                            {PARTNER_TYPE_LABELS[l.partner_type] ?? l.partner_type}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{l.city ?? "—"}</div>
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
                      <div className="text-muted-foreground">{l.email ?? "no email"}</div>
                      <div className="text-muted-foreground">{l.whatsapp ?? l.phone ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-lg font-semibold">{l.priority_score ?? "—"}</div>
                      {l.priority_reason && (
                        <div className="max-w-44 text-[11px] text-muted-foreground">
                          {l.priority_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={l.stage}
                        onValueChange={(v) => setStageFor(l.id, v as Stage)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGE_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STAGE_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
