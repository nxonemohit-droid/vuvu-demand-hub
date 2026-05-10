## Goal
Run a multi-country APIFY-powered discovery sweep across **Serbia, Turkey, Poland, Austria, Bosnia and Herzegovina, North Macedonia, Montenegro, Moldova, Belarus** with boolean-rich Google queries that prioritize pages exposing recruiter contact emails.

## Gaps in current code
1. `COUNTRY_ISO` is missing **Turkey (`tr`), Moldova (`md`), Belarus (`by`)** — `apifyGoogleSearch()` would default these to `"us"`, killing geo-targeted SERPs.
2. `HQ_COUNTRIES` doesn't include Turkey/Moldova/Belarus, so they'd be silently dropped if the caller relied on defaults.
3. APIFY tier-batching currently sends **all queries with the iso of the first country** (`apifyGoogleSearch(queries.map(...), iso=queries[0].country, ...)`), so e.g. Polish queries get searched on Serbian Google. Needs **per-country grouping**.
4. No boolean tier today specifically targets **`"@" intext:"@gmail.com" OR intext:"@" inurl:contact`** (email-bearing pages), so we waste scrapes on pages with no email at all.
5. Single-country trade-sweep optimization doesn't trigger for multi-country runs — these 9 countries will get ~1 trade each per tier (too sparse).

## Plan

### 1. Fill the country gap (`recruiter-discover/index.ts`)
- Extend `COUNTRY_ISO` with `Turkey: "tr"`, `Moldova: "md"`, `Belarus: "by"`.
- Extend `HQ_COUNTRIES` with the same three so default runs include them.

### 2. Add a dedicated **email-intent boolean tier** (Tier 6)
Append a new tier focused on pages that almost always contain an email:

```
("recruitment agency" OR "manpower" OR "labour supply" OR "HR consultant")
("Nepal" OR "India" OR "Bangladesh") "{country}"
(intext:"@gmail.com" OR intext:"@yahoo.com" OR intext:"info@" OR intext:"contact@" OR intext:"hr@" OR inurl:contact OR inurl:kontakt)
-site:linkedin.com -site:indeed.com -site:facebook.com
```

Plus a country-localized variant per language hint:
- Serbia / Bosnia / Montenegro / North Macedonia: add `OR "agencija za zapošljavanje" OR "posredovanje pri zapošljavanju"`
- Poland: `OR "agencja pracy tymczasowej" OR "agencja zatrudnienia"`
- Austria: `OR "Personalvermittlung" OR "Arbeitskräfteüberlasser"`
- Turkey: `OR "iş ve işçi bulma" OR "yurtdışı istihdam"`
- Moldova: `OR "agenție de recrutare" OR "plasare în câmpul muncii"`
- Belarus: `OR "агентство по трудоустройству"`

These are appended via a `LOCALIZED_RECRUITER_TERMS: Record<string,string>` map.

### 3. Fix APIFY per-country batching (`runPipeline` tier loop)
Replace the single bulk `apifyGoogleSearch(queries.map(q→q.q), iso=queries[0].country)` call with one APIFY run **per country group** within each tier:

```text
for each tier:
  group queries by country
  for each (country, qs) in groups:
    apifyGoogleSearch(qs, COUNTRY_ISO[country], 20)
```

Each call still bundles many queries (cheap), but localized geo. Cap parallel actor runs at 3 to respect APIFY concurrency.

### 4. Multi-country trade sweep tweak
Treat "9 countries, mid-range" like single-country in `buildQueries`: when `countries.length <= 10`, use **all trades** instead of sampling 1–2. Still bounded by `maxQueries`.

### 5. Email-pre-filter on SERP snippets (cheap, no extra scrape)
In the APIFY result loop, when the snippet/title already contains an `@…\.[a-z]{2,}` match, capture it in `candidates` value as `prefilledEmail`. Then in `processOne`, if the scrape returns no email, fall back to that snippet email (validated through `normalizeEmail`) before doing the `/contact` page fallback. This converts wasted scrapes into successful leads.

### 6. Kick-off invocation
After deploy, invoke:
```json
{
  "countries": ["Serbia","Turkey","Poland","Austria","Bosnia and Herzegovina",
                "North Macedonia","Montenegro","Moldova","Belarus"],
  "searchProvider": "apify",
  "recencyDays": 365,
  "maxQueries": 90,
  "maxScrapes": 60,
  "scrapeConcurrency": 6
}
```
Poll `discovery_jobs.result` until `completed`, then report per-country lead + email counts.

## Files to change
- `supabase/functions/recruiter-discover/index.ts` — only file. No DB migration. No frontend change.

## Out of scope
- Hunter.io enrichment loop (already in place for demand_leads only — recruiters stay scrape-only).
- New tables / RLS changes.
- UI changes to Recruiters page.

## Risk / cost
- ~9 countries × 7 tiers, 1 APIFY run per (tier, country group) ≈ 60 actor calls (each batches multiple queries). APIFY cost: roughly $0.30–0.60 for the full sweep.
- Firecrawl scrapes capped at 60 + up to 60 contact-page fallbacks ≈ 120 credit units.
