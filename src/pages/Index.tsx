import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, Users, Radar, AlertCircle, Mail, Loader2 } from "lucide-react";
import { useRoles } from "@/lib/auth";
import { toast } from "sonner";

type Stats = {
  leads: number;
  highPriority: number;
  candidates: number;
  signals: number;
};

const Index = () => {
  const { roles } = useRoles();
  const [stats, setStats] = useState<Stats | null>(null);
  const [enriching, setEnriching] = useState(false);

  const runHunter = async () => {
    setEnriching(true);
    const { data, error } = await supabase.functions.invoke("hunter-enrich", {
      body: { limit: 10 },
    });
    setEnriching(false);
    if (error) return toast.error(error.message);
    const found = (data?.results ?? []).filter((r: any) => r.email).length;
    toast.success(`Hunter: ${found} email(s) found across ${data?.processed ?? 0} leads`);
  };

  useEffect(() => {
    (async () => {
      const [leads, high, candidates, signals] = await Promise.all([
        supabase.from("demand_leads").select("id", { count: "exact", head: true }),
        supabase.from("demand_leads").select("id", { count: "exact", head: true }).eq("priority", "high"),
        supabase.from("candidates").select("id", { count: "exact", head: true }),
        supabase.from("raw_signals").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        leads: leads.count ?? 0,
        highPriority: high.count ?? 0,
        candidates: candidates.count ?? 0,
        signals: signals.count ?? 0,
      });
    })();
  }, []);

  const cards = [
    { label: "Demand Leads", value: stats?.leads, icon: Briefcase },
    { label: "High Priority", value: stats?.highPriority, icon: AlertCircle },
    { label: "Candidates", value: stats?.candidates, icon: Users },
    { label: "Raw Signals", value: stats?.signals, icon: Radar },
  ];

  return (
    <div className="p-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back. Here is your demand intelligence overview.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button size="sm" variant="outline" onClick={runHunter} disabled={enriching}>
            {enriching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Enrich emails (Hunter)
          </Button>
          {roles.map((r) => (
            <Badge key={r} variant="outline" className="capitalize">
              {r}
            </Badge>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="text-3xl font-semibold mt-3">
              {c.value ?? "—"}
            </div>
          </Card>
        ))}
      </section>

      <Card className="p-6 rounded-xl">
        <h2 className="font-semibold mb-2">Demand Intelligence</h2>
        <p className="text-sm text-muted-foreground">
          Live scraping, AI structuring, and reverse matching are being built out
          in upcoming slices. Use the sidebar to explore each area.
        </p>
      </Card>
    </div>
  );
};

export default Index;