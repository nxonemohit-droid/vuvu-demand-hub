import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().slice(0, 10);
    const since = `${today}T00:00:00Z`;

    const { data: leads, error } = await admin
      .from("demand_leads")
      .select("id, country, contact_email, contact_phone, lead_score")
      .gte("created_at", since)
      .not("discovered_board_domain", "is", null);
    if (error) return json({ error: error.message }, 500);

    const list = leads ?? [];
    const total = list.length;
    const qualified = list.filter((l) => l.contact_email && l.contact_phone).length;
    const hot = list.filter((l) => (l.lead_score ?? 0) >= 60).length;
    const countries = new Set(list.map((l) => l.country)).size;
    const breakdown: Record<string, number> = {};
    for (const l of list) breakdown[l.country] = (breakdown[l.country] ?? 0) + 1;

    await admin.from("daily_discovery_summary").upsert({
      date: today,
      total_found: total,
      qualified_count: qualified,
      hot_count: hot,
      countries_count: countries,
      breakdown,
      updated_at: new Date().toISOString(),
    });

    return json({ ok: true, total, qualified, hot, countries });
  } catch (e) {
    console.error("daily-discovery-summary", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});