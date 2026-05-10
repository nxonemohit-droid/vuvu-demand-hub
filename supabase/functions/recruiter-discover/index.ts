// recruiter-discover — finds recruitment agencies / labour-supply firms
// hiring blue-collar workers from NP/IN/BD across Balkan + wider EU.
// Uses Firecrawl /v2/search to find candidate pages, then /v2/scrape with
// JSON-schema extraction to pull structured agency data. Applies exclusion
// rules and upserts into recruiter_leads.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, extractDomain } from "../_shared/supabase.ts";

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const APIFY_GOOGLE_ACTOR = "apify~google-search-scraper";

const HQ_COUNTRIES = [
  "Serbia","Croatia","Bosnia and Herzegovina","Slovenia","Montenegro",
  "North Macedonia","Albania","Kosovo","Bulgaria","Romania",
  "Germany","Poland","Czechia","Slovakia","Hungary","Portugal",
  "Malta","Cyprus","Greece","Netherlands","Austria",
];
const COUNTRY_ISO: Record<string,string> = {
  Serbia:"rs",Croatia:"hr","Bosnia and Herzegovina":"ba",Slovenia:"si",
  Montenegro:"me","North Macedonia":"mk",Albania:"al",Kosovo:"xk",
  Bulgaria:"bg",Romania:"ro",Germany:"de",Poland:"pl",Czechia:"cz",
  Slovakia:"sk",Hungary:"hu",Portugal:"pt",Malta:"mt",Cyprus:"cy",
  Greece:"gr",Netherlands:"nl",Austria:"at",
};
const TRADES = [
  "construction","welding","masonry","carpentry","steel fixing","plumbing",
  "warehouse","logistics","hospitality","cleaning","agriculture",
  "factory operator","driver",
  "electrician","painter","scaffolder","HVAC","CNC operator","forklift",
  "picker packer","food processing","meat processing","butcher","baker",
  "chef","kitchen helper","housekeeping","room attendant","waiter",
  "security guard","landscaping","shipyard","automotive assembly",
  "tyre fitter","tile setter","plasterer","roofer","ironworker",
];
const ORIGINS = ["Nepal","India","Bangladesh"];
const ALLOWED_MODELS = new Set([
  "no_advance_after_visa","no_advance_after_deployment",
  "free_recruitment","company_recruitment",
]);

const AGGREGATOR_DOMAINS = new Set([
  "linkedin.com","indeed.com","glassdoor.com","google.com","facebook.com",
  "monster.com","reed.co.uk","stepstone.de","totaljobs.com","ziprecruiter.com",
  "jora.com","neuvoo.com","jooble.org","careerjet.com","simplyhired.com",
]);

// Social / video / forum domains — Firecrawl can't scrape these (403) and they
// burn time + credits. Always skip.
const SOCIAL_DOMAINS = new Set([
  "tiktok.com","instagram.com","youtube.com","youtu.be","twitter.com","x.com",
  "reddit.com","pinterest.com","threads.net","t.me","telegram.me","wa.me",
  "whatsapp.com","medium.com","quora.com","vk.com",
]);

type FcSearchResult = { url?: string; title?: string; description?: string };

const RECRUITER_SCHEMA = {
  type: "object",
  properties: {
    is_recruiter: { type: "boolean", description: "True if page is by a recruiter / manpower agency / labour supplier / HR consultant" },
    agency_name: { type: "string" },
    hq_country: { type: "string" },
    hq_city: { type: "string" },
    operating_country: { type: "string", description: "EU country where workers are deployed" },
    contact_name: { type: "string" },
    contact_email: { type: "string" },
    contact_phone: { type: "string", description: "Phone or WhatsApp number" },
    contact_linkedin: { type: "string" },
    license_number: { type: "string", description: "Government recruitment license / registration number if shown" },
    posted_at: { type: "string", description: "ISO date if a posting date is shown" },
    recruitment_model: {
      type: "string",
      enum: [
        "no_advance_after_visa","no_advance_after_deployment",
        "free_recruitment","company_recruitment",
        "upfront_fee","sub_agent","training_institute","unknown",
      ],
    },
    charges_upfront_candidate_fee: { type: "boolean" },
    worker_origin_focus: { type: "array", items: { type: "string", enum: ["NP","IN","BD"] } },
    trades: { type: "array", items: { type: "string" } },
    active_orders: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          country: { type: "string" },
          headcount: { type: "number" },
          salary_min: { type: "number" },
          salary_max: { type: "number" },
          currency: { type: "string" },
        },
      },
    },
  },
  required: ["is_recruiter"],
};

function recencyToTbs(days: number): string | undefined {
  if (!days || days <= 0) return undefined;
  if (days <= 7) return "qdr:w";
  if (days <= 31) return "qdr:m";
  if (days <= 365) return "qdr:y";
  return undefined; // all-time
}

async function fcSearch(query: string, country?: string, tbs?: string): Promise<FcSearchResult[]> {
  const r = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 15, ...(tbs ? { tbs } : {}), country }),
  });
  if (!r.ok) throw new Error(`fc search ${r.status}: ${(await r.text()).slice(0,200)}`);
  const j = await r.json();
  // Firecrawl v2 returns { success, data: { web: [...], news: [...], images: [...] } }
  // Older shapes may return data as an array directly.
  const d = j?.data;
  let arr: unknown = [];
  if (Array.isArray(d)) arr = d;
  else if (Array.isArray(d?.web)) arr = d.web;
  else if (Array.isArray(j?.web)) arr = j.web;
  else if (Array.isArray(j?.results)) arr = j.results;
  return (arr as FcSearchResult[]) ?? [];
}

// Run Apify Google Search Scraper for a batch of queries in a single actor run.
// Returns a flat array of { url, title, description } across all queries.
async function apifyGoogleSearch(
  queries: string[],
  countryCode?: string,
  resultsPerPage = 20,
): Promise<FcSearchResult[]> {
  if (!APIFY_API_TOKEN) throw new Error("APIFY_API_TOKEN not configured");
  const url =
    `https://api.apify.com/v2/acts/${APIFY_GOOGLE_ACTOR}/run-sync-get-dataset-items` +
    `?token=${APIFY_API_TOKEN}&timeout=240`;
  const input = {
    queries: queries.join("\n"),
    resultsPerPage,
    maxPagesPerQuery: 1,
    countryCode: countryCode ?? "us",
    languageCode: "en",
    mobileResults: false,
    saveHtml: false,
    includeUnfilteredResults: false,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`apify google ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const items = (await r.json()) as Array<{
    organicResults?: Array<{ url?: string; title?: string; description?: string }>;
  }>;
  const out: FcSearchResult[] = [];
  for (const page of items ?? []) {
    for (const o of page.organicResults ?? []) {
      if (o.url) out.push({ url: o.url, title: o.title, description: o.description });
    }
  }
  return out;
}

async function fcScrapeJson(url: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: [{ type: "json", schema: RECRUITER_SCHEMA }],
      onlyMainContent: true,
    }),
  });
  if (!r.ok) { console.error("fc scrape failed", url, r.status); return null; }
  const j = await r.json();
  return (j?.data?.json ?? j?.json ?? null) as Record<string, unknown> | null;
}

function isAggregator(domain: string | null): boolean {
  if (!domain) return true;
  for (const a of AGGREGATOR_DOMAINS) {
    if (domain === a || domain.endsWith(`.${a}`)) return true;
  }
  return false;
}

function isSocial(domain: string | null): boolean {
  if (!domain) return true;
  for (const a of SOCIAL_DOMAINS) {
    if (domain === a || domain.endsWith(`.${a}`)) return true;
  }
  return false;
}

function pickSample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
    const supa = adminClient();
    const body = await req.json().catch(() => ({}));

    // ----- Job-status polling endpoint: GET-style call with { jobId } -----
    if (body.jobId) {
      const { data: job, error } = await supa
        .from("discovery_jobs").select("*").eq("id", body.jobId).maybeSingle();
      if (error) return jsonResponse({ ok: false, error: error.message }, 500);
      if (!job) return jsonResponse({ ok: false, error: "job not found" }, 404);
      return jsonResponse({ ok: true, job });
    }

    const countries: string[] = body.countries ?? HQ_COUNTRIES;
    const trades: string[] = body.trades ?? TRADES;
    const origins: string[] = body.origins ?? ORIGINS;
    const recencyDays: number = body.recencyDays ?? 90;
    const tbs = recencyToTbs(recencyDays);
    const singleCountry = countries.length === 1;
    const maxQueries: number = Math.min(body.maxQueries ?? 20, singleCountry ? 80 : 60);
    const maxScrapes: number = Math.min(body.maxScrapes ?? 25, 80);
    const scrapeConcurrency: number = Math.min(body.scrapeConcurrency ?? 5, 10);
    const recencyCutoff = Date.now() - recencyDays * 86400_000;
    // Search provider: "firecrawl" (default) or "apify" (Google SERP via apify/google-search-scraper).
    const searchProvider: "firecrawl" | "apify" =
      (body.searchProvider === "apify") ? "apify" : "firecrawl";
    // Threshold of consecutive zero-result occurrences before a token is auto-skipped.
    const ZERO_SKIP_THRESHOLD = 3;

    // Create the job row up-front so the client can poll it immediately.
    const { data: jobRow, error: jobErr } = await supa
      .from("discovery_jobs")
      .insert({
        kind: "recruiter_discover",
        status: "queued",
        params: { countries, trades, origins, recencyDays, maxQueries, maxScrapes, scrapeConcurrency },
      })
      .select("id").single();
    if (jobErr || !jobRow) {
      return jsonResponse({ ok: false, error: jobErr?.message ?? "job insert failed" }, 500);
    }
    const jobId = jobRow.id as string;

    // ----- Background pipeline -----
    const runPipeline = async () => {
      try {
        await supa.from("discovery_jobs").update({
          status: "processing", started_at: new Date().toISOString(),
        }).eq("id", jobId);

    // Load learned exclusions: keywords, domains, and country/trade combos that
    // have repeatedly produced zero usable results in past runs.
    const { data: statRows } = await supa
      .from("discovery_query_stats")
      .select("kind, token, zero_result_count, hit_count")
      .gte("zero_result_count", ZERO_SKIP_THRESHOLD);
    const learnedSkipKeywords = new Set<string>();
    const learnedSkipDomains = new Set<string>();
    const learnedSkipCT = new Set<string>(); // "country|trade"
    for (const r of statRows ?? []) {
      // If the token has ever produced hits, don't permanently skip it.
      if ((r.hit_count ?? 0) > 0) continue;
      const t = String(r.token).toLowerCase();
      if (r.kind === "keyword") learnedSkipKeywords.add(t);
      else if (r.kind === "domain") learnedSkipDomains.add(t);
      else if (r.kind === "country_trade") learnedSkipCT.add(t);
    }
    console.log(`learned skips: ${learnedSkipKeywords.size} kw, ${learnedSkipDomains.size} dom, ${learnedSkipCT.size} c×t`);

    // Per-run accounting → flushed to discovery_query_stats at the end.
    const ctZero = new Map<string, number>();   // country|trade → 0 if no hits
    const ctHit  = new Map<string, number>();
    const kwZero = new Map<string, number>();
    const kwHit  = new Map<string, number>();
    const domZero = new Map<string, number>();
    const domHit  = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

    // Filter out learned-bad inputs.
    const filteredTrades = trades.filter((t) => !learnedSkipKeywords.has(t.toLowerCase()));
    const tradePool = filteredTrades.length ? filteredTrades : trades;

    // Build extra `-site:` exclusions from learned-bad domains (cap to keep query short).
    const learnedSiteExclusions = [...learnedSkipDomains].slice(0, 10)
      .map((d) => `-site:${d}`).join(" ");

    // Tiered query builder — auto-tune by progressively dropping filters.
    const buildQueries = (tier: 0 | 1 | 2 | 3 | 4 | 5): { q: string; country: string; trade: string }[] => {
      const sampleCountries = pickSample(countries, Math.min(countries.length, 12));
      const out: { q: string; country: string; trade: string }[] = [];
      const originExpr = origins.map((o) => `"${o}"`).join(" OR ");
      outer: for (const country of sampleCountries) {
        // For single-country runs, sweep ALL trades; otherwise sample.
        const tradeSample = singleCountry
          ? tradePool
          : pickSample(tradePool, tier === 0 ? 2 : 1);
        for (const trade of tradeSample) {
          // Skip combos that have repeatedly returned nothing.
          if (learnedSkipCT.has(`${country.toLowerCase()}|${trade.toLowerCase()}`)) continue;
          let q: string;
          if (tier === 0) {
            q = `("recruitment agency" OR "manpower agency" OR "labour supply" OR "HR consultant") (${originExpr}) workers ${trade} "${country}" ("free recruitment" OR "no advance" OR "company paid" OR "employer paid") -site:linkedin.com -site:indeed.com ${learnedSiteExclusions}`;
          } else if (tier === 1) {
            q = `("recruitment agency" OR "manpower agency" OR "labour supply") (${originExpr}) ${trade} workers "${country}" -site:linkedin.com -site:indeed.com ${learnedSiteExclusions}`;
          } else if (tier === 2) {
            q = `("recruitment agency" OR "manpower agency") (Nepal OR India OR Bangladesh) workers "${country}" ${learnedSiteExclusions}`;
          } else if (tier === 3) {
            // Country-TLD agency sites (e.g. site:rs for Serbia)
            const tld = (COUNTRY_ISO[country] ?? "").toLowerCase();
            const tldFrag = tld ? `site:${tld}` : `"${country}"`;
            q = `("manpower" OR "recruitment" OR "labour supply" OR "agencija za zapošljavanje" OR "agencija za posredovanje") (Nepal OR India OR Bangladesh) ${tldFrag} ${learnedSiteExclusions}`;
          } else if (tier === 4) {
            // Contact-page intent
            q = `("workers to ${country}" OR "deployment ${country}" OR "${country} placement") (Nepal OR India OR Bangladesh) (intext:"contact us" OR intext:"send your CV" OR inurl:contact) -site:linkedin.com -site:indeed.com ${learnedSiteExclusions}`;
          } else {
            // Origin-side agencies advertising this destination
            q = `("recruitment agency" OR "manpower consultant" OR "overseas placement") "${country}" (Nepal OR India OR Bangladesh) (site:in OR site:np OR site:com.bd) ${learnedSiteExclusions}`;
          }
          out.push({ country, q, trade });
          if (out.length >= maxQueries) break outer;
        }
      }
      return out;
    };

    // Fetch blacklisted domains once.
    const { data: blacklist } = await supa.from("lead_blacklist").select("domain");
    const blocked = new Set((blacklist ?? []).map((r: { domain: string }) => r.domain.toLowerCase()));

    const searchConcurrency: number = Math.min(body.searchConcurrency ?? 6, 10);
    const candidates = new Map<string, { url: string; country: string }>();
    let searched = 0;
    const tunedTiers: number[] = [];

    const runSearch = async ({ q, country, trade }: { q: string; country: string; trade: string }) => {
      try {
        const iso = COUNTRY_ISO[country];
        const results = searchProvider === "firecrawl"
          ? await fcSearch(q, iso, tbs)
          : await apifyGoogleSearch([q], iso, 20);
        searched++;
        const ctKey = `${country.toLowerCase()}|${trade.toLowerCase()}`;
        const kwKey = trade.toLowerCase();
        let usable = 0;
        for (const r of results) {
          const domain = extractDomain(r.url);
          if (!domain || isAggregator(domain) || isSocial(domain) || blocked.has(domain) || learnedSkipDomains.has(domain)) continue;
          if (candidates.has(domain)) continue;
          candidates.set(domain, { url: r.url!, country });
          usable++;
          bump(domHit, domain);
        }
        if (usable === 0) {
          bump(ctZero, ctKey); bump(kwZero, kwKey);
          for (const r of results) {
            const domain = extractDomain(r.url);
            if (domain) bump(domZero, domain);
          }
        } else {
          bump(ctHit, ctKey); bump(kwHit, kwKey);
        }
      } catch (e) { console.error("search err", q, e); }
    };

    const targetCandidates = Math.max(maxScrapes * 2, 20);
    for (const tier of [0, 1, 2, 3, 4, 5] as const) {
      const queries = buildQueries(tier);
      tunedTiers.push(tier);
      if (searchProvider === "apify") {
        // One actor run per tier — cheaper and faster than per-query calls.
        try {
          const iso = COUNTRY_ISO[queries[0]?.country ?? ""] ?? "rs";
          const flat = await apifyGoogleSearch(queries.map((x) => x.q), iso, 20);
          searched += queries.length;
          for (const r of flat) {
            const domain = extractDomain(r.url);
            if (!domain || isAggregator(domain) || isSocial(domain) || blocked.has(domain) || learnedSkipDomains.has(domain)) continue;
            if (candidates.has(domain)) continue;
            candidates.set(domain, { url: r.url!, country: queries[0]?.country ?? "" });
            bump(domHit, domain);
          }
        } catch (e) { console.error("apify search err", e); }
      } else {
        for (let i = 0; i < queries.length; i += searchConcurrency) {
          await Promise.all(queries.slice(i, i + searchConcurrency).map(runSearch));
          if (candidates.size >= targetCandidates) break;
        }
      }
      console.log(`auto-tune tier ${tier}: ${candidates.size} unique candidates so far`);
      if (candidates.size >= targetCandidates) break;
    }

    // Persist learning. Each token: increment zero_result_count or hit_count.
    const upsertStat = async (kind: string, token: string, zeroDelta: number, hitDelta: number) => {
      const { data: existing } = await supa
        .from("discovery_query_stats")
        .select("id, zero_result_count, hit_count")
        .eq("kind", kind).eq("token", token).maybeSingle();
      if (existing) {
        await supa.from("discovery_query_stats").update({
          zero_result_count: (existing.zero_result_count ?? 0) + zeroDelta,
          hit_count: (existing.hit_count ?? 0) + hitDelta,
          last_seen_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supa.from("discovery_query_stats").insert({
          kind, token, zero_result_count: zeroDelta, hit_count: hitDelta,
        });
      }
    };
    const flushes: Promise<unknown>[] = [];
    for (const [k, v] of ctZero) flushes.push(upsertStat("country_trade", k, v, 0));
    for (const [k, v] of ctHit)  flushes.push(upsertStat("country_trade", k, 0, v));
    for (const [k, v] of kwZero) flushes.push(upsertStat("keyword", k, v, 0));
    for (const [k, v] of kwHit)  flushes.push(upsertStat("keyword", k, 0, v));
    for (const [k, v] of domZero) flushes.push(upsertStat("domain", k, v, 0));
    for (const [k, v] of domHit)  flushes.push(upsertStat("domain", k, 0, v));
    await Promise.all(flushes);

    // Cap scrapes so we fit within the edge timeout.
    const candidateList = [...candidates.entries()].slice(0, maxScrapes);

    let inserted = 0, updated = 0, excluded = 0, skipped = 0;
    const breakdown: Record<string, number> = {};

    const processOne = async ([domain, info]: [string, { url: string; country: string }]) => {
      try {
        let extracted = await fcScrapeJson(info.url);
        if (!extracted || extracted.is_recruiter !== true) { skipped++; return; }

        // Contact-page fallback if no email found on the SERP page.
        if (!extracted.contact_email) {
          const candidatesPaths = ["/contact", "/contact-us", "/about", "/about-us"];
          for (const p of candidatesPaths) {
            try {
              const fb = await fcScrapeJson(`https://${domain}${p}`);
              if (fb && (fb.contact_email || fb.contact_phone)) {
                extracted = {
                  ...extracted,
                  contact_email: extracted.contact_email ?? fb.contact_email,
                  contact_phone: extracted.contact_phone ?? fb.contact_phone,
                  contact_name: extracted.contact_name ?? fb.contact_name,
                  contact_linkedin: extracted.contact_linkedin ?? fb.contact_linkedin,
                };
                break;
              }
            } catch (_) { /* keep trying */ }
          }
        }

        const agencyName = String(extracted.agency_name ?? domain.split(".")[0]).trim();
        if (!agencyName) { skipped++; return; }

        const model = String(extracted.recruitment_model ?? "unknown");
        const upfront = extracted.charges_upfront_candidate_fee === true;
        const postedRaw = extracted.posted_at ? Date.parse(String(extracted.posted_at)) : NaN;

        let excludedReason: string | null = null;
        if (upfront) excludedReason = "upfront_fee";
        else if (model === "sub_agent") excludedReason = "sub_agent";
        else if (model === "training_institute") excludedReason = "training_institute";
        // Note: "unknown" model is allowed (kept active). Stale check removed — recency
        // is already enforced via Firecrawl `tbs`.

        // Persist raw signal for provenance.
        const { data: rs } = await supa.from("raw_signals").insert({
          source: "google_jobs",
          source_url: info.url,
          source_id: `recruiter:${domain}`,
          payload: { kind: "recruiter_directory", domain, extracted },
          fingerprint: `recruiter:${domain}`,
        }).select("id").maybeSingle();

        const status = excludedReason ? "excluded" : "active";
        const recruitment_model = ALLOWED_MODELS.has(model) ? [model] : [];

        const row = {
          agency_name: agencyName,
          hq_country: (extracted.hq_country as string) ?? info.country,
          hq_city: (extracted.hq_city as string) ?? null,
          operating_eu_country: (extracted.operating_country as string) ?? info.country,
          contact_name: (extracted.contact_name as string) ?? null,
          contact_email: (extracted.contact_email as string) ?? null,
          contact_phone: (extracted.contact_phone as string) ?? null,
          contact_linkedin: (extracted.contact_linkedin as string) ?? null,
          recruitment_model,
          license_number: (extracted.license_number as string) ?? null,
          active_orders: extracted.active_orders ?? [],
          worker_origin_focus: Array.isArray(extracted.worker_origin_focus) ? extracted.worker_origin_focus : [],
          trades: Array.isArray(extracted.trades) ? extracted.trades : [],
          source_url: info.url,
          source_posted_at: !isNaN(postedRaw) ? new Date(postedRaw).toISOString() : null,
          last_seen_at: new Date().toISOString(),
          raw_signal_id: rs?.id ?? null,
          status,
          excluded_reason: excludedReason,
        };

        // Upsert by lower(agency_name) + hq_country
        const hq = row.hq_country ?? "";
        const { data: existing } = await supa
          .from("recruiter_leads")
          .select("id")
          .ilike("agency_name", agencyName)
          .eq("hq_country", hq)
          .maybeSingle();

        if (existing) {
          await supa.from("recruiter_leads").update(row).eq("id", existing.id);
          updated++;
        } else {
          const { error } = await supa.from("recruiter_leads").insert(row);
          if (error) { console.error("insert err", error); skipped++; return; }
          inserted++;
        }
        if (excludedReason) excluded++;
        breakdown[row.hq_country ?? "unknown"] = (breakdown[row.hq_country ?? "unknown"] ?? 0) + 1;
      } catch (e) {
        console.error("process err", domain, e);
        skipped++;
      }
    };

    for (let i = 0; i < candidateList.length; i += scrapeConcurrency) {
      const batch = candidateList.slice(i, i + scrapeConcurrency);
      await Promise.all(batch.map(processOne));
    }

        await supa.from("discovery_jobs").update({
          status: "completed",
          finished_at: new Date().toISOString(),
          result: {
            searched, discovered: candidates.size,
            scraped: candidateList.length,
            inserted, updated, excluded, skipped, breakdown,
            auto_tune_tiers: tunedTiers,
          },
        }).eq("id", jobId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("pipeline error", msg);
        await supa.from("discovery_jobs").update({
          status: "failed", finished_at: new Date().toISOString(), error_message: msg,
        }).eq("id", jobId);
      }
    };

    // @ts-ignore — EdgeRuntime is provided by Supabase Edge Functions runtime.
    EdgeRuntime.waitUntil(runPipeline());

    return jsonResponse({ ok: true, jobId, status: "queued" }, 202);
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});