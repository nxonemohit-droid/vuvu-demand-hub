// Reverse matching: compare a demand lead against candidates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function scoreMatch(lead: any, c: any): { score: number; reason: string } {
  let s = 0; const r: string[] = [];
  const leadRole = (lead.role ?? "").toLowerCase();
  const candRole = (c.role ?? "").toLowerCase();

  // Role match: exact = 50, substring either direction = 35
  if (leadRole && candRole) {
    if (leadRole === candRole) { s += 50; r.push("role:exact"); }
    else if (leadRole.includes(candRole) || candRole.includes(leadRole)) { s += 35; r.push("role:substring"); }
  }

  // Country preference
  if (lead.country && (c.preferred_countries ?? []).map((x: string) => x.toLowerCase())
      .includes((lead.country ?? "").toLowerCase())) { s += 25; r.push("country"); }

  // Skill overlap with the lead's role text OR trades/sector tags
  const haystack = [leadRole, ...(lead.sector_tags ?? []), ...(lead.worker_origin_focus ?? []), lead.trade_category ?? ""].join(" ").toLowerCase();
  const skillHit = (c.skills ?? []).find((k: string) => k && haystack.includes(k.toLowerCase()));
  if (skillHit) { s += 15; r.push(`skill:${skillHit}`); }

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
    const threshold: number = Math.max(10, Math.min(100, Number(body.threshold) || 30));

    const leadsQ = leadId
      ? supabase.from("demand_leads").select("*").eq("id", leadId)
      : supabase.from("demand_leads").select("*").order("created_at", { ascending: false }).limit(50);
    const { data: leads, error: lerr } = await leadsQ;
    if (lerr) throw lerr;
    const { data: candidates, error: cerr } = await supabase.from("candidates").select("*");
    if (cerr) throw cerr;

    const candidate_count = candidates?.length ?? 0;
    if (candidate_count === 0) {
      return new Response(JSON.stringify({
        ok: true, matched: 0, candidate_count: 0,
        note: "No candidates in database. Seed candidates before running reverse matching.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let inserted = 0;
    for (const lead of leads ?? []) {
      for (const c of candidates ?? []) {
        const { score, reason } = scoreMatch(lead, c);
        if (score < threshold) continue;
        const { error } = await supabase.from("demand_matches").upsert({
          lead_id: lead.id, candidate_id: c.id, match_score: score, reason,
        }, { onConflict: "lead_id,candidate_id" });
        if (!error) inserted++;
      }
    }

    return new Response(JSON.stringify({
      ok: true, matched: inserted, candidate_count, leads_scanned: leads?.length ?? 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});