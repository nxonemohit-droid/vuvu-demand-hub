// Reverse matching: compare a demand lead against candidates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function scoreMatch(lead: any, c: any): { score: number; reason: string } {
  let s = 0; const r: string[] = [];
  if (lead.role && c.role && lead.role.toLowerCase() === c.role.toLowerCase()) { s += 50; r.push("role"); }
  if (lead.country && (c.preferred_countries ?? []).includes(lead.country)) { s += 25; r.push("country"); }
  if ((c.skills ?? []).some((k: string) => (lead.role || "").toLowerCase().includes(k.toLowerCase()))) { s += 10; r.push("skill"); }
  if (c.experience_years && c.experience_years >= 2) { s += 5; r.push("exp"); }
  if (c.available_from && new Date(c.available_from) <= new Date()) { s += 10; r.push("available"); }
  return { score: Math.min(100, s), reason: r.join(", ") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const leadId: string | undefined = body.leadId;

    const leadsQ = leadId
      ? supabase.from("demand_leads").select("*").eq("id", leadId)
      : supabase.from("demand_leads").select("*").order("created_at", { ascending: false }).limit(50);
    const { data: leads, error: lerr } = await leadsQ;
    if (lerr) throw lerr;
    const { data: candidates, error: cerr } = await supabase.from("candidates").select("*");
    if (cerr) throw cerr;

    let inserted = 0;
    for (const lead of leads ?? []) {
      for (const c of candidates ?? []) {
        const { score, reason } = scoreMatch(lead, c);
        if (score < 40) continue;
        const { error } = await supabase.from("demand_matches").upsert({
          lead_id: lead.id, candidate_id: c.id, match_score: score, reason,
        }, { onConflict: "lead_id,candidate_id" });
        if (!error) inserted++;
      }
    }

    return new Response(JSON.stringify({ ok: true, matched: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});