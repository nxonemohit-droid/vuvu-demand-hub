import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Briefcase,
  Globe2,
  MapPin,
  Building2,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Tag,
  FileText,
  Sparkles,
  Layers,
  DollarSign,
  Hash,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type DemandLead = {
  id: string;
  role: string;
  employer_name: string | null;
  country: string;
  city: string | null;
  source: string;
  source_url: string | null;
  priority: string;
  score: number | null;
  tier: string | null;
  visa_sponsorship: boolean;
  urgency_score: number;
  demand_size: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  matched_keywords: string[] | null;
  sector_tags: string[] | null;
  worker_origin_focus: string[] | null;
  sponsorship_signals: string[] | null;
  notes: string | null;
  ai_rationale: string | null;
  created_at: string;
  raw_signals: {
    raw_text: string | null;
    payload: Record<string, unknown> | null;
    source_url: string | null;
  } | null;
};

/* ----------------- skill extraction ----------------- */

const SKILL_VOCAB = [
  // construction / blue collar
  "welding","mig","tig","arc welding","carpentry","masonry","plumbing","electrical","scaffolding",
  "rigging","painting","plastering","roofing","steel fixing","shuttering","concrete","tiling",
  "hvac","refrigeration","forklift","crane operator","excavator","heavy machinery","cnc",
  // hospitality / care
  "cooking","chef","barista","waiter","housekeeping","cleaning","caregiver","nursing","elderly care",
  // logistics / transport
  "driving","cdl","truck driver","warehouse","picking","packing","loading","logistics",
  // agri / general
  "harvesting","farming","greenhouse","slaughterhouse","meat processing","fish processing",
  // tech-adjacent
  "ms office","excel","sap","autocad","revit",
  // generic soft
  "english","serbian","greek","german","russian","arabic","teamwork","shift work","night shift",
];

function extractSkills(lead: DemandLead): string[] {
  const fromPayload = new Set<string>();
  const payload = lead.raw_signals?.payload;
  if (payload && typeof payload === "object") {
    for (const key of ["skills", "requirements", "tags", "qualifications"]) {
      const v = (payload as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        v.forEach((s) => typeof s === "string" && fromPayload.add(s.trim()));
      } else if (typeof v === "string") {
        v.split(/[,;\n•|]/).forEach((s) => s.trim() && fromPayload.add(s.trim()));
      }
    }
  }
  const haystack = `${lead.role} ${lead.notes ?? ""} ${lead.raw_signals?.raw_text ?? ""} ${JSON.stringify(payload ?? {})}`.toLowerCase();
  const fromVocab = SKILL_VOCAB.filter((s) => haystack.includes(s));
  return Array.from(new Set([...fromPayload, ...fromVocab])).slice(0, 30);
}

/* ----------------- structured field flattener ----------------- */

type Field = { label: string; value: string };

function flatten(obj: Record<string, unknown>, prefix = "", out: Field[] = []): Field[] {
  for (const [k, v] of Object.entries(obj)) {
    const label = prefix ? `${prefix}.${k}` : k;
    if (v == null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x !== "object")) {
        out.push({ label, value: v.join(", ") });
      } else {
        v.slice(0, 5).forEach((item, i) => {
          if (item && typeof item === "object") flatten(item as Record<string, unknown>, `${label}[${i}]`, out);
          else out.push({ label: `${label}[${i}]`, value: String(item) });
        });
      }
    } else if (typeof v === "object") {
      flatten(v as Record<string, unknown>, label, out);
    } else {
      out.push({ label, value: String(v) });
    }
  }
  return out;
}

/* ----------------- page ----------------- */

export default function DemandLeadDetail() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<DemandLead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("demand_leads")
        .select(
          "id, role, employer_name, country, city, source, source_url, priority, score, tier, visa_sponsorship, urgency_score, demand_size, salary_min, salary_max, salary_currency, contact_name, contact_email, contact_phone, matched_keywords, sector_tags, worker_origin_focus, sponsorship_signals, notes, ai_rationale, created_at, raw_signals(raw_text, payload, source_url)"
        )
        .eq("id", id)
        .maybeSingle();
      setLead(data as DemandLead | null);
      setLoading(false);
    })();
  }, [id]);

  const skills = useMemo(() => (lead ? extractSkills(lead) : []), [lead]);
  const structured = useMemo<Field[]>(() => {
    if (!lead) return [];
    const base: Field[] = [
      { label: "role", value: lead.role },
      lead.employer_name && { label: "employer", value: lead.employer_name },
      { label: "country", value: lead.country },
      lead.city && { label: "city", value: lead.city },
      { label: "source", value: lead.source },
      lead.demand_size != null && { label: "demand_size", value: String(lead.demand_size) },
      (lead.salary_min || lead.salary_max) && {
        label: "salary",
        value: `${lead.salary_min ?? "?"} – ${lead.salary_max ?? "?"} ${lead.salary_currency ?? ""}`.trim(),
      },
      lead.contact_name && { label: "contact_name", value: lead.contact_name },
      lead.contact_email && { label: "contact_email", value: lead.contact_email },
      lead.contact_phone && { label: "contact_phone", value: lead.contact_phone },
      { label: "visa_sponsorship", value: lead.visa_sponsorship ? "yes" : "no" },
    ].filter(Boolean) as Field[];
    const payload = lead.raw_signals?.payload;
    const fromPayload = payload ? flatten(payload) : [];
    return [...base, ...fromPayload];
  }, [lead]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Link to="/demand" className="text-sm text-primary inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Demand Intelligence
        </Link>
        <Card className="p-8 text-center text-muted-foreground">Lead not found.</Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <Link
        to="/demand"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Demand Intelligence
      </Link>

      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary shrink-0" />
              <span className="truncate">{lead.role}</span>
            </h1>
            <div className="text-muted-foreground mt-1 flex items-center gap-3 flex-wrap text-sm">
              {lead.employer_name && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {lead.employer_name}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Globe2 className="h-4 w-4" />
                {lead.country}
                {lead.city && (
                  <>
                    <MapPin className="h-3.5 w-3.5 ml-1" /> {lead.city}
                  </>
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <PriorityBadge priority={lead.priority} />
              <Badge variant="secondary">{lead.source}</Badge>
              {lead.tier && <Badge variant="outline">Tier {lead.tier}</Badge>}
              {lead.visa_sponsorship && (
                <Badge className="bg-green-500/15 text-green-700 border-green-500/20 hover:bg-green-500/20 gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Visa-friendly
                </Badge>
              )}
              {lead.score != null && (
                <Badge variant="outline" className="gap-1">
                  <Hash className="h-3 w-3" /> Score {Math.round(lead.score)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {lead.source_url && (
              <Button asChild variant="outline" size="sm">
                <a href={lead.source_url} target="_blank" rel="noreferrer">
                  Open source <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
            )}
            <Button asChild size="sm">
              <Link to={`/leads/${lead.id}`}>Open in CRM</Link>
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: structured fields */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={Layers}>Structured fields</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-3">
            {structured.map((f) => (
              <div key={f.label} className="flex justify-between gap-3 py-1.5 border-b border-border/40">
                <span className="text-xs text-muted-foreground font-mono truncate">{f.label}</span>
                <span className="text-sm font-medium text-right truncate" title={f.value}>
                  {f.value}
                </span>
              </div>
            ))}
            {structured.length === 0 && (
              <div className="text-sm text-muted-foreground">No structured fields.</div>
            )}
          </div>
        </Card>

        {/* Right: keywords & skills */}
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle icon={Tag}>Matched keywords</SectionTitle>
            <ChipList
              items={lead.matched_keywords ?? []}
              empty="No keywords matched."
              variant="primary"
            />
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Sparkles}>Extracted skills</SectionTitle>
            <ChipList items={skills} empty="No skills detected." variant="accent" />
          </Card>

          {(lead.sector_tags?.length || lead.worker_origin_focus?.length || lead.sponsorship_signals?.length) && (
            <Card className="p-5 space-y-4">
              {lead.sector_tags?.length ? (
                <div>
                  <SectionTitle icon={Briefcase} small>Sectors</SectionTitle>
                  <ChipList items={lead.sector_tags} variant="muted" />
                </div>
              ) : null}
              {lead.worker_origin_focus?.length ? (
                <div>
                  <SectionTitle icon={Globe2} small>Worker origin focus</SectionTitle>
                  <ChipList items={lead.worker_origin_focus} variant="muted" />
                </div>
              ) : null}
              {lead.sponsorship_signals?.length ? (
                <div>
                  <SectionTitle icon={ShieldCheck} small>Sponsorship signals</SectionTitle>
                  <ChipList items={lead.sponsorship_signals} variant="muted" />
                </div>
              ) : null}
            </Card>
          )}
        </div>
      </div>

      {/* AI rationale */}
      {lead.ai_rationale && (
        <Card className="p-5">
          <SectionTitle icon={Sparkles}>AI rationale</SectionTitle>
          <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">{lead.ai_rationale}</p>
        </Card>
      )}

      {/* Raw text */}
      <Card className="p-5">
        <SectionTitle icon={FileText}>Raw text</SectionTitle>
        <Separator className="my-3" />
        {lead.raw_signals?.raw_text ? (
          <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed text-foreground/80 bg-muted/40 p-4 rounded-lg max-h-[600px] overflow-auto">
            {lead.raw_signals.raw_text}
          </pre>
        ) : lead.notes ? (
          <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed text-foreground/80 bg-muted/40 p-4 rounded-lg max-h-[600px] overflow-auto">
            {lead.notes}
          </pre>
        ) : (
          <div className="text-sm text-muted-foreground">No raw text captured for this signal.</div>
        )}
      </Card>
    </div>
  );
}

/* ----------------- helpers ----------------- */

function SectionTitle({
  icon: Icon,
  children,
  small,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <h2
      className={cn(
        "font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2",
        small ? "text-[11px] mb-1.5" : "text-xs"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </h2>
  );
}

function ChipList({
  items,
  empty,
  variant = "muted",
}: {
  items: string[];
  empty?: string;
  variant?: "primary" | "accent" | "muted";
}) {
  if (!items?.length)
    return <div className="text-sm text-muted-foreground mt-2">{empty}</div>;
  const cls =
    variant === "primary"
      ? "bg-primary/10 text-primary border-primary/20"
      : variant === "accent"
      ? "bg-green-500/10 text-green-700 border-green-500/20"
      : "bg-muted text-foreground/70 border-transparent";
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((s) => (
        <Badge key={s} variant="outline" className={cn("font-normal", cls)}>
          {s}
        </Badge>
      ))}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-500/15 text-red-700 border-red-500/20",
    high: "bg-orange-500/15 text-orange-700 border-orange-500/20",
    medium: "bg-blue-500/15 text-blue-700 border-blue-500/20",
    low: "bg-muted text-muted-foreground border-transparent",
  };
  return (
    <Badge variant="outline" className={cn("capitalize", map[priority] ?? map.low)}>
      {priority}
    </Badge>
  );
}