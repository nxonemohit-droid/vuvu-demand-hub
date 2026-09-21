import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sha256Hex, extractDomain } from "../_shared/supabase.ts";
import { buildQueries, buildMapsQueries, isUsefulUrl, marketFor, scoreLead } from "../_shared/markets.ts";

const CSE_KEY = Deno.env.get("GOOGLE_CSE_API_KEY");
const CSE_ID = Deno.env.get("GOOGLE_CSE_ID");
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
// The working user-owned Maps connection is the second linked connection.
const MAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY_1") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

type Hit = {
  url: string;
  title: string;
  snippet: string;
  company?: string;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  openingHours?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  placeId?: string | null;
  contactName?: string | null;
};

/** Google Maps Places (New) text search — reliable employer discovery with phone numbers. */
async function mapsSearch(q: string): Promise<Hit[]> {
  if (!LOVABLE_KEY || !MAPS_KEY) return [];
  try {
    const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "X-Connection-Api-Key": MAPS_KEY,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.formattedAddress,places.shortFormattedAddress,places.regularOpeningHours.weekdayDescriptions,places.rating,places.userRatingCount,places.primaryTypeDisplayName",
      },
      body: JSON.stringify({ textQuery: q, pageSize: 20 }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.error(`Maps search ${res.status}: ${body}`);
      noteError("Google Maps", res.status, body);
      return [];
    }
    const data = await res.json();
    const hits: Hit[] = [];
    for (const p of data.places ?? []) {
      const website = p.websiteUri as string | undefined;
      if (!website) continue;
      hits.push({
        url: website,
        title: p.displayName?.text ?? "",
        snippet: p.formattedAddress ?? "",
        company: p.displayName?.text ?? undefined,
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
        city: (p.shortFormattedAddress ?? "").split(",")[0]?.trim() || null,
        address: p.formattedAddress ?? null,
        openingHours: (p.regularOpeningHours?.weekdayDescriptions ?? []).join("\n") || null,
        rating: typeof p.rating === "number" ? p.rating : null,
        ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        placeId: p.id ?? null,
      });
    }
    return hits;
  } catch (e) {
    console.error("Maps search error", e);
    return [];
  }
}

const providerErrors = new Set<string>();

function noteError(provider: string, status: number, body: string) {
  if (status === 402 || /insufficient credits/i.test(body)) {
    providerErrors.add(`${provider}: credits khatam ho gaye hain.`);
  } else if (status === 403) {
    providerErrors.add(`${provider}: access allowed nahi hai (${status}).`);
  } else {
    providerErrors.add(`${provider}: request fail (${status}).`);
  }
}

async function googleSearch(q: string): Promise<Hit[]> {
  if (!CSE_KEY || !CSE_ID) return [];
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", CSE_KEY);
  u.searchParams.set("cx", CSE_ID);
  u.searchParams.set("q", q);
  u.searchParams.set("num", "10");
  try {
    const res = await fetch(u.toString());
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.error(`CSE ${res.status}: ${body}`);
      noteError("Google Search", res.status, body);
      return [];
    }
    const data = await res.json();
    return (data.items ?? []).map((i: Record<string, string>) => ({
      url: i.link,
      title: i.title ?? "",
      snippet: i.snippet ?? "",
    }));
  } catch (e) {
    console.error("CSE error", e);
    return [];
  }
}

async function firecrawlSearch(q: string): Promise<Hit[]> {
  if (!FIRECRAWL_KEY || !LOVABLE_KEY) return [];
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "X-Connection-Api-Key": FIRECRAWL_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: q, limit: 8 }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.error(`Firecrawl search ${res.status}: ${body}`);
      noteError("Firecrawl", res.status, body);
      return [];
    }
    const data = await res.json();
    const items = data.data ?? data.web ?? [];
    return items.map((i: Record<string, string>) => ({
      url: i.url,
      title: i.title ?? "",
      snippet: i.description ?? "",
    }));
  } catch (e) {
    console.error("Firecrawl search error", e);
    return [];
  }
}

function stripTags(v: string): string {
  return v.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/** Free, keyless web search fallbacks so lead discovery works without paid providers. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function ddgSearch(q: string): Promise<Hit[]> {
  const attempts: Array<() => Promise<Response>> = [
    () =>
      fetch("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept-Language": "en-US,en;q=0.9",
        },
        body: new URLSearchParams({ q }).toString(),
      }),
    () =>
      fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      }),
  ];

  attempts.push(() => {
    const target = encodeURIComponent(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    return fetch(`https://r.jina.ai/${target}`, {
      headers: { "User-Agent": UA, Accept: "text/plain" },
    });
  });

  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) {
        console.error(`DuckDuckGo ${res.status}`);
        continue;
      }
      const html = await res.text();
      const hits = html.includes("Markdown Content:") ? parseMarkdown(html) : parseDuckDuckGo(html);
      console.log(`DuckDuckGo html=${html.length} hits=${hits.length}`);
      if (hits.length) return hits;
    } catch (e) {
      console.error("DuckDuckGo error", e);
    }
  }
  return [];
}

function parseMarkdown(md: string): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const re = /\[([^\]\n]{3,150})\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null && hits.length < 15) {
    const enc = /[?&]uddg=([^&)"]+)/.exec(m[2])?.[1];
    if (!enc) continue;
    const url = decodeURIComponent(enc);
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
    seen.add(url);
    hits.push({ url, title: m[1].trim().slice(0, 120), snippet: "" });
  }
  return hits;
}

function parseDuckDuckGo(html: string): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const re = /href="((?:https?:)?\/\/duckduckgo\.com\/l\/\?uddg=[^"]+|https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && hits.length < 15) {
    const enc = /[?&]uddg=([^&"]+)/.exec(m[1])?.[1];
    let url = enc ? decodeURIComponent(enc) : m[1];
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https?:\/\//.test(url)) continue;
    if (/duckduckgo\.com/.test(url) || seen.has(url)) continue;
    seen.add(url);
    hits.push({ url, title: stripTags(m[2]).slice(0, 120), snippet: "" });
  }
  return hits;
}

/** Second keyless engine: Mojeek allows plain HTML requests. */
async function mojeekSearch(q: string): Promise<Hit[]> {
  try {
    const res = await fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) {
      console.error(`Mojeek ${res.status}`);
      return [];
    }
    const html = await res.text();
    const hits: Hit[] = [];
    const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="ob"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && hits.length < 15) {
      hits.push({ url: m[1], title: stripTags(m[2]).slice(0, 120), snippet: "" });
    }
    console.log(`Mojeek html=${html.length} hits=${hits.length}`);
    return hits;
  } catch (e) {
    console.error("Mojeek error", e);
    return [];
  }
}

async function apifySearch(q: string): Promise<Hit[]> {
  if (!APIFY_TOKEN) return [];
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: q,
          maxPagesPerQuery: 1,
          resultsPerPage: 10,
          saveHtml: false,
          mobileResults: false,
        }),
      },
    );
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.error(`Apify search ${res.status}: ${body}`);
      noteError("Apify", res.status, body);
      return [];
    }
    const pages = await res.json();
    const hits: Hit[] = [];
    for (const page of Array.isArray(pages) ? pages : []) {
      for (const r of page.organicResults ?? []) {
        if (r?.url) hits.push({ url: r.url, title: r.title ?? "", snippet: r.description ?? "" });
      }
    }
    return hits;
  } catch (e) {
    console.error("Apify search error", e);
    return [];
  }
}

function companyFromHit(hit: Hit): string {
  const t = (hit.title || "").split(/[|\-–—:]/)[0].trim();
  if (t.length > 2 && t.length < 90) return t;
  return extractDomain(hit.url) ?? "Unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const kind: LeadKind = body.kind === "education"
      ? "education"
      : body.kind === "supply"
      ? "supply"
      : "employer";
    const countries: string[] = Array.isArray(body.countries) ? body.countries : [];
    const sectors: string[] = Array.isArray(body.sectors) ? body.sectors : [];
    const keywords: string[] = Array.isArray(body.keywords) ? body.keywords : [];
    const maxQueries: number = Math.min(Number(body.maxQueries) || 12, 30);

    if (!countries.length) {
      return new Response(JSON.stringify({ error: "Pick at least one country" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = adminClient();
    const { data: job, error: jobErr } = await supa
      .from("find_jobs")
      .insert({ kind, countries, sectors, keywords, status: "running" })
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    const mapsQueries = buildMapsQueries(kind, countries, sectors);
    const webQueries = buildQueries(kind, countries, sectors, keywords).slice(0, maxQueries);
    const queries = [
      ...mapsQueries.map((q) => ({ q, maps: true })),
      ...webQueries.map((q) => ({ q, maps: false })),
    ];

    const work = async () => {
      providerErrors.clear();
      const seen = new Set<string>();
      let created = 0;
      let found = 0;

      for (const { q, maps } of queries) {
        let hits: Hit[] = [];
        if (maps) {
          hits = await mapsSearch(q);
        } else {
          hits = [...(await googleSearch(q)), ...(await firecrawlSearch(q))];
          if (!hits.length) hits = await apifySearch(q);
          if (!hits.length) hits = await ddgSearch(q);
          if (!hits.length) hits = await mojeekSearch(q);
        }
        await new Promise((r) => setTimeout(r, maps ? 400 : 1200));
        for (const hit of hits) {
          if (!hit?.url || seen.has(hit.url) || !isUsefulUrl(hit.url)) continue;
          seen.add(hit.url);
          found++;

          const domain = extractDomain(hit.url);
          const country = countries.find((c) => q.includes(c)) ?? countries[0];
          const sector = sectors.find((s) => q.includes(s)) ?? null;
          const hash = await sha256Hex(`${domain}|${country}|${kind}`);

          const lead = {
            kind,
            company: hit.company ?? companyFromHit(hit),
            website: domain ? `https://${domain}` : null,
            country,
            city: hit.city ?? null,
            phone: hit.phone ?? null,
            whatsapp: hit.phone ?? null,
            sector,
            address: hit.address ?? null,
            opening_hours: hit.openingHours ?? null,
            rating: hit.rating ?? null,
            rating_count: hit.ratingCount ?? null,
            place_id: hit.placeId ?? null,
            hiring_signal: hit.snippet?.slice(0, 400) ?? null,
            visa_speed: marketFor(country)?.speed ?? null,
            source: maps ? "google_maps" : "gcse",
            source_url: hit.url,
            dedup_hash: hash,
          };

          const { error } = await supa
            .from("leads")
            .insert({ ...lead, visa_fit_score: scoreLead(lead) });
          if (!error) created++;
        }

        await supa
          .from("find_jobs")
          .update({ urls_found: found, leads_created: created })
          .eq("id", job.id);
      }

      await supa
        .from("find_jobs")
        .update({
          status: "done",
          urls_found: found,
          leads_created: created,
          error: found === 0 && providerErrors.size
            ? Array.from(providerErrors).join(" ")
            : null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    };

    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(work());

    return new Response(JSON.stringify({ job_id: job.id, queries: queries.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("find-leads failed", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
