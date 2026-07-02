import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Hotel, Search, Sparkles, Send, Target, Mail, RefreshCw, Rocket, Loader2,
} from "lucide-react";

const REGIONS = [
  "Manipur","Meghalaya","Assam","Nagaland","Mizoram","Tripura",
  "Arunachal Pradesh","Sikkim","Uttarakhand","Nepal",
];

const STAGES = ["lead","interested","docs_sent","application","offer","visa","admitted"] as const;
const STAGE_LABEL: Record<string,string> = {
  lead: "Lead", interested: "Interested", docs_sent: "Docs Sent",
  application: "Application", offer: "Offer", visa: "Visa", admitted: "Admitted",
};

type HmLead = {
  id: string; type: "institute"|"consultancy"; name: string; website?: string;
  region?: string; state?: string; city?: string; country?: string;
  contact_name?: string; contact_role?: string; email?: string; phone?: string; linkedin?: string;
  status: string; admission_stage: typeof STAGES[number]; score: number; source: string; created_at: string;
};

type HmCampaign = {
  id: string; name: string; status: string;
  template_1_subject?: string; template_1_body?: string;
  template_2_subject?: string; template_2_body?: string;
  template_3_subject?: string; template_3_body?: string;
  daily_cap: number; gap_seconds: number;
  total_queued: number; total_sent: number; total_failed: number; total_replied: number;
};

export default function HmMauritius() {
  const [tab, setTab] = useState("discover");
  const [leads, setLeads] = useState<HmLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<HmCampaign[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: ls }, { data: cs }] = await Promise.all([
      supabase.from("hm_leads").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("hm_campaigns").select("*").order("created_at", { ascending: false }),
    ]);
    setLeads((ls as any) || []);
    setCampaigns((cs as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const admittedCount = useMemo(() => leads.filter((l) => l.admission_stage === "admitted").length, [leads]);

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Hotel className="h-6 w-6 text-primary" /> HM Mauritius Admissions Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scrape hotel-management institutes & consultancies → AI personalize → bulk mail (50/day · 90s gap). Target: <b>500 admissions</b>.
          </p>
        </div>
        <AutoRunButton onDone={load} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm text-muted-foreground">Admissions progress</div>
              <div className="text-2xl font-bold">{admittedCount} / 500</div>
            </div>
            <Progress value={(admittedCount / 500) * 100} className="w-64" />
            <div className="text-sm">
              <div><b>{leads.length}</b> leads · <b>{leads.filter(l => l.email).length}</b> with email · <b>{campaigns.reduce((a,c)=>a+(c.total_sent||0),0)}</b> sent</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="discover"><Search className="h-4 w-4 mr-1"/>Discover</TabsTrigger>
          <TabsTrigger value="leads"><Mail className="h-4 w-4 mr-1"/>Leads</TabsTrigger>
          <TabsTrigger value="templates"><Sparkles className="h-4 w-4 mr-1"/>Templates</TabsTrigger>
          <TabsTrigger value="campaign"><Send className="h-4 w-4 mr-1"/>Campaign</TabsTrigger>
          <TabsTrigger value="pipeline"><Target className="h-4 w-4 mr-1"/>Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="discover"><DiscoverTab onDone={load} /></TabsContent>
        <TabsContent value="leads"><LeadsTab leads={leads} loading={loading} onReload={load} /></TabsContent>
        <TabsContent value="templates"><TemplatesTab campaigns={campaigns} onReload={load} /></TabsContent>
        <TabsContent value="campaign"><CampaignTab campaigns={campaigns} leads={leads} onReload={load} /></TabsContent>
        <TabsContent value="pipeline"><PipelineTab leads={leads} onReload={load} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Auto Run ----------------
function AutoRunButton({ onDone }: { onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      toast.info("Discovering institutes across NE India + Uttarakhand + Nepal…");
      const { data, error } = await supabase.functions.invoke("hm-discover", {
        body: { bucket: "institute", regions: REGIONS, per_query: 8, max_queries: 40 },
      });
      if (error) throw error;
      toast.success(`Queued ${data?.urls_found || 0} URLs for enrichment. Check Leads tab in 1-2 mins.`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Auto run failed");
    } finally { setRunning(false); }
  };
  return (
    <Button size="lg" onClick={run} disabled={running} className="gap-2">
      {running ? <Loader2 className="h-4 w-4 animate-spin"/> : <Rocket className="h-4 w-4"/>}
      Auto Run (Discover)
    </Button>
  );
}

// ---------------- Discover Tab ----------------
function DiscoverTab({ onDone }: { onDone: () => void }) {
  const [bucket, setBucket] = useState<"institute"|"consultancy">("institute");
  const [selected, setSelected] = useState<string[]>(REGIONS);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const toggle = (r: string) =>
    setSelected(s => s.includes(r) ? s.filter(x => x!==r) : [...s, r]);

  const run = async () => {
    if (!selected.length) return toast.error("Select at least 1 region");
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("hm-discover", {
        body: { bucket, regions: selected, per_query: 8, max_queries: 40 },
      });
      if (error) throw error;
      setLastResult(data);
      toast.success(`Discovery started · ${data?.urls_found || 0} new URLs`);
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setRunning(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Discover leads</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Bucket</Label>
          <div className="flex gap-2 mt-2">
            <Button variant={bucket==="institute"?"default":"outline"} onClick={()=>setBucket("institute")}>Hotel Management Institutes</Button>
            <Button variant={bucket==="consultancy"?"default":"outline"} onClick={()=>setBucket("consultancy")}>Career Consultancies</Button>
          </div>
        </div>
        <div>
          <Label>Regions</Label>
          <div className="flex gap-2 flex-wrap mt-2">
            {REGIONS.map(r => (
              <Badge key={r} variant={selected.includes(r)?"default":"outline"}
                className="cursor-pointer" onClick={()=>toggle(r)}>{r}</Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={run} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}
            Start scrape
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Uses Google CSE + Firecrawl · new leads appear in Leads tab as enrichment completes.
          </span>
        </div>
        {lastResult && (
          <div className="text-sm bg-muted p-3 rounded">
            Queries: <b>{lastResult.queries}</b> · Hits: <b>{lastResult.total_hits}</b> · New URLs: <b>{lastResult.urls_found}</b> · Job: <code className="text-xs">{lastResult.job_id?.slice(0,8)}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Leads Tab ----------------
function LeadsTab({ leads, loading, onReload }: { leads: HmLead[]; loading: boolean; onReload: () => void }) {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterEmail, setFilterEmail] = useState<string>("all");
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const filtered = leads.filter(l =>
    (filterType === "all" || l.type === filterType) &&
    (filterEmail === "all" || (filterEmail === "yes" ? !!l.email : !l.email)) &&
    (filterRegion === "all" || l.region === filterRegion)
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Leads ({filtered.length})</CardTitle>
        <Button variant="outline" size="sm" onClick={onReload} className="gap-1"><RefreshCw className="h-3 w-3"/>Refresh</Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3 flex-wrap">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="institute">Institutes</SelectItem>
              <SelectItem value="consultancy">Consultancies</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterEmail} onValueChange={setFilterEmail}>
            <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any email</SelectItem>
              <SelectItem value="yes">Has email</SelectItem>
              <SelectItem value="no">No email</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRegion} onValueChange={setFilterRegion}>
            <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {loading ? (
          <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto"/></div>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell><Badge variant="secondary">{l.type}</Badge></TableCell>
                    <TableCell className="text-xs">{l.region || "—"}</TableCell>
                    <TableCell className="text-xs">{l.contact_name || "—"}{l.contact_role ? ` · ${l.contact_role}` : ""}</TableCell>
                    <TableCell className="text-xs">{l.email || "—"}</TableCell>
                    <TableCell><Badge>{STAGE_LABEL[l.admission_stage]}</Badge></TableCell>
                    <TableCell>{l.score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Templates Tab ----------------
function TemplatesTab({ campaigns, onReload }: { campaigns: HmCampaign[]; onReload: () => void }) {
  const [name, setName] = useState("HM Mauritius Admissions Q1");
  const [notes, setNotes] = useState("");
  const [variants, setVariants] = useState<{name:string;subject:string;body:string}[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("hm-generate-templates", { body: { notes } });
      if (error) throw error;
      setVariants(data.variants || []);
      toast.success("3 templates generated");
    } catch (e: any) { toast.error(e.message); } finally { setGenerating(false); }
  };

  const save = async () => {
    if (variants.length < 3) return toast.error("Need 3 variants");
    setSaving(true);
    try {
      const { error } = await supabase.from("hm_campaigns").insert({
        name,
        template_1_subject: variants[0].subject, template_1_body: variants[0].body,
        template_2_subject: variants[1].subject, template_2_body: variants[1].body,
        template_3_subject: variants[2].subject, template_3_body: variants[2].body,
      });
      if (error) throw error;
      toast.success("Campaign template saved");
      setVariants([]); onReload();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Generate 3 AI templates</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Campaign name</Label><Input value={name} onChange={e=>setName(e.target.value)}/></div>
          <div><Label>Extra notes (optional)</Label><Textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. focus on winter intake, 3-star hotels…"/></div>
          <Button onClick={generate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
            Generate 3 drafts
          </Button>
        </CardContent>
      </Card>
      {variants.map((v,i) => (
        <Card key={i}>
          <CardHeader><CardTitle className="text-base">{v.name || `Variant ${i+1}`}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input value={v.subject} onChange={e => setVariants(vs => vs.map((x,j)=>j===i?{...x,subject:e.target.value}:x))}/>
            <Textarea rows={10} value={v.body} onChange={e => setVariants(vs => vs.map((x,j)=>j===i?{...x,body:e.target.value}:x))}/>
          </CardContent>
        </Card>
      ))}
      {variants.length >= 3 && (
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : null} Save as new campaign
        </Button>
      )}
      <Card>
        <CardHeader><CardTitle>Saved campaigns ({campaigns.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Status</TableHead>
              <TableHead>Queued</TableHead><TableHead>Sent</TableHead><TableHead>Failed</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {campaigns.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge>{c.status}</Badge></TableCell>
                  <TableCell>{c.total_queued}</TableCell>
                  <TableCell>{c.total_sent}</TableCell>
                  <TableCell>{c.total_failed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Campaign Tab ----------------
function CampaignTab({ campaigns, leads, onReload }: { campaigns: HmCampaign[]; leads: HmLead[]; onReload: () => void }) {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [scheduling, setScheduling] = useState(false);

  const eligible = useMemo(() => leads.filter(l => l.email && l.status !== "sent" && l.status !== "queued"), [leads]);
  const allSelected = eligible.length > 0 && selectedLeadIds.length === eligible.length;

  const launch = async () => {
    if (!selectedCampaign) return toast.error("Pick a campaign");
    if (!selectedLeadIds.length) return toast.error("Select at least 1 lead");
    setScheduling(true);
    try {
      const { data, error } = await supabase.functions.invoke("hm-schedule-campaign", {
        body: { campaign_id: selectedCampaign, lead_ids: selectedLeadIds },
      });
      if (error) throw error;
      toast.success(`Queued ${data.queued} sends · first ${new Date(data.first_send).toLocaleString()} · last ${new Date(data.last_send).toLocaleString()}`);
      setSelectedLeadIds([]); onReload();
    } catch (e: any) { toast.error(e.message); } finally { setScheduling(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Launch campaign</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Campaign template</Label>
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger><SelectValue placeholder="Pick a saved campaign"/></SelectTrigger>
            <SelectContent>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name} · {c.daily_cap}/day · {c.gap_seconds}s gap</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm"><b>{eligible.length}</b> eligible leads (with email, not yet sent)</div>
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={(v) => setSelectedLeadIds(v ? eligible.map(e=>e.id) : [])}/>
            <span className="text-sm">Select all</span>
          </div>
        </div>
        <div className="max-h-96 overflow-auto border rounded">
          <Table>
            <TableBody>
              {eligible.slice(0, 300).map(l => (
                <TableRow key={l.id}>
                  <TableCell className="w-8">
                    <Checkbox checked={selectedLeadIds.includes(l.id)} onCheckedChange={(v)=>
                      setSelectedLeadIds(ids => v ? [...ids, l.id] : ids.filter(x=>x!==l.id))
                    }/>
                  </TableCell>
                  <TableCell>{l.name}</TableCell>
                  <TableCell className="text-xs">{l.email}</TableCell>
                  <TableCell className="text-xs">{l.region || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedLeadIds.length} selected · at 50/day ≈ {Math.ceil(selectedLeadIds.length / 50)} working days
          </div>
          <Button onClick={launch} disabled={scheduling || !selectedCampaign || !selectedLeadIds.length} className="gap-2">
            {scheduling ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
            Launch
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Pipeline Tab ----------------
function PipelineTab({ leads, onReload }: { leads: HmLead[]; onReload: () => void }) {
  const byStage = useMemo(() => {
    const m: Record<string, HmLead[]> = {};
    for (const s of STAGES) m[s] = [];
    for (const l of leads) (m[l.admission_stage] || m.lead).push(l);
    return m;
  }, [leads]);

  const advance = async (id: string, stage: string) => {
    const { error } = await supabase.from("hm_leads").update({ admission_stage: stage as any }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Stage updated"); onReload(); }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {STAGES.map(s => (
        <Card key={s} className="min-h-[300px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              {STAGE_LABEL[s]} <Badge>{byStage[s].length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-auto">
            {byStage[s].slice(0, 20).map(l => (
              <div key={l.id} className="border rounded p-2 text-xs space-y-1">
                <div className="font-medium">{l.name}</div>
                <div className="text-muted-foreground">{l.email || "no email"}</div>
                <Select value={l.admission_stage} onValueChange={(v)=>advance(l.id,v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(x => <SelectItem key={x} value={x}>{STAGE_LABEL[x]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}