// Discover URLs for HM institutes / consultancies via Google CSE + Firecrawl search.
// Creates a hm_scrape_jobs row, then queues per-URL enrichment via hm-enrich.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { buildQueries, HM_REGIONS } from "../_shared/hm-regions.ts";

const GCSE_KEY = Deno.env.get("GOOGLE_CSE_API_KEY");
const GCSE_ID = Deno.env.get("GOOGLE_CSE_ID");
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");

async function googleCSE(query: string, num = 10): Promise<string[]> {
  if (!GCSE_KEY || !GCSE_ID) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${GCSE_KEY}&cx=${GCSE_ID}&q=${encodeURIComponent(query)}&num=${num}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.items || []).map((it: any) => it.link).filter(Boolean);
  } catch { return []; }
}

async function firecrawlSearch(query: string, limit = 10): Promise<string[]> {
  if (!FIRECRAWL_KEY) return [];
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    const results = j?.data?.web || j?.data || [];
    return results.map((it: any) => it.url).filter(Boolean);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const bucket = (body.bucket === "consultancy" ? "consultancy" : "institute") as "institute" | "consultancy";
    const regions: string[] = Array.isArray(body.regions) && body.regions.length
      ? body.regions
      : Object.keys(HM_REGIONS);
    const perQuery = Math.min(Math.max(Number(body.per_query) || 8, 1), 10);
    const maxQueries = Math.min(Math.max(Number(body.max_queries) || 30, 1), 120);

    const supa = adminClient();
    const { data: job, error: jErr } = await supa.from("hm_scrape_jobs").insert({
      mode: "discover",
      provider: "gcse+firecrawl",
      bucket,
      regions,
      status: "running",
      started_at: new Date().toISOString(),
      meta: { per_query: perQuery, max_queries: maxQueries },
    }).select("id").single();
    if (jErr) return jsonResponse({ error: jErr.message }, 500);

    const queries = buildQueries(bucket, regions).slice(0, maxQueries);
    const seen = new Set<string>();
    const urls: { url: string; query: string }[] = [];

    for (const q of queries) {
      let hits = await googleCSE(q, perQuery);
      if (hits.length === 0) hits = await firecrawlSearch(q, perQuery);
      for (const u of hits) {
        try {
          const clean = new URL(u).toString();
          if (!seen.has(clean)) { seen.add(clean); urls.push({ url: clean, query: q }); }
        } catch { /* skip */ }
      }
    }

    // De-dupe against existing leads
    const { data: existing } = await supa.from("hm_leads").select("source_url").not("source_url", "is", null);
    const existingSet = new Set((existing || []).map((r: any) => r.source_url));
    const fresh = urls.filter((u) => !existingSet.has(u.url));

    // Fire-and-forget enrichment for each URL
    const enrichUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hm-enrich`;
    const auth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    // batch by 20 to avoid slamming
    (async () => {
      for (let i = 0; i < fresh.length; i += 20) {
        const chunk = fresh.slice(i, i + 20);
        await Promise.all(chunk.map((u) =>
          fetch(enrichUrl, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/json" },
            body: JSON.stringify({ url: u.url, bucket, job_id: job.id, query: u.query }),
          }).catch(() => null)
        ));
      }
      await supa.from("hm_scrape_jobs").update({
        status: "completed", urls_found: fresh.length, finished_at: new Date().toISOString(),
      }).eq("id", job.id);
    })();

    return jsonResponse({
      ok: true, job_id: job.id, queries: queries.length,
      urls_found: fresh.length, total_hits: urls.length,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});