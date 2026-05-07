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

    // Cooldown grows with each attempt: 1d, 3d, 7d
    const now = Date.now();
    const cutoff1 = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff2 = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff3 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Eligible: needs_enrichment OR (quality 25..60), missing email, <3 attempts,
    // and respect the per-attempt cooldown.
    const { data: targets, error } = await supabase
      .from("demand_leads")
      .select("id, last_enriched_at, enrichment_attempts, review_status, quality_score")
      .lt("enrichment_attempts", 3)
      .is("contact_email", null)
      .or(
        `review_status.eq.needs_enrichment,and(quality_score.gte.25,quality_score.lt.60)`,
      )
      .order("quality_score", { ascending: false })
      .limit(limit * 3);

    const eligible = (targets ?? []).filter((t) => {
      const attempts = t.enrichment_attempts ?? 0;
      if (!t.last_enriched_at) return true;
      const cutoff = attempts >= 2 ? cutoff3 : attempts === 1 ? cutoff2 : cutoff1;
      return t.last_enriched_at < cutoff;
    }).slice(0, limit);

    if (error) throw error;
    if (!eligible.length) {
      return new Response(JSON.stringify({ ok: true, picked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const leadIds = eligible.map((t) => t.id);

    // Mark attempt up-front so a crash doesn't make us re-pick the same rows
    await Promise.all(
      eligible.map((t) =>
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

    // Post-enrichment housekeeping:
    //  - If email landed, flip review_status from 'needs_enrichment' to 'new'.
    //  - If we've now hit max attempts and still no email + still low quality,
    //    leave for an admin to clean up via the bulk archive flow.
    const { data: after } = await supabase
      .from("demand_leads")
      .select("id, contact_email, review_status, enrichment_attempts, quality_score")
      .in("id", leadIds);
    const promoted: string[] = [];
    for (const row of after ?? []) {
      if (row.contact_email && row.review_status === "needs_enrichment") {
        await supabase
          .from("demand_leads")
          .update({ review_status: "new" })
          .eq("id", row.id);
        promoted.push(row.id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        picked: leadIds.length,
        promoted: promoted.length,
        enrichResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});