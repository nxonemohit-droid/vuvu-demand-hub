// Nightly job: pick low-quality demand_leads, enrich them via hunter-enrich,
// and bump enrichment_attempts so we don't loop on dead-end leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit ?? 15), 50);

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: targets, error } = await supabase
      .from("demand_leads")
      .select("id, last_enriched_at, enrichment_attempts")
      .gte("quality_score", 25)
      .lt("quality_score", 60)
      .lt("enrichment_attempts", 3)
      .or(`last_enriched_at.is.null,last_enriched_at.lt.${cutoff}`)
      .is("contact_email", null)
      .order("quality_score", { ascending: false })
      .limit(limit);
    if (error) throw error;
    if (!targets?.length) {
      return new Response(JSON.stringify({ ok: true, picked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const leadIds = targets.map((t) => t.id);

    // Mark attempt up-front so a crash doesn't make us re-pick the same rows
    await Promise.all(
      targets.map((t) =>
        supabase
          .from("demand_leads")
          .update({
            last_enriched_at: new Date().toISOString(),
            enrichment_attempts: (t.enrichment_attempts ?? 0) + 1,
          })
          .eq("id", t.id),
      ),
    );

    const r = await fetch(`${SUPABASE_URL}/functions/v1/hunter-enrich`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ lead_ids: leadIds }),
    });
    const enrichResult = await r.json().catch(() => ({}));

    return new Response(
      JSON.stringify({ ok: true, picked: leadIds.length, enrichResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});