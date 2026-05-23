import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Sparkles, Mail, Phone, ExternalLink, Globe2 } from "lucide-react";

type Lead = {
  id: string;
  employer_name: string | null;
  role: string;
  country: string;
  city: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_qualified: boolean | null;
  discovered_board: string | null;
  discovered_board_domain: string | null;
  posted_at_local: string | null;
  source_url: string | null;
  quality_score: number;
  created_at: string;
};

type Board = {
  id: string;
  country: string;
  country_iso2: string;
  board_domain: string;
  board_name: string | null;
  enabled: boolean;
  total_leads_found: number;
  last_run_at: string | null;
};

const POSTED_WINDOWS = [
  { v: "1", label: "Last 24h" },
  { v: "7", label: "Last 7 days" },
  { v: "30", label: "Last 30 days" },
  { v: "all", label: "All time" },
];

export default function LocalHiring() {
  const qc = useQueryClient();
  const [country, setCountry] = useState<string>("all");
  const [board, setBoard] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [window, setWindow] = useState<string>("7");
  const [onlyQualified, setOnlyQualified] = useState(true);

  const boardsQ = useQuery({
    queryKey: ["source_boards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("source_boards" as never)
        .select("*")
        .order("country")
        .order("priority");
      if (error) throw error;
      return (data ?? []) as unknown as Board[];
    },
  });

  const leadsQ = useQuery({
    queryKey: ["local-leads", country, board, window, onlyQualified, search],
    queryFn: async () => {
      let q = supabase
        .from("demand_leads")
        .select(
          "id, employer_name, role, country, city, contact_email, contact_phone, contact_qualified, discovered_board, discovered_board_domain, posted_at_local, source_url, quality_score, created_at",
        )
        .not("discovered_board_domain", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (country !== "all") q = q.eq("country", country);
      if (board !== "all") q = q.eq("discovered_board_domain", board);
      if (onlyQualified) q = q.eq("contact_qualified", true);
      if (window !== "all") {
        const days = parseInt(window, 10);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        q = q.gte("created_at", since);
      }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`employer_name.ilike.${s},role.ilike.${s},city.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const discover = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (country !== "all") {
        const iso = boardsQ.data?.find((b) => b.country === country)?.country_iso2;
        if (iso) payload.countries = [iso];
      }
      const { data, error } = await supabase.functions.invoke("discover-local-jobs", { body: payload });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Discovery run finished — ${d?.boards_scanned ?? 0} boards scanned.`);
      qc.invalidateQueries({ queryKey: ["local-leads"] });
      qc.invalidateQueries({ queryKey: ["source_boards"] });
    },
    onError: (e: Error) => toast.error(`Discovery failed: ${e.message}`),
  });

  const enrichAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("enrich-contacts", { body: { limit: 50 } });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Enriched ${d?.enriched ?? 0} of ${d?.processed ?? 0}`);
      qc.invalidateQueries({ queryKey: ["local-leads"] });
    },
    onError: (e: Error) => toast.error(`Enrich failed: ${e.message}`),
  });

  const enrichOne = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("enrich-contacts", { body: { ids: [id] } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Enriched");
      qc.invalidateQueries({ queryKey: ["local-leads"] });
    },
    onError: (e: Error) => toast.error(`Enrich failed: ${e.message}`),
  });

  const countries = useMemo(() => {
    const set = new Set((boardsQ.data ?? []).map((b) => b.country));
    return [...set].sort();
  }, [boardsQ.data]);

  const boardsForCountry = useMemo(() => {
    if (country === "all") return boardsQ.data ?? [];
    return (boardsQ.data ?? []).filter((b) => b.country === country);
  }, [boardsQ.data, country]);

  const leads = leadsQ.data ?? [];
  const qualifiedCount = leads.filter((l) => l.contact_qualified).length;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe2 className="h-6 w-6 text-primary" />
            Local Hiring Discovery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live employer postings scraped from native job boards across the Balkans & EU.
            Only leads with both <strong>email + phone</strong> are qualified.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => enrichAll.mutate()}
            disabled={enrichAll.isPending}
          >
            {enrichAll.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Enrich Missing Contacts
          </Button>
          <Button onClick={() => discover.mutate()} disabled={discover.isPending}>
            {discover.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run Discovery Now
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Boards configured" value={boardsQ.data?.length ?? 0} />
        <Stat label="Leads shown" value={leads.length} />
        <Stat label="Qualified (email+phone)" value={qualifiedCount} accent />
        <Stat label="Countries covered" value={countries.length} />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Country</label>
            <Select value={country} onValueChange={(v) => { setCountry(v); setBoard("all"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Board</label>
            <Select value={board} onValueChange={setBoard}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All boards</SelectItem>
                {boardsForCountry.map((b) => (
                  <SelectItem key={b.id} value={b.board_domain}>
                    {b.board_name ?? b.board_domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Posted</label>
            <Select value={window} onValueChange={setWindow}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POSTED_WINDOWS.map((w) => <SelectItem key={w.v} value={w.v}>{w.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <Input
              placeholder="company, role, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={onlyQualified} onCheckedChange={setOnlyQualified} id="only-q" />
            <label htmlFor="only-q" className="text-sm font-medium">
              Only qualified (email+phone)
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Board</TableHead>
              <TableHead>Score</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsQ.isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
              </TableCell></TableRow>
            )}
            {!leadsQ.isLoading && leads.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                No leads match. Try toggling "Only qualified" off or run discovery.
              </TableCell></TableRow>
            )}
            {leads.map((l) => (
              <TableRow key={l.id} className={!l.contact_qualified ? "opacity-60" : ""}>
                <TableCell className="font-medium max-w-[200px] truncate">{l.employer_name ?? "—"}</TableCell>
                <TableCell className="max-w-[180px] truncate">{l.role}</TableCell>
                <TableCell className="text-sm">
                  <div>{l.country}</div>
                  {l.city && <div className="text-xs text-muted-foreground">{l.city}</div>}
                </TableCell>
                <TableCell>
                  {l.contact_email ? (
                    <a href={`mailto:${l.contact_email}`} className="text-primary text-sm flex items-center gap-1">
                      <Mail className="h-3 w-3" />{l.contact_email}
                    </a>
                  ) : <Badge variant="outline">missing</Badge>}
                </TableCell>
                <TableCell>
                  {l.contact_phone ? (
                    <span className="text-sm flex items-center gap-1"><Phone className="h-3 w-3" />{l.contact_phone}</span>
                  ) : <Badge variant="outline">missing</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.discovered_board}</TableCell>
                <TableCell>
                  <Badge variant={l.quality_score >= 70 ? "default" : "secondary"}>{l.quality_score}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {!l.contact_qualified && (
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => enrichOne.mutate(l.id)}
                        disabled={enrichOne.isPending}
                      >
                        <Sparkles className="h-3 w-3 mr-1" /> Enrich
                      </Button>
                    )}
                    {l.source_url && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={l.source_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className={`p-4 ${accent ? "border-primary" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}