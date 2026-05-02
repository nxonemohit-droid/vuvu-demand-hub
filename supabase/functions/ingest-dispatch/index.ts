// ingest-dispatch — orchestrator for the modular demand pipeline.
//
//   mode: "plan"  → reads source_registry, fans out (source × country × keyword)
//                   into queued scrape_jobs rows.
//   mode: "drain" → pulls a wave of queued jobs ordered by source trust_tier,
//                   invokes the right adapter function per row, then triggers
//                   structure-leads to refresh demand_leads.
//
// Adding a new source = insert one row in source_registry + (if needed) build
// a new adapter-* function. No code change here.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, logRunEvent, type SourceRow } from "../_shared/supabase.ts";
import {
  COUNTRY_META,
  INDEED_ALLOWED,
  LINKEDIN_OFFICIAL_PRIORITY,
  PRIORITY_COUNTRIES,
  PRIORITY_KEYWORDS,
  legacySourceForRegistryId,
} from "../_shared/constants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_ROLE;

const ADAPTER_FUNCTION: Record<string, string> = {
  apify: "adapter-apify",
  // firecrawl adapter ships in a follow-up patch — wired here so dispatch is ready.
  firecrawl: "adapter-firecrawl",
};

function shouldSkip(source: SourceRow, country: string): boolean {
  if (source.id === "indeed") {
    const iso = COUNTRY_META[country]?.iso2;
    return !iso || !INDEED_ALLOWED.has(iso);
  }
  if (source.id === "linkedin_official") {
    const iso = COUNTRY_META[country]?.iso2;
    return !iso || !LINKEDIN_OFFICIAL_PRIORITY.has(iso);
  }
  if (source.id === "linkedin_bebity") {
    const iso = COUNTRY_META[country]?.iso2;
    // Bebity covers everything Official doesn't — avoids double-scraping.
    return !iso || LINKEDIN_OFFICIAL_PRIORITY.has(iso);
  }
  return false;
}

async function invokeAdapter(adapterFn: string, scrapeJobId: string) {
  return fetch(`${SUPABASE_URL}/functions/v1/${adapterFn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ scrape_job_id: scrapeJobId }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supa = adminClient();
    const body = await req.json().catch(() => ({}));
    const mode: "plan" | "drain" = body.mode === "drain" ? "drain" : "plan";

    if (mode === "plan") {
      const countries: string[] = body.countries ?? PRIORITY_COUNTRIES;
      const keywords: string[] = body.keywords ?? PRIORITY_KEYWORDS;
      const maxJobs: number = Math.min(body.maxJobs ?? 60, 200);

      const { data: sources, error: srcErr } = await supa
        .from("source_registry")
        .select("id, source_family, adapter, actor_or_endpoint, default_input, trust_tier, confidence_weight, enabled")
        .eq("enabled", true)
        .order("trust_tier", { ascending: true });
      if (srcErr) throw srcErr;
      const enabledSources = (sources ?? []) as SourceRow[];

      // Round-robin so no single source drowns out others.
      const planRows: Array<{ source: SourceRow; country: string; keyword: string }> = [];
      const seen = new Set<string>();
      outer: for (let k = 0; k < keywords.length; k++) {
        for (let c = 0; c < countries.length; c++) {
          for (let s = 0; s < enabledSources.length; s++) {
            const src = enabledSources[(s + k) % enabledSources.length];
            const country = countries[(c + s) % countries.length];
            const keyword = keywords[k];
            if (shouldSkip(src, country)) continue;
            // company_site / career_page / directory are per-company, not per-keyword —
            // skip in keyword sweep, they're driven by companies table separately.
            if (["company_site", "career_page", "directory"].includes(src.source_family)) continue;
            const key = `${src.id}|${country}|${keyword}`;
            if (seen.has(key)) continue;
            seen.add(key);
            planRows.push({ source: src, country, keyword });
            if (planRows.length >= maxJobs) break outer;
          }
        }
      }

      let queued = 0;
      for (const row of planRows) {
        const { error } = await supa.from("scrape_jobs").insert({
          source: legacySourceForRegistryId(row.source.id),
          source_id: row.source.id,
          actor_id: row.source.actor_or_endpoint,
          country: row.country,
          keyword: row.keyword,
          status: "queued",
        });
        if (!error) queued++;
      }

      return jsonResponse({
        ok: true, mode: "plan", queued,
        sources: enabledSources.length, countries: countries.length, keywords: keywords.length,
      });
    }

    // ---------- DRAIN ----------
    const WAVE_SIZE = Math.min(body.waveSize ?? 4, 8);
    const { data: candidates, error: pickErr } = await supa
      .from("scrape_jobs")
      .select("id, source_id, source")
      .eq("status", "queued")
      .order("started_at", { ascending: true })
      .limit(WAVE_SIZE * 4);
    if (pickErr) throw pickErr;

    if (!candidates || candidates.length === 0) {
      return jsonResponse({ ok: true, mode: "drain", processed: 0, remaining: 0 });
    }

    const sourceIds = Array.from(new Set(candidates.map((c) => c.source_id).filter(Boolean))) as string[];
    const { data: srcRows } = await supa
      .from("source_registry")
      .select("id, adapter, trust_tier")
      .in("id", sourceIds.length ? sourceIds : ["__none__"]);
    const srcByid = new Map((srcRows ?? []).map((s: any) => [s.id, s]));

    // Tier 1 (first-party) before Tier 2/3.
    const ordered = candidates
      .slice()
      .sort((a, b) => (srcByid.get(a.source_id!)?.trust_tier ?? 9) - (srcByid.get(b.source_id!)?.trust_tier ?? 9))
      .slice(0, WAVE_SIZE);

    const results = await Promise.all(ordered.map(async (job) => {
      const src = srcByid.get(job.source_id!);
      const adapterFn = ADAPTER_FUNCTION[src?.adapter ?? ""] ?? null;
      if (!adapterFn) {
        await supa.from("scrape_jobs").update({
          status: "failed", error: `no adapter for ${src?.adapter}`, finished_at: new Date().toISOString(),
        }).eq("id", job.id);
        await logRunEvent(supa, job.id, "dispatch.error", `no adapter for ${src?.adapter}`, {}, "error");
        return { id: job.id, ok: false };
      }
      try {
        const r = await invokeAdapter(adapterFn, job.id);
        const ok = r.ok;
        await r.text().catch(() => "");
        return { id: job.id, ok };
      } catch (e) {
        await logRunEvent(supa, job.id, "dispatch.error", String(e), {}, "error");
        return { id: job.id, ok: false };
      }
    }));

    const { count: remaining } = await supa
      .from("scrape_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");

    // Fire-and-forget structuring so leads refresh after each wave.
    fetch(`${SUPABASE_URL}/functions/v1/structure-leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ limit: 100 }),
    }).catch(() => {});

    return jsonResponse({
      ok: true, mode: "drain",
      processed: results.length,
      succeeded: results.filter((r) => r.ok).length,
      remaining: remaining ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});