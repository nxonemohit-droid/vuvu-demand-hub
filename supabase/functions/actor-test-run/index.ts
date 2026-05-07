// actor-test-run — runs a single capped (max 5 items) scrape against one actor
// for quick health/sanity testing from the Actor Health UI. Bypasses the
// regular dedup/budget gating so the user can always force a fresh probe.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { legacySourceForRegistryId } from "../_shared/constants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supa = adminClient();
    const body = await req.json().catch(() => ({}));
    const sourceId: string | undefined = body.source_id;
    const actorId: string | undefined = body.actor_id ?? undefined;
    const country: string | null = body.country ?? null;
    const keyword: string | null = body.keyword ?? null;
    const cap: number = Math.max(1, Math.min(Number(body.cap ?? 5), 10));

    if (!sourceId) return jsonResponse({ ok: false, error: "source_id required" }, 400);

    const { data: source, error: srcErr } = await supa
      .from("source_registry")
      .select("id, adapter, actor_or_endpoint")
      .eq("id", sourceId)
      .single();
    if (srcErr || !source) return jsonResponse({ ok: false, error: "source not found" }, 404);
    if (source.adapter !== "apify") {
      return jsonResponse({ ok: false, error: `adapter ${source.adapter} not supported by test-run` }, 400);
    }

    const finalActor = actorId || source.actor_or_endpoint;
    if (!finalActor) return jsonResponse({ ok: false, error: "no actor_id available" }, 400);

    // Insert a one-off queued job with a tiny cap so credits stay minimal.
    const { data: job, error: jobErr } = await supa
      .from("scrape_jobs")
      .insert({
        source: legacySourceForRegistryId(source.id),
        source_id: source.id,
        actor_id: finalActor,
        country,
        keyword,
        status: "queued",
        input: { cap_override: cap, test_run: true },
      })
      .select("id")
      .single();
    if (jobErr || !job) throw jobErr ?? new Error("could not queue test job");

    // Run the adapter synchronously and wait for completion.
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/adapter-apify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ scrape_job_id: job.id }),
    });
    const adapterJson = await resp.json().catch(() => ({}));

    // Re-read the job for final counts/status/error/cost.
    const { data: finalJob } = await supa
      .from("scrape_jobs")
      .select("id, status, items_found, items_structured, cost_usd, error, started_at, finished_at")
      .eq("id", job.id)
      .single();

    return jsonResponse({
      ok: true,
      job: finalJob,
      adapter: adapterJson,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});