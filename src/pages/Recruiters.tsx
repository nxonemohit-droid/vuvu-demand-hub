import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ExternalLink, Mail, Phone, Linkedin, Sparkles, Filter, RefreshCw, ShieldCheck,
} from "lucide-react";

type RecruiterRow = {
  id: string;
  agency_name: string;
  hq_country: string | null;
  hq_city: string | null;
  operating_eu_country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_linkedin: string | null;
  recruitment_model: string[];
  license_number: string | null;
  license_verified: boolean;
  active_orders: Array<{
    role?: string; country?: string; headcount?: number;
    salary_min?: number; salary_max?: number; currency?: string;
  }>;
  worker_origin_focus: string[];
  trades: string[];
  source_url: string | null;
  source_posted_at: string | null;
  last_seen_at: string;
  status: string;
  excluded_reason: string | null;
  quality_score: number;
};

const MODEL_LABELS: Record<string, string> = {
  no_advance_after_visa: "No Advance After Visa",
  no_advance_after_deployment: "No Advance After Deployment",
  free_recruitment: "Free Recruitment",
  company_recruitment: "Employer-Paid Recruitment",
};
const ORIGIN_LABELS: Record<string, string> = { NP: "Nepal", IN: "India", BD: "Bangladesh" };

function totalHeadcount(orders: RecruiterRow["active_orders"]) {
  return (orders ?? []).reduce((sum, o) => sum + (Number(o.headcount) || 0), 0);
}

function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const Recruiters = () => {
  const { isAdmin } = useRoles();
  const [rows, setRows] = useState<RecruiterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [hqFilter, setHqFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [licensedOnly, setLicensedOnly] = useState(false);
  const [recencyDays, setRecencyDays] = useState<string>("90");
  const [showExcluded, setShowExcluded] = useState(false);
  const [selected, setSelected] = useState<RecruiterRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recruiter_leads")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as RecruiterRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const cutoff = recencyDays === "all" ? 0 : Date.now() - Number(recencyDays) * 86400_000;
    return rows
      .filter((r) => (showExcluded ? true : r.status === "active"))
      .filter((r) => !search || r.agency_name.toLowerCase().includes(search.toLowerCase()))
      .filter((r) => hqFilter === "all" || r.hq_country === hqFilter)
      .filter((r) => modelFilter === "all" || (r.recruitment_model ?? []).includes(modelFilter))
      .filter((r) => originFilter === "all" || (r.worker_origin_focus ?? []).includes(originFilter))
      .filter((r) => !licensedOnly || r.license_verified)
      .filter((r) => {
        if (cutoff === 0) return true;
        const ts = r.source_posted_at ? Date.parse(r.source_posted_at) : Date.parse(r.last_seen_at);
        return ts >= cutoff;
      })
      .sort((a, b) => {
        const ta = Date.parse(a.last_seen_at), tb = Date.parse(b.last_seen_at);
        if (tb !== ta) return tb - ta;
        const ha = totalHeadcount(a.active_orders), hb = totalHeadcount(b.active_orders);
        if (hb !== ha) return hb - ha;
        return Number(b.license_verified) - Number(a.license_verified);
      });
  }, [rows, search, hqFilter, modelFilter, originFilter, licensedOnly, recencyDays, showExcluded]);

  const hqOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.hq_country).filter(Boolean))).sort() as string[],
    [rows]
  );

  const runDiscovery = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-discover", {
        body: { recencyDays: Number(recencyDays) || 90, maxQueries: 20 },
      });
      if (error) throw error;
      const d = data as { inserted?: number; updated?: number; excluded?: number; discovered?: number };
      toast.success(
        `Discovery complete: ${d.discovered ?? 0} found · ${d.inserted ?? 0} new · ${d.updated ?? 0} updated · ${d.excluded ?? 0} excluded`
      );
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="container py-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recruiter Discovery</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Active recruiters & manpower agencies in the Balkans + EU hiring blue-collar workers from Nepal, India and Bangladesh.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Sparkles className="h-4 w-4 mr-1.5" /> Run discovery
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Run recruiter discovery</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Searches Firecrawl for recruitment agencies hiring NP / IN / BD workers across {`${hqOptions.length || 21}`} target countries. Up to 20 queries per run.
                </p>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={running}>Cancel</Button>
                  <Button onClick={runDiscovery} disabled={running}>
                    {running ? "Running…" : "Start discovery"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Search agency</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter…" />
          </div>
          <div className="w-44">
            <Label className="text-xs">HQ country</Label>
            <Select value={hqFilter} onValueChange={setHqFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {hqOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <Label className="text-xs">Recruitment model</Label>
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All allowed models</SelectItem>
                {Object.entries(MODEL_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Label className="text-xs">Worker origin</Label>
            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="NP">Nepal</SelectItem>
                <SelectItem value="IN">India</SelectItem>
                <SelectItem value="BD">Bangladesh</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label className="text-xs">Posted within</Label>
            <Select value={recencyDays} onValueChange={setRecencyDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="all">Any time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="lic" checked={licensedOnly} onCheckedChange={setLicensedOnly} />
            <Label htmlFor="lic" className="text-xs">Verified license only</Label>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="exc" checked={showExcluded} onCheckedChange={setShowExcluded} />
            <Label htmlFor="exc" className="text-xs">Show excluded</Label>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No recruiters match. Run discovery or relax filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>HQ → Operating</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>License</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const headcount = totalHeadcount(r.active_orders);
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell>
                      <div className="font-medium">{r.agency_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(r.worker_origin_focus ?? []).map((o) => ORIGIN_LABELS[o] ?? o).join(", ") || "—"}
                      </div>
                      {r.status === "excluded" && (
                        <Badge variant="destructive" className="mt-1 text-[10px]">
                          Excluded: {r.excluded_reason ?? "n/a"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{[r.hq_city, r.hq_country].filter(Boolean).join(", ") || "—"}</div>
                      <div className="text-xs text-muted-foreground">→ {r.operating_eu_country ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.contact_email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.contact_email}</div>}
                      {r.contact_phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.contact_phone}</div>}
                      {r.contact_linkedin && <div className="flex items-center gap-1"><Linkedin className="h-3 w-3" />profile</div>}
                      {!r.contact_email && !r.contact_phone && !r.contact_linkedin && <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.recruitment_model ?? []).map((m) => (
                          <Badge key={m} variant="secondary" className="text-[10px]">
                            {MODEL_LABELS[m] ?? m}
                          </Badge>
                        ))}
                        {(r.recruitment_model ?? []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{headcount > 0 ? `${headcount} workers` : "—"}</div>
                      <div className="text-xs text-muted-foreground">{(r.active_orders ?? []).length} orders</div>
                    </TableCell>
                    <TableCell>
                      {r.license_number ? (
                        <div className="flex items-center gap-1 text-xs">
                          {r.license_verified && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                          <span className="font-mono">{r.license_number}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(r.last_seen_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.agency_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Headquarters</div>
                  <div>{[selected.hq_city, selected.hq_country].filter(Boolean).join(", ") || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Operating EU country</div>
                  <div>{selected.operating_eu_country ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Contact</div>
                  <div>{selected.contact_name ?? "—"}</div>
                  {selected.contact_email && <div>{selected.contact_email}</div>}
                  {selected.contact_phone && <div>{selected.contact_phone}</div>}
                  {selected.contact_linkedin && (
                    <a className="text-primary inline-flex items-center gap-1" href={selected.contact_linkedin} target="_blank" rel="noreferrer">
                      LinkedIn <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">License</div>
                  <div className="font-mono text-xs">
                    {selected.license_number ?? "—"}{" "}
                    {selected.license_verified && <Badge variant="secondary" className="ml-1">verified</Badge>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Active orders</div>
                  {(selected.active_orders ?? []).length === 0 ? (
                    <div className="text-muted-foreground">None extracted</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Role</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Salary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.active_orders.map((o, i) => (
                          <TableRow key={i}>
                            <TableCell>{o.role ?? "—"}</TableCell>
                            <TableCell>{o.country ?? "—"}</TableCell>
                            <TableCell className="text-right">{o.headcount ?? "—"}</TableCell>
                            <TableCell className="text-right text-xs">
                              {o.salary_min || o.salary_max
                                ? `${o.salary_min ?? "?"}–${o.salary_max ?? "?"} ${o.currency ?? ""}`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Source</div>
                  {selected.source_url ? (
                    <a className="text-primary inline-flex items-center gap-1 break-all" href={selected.source_url} target="_blank" rel="noreferrer">
                      {selected.source_url} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "—"}
                  <div className="text-xs text-muted-foreground mt-1">
                    Posted {formatDate(selected.source_posted_at)} · Last seen {formatDate(selected.last_seen_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge>Quality {selected.quality_score}</Badge>
                  <Badge variant={selected.status === "active" ? "secondary" : "destructive"}>
                    {selected.status}
                  </Badge>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Recruiters;