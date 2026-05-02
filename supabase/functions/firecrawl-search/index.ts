// firecrawl-search — discovery loop. Uses Firecrawl /search to find new
// employer pages we don't yet know about, then upserts into companies so the
// recrawl loop will deep-crawl them on the next pass.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, extractDomain } from "../_shared/supabase.ts";
import { COUNTRY_META, PRIORITY_COUNTRIES, PRIORITY_KEYWORDS, ROLE_SYNONYMS } from "../_shared/constants.ts";

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

const AGGREGATOR_DOMAINS = new Set([
  "linkedin.com", "indeed.com", "glassdoor.com", "google.com", "facebook.com",
  "monster.com", "reed.co.uk", "stepstone.de", "totaljobs.com", "ziprecruiter.com",
  "jora.com", "neuvoo.com", "jooble.org", "careerjet.com", "simplyhired.com",
]);

type FcSearchResult = { url?: string; title?: string; description?: string };

async function fcSearch(query: string, country?: string): Promise<FcSearchResult[]> {
  const r = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: 20,
      tbs: "qdr:w", // last week
      country: country?.toLowerCase(),
    }),
  });
  if (!r.ok) throw new Error(`Firecrawl search ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const json = await r.json();
  return (json?.data ?? json?.results ?? json?.web ?? []) as FcSearchResult[];
}

function isAggregator(domain: string | null): boolean {
  if (!domain) return true;
  for (const a of AGGREGATOR_DOMAINS) {
    if (domain === a || domain.endsWith(`.${a}`)) return true;
  }
  return false;
}

function guessCompanyName(result: FcSearchResult, domain: string): string {
  const title = (result.title ?? "").split(/[|\-—–·]/)[0].trim();
  if (title && title.length > 2 && title.length < 80) return title;
  return domain.split(".")[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
    const supa = adminClient();
    const body = await req.json().catch(() => ({}));
    const countries: string[] = body.countries ?? PRIORITY_COUNTRIES.slice(0, 6);
    const keywords: string[] = body.keywords ?? PRIORITY_KEYWORDS.slice(0, 6);
    const maxQueries: number = Math.min(body.maxQueries ?? 12, 30);

    const queries: Array<{ q: string; country: string }> = [];
    outer: for (const kw of keywords) {
      const synonyms = (ROLE_SYNONYMS[kw] ?? [kw]).slice(0, 1);
      for (const country of countries) {
        for (const syn of synonyms) {
          queries.push({
            q: `"${syn}" jobs ${country} "visa sponsorship" OR "we are hiring" -site:linkedin.com -site:indeed.com`,
            country,
          });
          if (queries.length >= maxQueries) break outer;
        }
      }
    }

    const discovered = new Map<string, { name: string; country: string; url: string }>();
    let searched = 0;
    for (const { q, country } of queries) {
      try {
        const iso = COUNTRY_META[country]?.iso2;
        const results = await fcSearch(q, iso);
        searched++;
        for (const r of results) {
          const domain = extractDomain(r.url);
          if (!domain || isAggregator(domain)) continue;
          if (discovered.has(domain)) continue;
          discovered.set(domain, { name: guessCompanyName(r, domain), country, url: r.url! });
        }
      } catch (e) {
        console.error("search failed", q, e);
      }
    }

    let inserted = 0;
    let skipped = 0;
    for (const [domain, info] of discovered) {
      const { data: existing } = await supa.from("companies").select("id").eq("website_domain", domain).maybeSingle();
      if (existing) { skipped++; continue; }
      const { error } = await supa.from("companies").insert({
        name: info.name,
        website_domain: domain,
        official_url: `https://${domain}`,
        country: info.country,
        discovery_source: "firecrawl_search",
        crawl_priority: 2,
        metadata: { discovered_url: info.url },
      });
      if (!error) inserted++;
    }

    return jsonResponse({ ok: true, searched, discovered: discovered.size, inserted, skipped });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});