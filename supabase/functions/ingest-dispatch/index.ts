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

const ADAPTER_PROVIDER: Record<string, string> = {
  apify: "apify",
  firecrawl: "firecrawl",
};

// Hard pause when provider is over this % of monthly budget.
const PROVIDER_PAUSE_PCT = 95;
// Hard pause for a single source over this % of its own slice.
const SOURCE_PAUSE_PCT = 95;
// Skip queueing a (source, country, keyword) triple if it ran successfully
// in the last DEDUP_HOURS hours.
const DEDUP_HOURS = 72;
// Delay between consecutive adapter invocations within a drain wave (ms).
const PER_JOB_DELAY_MS = 1500;

async function getQuotaMap(supa: ReturnType<typeof adminClient>) {
  const { data } = await supa.from("provider_quota_state")
    .select("provider, usage_pct, exhausted_at, cycle_end_at");
  const m = new Map<string, { paused: boolean; reason: string | null }>();
  for (const r of data ?? []) {
    const pct = Number((r as any).usage_pct ?? 0);
    const exhausted = Boolean((r as any).exhausted_at);
    const paused = exhausted || pct >= PROVIDER_PAUSE_PCT;
    const reason = exhausted
      ? `quota exhausted; resets ${(r as any).cycle_end_at ?? "next cycle"}`
      : (paused ? `usage at ${pct.toFixed(1)}% of monthly budget` : null);
    m.set((r as any).provider, { paused, reason });
  }
  return m;
}

/** Returns true if a recent successful (or empty-success) run already covered
 *  this triple. Used at plan time to prevent burning credits on duplicates. */
async function recentlyRan(
  supa: ReturnType<typeof adminClient>,
  source_id: string,
  country: string | null,
  keyword: string | null,
): Promise<boolean> {
  const sinceIso = new Date(Date.now() - DEDUP_HOURS * 3_600_000).toISOString();
  let q = supa.from("scrape_jobs")
    .select("id", { head: true, count: "exact" })
    .eq("source_id", source_id)
    .in("status", ["succeeded", "succeeded_empty", "running", "queued"])
    .gte("started_at", sinceIso);
  q = country === null ? q.is("country", null) : q.eq("country", country);
  q = keyword === null ? q.is("keyword", null) : q.eq("keyword", keyword);
  const { count } = await q;
  return (count ?? 0) > 0;
}

/** Returns true if the source has burned its monthly slice. */
function sourceOverBudget(s: SourceRow): boolean {
  const budget = Number(s.monthly_budget_usd ?? 0);
  if (!budget || budget <= 0) return false;
  const spend = Number(s.monthly_spend_usd ?? 0);
  return (spend / budget) * 100 >= SOURCE_PAUSE_PCT;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
    const planType: string = body.planType ?? "keyword"; // keyword | recrawl | discovery

    if (mode === "plan") {
      // ---------- RECRAWL plan: per-company crawls of careers/official sites ----------
      if (planType === "recrawl") {
        const maxCompanies: number = Math.min(body.maxCompanies ?? 20, 100);
        const { data: src } = await supa.from("source_registry")
          .select("id, source_family, adapter, actor_or_endpoint, default_input, trust_tier, confidence_weight, enabled")
          .eq("id", "company_site_firecrawl").maybeSingle<SourceRow>();
        if (!src || !src.enabled) {
          return jsonResponse({ ok: false, error: "company_site_firecrawl source disabled" });
        }
        // Pick companies due for recrawl (last_crawled_at older than recrawl_interval_hours, or never crawled).
        const { data: due, error: dueErr } = await supa
          .from("companies")
          .select("id, name, careers_url, official_url, website_domain, recrawl_interval_hours, last_crawled_at, crawl_priority")
          .or("careers_url.not.is.null,official_url.not.is.null,website_domain.not.is.null")
          .order("crawl_priority", { ascending: true })
          .order("last_crawled_at", { ascending: true, nullsFirst: true })
          .limit(maxCompanies * 3);
        if (dueErr) throw dueErr;
        const now = Date.now();
        const eligible = (due ?? []).filter((c: any) => {
          if (!c.last_crawled_at) return true;
          const ageH = (now - new Date(c.last_crawled_at).getTime()) / 3_600_000;
          return ageH >= (c.recrawl_interval_hours ?? 168);
        }).slice(0, maxCompanies);

        let queued = 0;
        for (const c of eligible) {
          const url = c.careers_url ?? c.official_url ?? (c.website_domain ? `https://${c.website_domain}` : null);
          if (!url) continue;
          const { error } = await supa.from("scrape_jobs").insert({
            source: legacySourceForRegistryId(src.id),
            source_id: src.id,
            actor_id: src.actor_or_endpoint,
            country: null,
            keyword: null,
            status: "queued",
            parent_company_id: c.id,
            input: { url, intent: "map" },
          });
          if (!error) queued++;
        }
        return jsonResponse({ ok: true, mode: "plan", planType: "recrawl", queued, candidates: eligible.length });
      }

      // ---------- DISCOVERY plan: trigger firecrawl-search to seed new companies ----------
      if (planType === "discovery") {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        return jsonResponse({ ok: true, mode: "plan", planType: "discovery", search: j });
      }

      // ---------- KEYWORD plan (default) ----------
      const countries: string[] = body.countries ?? PRIORITY_COUNTRIES;
      const keywords: string[] = body.keywords ?? PRIORITY_KEYWORDS;
      const maxJobs: number = Math.min(body.maxJobs ?? 60, 200);

      const { data: sources, error: srcErr } = await supa
        .from("source_registry")
        .select("id, source_family, adapter, actor_or_endpoint, default_input, trust_tier, confidence_weight, enabled, priority, monthly_budget_usd, monthly_spend_usd, max_items_per_run")
        .eq("enabled", true)
        .order("trust_tier", { ascending: true })
        .order("priority", { ascending: true });
      if (srcErr) throw srcErr;
      const allSources = (sources ?? []) as SourceRow[];
      // Drop sources over their per-source monthly budget.
      const enabledSources = allSources.filter((s) => !sourceOverBudget(s));
      // Group by family and keep only the lowest-priority (= primary) source per
      // family at plan time. Fallbacks kick in at drain time when the primary
      // returns empty/quota-exceeded.
      const primaryByFamily = new Map<string, SourceRow>();
      for (const s of enabledSources) {
        const cur = primaryByFamily.get(s.source_family);
        if (!cur || (s.priority ?? 1) < (cur.priority ?? 1)) {
          primaryByFamily.set(s.source_family, s);
        }
      }
      const primarySources = Array.from(primaryByFamily.values());

      // Round-robin so no single source drowns out others.
      const planRows: Array<{ source: SourceRow; country: string; keyword: string }> = [];
      const seen = new Set<string>();
      outer: for (let k = 0; k < keywords.length; k++) {
        for (let c = 0; c < countries.length; c++) {
          for (let s = 0; s < primarySources.length; s++) {
            const src = primarySources[(s + k) % primarySources.length];
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
      let dedupSkipped = 0;
      for (const row of planRows) {
        if (await recentlyRan(supa, row.source.id, row.country, row.keyword)) {
          dedupSkipped++;
          continue;
        }
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
        dedup_skipped: dedupSkipped,
        sources: primarySources.length,
        sources_over_budget: allSources.length - enabledSources.length,
        countries: countries.length, keywords: keywords.length,
      });
    }

    // ---------- DRAIN ----------
    const WAVE_SIZE = Math.min(body.waveSize ?? 4, 8);
    const quota = await getQuotaMap(supa);
    const { data: candidates, error: pickErr } = await supa
      .from("scrape_jobs")
      .select("id, source_id, source")
      .eq("status", "queued")
      .not("source_id", "is", null)
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

    const results: Array<{ id: string; ok: boolean; status: string }> = [];
    let skippedQuota = 0;
    for (let i = 0; i < ordered.length; i++) {
      const job = ordered[i];
      const src = srcByid.get(job.source_id!);
      const adapterFn = ADAPTER_FUNCTION[src?.adapter ?? ""] ?? null;
      if (!adapterFn) {
        await supa.from("scrape_jobs").update({
          status: "failed", error: `no adapter for ${src?.adapter}`, finished_at: new Date().toISOString(),
        }).eq("id", job.id);
        await logRunEvent(supa, job.id, "dispatch.error", `no adapter for ${src?.adapter}`, {}, "error");
        results.push({ id: job.id, ok: false, status: "failed" });
        continue;
      }
      // Pre-flight quota check: if this adapter's provider is paused, mark the
      // job as skipped_quota instead of burning a 403.
      const provider = ADAPTER_PROVIDER[src?.adapter ?? ""] ?? src?.adapter ?? "";
      const q = quota.get(provider);
      if (q?.paused) {
        await supa.from("scrape_jobs").update({
          status: "skipped_quota",
          error: q.reason ?? "provider quota paused",
          finished_at: new Date().toISOString(),
        }).eq("id", job.id);
        await logRunEvent(supa, job.id, "dispatch.skipped_quota", q.reason ?? "paused", { provider }, "warn");
        skippedQuota++;
        results.push({ id: job.id, ok: false, status: "skipped_quota" });
        continue;
      }
      try {
        const r = await invokeAdapter(adapterFn, job.id);
        const ok = r.ok;
        await r.text().catch(() => "");
        results.push({ id: job.id, ok, status: ok ? "ok" : "err" });
      } catch (e) {
        await logRunEvent(supa, job.id, "dispatch.error", String(e), {}, "error");
        results.push({ id: job.id, ok: false, status: "err" });
      }
      // Refresh quota map after each call so a freshly-detected 403 stops the wave.
      if (i < ordered.length - 1) {
        await sleep(PER_JOB_DELAY_MS);
        const fresh = await getQuotaMap(supa);
        for (const [k, v] of fresh) quota.set(k, v);
      }
    }

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
      skipped_quota: skippedQuota,
      remaining: remaining ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});