// Demand Discovery edge function — runs APIFY actors across multiple sources,
// stores raw signals, then calls structuring function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Default actor map. Admins can override per-call via request body.
// These are widely-used public APIFY actors. Replace freely from admin UI later.
const DEFAULT_ACTORS: Record<string, string> = {
  indeed: "misceres~indeed-scraper",
  facebook: "apify~facebook-posts-scraper",
  classifieds: "apify~web-scraper",
  career_page: "apify~web-scraper",
};

const COUNTRIES = ["Serbia", "Romania", "Poland", "Germany", "Malta"];
const KEYWORDS = [
  "mason","plumber","electrician","caregiver","nurse",
  "factory worker","driver","construction worker",
];

function fingerprint(s: string) {
  // Cheap stable hash for dedup
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return `${h}`;
}

async function runActor(actorId: string, input: unknown, timeoutMs = 90_000) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${Math.floor(timeoutMs/1000)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs + 5000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`APIFY ${r.status}: ${t.slice(0, 300)}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function buildInput(source: string, country: string, keyword: string) {
  switch (source) {
    case "indeed":
      return {
        country: country.toLowerCase().slice(0,2) === "ge" ? "DE" : country.slice(0,2).toUpperCase(),
        position: keyword,
        maxItems: 20,
      };
    case "facebook":
      return {
        startUrls: [
          { url: `https://www.facebook.com/search/posts?q=${encodeURIComponent(`${keyword} jobs ${country} hiring`)}` },
        ],
        maxPosts: 15,
      };
    case "classifieds":
    case "career_page":
      return {
        startUrls: [
          { url: `https://www.google.com/search?q=${encodeURIComponent(`${keyword} jobs ${country} site:olx.${country.slice(0,2).toLowerCase()} OR inurl:careers`)}` },
        ],
        pageFunction: "async function pageFunction(ctx){return{title:ctx.request.url,text:await ctx.page.evaluate(()=>document.body.innerText.slice(0,4000))}}",
        maxPagesPerCrawl: 5,
      };
    default:
      return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const sources: string[] = body.sources ?? Object.keys(DEFAULT_ACTORS);
    const countries: string[] = body.countries ?? COUNTRIES;
    const keywords: string[] = body.keywords ?? KEYWORDS;
    const actors: Record<string,string> = { ...DEFAULT_ACTORS, ...(body.actors ?? {}) };
    // Cap fan-out so we don't blow timeouts on first run.
    const maxJobs = body.maxJobs ?? 6;

    const plan: Array<{source:string;country:string;keyword:string}> = [];
    outer: for (const s of sources) {
      for (const c of countries) {
        for (const k of keywords) {
          plan.push({ source: s, country: c, keyword: k });
          if (plan.length >= maxJobs) break outer;
        }
      }
    }

    const results: any[] = [];
    for (const job of plan) {
      const actorId = actors[job.source];
      const { data: jobRow, error: jobErr } = await supabase.from("scrape_jobs").insert({
        source: job.source, actor_id: actorId, country: job.country, keyword: job.keyword, status: "running",
      }).select().single();
      if (jobErr || !jobRow) { results.push({ ...job, error: jobErr?.message }); continue; }

      try {
        const input = buildInput(job.source, job.country, job.keyword);
        const items: any[] = await runActor(actorId, input);
        let inserted = 0;
        for (const it of items.slice(0, 25)) {
          const text = JSON.stringify(it).slice(0, 8000);
          const fp = fingerprint(`${job.source}|${job.country}|${job.keyword}|${(it.url ?? it.link ?? it.id ?? text.slice(0,200))}`);
          const { error: insErr } = await supabase.from("raw_signals").insert({
            job_id: jobRow.id,
            source: job.source,
            source_url: it.url ?? it.link ?? null,
            source_id: it.id ?? null,
            raw_text: text,
            payload: it,
            fingerprint: fp,
          });
          if (!insErr) inserted++;
        }
        await supabase.from("scrape_jobs").update({
          status: "succeeded", items_found: items.length, finished_at: new Date().toISOString(),
        }).eq("id", jobRow.id);
        results.push({ ...job, items_found: items.length, inserted });
      } catch (e) {
        await supabase.from("scrape_jobs").update({
          status: "failed", error: String(e).slice(0, 500), finished_at: new Date().toISOString(),
        }).eq("id", jobRow.id);
        results.push({ ...job, error: String(e).slice(0, 200) });
      }
    }

    // Fire structuring asynchronously
    fetch(`${SUPABASE_URL}/functions/v1/structure-leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ limit: 50 }),
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: true, ran: plan.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});