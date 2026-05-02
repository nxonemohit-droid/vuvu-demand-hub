// adapter-firecrawl — executes ONE Firecrawl-driven scrape_job.
//
// Behaviour by source family / job intent:
//   - career_page_generic  (sync scrape of a known careers URL)
//   - company_site_firecrawl (map → enqueue careers URL, then async crawl via webhook)
//   - directory_generic    (scrape directory pages → seed companies)
//   - intent="recrawl"     (per-company recrawl driven by ingest-dispatch)
//
// All async crawls register a webhook → firecrawl-webhook function persists pages.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  adminClient,
  extractDomain,
  logRunEvent,
  sha256Hex,
  type ScrapeJobRow,
  type SourceRow,
} from "../_shared/supabase.ts";
import {
  CAREER_PATH_HINTS,
  FIRECRAWL_JOB_SCHEMA,
  legacySourceForRegistryId,
  looksLikeCareerUrl,
} from "../_shared/constants.ts";

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

const DEEP_CRAWL_LIMIT = 400;
const DEEP_CRAWL_DEPTH = 4;

type FcResp = { success?: boolean; data?: any; id?: string; error?: string; [k: string]: any };

async function fc(path: string, body: unknown, method: "POST" | "GET" = "POST"): Promise<FcResp> {
  const r = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: FcResp = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text.slice(0, 400) }; }
  if (!r.ok) throw new Error(`Firecrawl ${path} ${r.status}: ${json.error ?? text.slice(0, 300)}`);
  return json;
}

async function persistScrapedPage(
  supa: ReturnType<typeof adminClient>,
  job: ScrapeJobRow,
  source: SourceRow,
  page: any,
): Promise<boolean> {
  const url: string | null = page?.metadata?.sourceURL ?? page?.url ?? null;
  const text = page?.markdown ?? page?.summary ?? JSON.stringify(page).slice(0, 8000);
  const fpInput = `${source.id}|${job.country}|${url ?? text.slice(0, 200)}`;
  const fp = await sha256Hex(fpInput);
  const domain = extractDomain(url);
  const { error } = await supa.from("raw_signals").insert({
    job_id: job.id,
    source: legacySourceForRegistryId(source.id),
    source_id: source.id,
    source_url: url,
    raw_text: typeof text === "string" ? text.slice(0, 10000) : null,
    payload: page,
    fingerprint: fp,
    company_domain: domain,
  });
  return !error;
}

function pickCareerLinks(links: string[], rootDomain: string | null): string[] {
  const filtered = links.filter((l) => {
    if (!l) return false;
    const d = extractDomain(l);
    if (rootDomain && d && !d.endsWith(rootDomain)) return false;
    return looksLikeCareerUrl(l);
  });
  return Array.from(new Set(filtered)).slice(0, 25);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let scrapeJobId: string | undefined;
  try {
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
    const supa = adminClient();
    const body = await req.json().catch(() => ({}));
    scrapeJobId = body.scrape_job_id;
    if (!scrapeJobId) return jsonResponse({ ok: false, error: "scrape_job_id required" }, 400);

    const { data: job, error: jobErr } = await supa
      .from("scrape_jobs")
      .select("id, source, source_id, actor_id, country, keyword, input, parent_company_id")
      .eq("id", scrapeJobId)
      .single();
    if (jobErr || !job) throw jobErr ?? new Error("scrape_job not found");
    const sjob = job as ScrapeJobRow & { parent_company_id?: string | null };

    if (!sjob.source_id) throw new Error(`scrape_job ${sjob.id} missing source_id`);
    const { data: source, error: srcErr } = await supa
      .from("source_registry")
      .select("id, source_family, adapter, actor_or_endpoint, default_input, trust_tier, confidence_weight, enabled")
      .eq("id", sjob.source_id)
      .single<SourceRow>();
    if (srcErr || !source) throw srcErr ?? new Error(`source_registry ${sjob.source_id} not found`);
    if (source.adapter !== "firecrawl") throw new Error(`source ${source.id} is not a firecrawl adapter`);

    await supa.from("scrape_jobs").update({ status: "running" }).eq("id", sjob.id);
    await logRunEvent(supa, sjob.id, "firecrawl.start", `Starting ${source.id}`, { source: source.id });

    // Resolve target URL (from job.input.url, parent_company.careers_url/official_url, or source default).
    let targetUrl: string | null = (sjob.input as any)?.url ?? null;
    let company: any = null;
    if (sjob.parent_company_id) {
      const { data: c } = await supa.from("companies")
        .select("id, name, careers_url, official_url, website_domain, country")
        .eq("id", sjob.parent_company_id).single();
      company = c;
      targetUrl ??= c?.careers_url ?? c?.official_url ?? (c?.website_domain ? `https://${c.website_domain}` : null);
    }
    if (!targetUrl) {
      throw new Error("no target URL — set job.input.url or parent_company_id");
    }

    const intent = (sjob.input as any)?.intent ?? source.actor_or_endpoint ?? "scrape";
    let inserted = 0;
    let pageCount = 0;
    let firecrawlJobId: string | null = null;

    if (intent === "scrape") {
      // Single-page sync scrape with structured JSON extraction.
      const res = await fc("/scrape", {
        url: targetUrl,
        formats: [
          "markdown",
          { type: "json", schema: FIRECRAWL_JOB_SCHEMA },
        ],
        onlyMainContent: true,
      });
      const page = (res as any).data ?? res;
      pageCount = 1;
      if (await persistScrapedPage(supa, sjob, source, page)) inserted++;
    } else if (intent === "map" || source.source_family === "company_site") {
      // Map → pick career URLs → kick deep async crawl(s).
      const rootDomain = extractDomain(targetUrl);
      const mapRes = await fc("/map", {
        url: targetUrl,
        search: "careers jobs vacancies hiring",
        limit: 1000,
        includeSubdomains: false,
      });
      const links: string[] = (mapRes as any).links ?? (mapRes as any).data?.links ?? [];
      const careerLinks = pickCareerLinks(links, rootDomain);
      pageCount = careerLinks.length;
      await logRunEvent(supa, sjob.id, "firecrawl.map", `${links.length} urls, ${careerLinks.length} career`, { sample: careerLinks.slice(0, 5) });

      // Update company careers_url if discovered.
      if (company && !company.careers_url && careerLinks[0]) {
        await supa.from("companies").update({ careers_url: careerLinks[0] }).eq("id", company.id);
      }

      // Launch one deep async crawl rooted at the careers URL (or site root if none found).
      const crawlRoot = careerLinks[0] ?? targetUrl;
      const webhookUrl = `${SUPABASE_URL}/functions/v1/firecrawl-webhook`;
      const crawlReq = {
        url: crawlRoot,
        limit: DEEP_CRAWL_LIMIT,
        maxDiscoveryDepth: DEEP_CRAWL_DEPTH,
        includePaths: CAREER_PATH_HINTS.map((h) => `.*${h}.*`),
        scrapeOptions: {
          formats: ["markdown", { type: "json", schema: FIRECRAWL_JOB_SCHEMA }],
          onlyMainContent: true,
        },
        webhook: {
          url: webhookUrl,
          metadata: { scrape_job_id: sjob.id, source_id: source.id, company_id: company?.id ?? null },
          events: ["completed", "page", "failed"],
        },
      };
      const crawlRes = await fc("/crawl", crawlReq);
      firecrawlJobId = (crawlRes as any).id ?? (crawlRes as any).data?.id ?? null;

      await supa.from("firecrawl_jobs").insert({
        firecrawl_job_id: firecrawlJobId,
        mode: "crawl",
        target_url: crawlRoot,
        status: firecrawlJobId ? "running" : "failed",
        scrape_job_id: sjob.id,
        source_id: source.id,
        company_id: company?.id ?? null,
        request_payload: crawlReq,
      });

      // scrape_job stays "running" — webhook flips it to succeeded on completion.
      await logRunEvent(supa, sjob.id, "firecrawl.crawl.queued", `crawl ${firecrawlJobId}`, { crawlRoot });
      if (company) {
        await supa.from("companies").update({ last_crawled_at: new Date().toISOString() }).eq("id", company.id);
      }
      return jsonResponse({ ok: true, async: true, firecrawl_job_id: firecrawlJobId });
    } else {
      // directory / unknown — sync scrape with markdown only.
      const res = await fc("/scrape", {
        url: targetUrl,
        formats: ["markdown", "links"],
        onlyMainContent: true,
      });
      const page = (res as any).data ?? res;
      pageCount = 1;
      if (await persistScrapedPage(supa, sjob, source, page)) inserted++;
    }

    await supa.from("scrape_jobs").update({
      status: "succeeded",
      items_found: pageCount,
      items_structured: inserted,
      finished_at: new Date().toISOString(),
    }).eq("id", sjob.id);
    await logRunEvent(supa, sjob.id, "firecrawl.done", `inserted ${inserted}/${pageCount}`, {});

    if (company) {
      await supa.from("companies").update({ last_crawled_at: new Date().toISOString() }).eq("id", company.id);
    }

    return jsonResponse({ ok: true, pages: pageCount, inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (scrapeJobId) {
      try {
        const supa = adminClient();
        await supa.from("scrape_jobs").update({
          status: "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString(),
        }).eq("id", scrapeJobId);
        await logRunEvent(supa, scrapeJobId, "firecrawl.error", msg, {}, "error");
      } catch (_) { /* swallow */ }
    }
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});