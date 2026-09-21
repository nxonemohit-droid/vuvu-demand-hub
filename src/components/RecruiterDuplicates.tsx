import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, Merge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DupLead = {
  id: string;
  company: string;
  country: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  contact_name: string | null;
  priority_score: number | null;
};

type DupGroup = { key: string; reason: string; leads: DupLead[] };

/** Duplicate detection and merge for recruiter leads (email, phone, website, name). */
export const RecruiterDuplicates = () => {
  const qc = useQueryClient();
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [primaryByKey, setPrimaryByKey] = useState<Record<string, string>>({});

  const scan = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("recruiter-tools", {
        body: { action: "duplicates" },
      });
      if (error) throw error;
      setGroups(data?.groups ?? []);
      toast.success(`${data?.total_groups ?? 0} duplicate groups mile`);
    } catch {
      toast.error("Duplicate check nahi ho paya. Thodi der baad try karo.");
    } finally {
      setLoading(false);
    }
  };

  const merge = async (group: DupGroup) => {
    const primaryId = primaryByKey[group.key] ?? group.leads[0]?.id;
    const duplicateIds = group.leads.filter((l) => l.id !== primaryId).map((l) => l.id);
    if (!primaryId || !duplicateIds.length) return;
    setMergingKey(group.key);
    try {
      const { error } = await supabase.functions.invoke("recruiter-tools", {
        body: { action: "merge", primary_id: primaryId, duplicate_ids: duplicateIds },
      });
      if (error) throw error;
      setGroups((prev) => (prev ?? []).filter((g) => g.key !== group.key));
      qc.invalidateQueries({ queryKey: ["recruiter-pipeline"] });
      qc.invalidateQueries({ queryKey: ["recruiter-stats"] });
      toast.success("Records merge ho gaye");
    } catch {
      toast.error("Merge nahi hua");
    } finally {
      setMergingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Duplicate partners</CardTitle>
            <CardDescription>
              Same email, phone, website ya agency name wale records dhundo aur ek record me merge
              karo. Merge me khaali fields bhar jaate hain.
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={scan} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Find duplicates
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups === null ? (
          <p className="text-sm text-muted-foreground">
            "Find duplicates" dabao — hum sab partner records check kar lenge.
          </p>
        ) : !groups.length ? (
          <p className="text-sm text-muted-foreground">Koi duplicate nahi mila.</p>
        ) : (
          groups.map((g) => {
            const primaryId = primaryByKey[g.key] ?? g.leads[0]?.id;
            return (
              <div key={g.key} className="rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline">{g.reason}</Badge>
                  <Button
                    size="sm"
                    onClick={() => merge(g)}
                    disabled={mergingKey === g.key}
                  >
                    {mergingKey === g.key ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Merge className="mr-2 h-4 w-4" />
                    )}
                    Merge {g.leads.length} records
                  </Button>
                </div>
                <div className="space-y-2">
                  {g.leads.map((l) => (
                    <label
                      key={l.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm hover:bg-muted"
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        name={`primary-${g.key}`}
                        checked={primaryId === l.id}
                        onChange={() => setPrimaryByKey((p) => ({ ...p, [g.key]: l.id }))}
                      />
                      <span>
                        <span className="font-medium">{l.company}</span>
                        {primaryId === l.id && (
                          <Badge className="ml-2" variant="default">
                            Keep this
                          </Badge>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {[l.city, l.country, l.contact_name].filter(Boolean).join(" · ")}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {[l.email, l.phone, l.website].filter(Boolean).join(" · ") || "no contact"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
