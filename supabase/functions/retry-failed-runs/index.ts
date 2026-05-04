// retry-failed-runs — re-queues jobs that previously failed so the dispatcher
// can pick them up. Refuses to act while the relevant provider's quota is
// known to be exhausted (otherwise we'd just burn another wall of 403s).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supa = adminClient();
    const body = await req.json().catch(() => ({}));
    const max = Math.min(Number(body.max ?? 200), 1000);
    const includeQuotaSkipped = body.includeQuotaSkipped === true;

    // Block if Apify quota still exhausted (we only have apify adapters today).
    const { data: quota } = await supa
      .from("provider_quota_state")
      .select("provider, exhausted_at, usage_pct, cycle_end_at")
      .eq("provider", "apify")
      .maybeSingle();
    if (quota?.exhausted_at) {
      return jsonResponse({
        ok: false,
        blocked: true,
        reason: "Apify monthly quota still exhausted",
        cycle_end_at: quota.cycle_end_at,
        usage_pct: quota.usage_pct,
      }, 200);
    }

    const statuses = includeQuotaSkipped
      ? ["failed", "quota_exceeded", "skipped_quota"]
      : ["failed", "quota_exceeded"];

    const { data: rows, error } = await supa
      .from("scrape_jobs")
      .select("id")
      .in("status", statuses)
      .order("started_at", { ascending: false })
      .limit(max);
    if (error) throw error;

    const ids = (rows ?? []).map((r: any) => r.id);
    if (ids.length === 0) return jsonResponse({ ok: true, requeued: 0 });

    const { error: upErr } = await supa
      .from("scrape_jobs")
      .update({
        status: "queued",
        error: null,
        finished_at: null,
        started_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (upErr) throw upErr;

    return jsonResponse({ ok: true, requeued: ids.length });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});