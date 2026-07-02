import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await supa.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRows } = await admin.from("user_roles").select("role")
      .eq("user_id", u.user.id).in("role", ["admin", "bd"]);
    if (!roleRows?.length) return json({ error: "Team members only" }, 403);

    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaign_id ?? "");
    if (!campaignId) return json({ error: "campaign_id required" }, 400);

    const dailyLimit = Math.min(Math.max(Number(body?.daily_limit) || 100, 1), 500);
    const startDateStr: string | undefined = body?.start_date;

    const { data: camp, error: cErr } = await admin
      .from("email_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (cErr || !camp) return json({ error: cErr?.message ?? "Campaign not found" }, 404);

    const startHour = Math.max(0, Math.min(23, camp.send_window_start_hour ?? 9));
    const endHour = Math.max(startHour + 1, Math.min(23, camp.send_window_end_hour ?? 17));
    const windowMinutes = (endHour - startHour) * 60;

    // Determine Day 1 in UTC. We use the provided date at startHour in the campaign timezone
    // best-effort by treating start_date as local-Y-M-D and constructing UTC using IST offset (+5:30) for the default.
    // For simplicity we honour the timezone if it's Asia/Kolkata; otherwise assume UTC.
    const tzOffsetMinutes = camp.timezone === "Asia/Kolkata" ? 330
      : camp.timezone === "Europe/Belgrade" ? 60
      : 0;
    const base = startDateStr ? new Date(`${startDateStr}T00:00:00Z`) : new Date();
    if (!startDateStr) base.setUTCHours(0, 0, 0, 0);
    const dayStartUtcMs = base.getTime() + (startHour * 60 - tzOffsetMinutes) * 60_000;

    const { data: pendingEmails, error: pErr } = await admin
      .from("campaign_emails")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (pErr) return json({ error: pErr.message }, 500);

    const ids = (pendingEmails ?? []).map((r) => r.id);
    const totalDays = Math.max(1, Math.ceil(ids.length / dailyLimit));

    // Slot each email evenly across its day's window
    let updated = 0;
    for (let day = 0; day < totalDays; day++) {
      const slice = ids.slice(day * dailyLimit, (day + 1) * dailyLimit);
      const stepMin = slice.length > 1 ? windowMinutes / slice.length : 0;
      const dayMs = dayStartUtcMs + day * 86_400_000;
      // Build per-id timestamps and batch-update
      for (let i = 0; i < slice.length; i++) {
        const ts = new Date(dayMs + Math.round(i * stepMin) * 60_000).toISOString();
        const { error: uErr } = await admin
          .from("campaign_emails")
          .update({ scheduled_for: ts })
          .eq("id", slice[i]);
        if (!uErr) updated++;
      }
    }

    await admin.from("email_campaigns").update({
      status: "active",
      daily_limit: dailyLimit,
      start_date: startDateStr ?? new Date().toISOString().slice(0, 10),
      total_recipients: ids.length,
    }).eq("id", campaignId);

    return json({
      ok: true,
      scheduled: updated,
      total_recipients: ids.length,
      days: totalDays,
      daily_limit: dailyLimit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("schedule-campaign error", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}