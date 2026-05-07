import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRoles } from "@/lib/auth";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

type ArchivedRow = {
  id: string;
  original_id: string | null;
  archived_at: string;
  archived_reason: string | null;
  archived_by: string;
  payload: Record<string, unknown> | null;
};

const ArchivedLeads = () => {
  const { isAdmin, loading: rolesLoading } = useRoles();
  const [rows, setRows] = useState<ArchivedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("archived_leads")
      .select("*")
      .order("archived_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data ?? []) as ArchivedRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!rolesLoading && !isAdmin) return <Navigate to="/leads" replace />;

  const restore = async (id: string) => {
    const { error } = await supabase.rpc("restore_archived_lead", { _archived_id: id });
    if (error) {
      toast.error(error.message || "Restore failed");
      return;
    }
    toast.success("Lead restored");
    load();
  };

  return (
    <div className="container py-8 max-w-5xl">
      <Link to="/leads" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Leads
      </Link>
      <h1 className="text-3xl font-bold">Archived leads</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Soft-archived leads. Restore any of them back into the active list.
      </p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No archived leads.</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const p = (r.payload ?? {}) as Record<string, unknown>;
            return (
              <Card key={r.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-muted">
                      {r.archived_reason ?? "unknown"}
                    </span>
                    <span>by {r.archived_by}</span>
                    <span>·</span>
                    <span>{new Date(r.archived_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 font-medium truncate">
                    {String(p.employer_name ?? "—")} — {String(p.role ?? "—")}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {String(p.country ?? "")} {p.city ? `· ${String(p.city)}` : ""} ·
                    quality {String(p.quality_score ?? 0)}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => restore(r.id)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restore
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ArchivedLeads;