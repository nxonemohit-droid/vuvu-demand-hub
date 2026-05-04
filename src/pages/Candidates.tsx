import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Plus, Search, MapPin, Calendar, Sparkles } from "lucide-react";
import { countryFlag } from "@/lib/country-flags";

type Candidate = {
  id: string;
  full_name: string;
  role: string;
  country_origin: string | null;
  preferred_countries: string[] | null;
  skills: string[] | null;
  experience_years: number | null;
  available_from: string | null;
  visa_status: string | null;
  notes: string | null;
  created_at: string;
};

/** Deterministic placeholder match score so cards stay stable between renders. */
function placeholderMatchScore(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 55 + (Math.abs(h) % 41); // 55–95
}

function availabilityLabel(c: Candidate): { label: string; tone: string } {
  if (!c.available_from) return { label: "Availability unknown", tone: "bg-muted text-muted-foreground border-border" };
  const d = new Date(c.available_from);
  const now = Date.now();
  if (d.getTime() <= now)
    return { label: "Available now", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
  return {
    label: `From ${d.toLocaleDateString("en-GB")}`,
    tone: "bg-primary/10 text-primary border-primary/30",
  };
}

export default function Candidates() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("candidates")
        .select(
          "id,full_name,role,country_origin,preferred_countries,skills,experience_years,available_from,visa_status,notes,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.error(error);
        toast.error("Failed to load candidates");
      } else {
        setRows((data ?? []) as Candidate[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((c) =>
        [
          c.full_name,
          c.role,
          c.country_origin,
          (c.skills ?? []).join(" "),
          (c.preferred_countries ?? []).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : rows;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="border-b bg-background/60 backdrop-blur sticky top-0 z-20">
        <div className="px-6 lg:px-8 py-5 max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-2 mt-1">
              <Users className="h-6 w-6 text-accent" />
              Candidates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Workers ready to be matched with employer demand.
            </p>
          </div>
          <Button onClick={() => toast.info("Candidate intake form coming soon")}>
            <Plus className="h-4 w-4 mr-2" /> Add candidate
          </Button>
        </div>
      </div>

      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-4">
        <Card className="p-4 rounded-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, role, skills, country…"
              className="pl-9"
            />
          </div>
        </Card>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center rounded-xl">
            <Users className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold mt-3">
              {rows.length === 0 ? "No candidates yet" : "No candidates match your search"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {rows.length === 0
                ? "Add your first candidate to start matching workers with employer demand."
                : "Try a different keyword or clear the search box."}
            </p>
            {rows.length === 0 && (
              <Button
                className="mt-4"
                onClick={() => toast.info("Candidate intake form coming soon")}
              >
                <Plus className="h-4 w-4 mr-2" /> Add candidate
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const avail = availabilityLabel(c);
              const match = placeholderMatchScore(c.id);
              return (
                <Card key={c.id} className="p-5 rounded-xl flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate" title={c.full_name}>
                        {c.full_name}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">{c.role}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 bg-accent/10 text-accent border-accent/30 tabular-nums"
                      title="Placeholder match score"
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      {match}
                    </Badge>
                  </div>

                  {c.country_origin && (
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <span aria-hidden>{countryFlag(c.country_origin)}</span>
                      From {c.country_origin}
                      {c.experience_years != null && ` · ${c.experience_years}y exp`}
                    </div>
                  )}

                  {(c.skills ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(c.skills ?? []).slice(0, 6).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[11px]">
                          {s}
                        </Badge>
                      ))}
                      {(c.skills ?? []).length > 6 && (
                        <Badge variant="outline" className="text-[11px]">
                          +{(c.skills ?? []).length - 6}
                        </Badge>
                      )}
                    </div>
                  )}

                  {(c.preferred_countries ?? []).length > 0 && (
                    <div className="text-xs text-muted-foreground inline-flex items-start gap-1">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="flex flex-wrap gap-1">
                        {(c.preferred_countries ?? []).map((p) => (
                          <span key={p} className="inline-flex items-center gap-0.5">
                            <span aria-hidden>{countryFlag(p)}</span>
                            {p}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}

                  <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                    <Badge variant="outline" className={`text-[11px] ${avail.tone}`}>
                      <Calendar className="h-3 w-3 mr-1" />
                      {avail.label}
                    </Badge>
                    {c.visa_status && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        Visa: {c.visa_status}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}