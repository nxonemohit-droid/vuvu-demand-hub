// recruiter-discover — finds recruitment agencies / labour-supply firms
// hiring blue-collar workers from NP/IN/BD across Balkan + wider EU.
// Uses Firecrawl /v2/search to find candidate pages, then /v2/scrape with
// JSON-schema extraction to pull structured agency data. Applies exclusion
// rules and upserts into recruiter_leads.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, extractDomain } from "../_shared/supabase.ts";

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

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

async function fcSearch(query: string, country?: string): Promise<FcSearchResult[]> {
  const r = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 15, tbs: "qdr:m", country }),
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

    const countries: string[] = body.countries ?? HQ_COUNTRIES;
    const trades: string[] = body.trades ?? TRADES;
    const origins: string[] = body.origins ?? ORIGINS;
    const recencyDays: number = body.recencyDays ?? 90;
    const maxQueries: number = Math.min(body.maxQueries ?? 20, 60);
    const recencyCutoff = Date.now() - recencyDays * 86400_000;

    // Build a sampled query set: rotate through countries x 2 trades.
    const sampleCountries = pickSample(countries, Math.min(countries.length, 12));
    const queries: { q: string; country: string }[] = [];
    outer: for (const country of sampleCountries) {
      for (const trade of pickSample(trades, 2)) {
        const originExpr = origins.map((o) => `"${o}"`).join(" OR ");
        queries.push({
          country,
          q: `("recruitment agency" OR "manpower agency" OR "labour supply" OR "HR consultant") (${originExpr}) workers ${trade} "${country}" ("free recruitment" OR "no advance" OR "company paid" OR "employer paid") -site:linkedin.com -site:indeed.com`,
        });
        if (queries.length >= maxQueries) break outer;
      }
    }

    // Fetch blacklisted domains once.
    const { data: blacklist } = await supa.from("lead_blacklist").select("domain");
    const blocked = new Set((blacklist ?? []).map((r: { domain: string }) => r.domain.toLowerCase()));

    const candidates = new Map<string, { url: string; country: string }>();
    let searched = 0;
    for (const { q, country } of queries) {
      try {
        const iso = COUNTRY_ISO[country];
        const results = await fcSearch(q, iso);
        searched++;
        for (const r of results) {
          const domain = extractDomain(r.url);
          if (!domain || isAggregator(domain) || blocked.has(domain)) continue;
          if (candidates.has(domain)) continue;
          candidates.set(domain, { url: r.url!, country });
        }
      } catch (e) { console.error("search err", q, e); }
    }

    let inserted = 0, updated = 0, excluded = 0, skipped = 0;
    const breakdown: Record<string, number> = {};

    for (const [domain, info] of candidates) {
      try {
        const extracted = await fcScrapeJson(info.url);
        if (!extracted || extracted.is_recruiter !== true) { skipped++; continue; }

        const agencyName = String(extracted.agency_name ?? domain.split(".")[0]).trim();
        if (!agencyName) { skipped++; continue; }

        const model = String(extracted.recruitment_model ?? "unknown");
        const upfront = extracted.charges_upfront_candidate_fee === true;
        const postedRaw = extracted.posted_at ? Date.parse(String(extracted.posted_at)) : NaN;
        const isStale = !isNaN(postedRaw) && postedRaw < recencyCutoff;

        let excludedReason: string | null = null;
        if (upfront) excludedReason = "upfront_fee";
        else if (model === "sub_agent") excludedReason = "sub_agent";
        else if (model === "training_institute") excludedReason = "training_institute";
        else if (!ALLOWED_MODELS.has(model)) excludedReason = "unknown_model";
        else if (isStale) excludedReason = "stale";

        // Persist raw signal for provenance.
        const { data: rs } = await supa.from("raw_signals").insert({
          source: "google_jobs",
          source_url: info.url,
          source_id: `recruiter:${domain}`,
          payload: { kind: "recruiter_directory", domain, extracted },
          fingerprint: `recruiter:${domain}`,
        }).select("id").maybeSingle();

        const status = excludedReason ? "excluded" : "active";
        const recruitment_model = ALLOWED_MODELS.has(model)
          ? [model]
          : (model === "unknown" ? [] : []);

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
          if (error) { console.error("insert err", error); skipped++; continue; }
          inserted++;
        }
        if (excludedReason) excluded++;
        breakdown[row.hq_country ?? "unknown"] = (breakdown[row.hq_country ?? "unknown"] ?? 0) + 1;
      } catch (e) {
        console.error("process err", domain, e);
        skipped++;
      }
    }

    return jsonResponse({
      ok: true, searched, discovered: candidates.size,
      inserted, updated, excluded, skipped, breakdown,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});