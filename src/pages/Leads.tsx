import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
  Download,
  FileJson,
  FileSpreadsheet,
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
  FileText,
  Flame,
  Send,
  CheckSquare,
  Copy,
  Sparkle,
  Star,
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
import { computeLeadScore, SCORE_DIMENSIONS, type ScoreBreakdown } from "@/lib/lead-scoring";
import { dedupeAndEnrich, type Enrichment } from "@/lib/lead-enrichment";
import { exportLeads, exportLeadsPdf, safeFileSlug } from "@/lib/lead-export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutGrid, List, ArrowUpRight, ArrowLeft } from "lucide-react";
import { LeadCard } from "@/components/leads/LeadCard";
import {
  classifyRoleType,
  extractDomain,
  getFreshness,
  getTrustTier,
  TRUST_RANK,
  type TrustTier,
  type RoleType,
} from "@/lib/lead-classifiers";
import { useHotkeys } from "@/hooks/use-hotkeys";
import {
  BarChart as RBarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart3, GitCompareArrows, PanelRightClose, PanelRightOpen } from "lucide-react";

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
  quality_score: number | null;
};

type Lead = RawLead & {
  linkedin_url: string | null;
  website_url: string | null;
  company_size: string;
  computed_score: number;
  score_breakdown: ScoreBreakdown;
  enrichment: Enrichment;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"cards" | "table">(() => {
    try {
      const v = localStorage.getItem("voynova.leads.viewMode.v1");
      return v === "table" ? "table" : "cards";
    } catch {
      return "cards";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("voynova.leads.viewMode.v1", viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(loadSavedPresets);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const PAGE_SIZE = 21;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [hideStale, setHideStale] = useState(false);
  const [minTrust, setMinTrust] = useState<TrustTier | "all">("all");
  const [roleTypeFilter, setRoleTypeFilter] = useState<RoleType | "all">("all");
  const [statsOpen, setStatsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [blacklistedDomains, setBlacklistedDomains] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
          "id,employer_name,role,country,city,priority,score,urgency_score,quality_score,contact_email,contact_name,contact_phone,source_url,created_at,demand_size,worker_origin_focus,target_audience_type,sector_tags,raw_signals(payload)",
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
    const scored = (data ?? []).map((l) => {
      const raw = l as unknown as RawLead;
      const breakdown = computeLeadScore(raw);
      return {
        ...raw,
        linkedin_url: pickLinkedIn(raw),
        website_url: pickWebsite(raw),
        company_size: inferCompanySize(raw.raw_signals?.payload ?? null),
        computed_score: breakdown.total,
        score_breakdown: breakdown,
      };
    });
    // Dedupe by domain + company name; fold contacts/emails from duplicates.
    const deduped: Lead[] = dedupeAndEnrich(scored, (l) =>
      collectEmails(l.raw_signals?.payload ?? null),
    );
    setAllLeads(deduped);
    setTotalCount(countRes.count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Load the set of bookmarked lead ids from the CRM table.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("lead_crm")
        .select("lead_id")
        .eq("bookmarked", true);
      if (cancelled || error) return;
      setBookmarkedIds(new Set((data ?? []).map((r) => r.lead_id as string)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load blacklisted domains.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("lead_blacklist").select("domain");
      if (cancelled || error) return;
      setBlacklistedDomains(
        new Set(((data ?? []) as Array<{ domain: string }>).map((r) => r.domain.toLowerCase())),
      );
    })();
    return () => {
      cancelled = true;
    };
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
      if (bookmarkedOnly && !bookmarkedIds.has(l.id)) return false;
      if (hideStale && getFreshness(l.created_at) === "stale") return false;
      if (minTrust !== "all") {
        const t = getTrustTier(
          ((l.raw_signals?.payload as Record<string, unknown> | null)?.source as string | undefined) ??
            l.source_url,
        );
        if (TRUST_RANK[t] < TRUST_RANK[minTrust]) return false;
      }
      if (roleTypeFilter !== "all") {
        if (classifyRoleType(l.role, l.target_audience_type) !== roleTypeFilter) return false;
      }
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
        const s = l.computed_score ?? l.score ?? l.urgency_score ?? 0;
        if (s < filters.minScore) return false;
      }
      if (filters.minQuality > 0) {
        if ((l.quality_score ?? 0) < filters.minQuality) return false;
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
        case "employer":
          return (a.employer_name ?? "").localeCompare(b.employer_name ?? "");
        case "industry": {
          const ai = (a.sector_tags ?? [])[0] ?? "";
          const bi = (b.sector_tags ?? [])[0] ?? "";
          return ai.localeCompare(bi);
        }
        case "demand": {
          const ad = a.demand_size ?? 0;
          const bd = b.demand_size ?? 0;
          if (ad !== bd) return bd - ad;
          return (b.computed_score ?? 0) - (a.computed_score ?? 0);
        }
        case "priority":
        default: {
          // Composite Voynova score is the primary sort signal; priority tier
          // breaks ties so manually-flagged hot leads stay near the top.
          const av = a.computed_score ?? 0;
          const bv = b.computed_score ?? 0;
          if (av !== bv) return bv - av;
          const ar = PRIORITY_RANK[a.priority] ?? 9;
          const br = PRIORITY_RANK[b.priority] ?? 9;
          if (ar !== br) return ar - br;
          return (b.urgency_score ?? 0) - (a.urgency_score ?? 0);
        }
      }
    });
    return sorted;
  }, [allLeads, filters, bookmarkedOnly, bookmarkedIds, hideStale, minTrust, roleTypeFilter]);

  // Reset pagination whenever filters/sort change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters, bookmarkedOnly, hideStale, minTrust, roleTypeFilter]);

  // ---- Data quality + stats -------------------------------------------------
  const dataQuality = useMemo(() => {
    const n = filtered.length || 1;
    const stat = (pred: (l: Lead) => boolean) =>
      Math.round((filtered.filter(pred).length / n) * 100);
    return {
      total: filtered.length,
      email: stat((l) => !!l.contact_email),
      phone: stat((l) => !!l.contact_phone),
      linkedin: stat((l) => !!l.linkedin_url),
      fresh: stat((l) => getFreshness(l.created_at) === "fresh"),
      highTrust: stat((l) =>
        getTrustTier(
          ((l.raw_signals?.payload as Record<string, unknown> | null)?.source as string | undefined) ??
            l.source_url,
        ) === "high",
      ),
    };
  }, [filtered]);

  const stats = useMemo(() => {
    const countries = new Map<string, number>();
    const industries = new Map<string, number>();
    const sources = new Map<string, number>();
    let scoreSum = 0;
    for (const l of filtered) {
      countries.set(l.country, (countries.get(l.country) ?? 0) + 1);
      for (const t of l.sector_tags ?? []) {
        industries.set(t, (industries.get(t) ?? 0) + 1);
      }
      const src = getTrustTier(
        ((l.raw_signals?.payload as Record<string, unknown> | null)?.source as string | undefined) ??
          l.source_url,
      );
      sources.set(src, (sources.get(src) ?? 0) + 1);
      scoreSum += l.computed_score ?? 0;
    }
    const top = (m: Map<string, number>, n = 5) =>
      Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, value]) => ({ name, value }));
    return {
      countries: top(countries),
      industries: top(industries),
      sources: Array.from(sources.entries()).map(([name, value]) => ({ name, value })),
      avgScore: filtered.length ? Math.round(scoreSum / filtered.length) : 0,
    };
  }, [filtered]);

  const visibleLeads = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

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

  // ---- Bulk actions ---------------------------------------------------------
  const selectedLeads = useMemo(
    () => filtered.filter((l) => selectedIds.has(l.id)),
    [filtered, selectedIds],
  );

  const clearSelection = () => setSelectedIds(new Set());

  const clearAllFilters = () => {
    setFilters(EMPTY_FILTERS);
    setBookmarkedOnly(false);
    setHideStale(false);
    setMinTrust("all");
    setRoleTypeFilter("all");
  };

  useHotkeys({
    "/": (e) => {
      e.preventDefault();
      searchInputRef.current?.focus();
    },
    Escape: () => clearAllFilters(),
  });

  const bulkExportCsv = () => {
    if (!selectedLeads.length) return;
    exportLeads(selectedLeads, "csv", "voynova-leads-selected");
    toast.success(`Exported ${selectedLeads.length} leads to CSV`);
  };

  const bulkExportPdf = () => {
    if (!selectedLeads.length) return;
    exportLeadsPdf(selectedLeads, "voynova-leads-selected");
    toast.success(`Exported ${selectedLeads.length} leads to PDF`);
  };

  const bulkMarkHighPriority = async () => {
    if (!selectedLeads.length) return;
    const ids = selectedLeads.map((l) => l.id);
    const { error } = await supabase
      .from("demand_leads")
      .update({ priority: "high" })
      .in("id", ids);
    if (error) {
      toast.error("Failed to update priority");
      console.error(error);
      return;
    }
    setAllLeads((prev) =>
      prev.map((l) => (selectedIds.has(l.id) ? { ...l, priority: "high" } : l)),
    );
    toast.success(`Marked ${ids.length} leads as High priority`);
  };

  const bulkAddToOutreach = async () => {
    if (!selectedLeads.length) return;
    const ids = selectedLeads.map((l) => l.id);
    const { error } = await supabase
      .from("demand_leads")
      .update({ review_status: "outreach" })
      .in("id", ids);
    if (error) {
      toast.error("Failed to add to Outreach");
      console.error(error);
      return;
    }
    toast.success(`Added ${ids.length} leads to Outreach`);
    clearSelection();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="border-b bg-background/60 backdrop-blur sticky top-0 z-20">
        <div className="px-6 lg:px-8 py-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <Breadcrumb className="mb-2">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/" className="inline-flex items-center gap-1">
                      <ArrowLeft className="h-3 w-3" /> Dashboard
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Leads</BreadcrumbPage>
                </BreadcrumbItem>
                {(filters.search || bookmarkedOnly) && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="text-muted-foreground font-normal">
                        {bookmarkedOnly
                          ? "Bookmarked"
                          : `Search: "${filters.search}"`}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
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
            <div
              className="inline-flex rounded-md border bg-card overflow-hidden"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                aria-pressed={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5 ${
                  viewMode === "cards"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Cards
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "table"}
                onClick={() => setViewMode("table")}
                className={`px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5 border-l ${
                  viewMode === "table"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <List className="h-3.5 w-3.5" /> Table
              </button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={!allLeads.length}>
                  <Download className="h-4 w-4 mr-2" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    const picked = filtered.filter((l) => selectedIds.has(l.id));
                    exportLeads(picked, "csv", "voynova-leads-selected");
                  }}
                  disabled={selectedIds.size === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Download CSV — Selected ({selectedIds.size})
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportLeads(filtered, "csv", "voynova-leads-filtered")}
                  disabled={!filtered.length}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Download CSV — Filtered ({filtered.length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLeads(allLeads, "csv", "voynova-leads-all")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Download CSV — All ({allLeads.length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLeads(allLeads, "json")}>
                  <FileJson className="h-4 w-4 mr-2" />
                  Export JSON ({allLeads.length})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                ref={searchInputRef}
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
              variant={bookmarkedOnly ? "default" : "outline"}
              onClick={() => setBookmarkedOnly((v) => !v)}
              aria-pressed={bookmarkedOnly}
              title="Show only bookmarked leads"
            >
              <Star
                className={`h-4 w-4 mr-2 ${bookmarkedOnly ? "fill-current" : ""}`}
              />
              Bookmarked{bookmarkedOnly ? ` (${bookmarkedIds.size})` : ""}
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

          {/* Trust / role / stale row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Trust tier</Label>
              <Select value={minTrust} onValueChange={(v) => setMinTrust(v as TrustTier | "all")}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="high">High (Company / LinkedIn)</SelectItem>
                  <SelectItem value="medium">Medium (Indeed / Directory)</SelectItem>
                  <SelectItem value="low">Low (Facebook / Classifieds)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Role type</Label>
              <Select value={roleTypeFilter} onValueChange={(v) => setRoleTypeFilter(v as RoleType | "all")}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="decision_maker">Decision Maker</SelectItem>
                  <SelectItem value="recruiter">Recruiter</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Label htmlFor="hide-stale" className="text-xs text-muted-foreground cursor-pointer">
                Hide stale (&gt;45d)
              </Label>
              <Switch id="hide-stale" checked={hideStale} onCheckedChange={setHideStale} />
            </div>
            <Button
              size="sm"
              variant={statsOpen ? "default" : "outline"}
              onClick={() => setStatsOpen((v) => !v)}
              aria-pressed={statsOpen}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              {statsOpen ? "Hide stats" : "Stats"}
            </Button>
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

        {/* Bulk actions toolbar */}
        {selectedIds.size > 0 && (
          <div className="sticky top-[88px] z-20 animate-in fade-in slide-in-from-top-2">
            <Card className="rounded-xl border-primary/40 bg-primary/5 backdrop-blur p-3 flex flex-wrap items-center gap-2 shadow-md">
              <div className="flex items-center gap-2 px-2 text-sm font-medium text-primary">
                <CheckSquare className="h-4 w-4" />
                {selectedIds.size} selected
              </div>
              <Separator orientation="vertical" className="h-6" />
              <Button size="sm" variant="outline" onClick={bulkExportCsv}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={bulkExportPdf}>
                <FileText className="h-4 w-4 mr-2" /> Export PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkMarkHighPriority}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Flame className="h-4 w-4 mr-2" /> Mark High Priority
              </Button>
              <Button size="sm" onClick={bulkAddToOutreach}>
                <Send className="h-4 w-4 mr-2" /> Add to Outreach
              </Button>
              {selectedIds.size >= 2 && (
                <Button size="sm" variant="secondary" onClick={() => setCompareOpen(true)}>
                  <GitCompareArrows className="h-4 w-4 mr-2" />
                  Compare ({selectedIds.size})
                </Button>
              )}
              <div className="ml-auto">
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Data quality bar */}
        {!loading && filtered.length > 0 && (
          <Card className="rounded-xl p-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground uppercase tracking-wider mr-1">Data quality</span>
            <QualityPill label="Email" pct={dataQuality.email} />
            <QualityPill label="Phone" pct={dataQuality.phone} />
            <QualityPill label="LinkedIn" pct={dataQuality.linkedin} />
            <QualityPill label="Fresh" pct={dataQuality.fresh} />
            <QualityPill label="High trust" pct={dataQuality.highTrust} />
            <span className="ml-auto text-muted-foreground">{filtered.length} leads</span>
          </Card>
        )}

        {/* Table */}
        {viewMode === "cards" ? (
          <div>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <FilteredEmptyState onClear={clearAllFilters} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleLeads.map((l) => (
                  <LeadCard key={l.id} lead={l} blacklistedDomains={blacklistedDomains} />
                ))}
              </div>
            )}
            {!loading && filtered.length > visibleLeads.length && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  Showing {visibleLeads.length} of {filtered.length} leads
                </p>
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        ) : (
        <Card className="rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12">
              <FilteredEmptyState onClear={clearAllFilters} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all filtered leads"
                        checked={
                          filtered.length > 0 &&
                          filtered.every((l) => selectedIds.has(l.id))
                        }
                        onCheckedChange={(v) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (v) filtered.forEach((l) => next.add(l.id));
                            else filtered.forEach((l) => next.delete(l.id));
                            return next;
                          });
                        }}
                      />
                    </TableHead>
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
                  {visibleLeads.map((l, i) => (
                    <TableRow
                      key={l.id}
                      className={`cursor-pointer hover:bg-muted/50 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                      onClick={() => setSelected(l)}
                    >
                      <TableCell
                        className="w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Select ${l.employer_name ?? "lead"}`}
                          checked={selectedIds.has(l.id)}
                          onCheckedChange={(v) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(l.id);
                              else next.delete(l.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[220px] truncate" title={l.employer_name ?? ""}>
                        <div className="flex items-center gap-1.5">
                          <Link
                            to={`/leads/${l.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate hover:underline text-primary inline-flex items-center gap-1 group/link"
                            aria-label={`Open ${l.employer_name ?? "lead"} detail`}
                          >
                            <span className="truncate">{l.employer_name ?? "—"}</span>
                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0" />
                          </Link>
                          {l.enrichment.duplicate_count > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 h-5 shrink-0"
                              title={`Merged with ${l.enrichment.duplicate_count} duplicate lead(s)`}
                            >
                              +{l.enrichment.duplicate_count}
                            </Badge>
                          )}
                        </div>
                        {l.enrichment.domain && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            {l.enrichment.domain}
                          </div>
                        )}
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
                          <button
                            type="button"
                            title="Export this lead as JSON"
                            onClick={() =>
                              exportLeads([l], "json", `lead-${safeFileSlug(l.employer_name)}`)
                            }
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
        )}
        {viewMode === "table" && !loading && filtered.length > visibleLeads.length && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Showing {visibleLeads.length} of {filtered.length} leads
            </p>
            <Button
              variant="outline"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Load more
            </Button>
          </div>
        )}
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

      {/* Stats sidebar */}
      <Sheet open={statsOpen} onOpenChange={setStatsOpen}>
        <SheetContent side="right" className="w-[380px] sm:w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Stats</SheetTitle>
            <SheetDescription>{filtered.length} leads in current filter</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Average score</div>
              <div className="text-3xl font-bold">{stats.avgScore}<span className="text-base text-muted-foreground"> / 100</span></div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Top countries</div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart data={stats.countries} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    <RTooltip cursor={{ fill: "hsl(var(--muted))" }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </RBarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Top industries</div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart data={stats.industries} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    <RTooltip cursor={{ fill: "hsl(var(--muted))" }} />
                    <Bar dataKey="value" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                  </RBarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Source trust</div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.sources} dataKey="value" nameKey="name" innerRadius={36} outerRadius={64}>
                      {stats.sources.map((s) => (
                        <Cell key={s.name} fill={s.name === "high" ? "hsl(142 71% 45%)" : s.name === "medium" ? "hsl(38 92% 50%)" : "hsl(var(--destructive))"} />
                      ))}
                    </Pie>
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Compare modal */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Compare leads ({selectedLeads.length})</DialogTitle>
          </DialogHeader>
          <CompareTable leads={selectedLeads} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leads;

/**
 * Build a recommended outreach email tailored for Voynova's blue-collar
 * recruitment pitch (S. Asia → EU/Balkans). Picks angle based on sectors,
 * worker-origin focus, and audience type (employer vs agent vs platform).
 */
function buildOutreachTemplate(lead: Lead): { subject: string; body: string } {
  const company = lead.employer_name?.trim() || "your team";
  const contactFirst = (lead.contact_name ?? "").trim().split(/\s+/)[0] || "";
  const greeting = contactFirst ? `Hi ${contactFirst},` : `Hello ${company} team,`;
  const country = lead.country || "your market";
  const role = (lead.role || "blue-collar roles").toLowerCase();

  const sectors = (lead.sector_tags ?? [])
    .map(sectorLabel)
    .filter(Boolean)
    .slice(0, 2)
    .join(" and ");
  const sectorLine = sectors ? ` in ${sectors}` : "";

  const origins = (lead.worker_origin_focus ?? []).filter(Boolean);
  const originLine = origins.length
    ? origins.join(", ")
    : "India, Nepal and Bangladesh";

  const audience = lead.target_audience_type ?? "";
  let pitch = "";
  if (audience === "employer_direct") {
    pitch =
      `I noticed ${company} is hiring for ${role}${sectorLine} in ${country}. ` +
      `At Voynova Global Solutions we place vetted, work-ready blue-collar workers from ${originLine} ` +
      `with EU and Balkan employers — including full visa, permit and onboarding support.`;
  } else if (audience === "recruitment_agency" || audience === "agent") {
    pitch =
      `I saw ${company} works on ${role} placements${sectorLine} in ${country}. ` +
      `Voynova Global Solutions can be your supply partner from ${originLine}: pre-screened blue-collar candidates, ` +
      `language-ready, with documentation and visa workflow handled end-to-end.`;
  } else {
    pitch =
      `I came across your post about ${role}${sectorLine} in ${country}. ` +
      `Voynova Global Solutions specialises in connecting employers in Europe with vetted blue-collar workers ` +
      `from ${originLine}, including full compliance and visa sponsorship support.`;
  }

  const demand = lead.demand_size && lead.demand_size > 1
    ? `\n\nIf the requirement is around ${lead.demand_size} workers, we can typically present a shortlist within 7–10 days.`
    : "\n\nWe can usually present a first shortlist within 7–10 days of a brief.";

  const subject = lead.employer_name
    ? `Vetted blue-collar workers for ${lead.employer_name} — ${country}`
    : `Vetted blue-collar workers for ${country} (${role})`;

  const body =
    `${greeting}\n\n${pitch}${demand}\n\n` +
    `Would a 15-minute call this week make sense to share profiles and rates?\n\n` +
    `Best regards,\n` +
    `Voynova Global Solutions\n` +
    `International blue-collar recruitment · India · Nepal · Bangladesh → EU & Balkans`;

  return { subject, body };
}

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
  const outreach = lead ? buildOutreachTemplate(lead) : null;
  const primaryEmail = allEmails[0] ?? lead?.enrichment?.email_patterns?.[0] ?? "";
  const mailtoHref = lead && outreach
    ? `mailto:${primaryEmail}?subject=${encodeURIComponent(outreach.subject)}&body=${encodeURIComponent(outreach.body)}`
    : "";

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col p-0">
        {lead && (
          <>
            <SheetHeader className="p-6 pb-4 border-b">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-accent shrink-0" />
                    <span className="truncate">{lead.employer_name ?? "Unknown employer"}</span>
                  </SheetTitle>
                  <SheetDescription>{lead.role}</SheetDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="shrink-0">
                      <Download className="h-4 w-4 mr-2" /> Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        exportLeads([lead], "csv", `lead-${safeFileSlug(lead.employer_name)}`)
                      }
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" /> Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        exportLeads([lead], "json", `lead-${safeFileSlug(lead.employer_name)}`)
                      }
                    >
                      <FileJson className="h-4 w-4 mr-2" /> Export JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
                    <Field label="Score" value={`${lead.computed_score} / 100`} />
                    <Field label="Urgency" value={lead.urgency_score?.toString() ?? "0"} />
                    <Field label="Contact name" value={lead.contact_name ?? "—"} />
                    <Field
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      label="Created"
                      value={new Date(lead.created_at).toLocaleString("en-GB")}
                    />
                  </div>
                  <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Score breakdown
                    </div>
                    <div className="space-y-1.5">
                      {SCORE_DIMENSIONS.map((d) => {
                        const val = lead.score_breakdown[d.key];
                        const pct = Math.round((val / d.max) * 100);
                        return (
                          <div key={d.key} className="flex items-center gap-2 text-xs">
                            <span className="w-44 shrink-0 text-muted-foreground">{d.label}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-12 text-right tabular-nums">
                              {val}/{d.max}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Contact links
                  </h3>
                  {(lead.enrichment.domain ||
                    lead.enrichment.duplicate_count > 0 ||
                    lead.enrichment.email_patterns.length > 0 ||
                    lead.enrichment.extra_emails.length > 0) && (
                    <div className="mb-3 rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {lead.enrichment.domain && (
                          <span>
                            <span className="text-muted-foreground">Domain: </span>
                            <span className="font-medium">{lead.enrichment.domain}</span>
                          </span>
                        )}
                        {lead.enrichment.duplicate_count > 0 && (
                          <span>
                            <span className="text-muted-foreground">Merged from: </span>
                            <span className="font-medium">
                              {lead.enrichment.duplicate_count} duplicate
                              {lead.enrichment.duplicate_count > 1 ? "s" : ""}
                            </span>
                          </span>
                        )}
                      </div>
                      {lead.enrichment.extra_emails.length > 0 && (
                        <div className="text-xs">
                          <div className="text-muted-foreground mb-1">Other emails found</div>
                          <div className="flex flex-wrap gap-1">
                            {lead.enrichment.extra_emails.slice(0, 8).map((e) => (
                              <a
                                key={e}
                                href={`mailto:${e}`}
                                className="px-1.5 py-0.5 rounded border border-border bg-background hover:bg-muted text-[11px]"
                              >
                                {e}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {lead.enrichment.email_patterns.length > 0 && (
                        <div className="text-xs">
                          <div className="text-muted-foreground mb-1">
                            Likely work emails (unverified)
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {lead.enrichment.email_patterns.slice(0, 8).map((e) => (
                              <a
                                key={e}
                                href={`mailto:${e}`}
                                className="px-1.5 py-0.5 rounded border border-dashed border-border bg-background hover:bg-muted text-[11px] text-muted-foreground"
                              >
                                {e}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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

                {outreach && (
                  <>
                    <Separator />
                    <section>
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Sparkle className="h-3.5 w-3.5 text-accent" />
                          Recommended outreach
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copy(`${outreach.subject}\n\n${outreach.body}`, "Email")}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy email
                          </Button>
                          <Button size="sm" asChild disabled={!primaryEmail}>
                            <a href={mailtoHref || "#"}>
                              <Mail className="h-3.5 w-3.5 mr-1.5" />
                              {primaryEmail ? "Open mailto" : "No email"}
                            </a>
                          </Button>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            <span>Subject</span>
                            <button
                              type="button"
                              onClick={() => copy(outreach.subject, "Subject")}
                              className="hover:text-foreground inline-flex items-center gap-1"
                            >
                              <Copy className="h-3 w-3" /> copy
                            </button>
                          </div>
                          <p className="text-sm font-medium">{outreach.subject}</p>
                        </div>
                        <Separator />
                        <div>
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            <span>Body</span>
                            <button
                              type="button"
                              onClick={() => copy(outreach.body, "Body")}
                              className="hover:text-foreground inline-flex items-center gap-1"
                            >
                              <Copy className="h-3 w-3" /> copy
                            </button>
                          </div>
                          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground">
                            {outreach.body}
                          </pre>
                        </div>
                        {!primaryEmail && (
                          <p className="text-[11px] text-muted-foreground">
                            No verified email — copy the message and paste it into LinkedIn or your CRM.
                          </p>
                        )}
                      </div>
                    </section>
                  </>
                )}

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

function QualityPill({ label, pct }: { label: string; pct: number }) {
  const tone =
    pct >= 70
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
      : pct >= 40
        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] ${tone}`}>
      <span className="font-medium">{label}</span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}

function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <Search className="h-10 w-10 text-muted-foreground mb-3" />
      <h3 className="text-base font-semibold">No leads match these filters</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Try removing a filter, broadening your search, or clearing all filters to start over.
      </p>
      <Button className="mt-4" onClick={onClear}>
        <X className="h-4 w-4 mr-2" /> Clear all filters
      </Button>
    </div>
  );
}

function CompareTable({ leads }: { leads: Lead[] }) {
  if (leads.length < 2) {
    return <p className="text-sm text-muted-foreground">Select 2 or more leads to compare.</p>;
  }
  const bestScore = Math.max(...leads.map((l) => l.computed_score ?? 0));
  const newest = Math.max(...leads.map((l) => new Date(l.created_at).getTime()));
  const rows: { label: string; render: (l: Lead) => React.ReactNode; isBest: (l: Lead) => boolean }[] = [
    { label: "Score", render: (l) => Math.round(l.computed_score ?? 0), isBest: (l) => (l.computed_score ?? 0) === bestScore },
    { label: "Country", render: (l) => l.country, isBest: () => false },
    { label: "Role", render: (l) => l.role, isBest: () => false },
    { label: "Email", render: (l) => l.contact_email ?? "—", isBest: (l) => !!l.contact_email },
    { label: "Phone", render: (l) => l.contact_phone ?? "—", isBest: (l) => !!l.contact_phone },
    { label: "LinkedIn", render: (l) => (l.linkedin_url ? "Yes" : "—"), isBest: (l) => !!l.linkedin_url },
    { label: "Website", render: (l) => (l.website_url ? "Yes" : "—"), isBest: (l) => !!l.website_url },
    { label: "Created", render: (l) => new Date(l.created_at).toLocaleDateString("en-GB"), isBest: (l) => new Date(l.created_at).getTime() === newest },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-3 text-xs uppercase tracking-wider text-muted-foreground">Field</th>
            {leads.map((l) => (
              <th key={l.id} className="text-left py-2 px-3 font-semibold">
                {l.employer_name ?? "Unknown"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="py-2 pr-3 text-xs text-muted-foreground">{row.label}</td>
              {leads.map((l) => (
                <td
                  key={l.id}
                  className={`py-2 px-3 ${row.isBest(l) ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium" : ""}`}
                >
                  {row.render(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
