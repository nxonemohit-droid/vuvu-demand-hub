import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, RefreshCw, Sparkles, Mail, Phone, ExternalLink, Globe2,
  Send, Download, Flame, Filter,
} from "lucide-react";
import { QueueDemandOutreachCard } from "@/components/outreach/QueueDemandOutreachCard";
import { EnrichEmailsCard } from "@/components/outreach/EnrichEmailsCard";
import { WhatsAppOutreachCard } from "@/components/outreach/WhatsAppOutreachCard";

type Lead = {
  id: string;
  employer_name: string | null;
  role: string;
  country: string;
  city: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  phone_e164: string | null;
  contact_qualified: boolean | null;
  discovered_board: string | null;
  discovered_board_domain: string | null;
  posted_at_local: string | null;
  source_url: string | null;
  quality_score: number;
  lead_score: number;
  vacancy_count: number;
  is_direct_employer: boolean;
  repost_count: number;
  trade_category: string | null;
  email_source: string;
  outreach_queued: boolean;
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

const TRADES = [
  "welding","construction","driver","warehouse","factory","hospitality",
  "caregiving","cleaning","security","agriculture","logistics","manufacturing",
];

const TRADE_COLOR: Record<string, string> = {
  welding: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  construction: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  driver: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  warehouse: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  factory: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  hospitality: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  caregiving: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cleaning: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  security: "bg-red-500/15 text-red-700 dark:text-red-300",
  agriculture: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  logistics: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  manufacturing: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};

function scoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500 text-white";
  if (score >= 60) return "bg-emerald-500/80 text-white";
  if (score >= 40) return "bg-amber-500 text-white";
  return "bg-red-500/70 text-white";
}

function toCsv(rows: Lead[]): string {
  const head = ["score","employer","role","trade","country","city","email","phone","vacancies","direct","reposts","board","posted_at","source_url"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((l) => [
    l.lead_score, l.employer_name, l.role, l.trade_category, l.country, l.city,
    l.contact_email, l.phone_e164 ?? l.contact_phone, l.vacancy_count,
    l.is_direct_employer ? "yes" : "no", l.repost_count, l.discovered_board,
    l.posted_at_local ?? l.created_at, l.source_url,
  ].map(esc).join(","));
  return [head.join(","), ...lines].join("\n");
}

export default function LocalHiring() {
  const qc = useQueryClient();
  const [country, setCountry] = useState<string>("all");
  const [board, setBoard] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [window, setWindow] = useState<string>("7");
  const [onlyQualified, setOnlyQualified] = useState(true);
  const [hotOnly, setHotOnly] = useState(false);
  const [directOnly, setDirectOnly] = useState(false);
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);

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
    queryKey: ["local-leads", country, board, window, onlyQualified, search, hotOnly, directOnly, selectedTrades.join(",")],
    queryFn: async () => {
      let q = supabase
        .from("demand_leads")
        .select(
          "id, employer_name, role, country, city, contact_email, contact_phone, phone_e164, contact_qualified, discovered_board, discovered_board_domain, posted_at_local, source_url, quality_score, lead_score, vacancy_count, is_direct_employer, repost_count, trade_category, email_source, outreach_queued, created_at",
        )
        .not("discovered_board_domain", "is", null)
        .order("lead_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (country !== "all") q = q.eq("country", country);
      if (board !== "all") q = q.eq("discovered_board_domain", board);
      if (onlyQualified) q = q.eq("contact_qualified", true);
      if (hotOnly) q = q.gte("lead_score", 60);
      if (directOnly) q = q.eq("is_direct_employer", true);
      if (selectedTrades.length) q = q.in("trade_category", selectedTrades);
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

  const summaryQ = useQuery({
    queryKey: ["daily-discovery-summary"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_discovery_summary" as never)
        .select("*")
        .eq("date", today)
        .maybeSingle();
      return data as { total_found: number; qualified_count: number; hot_count: number; countries_count: number } | null;
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
      qc.invalidateQueries({ queryKey: ["daily-discovery-summary"] });
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

  const pushOutreach = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("push-lead-to-outreach", { body: { lead_id: id } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Lead pushed to Mail/Outreach queue");
      qc.invalidateQueries({ queryKey: ["local-leads"] });
    },
    onError: (e: Error) => toast.error(`Push failed: ${e.message}`),
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
  const hotCount = leads.filter((l) => (l.lead_score ?? 0) >= 60).length;

  const toggleTrade = (t: string) =>
    setSelectedTrades((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const exportCsv = () => {
    const csv = toCsv(leads);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voynova-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            Only blue-collar postings — agencies filtered out. Sorted by lead score.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv} disabled={!leads.length}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={() => enrichAll.mutate()} disabled={enrichAll.isPending}>
            {enrichAll.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Enrich Missing
          </Button>
          <Button onClick={() => discover.mutate()} disabled={discover.isPending}>
            {discover.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run Discovery Now
          </Button>
        </div>
      </header>

      {summaryQ.data && (
        <Card className="p-4 bg-gradient-to-r from-primary/10 to-emerald-500/10 border-primary/30">
          <div className="flex items-center gap-2 text-sm">
            <Flame className="h-4 w-4 text-emerald-600" />
            <span className="font-medium">Today's Discovery:</span>
            <span><strong>{summaryQ.data.total_found}</strong> total</span>
            <span>·</span>
            <span><strong>{summaryQ.data.qualified_count}</strong> qualified</span>
            <span>·</span>
            <span className="text-emerald-700 dark:text-emerald-400">
              <strong>{summaryQ.data.hot_count}</strong> hot (≥60) ready for outreach
            </span>
            <span>·</span>
            <span><strong>{summaryQ.data.countries_count}</strong> countries</span>
          </div>
        </Card>
      )}

      <QueueDemandOutreachCard />
      <EnrichEmailsCard />
      <WhatsAppOutreachCard />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Boards configured" value={boardsQ.data?.length ?? 0} />
        <Stat label="Leads shown" value={leads.length} />
        <Stat label="Qualified (email+phone)" value={qualifiedCount} accent />
        <Stat label="Hot leads (≥60)" value={hotCount} accent />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
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
            <label className="text-xs font-medium text-muted-foreground">Trades</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <Filter className="h-4 w-4 mr-2" />
                  {selectedTrades.length ? `${selectedTrades.length} selected` : "All trades"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56">
                <div className="space-y-2 max-h-64 overflow-auto">
                  {TRADES.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={selectedTrades.includes(t)} onCheckedChange={() => toggleTrade(t)} />
                      <span className="capitalize">{t}</span>
                    </label>
                  ))}
                  {selectedTrades.length > 0 && (
                    <Button size="sm" variant="ghost" className="w-full" onClick={() => setSelectedTrades([])}>Clear</Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <Input placeholder="company, role, city…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Switch checked={onlyQualified} onCheckedChange={setOnlyQualified} id="only-q" />
              <label htmlFor="only-q" className="text-xs font-medium">Qualified only</label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={hotOnly} onCheckedChange={setHotOnly} id="hot" />
              <label htmlFor="hot" className="text-xs font-medium">Hot (≥60)</label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={directOnly} onCheckedChange={setDirectOnly} id="direct" />
              <label htmlFor="direct" className="text-xs font-medium">Direct employer</label>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Score</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Trade</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Vac.</TableHead>
              <TableHead>Direct</TableHead>
              <TableHead>Reposts</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsQ.isLoading && (
              <TableRow><TableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
              </TableCell></TableRow>
            )}
            {!leadsQ.isLoading && leads.length === 0 && (
              <TableRow><TableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                No leads match. Try toggling filters off or run discovery.
              </TableCell></TableRow>
            )}
            {leads.map((l) => (
              <TableRow key={l.id} className={!l.contact_qualified ? "opacity-70" : ""}>
                <TableCell>
                  <Badge className={scoreColor(l.lead_score ?? 0)}>{l.lead_score ?? 0}</Badge>
                </TableCell>
                <TableCell className="font-medium max-w-[180px] truncate">{l.employer_name ?? "—"}</TableCell>
                <TableCell className="max-w-[160px] truncate text-sm">{l.role}</TableCell>
                <TableCell>
                  {l.trade_category ? (
                    <span className={`px-2 py-0.5 rounded text-xs capitalize ${TRADE_COLOR[l.trade_category] ?? "bg-muted text-muted-foreground"}`}>
                      {l.trade_category}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm">
                  <div>{l.country}</div>
                  {l.city && <div className="text-xs text-muted-foreground">{l.city}</div>}
                </TableCell>
                <TableCell className="text-sm">
                  {l.vacancy_count >= 3
                    ? <Badge variant="default">{l.vacancy_count}</Badge>
                    : l.vacancy_count}
                </TableCell>
                <TableCell>
                  {l.is_direct_employer
                    ? <Badge variant="outline" className="text-emerald-700 border-emerald-500/40">Direct</Badge>
                    : <Badge variant="outline" className="text-muted-foreground">Agency</Badge>}
                </TableCell>
                <TableCell className="text-sm">{l.repost_count > 1 ? <Badge variant="secondary">{l.repost_count}×</Badge> : "—"}</TableCell>
                <TableCell>
                  {l.contact_email ? (
                    <a href={`mailto:${l.contact_email}`} className="text-primary text-xs flex items-center gap-1">
                      <Mail className="h-3 w-3" />{l.contact_email}
                    </a>
                  ) : <Badge variant="outline">missing</Badge>}
                  {l.email_source && l.email_source !== "missing" && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">{l.email_source}</div>
                  )}
                </TableCell>
                <TableCell>
                  {(l.phone_e164 || l.contact_phone) ? (
                    <span className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone_e164 ?? l.contact_phone}</span>
                  ) : <Badge variant="outline">missing</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.posted_at_local
                    ? formatDistanceToNow(new Date(l.posted_at_local), { addSuffix: true })
                    : formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {!l.contact_qualified && (
                      <Button size="sm" variant="ghost" onClick={() => enrichOne.mutate(l.id)} disabled={enrichOne.isPending}>
                        <Sparkles className="h-3 w-3 mr-1" /> Enrich
                      </Button>
                    )}
                    {l.lead_score >= 60 && !l.outreach_queued && l.contact_email && (
                      <Button size="sm" variant="default" onClick={() => pushOutreach.mutate(l.id)} disabled={pushOutreach.isPending}>
                        <Send className="h-3 w-3 mr-1" /> Push
                      </Button>
                    )}
                    {l.outreach_queued && (
                      <Badge variant="secondary" className="text-xs">Queued</Badge>
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