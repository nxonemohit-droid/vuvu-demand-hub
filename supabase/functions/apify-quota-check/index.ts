// apify-quota-check — fetches current Apify monthly usage and persists it
// into provider_quota_state so the dashboard and dispatcher can react.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");
    const supa = adminClient();

    const r = await fetch("https://api.apify.com/v2/users/me/limits", {
      headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`apify limits ${r.status}: ${t.slice(0, 300)}`);
    }
    const j = await r.json();
    const limits = j?.data?.limits ?? {};
    const cur = j?.data?.current ?? {};
    const cycle = j?.data?.monthlyUsageCycle ?? {};

    const usage = Number(cur.monthlyUsageUsd ?? 0);
    const limit = Number(limits.maxMonthlyUsageUsd ?? 0);
    const pct = limit > 0 ? Math.min(100, (usage / limit) * 100) : 0;
    const exhausted = limit > 0 && usage >= limit;

    const { data: existing } = await supa
      .from("provider_quota_state")
      .select("exhausted_at")
      .eq("provider", "apify")
      .maybeSingle();

    await supa.from("provider_quota_state").upsert({
      provider: "apify",
      monthly_usage_usd: usage,
      monthly_limit_usd: limit,
      usage_pct: pct,
      cycle_start_at: cycle.startAt ?? null,
      cycle_end_at: cycle.endAt ?? null,
      exhausted_at: exhausted
        ? (existing?.exhausted_at ?? new Date().toISOString())
        : null,
      last_checked_at: new Date().toISOString(),
      raw: j?.data ?? {},
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true, usage, limit, pct, exhausted,
      cycle_end_at: cycle.endAt ?? null,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});