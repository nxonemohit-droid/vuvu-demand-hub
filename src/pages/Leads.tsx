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
import { supabase } from "@/integrations/supabase/client";
import {
  Briefcase,
  ExternalLink,
  Linkedin,
  Mail,
  Phone,
  RefreshCw,
  Search,
} from "lucide-react";

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
  raw_signals: { payload: Record<string, unknown> | null } | null;
};

type Lead = RawLead & { linkedin_url: string | null };

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-primary/10 text-primary border-primary/30",
  low: "bg-muted text-muted-foreground border-border",
};

function pickLinkedIn(lead: RawLead): string | null {
  if (lead.source_url && /linkedin\.com\//i.test(lead.source_url)) {
    return lead.source_url;
  }
  const payload = lead.raw_signals?.payload;
  if (!payload || typeof payload !== "object") return null;

  const candidateKeys = [
    "linkedin_url",
    "linkedinUrl",
    "linkedin",
    "company_linkedin",
    "companyLinkedin",
    "employer_linkedin",
  ];
  for (const key of candidateKeys) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "string" && v.includes("linkedin.com")) return v;
  }
  // Shallow scan of nested objects/strings for any linkedin.com URL
  for (const v of Object.values(payload)) {
    if (typeof v === "string" && /https?:\/\/[^\s"']*linkedin\.com\/[^\s"']+/i.test(v)) {
      const match = v.match(/https?:\/\/[^\s"']*linkedin\.com\/[^\s"']+/i);
      if (match) return match[0];
    }
  }
  return null;
}

const Leads = () => {
  const [loading, setLoading] = useState(true);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const [{ data, error }, countRes] = await Promise.all([
      supabase
        .from("demand_leads")
        .select(
          "id,employer_name,role,country,city,priority,score,urgency_score,contact_email,contact_name,contact_phone,source_url,created_at,raw_signals(payload)",
        )
        .order("urgency_score", { ascending: false })
        .limit(1000),
      supabase.from("demand_leads").select("id", { count: "exact", head: true }),
    ]);
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const enriched: Lead[] = (data ?? []).map((l) => ({
      ...(l as unknown as RawLead),
      linkedin_url: pickLinkedIn(l as unknown as RawLead),
    }));
    // Keep only leads with at least one of: email, phone, linkedin
    const contactable = enriched.filter(
      (l) => l.contact_email || l.contact_phone || l.linkedin_url,
    );
    setAllLeads(contactable);
    setTotalCount(countRes.count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const countries = useMemo(() => {
    return Array.from(new Set(allLeads.map((l) => l.country).filter(Boolean))).sort();
  }, [allLeads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLeads.filter((l) => {
      if (country !== "all" && l.country !== country) return false;
      if (priority !== "all" && l.priority !== priority) return false;
      if (!q) return true;
      return (
        l.employer_name?.toLowerCase().includes(q) ||
        l.role?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.contact_email?.toLowerCase().includes(q)
      );
    });
  }, [allLeads, search, country, priority]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="border-b bg-background/60 backdrop-blur">
        <div className="px-8 py-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Briefcase className="h-3.5 w-3.5 text-accent" />
              Leads with contact info
            </div>
            <h1 className="text-3xl font-bold mt-1">Reachable Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Showing leads with at least one of: email, phone, or LinkedIn URL.{" "}
              <span className="font-medium text-foreground">
                {allLeads.length}
              </span>{" "}
              of {totalCount} total leads are reachable.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="p-8 space-y-4">
        <Card className="p-4 rounded-xl">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employer, role, city, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="md:w-48">
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
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="md:w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No reachable leads match your filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employer</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>LinkedIn</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      {l.employer_name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={l.role}>
                      {l.role}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.country}
                      {l.city ? ` · ${l.city}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize ${PRIORITY_STYLES[l.priority] ?? ""}`}
                      >
                        {l.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {l.contact_email ? (
                        <a
                          href={`mailto:${l.contact_email}`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                          title={l.contact_name ?? undefined}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[180px]">
                            {l.contact_email}
                          </span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.contact_phone ? (
                        <a
                          href={`tel:${l.contact_phone}`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {l.contact_phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.linkedin_url ? (
                        <a
                          href={l.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                          View
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.source_url ? (
                        <a
                          href={l.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          title={l.source_url}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Leads;