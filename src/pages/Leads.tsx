import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Briefcase,
  ExternalLink,
  Linkedin,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Globe,
  MapPin,
  Building2,
  Calendar,
  CalendarRange,
  Users,
  Gauge,
  Tag,
  Sparkles,
  Bookmark,
  X,
  ChevronDown,
  Filter,
  Save,
  Trash2,
} from "lucide-react";
import {
  TARGET_AUDIENCE_OPTIONS,
  SECTOR_OPTIONS,
  TARGET_COUNTRIES,
  WORKER_ORIGINS,
  COMPANY_SIZE_OPTIONS,
  SORT_OPTIONS,
  BUILTIN_PRESETS,
  RECRUITER_MODE_FILTERS,
  EMPTY_FILTERS,
  type LeadFilters,
  type SortKey,
  type ContactRequirement,
} from "@/lib/lead-taxonomies";

type RawLead = {
  id: string;
  employer_name: string | null;
  role: string;
  country: string;
  city: string | null;
  priority: string;
  score: number | null;
  urgency_score: number;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  source_url: string | null;
  created_at: string;
  demand_size: number | null;
  worker_origin_focus: string[] | null;
  target_audience_type: string | null;
  sector_tags: string[] | null;
  raw_signals: { payload: Record<string, unknown> | null } | null;
};

type Lead = RawLead & {
  linkedin_url: string | null;
  website_url: string | null;
  company_size: string;
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-primary/10 text-primary border-primary/30",
  low: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const SAVED_PRESETS_KEY = "voynova.leads.savedPresets.v1";
const RECRUITER_MODE_KEY = "voynova.leads.recruiterMode.v1";

function pickLinkedIn(lead: RawLead): string | null {
  if (lead.source_url && /linkedin\.com\//i.test(lead.source_url)) return lead.source_url;
  const payload = lead.raw_signals?.payload;
  if (!payload || typeof payload !== "object") return null;
  const candidates = ["linkedin_url","linkedinUrl","linkedin","company_linkedin","companyLinkedin","employer_linkedin"];
  for (const key of candidates) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "string" && v.includes("linkedin.com")) return v;
  }
  for (const v of Object.values(payload)) {
    if (typeof v === "string") {
      const m = v.match(/https?:\/\/[^\s"']*linkedin\.com\/[^\s"']+/i);
      if (m) return m[0];
    }
  }
  return null;
}

function pickWebsite(lead: RawLead): string | null {
  const payload = lead.raw_signals?.payload as Record<string, unknown> | null | undefined;
  if (payload) {
    for (const key of ["website","company_website","companyWebsite","website_url","employer_website","url"]) {
      const v = payload[key];
      if (typeof v === "string" && /^https?:\/\//i.test(v) && !/linkedin\.com|facebook\.com|indeed\.com/i.test(v)) {
        return v;
      }
    }
  }
  if (
    lead.source_url &&
    !/linkedin\.com|facebook\.com|indeed\.com|google\.com/i.test(lead.source_url)
  ) {
    return lead.source_url;
  }
  return null;
}

function collectUrls(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload) return [];
  const urls = new Set<string>();
  const walk = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      const m = v.match(/https?:\/\/[^\s"'<>)]+/gi);
      if (m) m.forEach((x) => urls.add(x));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(payload);
  return Array.from(urls);
}

function collectEmails(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload) return [];
  const emails = new Set<string>();
  const walk = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      const m = v.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (m) m.forEach((e) => emails.add(e));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(payload);
  return Array.from(emails);
}

function audienceLabel(value: string | null): string {
  if (!value) return "—";
  return TARGET_AUDIENCE_OPTIONS.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}

function sectorLabel(value: string): string {
  return SECTOR_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function sizeLabel(value: string): string {
  return COMPANY_SIZE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Infer company size bucket from headcount/employees fields in raw payload. */
function inferCompanySize(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return "unknown";
  const candidateKeys = [
    "company_size","companySize","employees","employee_count","employeeCount",
    "headcount","staff_count","size","company_employees",
  ];
  let n: number | null = null;
  for (const key of candidateKeys) {
    const v = payload[key];
    if (typeof v === "number" && Number.isFinite(v)) { n = v; break; }
    if (typeof v === "string") {
      const m = v.match(/(\d[\d,\.]*)/);
      if (m) {
        const parsed = parseInt(m[1].replace(/[,\.]/g, ""), 10);
        if (Number.isFinite(parsed)) { n = parsed; break; }
      }
      const lower = v.toLowerCase();
      if (/1\s*-\s*50|small|<\s*50/.test(lower)) return "small";
      if (/51\s*-\s*250|medium|mid/.test(lower)) return "medium";
      if (/251\s*-\s*1000|large/.test(lower)) return "large";
      if (/1000\+|enterprise|10000?\+/.test(lower)) return "enterprise";
    }
  }
  if (n == null) return "unknown";
  if (n <= 50) return "small";
  if (n <= 250) return "medium";
  if (n <= 1000) return "large";
  return "enterprise";
}

function isoDay(d: string | null): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

type SavedPreset = { id: string; name: string; filters: LeadFilters };

function loadSavedPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(SAVED_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedPreset[];
  } catch {
    return [];
  }
}

const Leads = () => {
  const [loading, setLoading] = useState(true);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<LeadFilters>(() => {
    try {
      const wasRecruiter = localStorage.getItem(RECRUITER_MODE_KEY) === "1";
      return wasRecruiter ? RECRUITER_MODE_FILTERS : EMPTY_FILTERS;
    } catch {
      return EMPTY_FILTERS;
    }
  });
  const [selected, setSelected] = useState<Lead | null>(null);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(loadSavedPresets);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  const recruiterMode = useMemo(
    () =>
      filters.workerOrigins.length === RECRUITER_MODE_FILTERS.workerOrigins.length &&
      filters.audiences.length === RECRUITER_MODE_FILTERS.audiences.length &&
      filters.sectors.length === RECRUITER_MODE_FILTERS.sectors.length &&
      filters.countries.length === RECRUITER_MODE_FILTERS.countries.length,
    [filters],
  );

  const load = async () => {
    setLoading(true);
    const [{ data, error }, countRes] = await Promise.all([
      supabase
        .from("demand_leads")
        .select(
          "id,employer_name,role,country,city,priority,score,urgency_score,contact_email,contact_name,contact_phone,source_url,created_at,demand_size,worker_origin_focus,target_audience_type,sector_tags,raw_signals(payload)",
        )
        .order("urgency_score", { ascending: false })
        .limit(2000),
      supabase.from("demand_leads").select("id", { count: "exact", head: true }),
    ]);
    if (error) {
      console.error(error);
      toast.error("Failed to load leads");
      setLoading(false);
      return;
    }
    const enriched: Lead[] = (data ?? []).map((l) => {
      const raw = l as unknown as RawLead;
      return {
        ...raw,
        linkedin_url: pickLinkedIn(raw),
        website_url: pickWebsite(raw),
        company_size: inferCompanySize(raw.raw_signals?.payload ?? null),
      };
    });
    setAllLeads(enriched);
    setTotalCount(countRes.count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // persist recruiter mode
  useEffect(() => {
    try {
      localStorage.setItem(RECRUITER_MODE_KEY, recruiterMode ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [recruiterMode]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const fromMs = isoDay(filters.dateFrom);
    const toMs = isoDay(filters.dateTo);
    // Split audience filter into "people" types and "employer:<sector>" tags.
    const audPeople = filters.audiences.filter((a) => !a.startsWith("employer:"));
    const audEmployerSectors = filters.audiences
      .filter((a) => a.startsWith("employer:"))
      .map((a) => a.slice("employer:".length));
    const out = allLeads.filter((l) => {
      if (filters.countries.length && !filters.countries.includes(l.country)) return false;
      if (audPeople.length || audEmployerSectors.length) {
        const matchesPeople =
          audPeople.length > 0 &&
          l.target_audience_type != null &&
          audPeople.includes(l.target_audience_type);
        const matchesEmployer =
          audEmployerSectors.length > 0 &&
          l.target_audience_type === "employer_direct" &&
          (l.sector_tags ?? []).some((t) => audEmployerSectors.includes(t));
        if (!matchesPeople && !matchesEmployer) return false;
      }
      if (filters.workerOrigins.length) {
        const focus = l.worker_origin_focus ?? [];
        if (!focus.some((w) => filters.workerOrigins.includes(w))) return false;
      }
      if (filters.sectors.length) {
        const tags = l.sector_tags ?? [];
        if (!tags.some((t) => filters.sectors.includes(t))) return false;
      }
      if (filters.sizes.length && !filters.sizes.includes(l.company_size)) return false;
      if (filters.minScore > 0) {
        const s = l.score ?? l.urgency_score ?? 0;
        if (s < filters.minScore) return false;
      }
      if (fromMs != null) {
        const t = new Date(l.created_at).getTime();
        if (t < fromMs) return false;
      }
      if (toMs != null) {
        const t = new Date(l.created_at).getTime();
        // include the whole "to" day
        if (t > toMs + 24 * 3600 * 1000 - 1) return false;
      }
      for (const req of filters.contactReq) {
        if (req === "email" && !l.contact_email) return false;
        if (req === "phone" && !l.contact_phone) return false;
        if (req === "website" && !l.website_url) return false;
      }
      if (q) {
        const hay = [
          l.employer_name,
          l.role,
          l.city,
          l.country,
          l.contact_email,
          l.contact_name,
          l.target_audience_type,
          (l.sector_tags ?? []).join(" "),
          (l.worker_origin_focus ?? []).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...out].sort((a, b) => {
      switch (filters.sort) {
        case "recency":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "country":
          return (a.country ?? "").localeCompare(b.country ?? "");
        case "industry": {
          const ai = (a.sector_tags ?? [])[0] ?? "";
          const bi = (b.sector_tags ?? [])[0] ?? "";
          return ai.localeCompare(bi);
        }
        case "demand": {
          const ad = a.demand_size ?? 0;
          const bd = b.demand_size ?? 0;
          if (ad !== bd) return bd - ad;
          return (b.urgency_score ?? 0) - (a.urgency_score ?? 0);
        }
        case "priority":
        default: {
          const ar = PRIORITY_RANK[a.priority] ?? 9;
          const br = PRIORITY_RANK[b.priority] ?? 9;
          if (ar !== br) return ar - br;
          return (b.urgency_score ?? 0) - (a.urgency_score ?? 0);
        }
      }
    });
    return sorted;
  }, [allLeads, filters]);

  const activeChipCount =
    filters.countries.length +
    filters.audiences.length +
    filters.workerOrigins.length +
    filters.sectors.length +
    filters.sizes.length +
    filters.contactReq.length +
    (filters.minScore > 0 ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.search ? 1 : 0);

  const toggleRecruiterMode = (on: boolean) => {
    setFilters(on ? RECRUITER_MODE_FILTERS : EMPTY_FILTERS);
  };

  const applyPreset = (p: { filters: LeadFilters }) => {
    setFilters(p.filters);
    toast.success("Preset applied");
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Give the preset a name");
      return;
    }
    const next: SavedPreset = { id: crypto.randomUUID(), name, filters };
    const updated = [next, ...savedPresets];
    setSavedPresets(updated);
    try {
      localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(updated));
    } catch {
      /* ignore */
    }
    setPresetName("");
    setSaveOpen(false);
    toast.success(`Saved "${name}"`);
  };

  const deletePreset = (id: string) => {
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    try {
      localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="border-b bg-background/60 backdrop-blur sticky top-0 z-20">
        <div className="px-6 lg:px-8 py-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Briefcase className="h-3.5 w-3.5 text-accent" />
              Lead search
            </div>
            <h1 className="text-3xl font-bold mt-1">Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">{filtered.length}</span> of{" "}
              {allLeads.length} loaded · {totalCount} total in database
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
              <Sparkles
                className={`h-4 w-4 ${recruiterMode ? "text-accent" : "text-muted-foreground"}`}
              />
              <Label htmlFor="recruiter-mode" className="text-sm cursor-pointer">
                Recruiter Mode
              </Label>
              <Switch
                id="recruiter-mode"
                checked={recruiterMode}
                onCheckedChange={toggleRecruiterMode}
              />
            </div>
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 lg:p-8 space-y-4">
        {/* Search + sort + presets */}
        <Card className="p-4 rounded-xl space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employer, role, city, sector, contact…"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-9"
              />
            </div>
            <Select
              value={filters.sort}
              onValueChange={(v) => setFilters({ ...filters, sort: v as SortKey })}
            >
              <SelectTrigger className="lg:w-56">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setSaveOpen(true)} disabled={!activeChipCount}>
              <Save className="h-4 w-4 mr-2" /> Save preset
            </Button>
            <Button
              variant="ghost"
              onClick={() => setFilters(EMPTY_FILTERS)}
              disabled={!activeChipCount}
            >
              <X className="h-4 w-4 mr-2" /> Clear
            </Button>
          </div>

          {/* Filter rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <MultiFilter
              label="Target audience"
              icon={<Filter className="h-3.5 w-3.5" />}
              options={TARGET_AUDIENCE_OPTIONS}
              selected={filters.audiences}
              onChange={(v) => setFilters({ ...filters, audiences: v })}
            />
            <MultiFilter
              label="Country"
              icon={<MapPin className="h-3.5 w-3.5" />}
              options={TARGET_COUNTRIES.map((c) => ({ value: c, label: c }))}
              selected={filters.countries}
              onChange={(v) => setFilters({ ...filters, countries: v })}
            />
            <MultiFilter
              label="Worker source"
              icon={<Globe className="h-3.5 w-3.5" />}
              options={WORKER_ORIGINS.map((c) => ({ value: c, label: c }))}
              selected={filters.workerOrigins}
              onChange={(v) => setFilters({ ...filters, workerOrigins: v })}
            />
            <MultiFilter
              label="Industry / sector"
              icon={<Tag className="h-3.5 w-3.5" />}
              options={SECTOR_OPTIONS}
              selected={filters.sectors}
              onChange={(v) => setFilters({ ...filters, sectors: v })}
            />
            <MultiFilter
              label="Company size"
              icon={<Users className="h-3.5 w-3.5" />}
              options={COMPANY_SIZE_OPTIONS}
              selected={filters.sizes}
              onChange={(v) => setFilters({ ...filters, sizes: v })}
            />
          </div>

          {/* Score slider + date range */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5" />
                  Min priority score
                </Label>
                <span className="text-xs font-medium text-foreground">
                  {filters.minScore > 0 ? `≥ ${filters.minScore}` : "Any"}
                </span>
              </div>
              <Slider
                value={[filters.minScore]}
                min={0}
                max={100}
                step={5}
                onValueChange={(v) => setFilters({ ...filters, minScore: v[0] ?? 0 })}
              />
            </div>

            <DateRangeFilter
              from={filters.dateFrom}
              to={filters.dateTo}
              onChange={(from, to) => setFilters({ ...filters, dateFrom: from, dateTo: to })}
            />

            <div className="flex flex-wrap items-end gap-2 lg:justify-end">
              {[7, 30, 90].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setFilters({
                      ...filters,
                      dateFrom: new Date(Date.now() - d * 24 * 3600 * 1000)
                        .toISOString()
                        .slice(0, 10),
                      dateTo: null,
                    })
                  }
                >
                  Last {d}d
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFilters({ ...filters, dateFrom: null, dateTo: null })}
                disabled={!filters.dateFrom && !filters.dateTo}
              >
                Clear dates
              </Button>
            </div>
          </div>

          {/* Contact requirement chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">
              Has
            </span>
            {(["email", "phone", "website"] as ContactRequirement[]).map((req) => {
              const on = filters.contactReq.includes(req);
              return (
                <button
                  key={req}
                  type="button"
                  onClick={() => {
                    const next = on
                      ? filters.contactReq.filter((r) => r !== req)
                      : [...filters.contactReq, req];
                    setFilters({ ...filters, contactReq: next });
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full border capitalize transition ${
                    on
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:bg-muted border-border"
                  }`}
                >
                  {req === "email" && <Mail className="h-3 w-3 mr-1 inline" />}
                  {req === "phone" && <Phone className="h-3 w-3 mr-1 inline" />}
                  {req === "website" && <Globe className="h-3 w-3 mr-1 inline" />}
                  {req}
                </button>
              );
            })}
          </div>

          {/* Preset row */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1 inline-flex items-center gap-1">
              <Bookmark className="h-3 w-3" /> Presets
            </span>
            {BUILTIN_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                className="text-xs px-3 py-1.5 rounded-full border bg-card hover:bg-muted hover:border-accent transition"
              >
                {p.name}
              </button>
            ))}
            {savedPresets.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 text-xs rounded-full border bg-accent/5 border-accent/30 overflow-hidden"
              >
                <button
                  onClick={() => applyPreset(p)}
                  className="px-3 py-1.5 hover:bg-accent/10 transition"
                >
                  ★ {p.name}
                </button>
                <button
                  onClick={() => deletePreset(p.id)}
                  className="px-2 py-1.5 hover:bg-destructive/10 hover:text-destructive transition"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </Card>

        {/* Active filter chips */}
        {activeChipCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.countries.map((c) => (
              <ActiveChip
                key={`c-${c}`}
                label={c}
                onClear={() =>
                  setFilters({ ...filters, countries: filters.countries.filter((x) => x !== c) })
                }
              />
            ))}
            {filters.audiences.map((a) => (
              <ActiveChip
                key={`a-${a}`}
                label={audienceLabel(a)}
                onClear={() =>
                  setFilters({ ...filters, audiences: filters.audiences.filter((x) => x !== a) })
                }
              />
            ))}
            {filters.workerOrigins.map((w) => (
              <ActiveChip
                key={`w-${w}`}
                label={`From ${w}`}
                onClear={() =>
                  setFilters({
                    ...filters,
                    workerOrigins: filters.workerOrigins.filter((x) => x !== w),
                  })
                }
              />
            ))}
            {filters.sectors.map((s) => (
              <ActiveChip
                key={`s-${s}`}
                label={sectorLabel(s)}
                onClear={() =>
                  setFilters({ ...filters, sectors: filters.sectors.filter((x) => x !== s) })
                }
              />
            ))}
            {filters.contactReq.map((r) => (
              <ActiveChip
                key={`r-${r}`}
                label={`Has ${r}`}
                onClear={() =>
                  setFilters({
                    ...filters,
                    contactReq: filters.contactReq.filter((x) => x !== r),
                  })
                }
              />
            ))}
            {filters.sizes.map((s) => (
              <ActiveChip
                key={`sz-${s}`}
                label={sizeLabel(s)}
                onClear={() =>
                  setFilters({ ...filters, sizes: filters.sizes.filter((x) => x !== s) })
                }
              />
            ))}
            {filters.minScore > 0 && (
              <ActiveChip
                label={`Score ≥ ${filters.minScore}`}
                onClear={() => setFilters({ ...filters, minScore: 0 })}
              />
            )}
            {filters.dateFrom && (
              <ActiveChip
                label={`From ${filters.dateFrom}`}
                onClear={() => setFilters({ ...filters, dateFrom: null })}
              />
            )}
            {filters.dateTo && (
              <ActiveChip
                label={`To ${filters.dateTo}`}
                onClear={() => setFilters({ ...filters, dateTo: null })}
              />
            )}
          </div>
        )}

        {/* Table */}
        <Card className="rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No leads match your filters. Try clearing some chips or turning off Recruiter Mode.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Employer</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Sectors</TableHead>
                    <TableHead>Worker source</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-center">Contacts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l, i) => (
                    <TableRow
                      key={l.id}
                      className={`cursor-pointer hover:bg-muted/50 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                      onClick={() => setSelected(l)}
                    >
                      <TableCell className="font-medium max-w-[200px] truncate" title={l.employer_name ?? ""}>
                        {l.employer_name ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={l.role}>
                        {l.role}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {l.country}
                        {l.city ? ` · ${l.city}` : ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="text-muted-foreground">
                          {audienceLabel(l.target_audience_type)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(l.sector_tags ?? []).slice(0, 3).map((t) => (
                            <Badge
                              key={t}
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 h-5"
                            >
                              {sectorLabel(t)}
                            </Badge>
                          ))}
                          {(l.sector_tags ?? []).length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{(l.sector_tags ?? []).length - 3}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                          {(l.worker_origin_focus ?? []).map((w) => (
                            <Badge
                              key={w}
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 h-5 bg-accent/10 text-accent border-accent/30"
                            >
                              {w}
                            </Badge>
                          ))}
                          {!l.worker_origin_focus?.length && (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`capitalize ${PRIORITY_STYLES[l.priority] ?? ""}`}
                        >
                          {l.priority}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <ContactIcon
                            href={l.contact_email ? `mailto:${l.contact_email}` : null}
                            title={l.contact_email ?? undefined}
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </ContactIcon>
                          <ContactIcon
                            href={l.contact_phone ? `tel:${l.contact_phone}` : null}
                            title={l.contact_phone ?? undefined}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </ContactIcon>
                          <ContactIcon
                            href={l.linkedin_url}
                            external
                            title={l.linkedin_url ?? undefined}
                          >
                            <Linkedin className="h-3.5 w-3.5" />
                          </ContactIcon>
                          <ContactIcon
                            href={l.website_url}
                            external
                            title={l.website_url ?? undefined}
                          >
                            <Globe className="h-3.5 w-3.5" />
                          </ContactIcon>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      {/* Save preset dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current filters as preset</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Serbia construction agencies"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && savePreset()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePreset}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadDetailDrawer lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

export default Leads;

function ContactIcon({
  href,
  external,
  title,
  children,
}: {
  href: string | null;
  external?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground/30 cursor-not-allowed"
        aria-hidden
      >
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      title={title}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-primary hover:bg-primary/10 transition"
    >
      {children}
    </a>
  );
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/30 rounded-full px-2.5 py-1">
      {label}
      <button onClick={onClear} className="hover:text-destructive">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function MultiFilter({
  label,
  icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const visible = useMemo(
    () =>
      q.trim()
        ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
        : options,
    [options, q],
  );
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal">
          <span className="inline-flex items-center gap-2 text-sm truncate">
            {icon}
            {label}
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {selected.length}
              </Badge>
            )}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-2 border-b">
          <Input
            placeholder={`Filter ${label.toLowerCase()}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8"
          />
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {visible.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">No matches</div>
            )}
            {visible.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={`w-full text-left text-sm px-3 py-1.5 rounded-md flex items-center gap-2 hover:bg-muted ${
                    on ? "text-primary font-medium" : ""
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                      on ? "bg-primary border-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        </ScrollArea>
        {selected.length > 0 && (
          <div className="p-2 border-t flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button size="sm" variant="ghost" onClick={() => onChange([])}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  const fmt = (d?: Date) =>
    d
      ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : null;
  const label =
    fromDate || toDate
      ? `${fmt(fromDate) ?? "…"} → ${fmt(toDate) ?? "…"}`
      : "Date range";
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
        <CalendarRange className="h-3.5 w-3.5" />
        Date range (created)
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !fromDate && !toDate && "text-muted-foreground",
            )}
          >
            <Calendar className="h-4 w-4 mr-2" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <CalendarUI
            mode="range"
            selected={{ from: fromDate, to: toDate }}
            onSelect={(range) => {
              const f = range?.from ? range.from.toISOString().slice(0, 10) : null;
              const t = range?.to ? range.to.toISOString().slice(0, 10) : null;
              onChange(f, t);
            }}
            numberOfMonths={2}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LeadDetailDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const open = !!lead;
  const payload = (lead?.raw_signals?.payload ?? null) as Record<string, unknown> | null;
  const allEmails = lead
    ? Array.from(
        new Set(
          [lead.contact_email, ...collectEmails(payload)].filter((e): e is string => !!e),
        ),
      )
    : [];
  const allUrls = lead ? collectUrls(payload) : [];
  const linkedinUrls = allUrls.filter((u) => /linkedin\.com\//i.test(u));
  const otherUrls = allUrls.filter((u) => !/linkedin\.com\//i.test(u));

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col p-0">
        {lead && (
          <>
            <SheetHeader className="p-6 pb-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-accent" />
                {lead.employer_name ?? "Unknown employer"}
              </SheetTitle>
              <SheetDescription>{lead.role}</SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Extracted fields
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field
                      icon={<MapPin className="h-3.5 w-3.5" />}
                      label="Location"
                      value={[lead.country, lead.city].filter(Boolean).join(" · ") || "—"}
                    />
                    <Field
                      icon={<Tag className="h-3.5 w-3.5" />}
                      label="Priority"
                      value={lead.priority}
                    />
                    <Field label="Audience" value={audienceLabel(lead.target_audience_type)} />
                    <Field
                      label="Sectors"
                      value={(lead.sector_tags ?? []).map(sectorLabel).join(", ") || "—"}
                    />
                    <Field
                      label="Worker source"
                      value={(lead.worker_origin_focus ?? []).join(", ") || "—"}
                    />
                    <Field label="Score" value={lead.score?.toString() ?? "—"} />
                    <Field label="Urgency" value={lead.urgency_score?.toString() ?? "0"} />
                    <Field label="Contact name" value={lead.contact_name ?? "—"} />
                    <Field
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      label="Created"
                      value={new Date(lead.created_at).toLocaleString("en-GB")}
                    />
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Contact links
                  </h3>
                  <div className="space-y-2">
                    {allEmails.length === 0 &&
                      !lead.contact_phone &&
                      linkedinUrls.length === 0 &&
                      !lead.website_url && (
                        <p className="text-sm text-muted-foreground">
                          No direct contact details found.
                        </p>
                      )}
                    {allEmails.map((e) => (
                      <a
                        key={e}
                        href={`mailto:${e}`}
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {e}
                      </a>
                    ))}
                    {lead.contact_phone && (
                      <a
                        href={`tel:${lead.contact_phone}`}
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {lead.contact_phone}
                      </a>
                    )}
                    {linkedinUrls.map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline break-all"
                      >
                        <Linkedin className="h-3.5 w-3.5 shrink-0" />
                        {u}
                      </a>
                    ))}
                    {lead.website_url && (
                      <a
                        href={lead.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-foreground hover:underline break-all"
                      >
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        {lead.website_url}
                      </a>
                    )}
                    {lead.source_url && lead.source_url !== lead.website_url && (
                      <a
                        href={lead.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground break-all"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        {lead.source_url}
                      </a>
                    )}
                  </div>
                </section>

                {otherUrls.length > 0 && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Other URLs in payload ({otherUrls.length})
                      </h3>
                      <div className="space-y-1.5 max-h-48 overflow-auto">
                        {otherUrls.map((u) => (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground break-all"
                          >
                            <Globe className="h-3 w-3 shrink-0" />
                            {u}
                          </a>
                        ))}
                      </div>
                    </section>
                  </>
                )}

                <Separator />

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Raw payload
                  </h3>
                  <pre className="text-xs bg-muted/50 border rounded-lg p-3 overflow-auto max-h-96 whitespace-pre-wrap break-all">
                    {payload ? JSON.stringify(payload, null, 2) : "No raw payload available."}
                  </pre>
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
        {icon}
        {label}
      </div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}
