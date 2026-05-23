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

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", u.user.id);
    const allowed = (roles ?? []).some((r) => ["admin", "bd"].includes(r.role));
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const leadId: string | undefined = body?.lead_id;
    if (!leadId) return json({ error: "lead_id required" }, 400);

    const { data: lead, error: lErr } = await admin
      .from("demand_leads")
      .select("id, employer_name, country, city, contact_email, contact_phone, phone_e164, trade_category, source_url, role, outreach_queued")
      .eq("id", leadId)
      .maybeSingle();
    if (lErr) return json({ error: lErr.message }, 500);
    if (!lead) return json({ error: "Lead not found" }, 404);
    if (lead.outreach_queued) return json({ error: "Already queued" }, 409);
    if (!lead.contact_email) return json({ error: "Lead has no email" }, 400);

    const { data: rec, error: rErr } = await admin
      .from("recruiter_leads")
      .insert({
        agency_name: lead.employer_name ?? "Unknown employer",
        contact_email: lead.contact_email,
        contact_phone: lead.phone_e164 ?? lead.contact_phone,
        hq_country: lead.country,
        hq_city: lead.city,
        operating_eu_country: lead.country,
        trades: lead.trade_category ? [lead.trade_category] : [],
        worker_origin_focus: ["India", "Nepal", "Bangladesh"],
        source_url: lead.source_url,
        discovery_tier: 2,
        notes: `Pushed from Local Hiring lead ${lead.id} — role: ${lead.role}`,
      })
      .select("id")
      .single();
    if (rErr) return json({ error: rErr.message }, 500);

    await admin
      .from("demand_leads")
      .update({ outreach_queued: true, outreach_queued_at: new Date().toISOString() })
      .eq("id", lead.id);

    return json({ ok: true, recruiter_lead_id: rec?.id });
  } catch (e) {
    console.error("push-lead-to-outreach", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});