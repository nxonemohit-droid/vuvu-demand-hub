// adapter-apify — single-purpose worker that executes ONE scrape_job against
// the Apify platform. Called by ingest-dispatch (drain mode). Keeps source-
// specific input shaping in one place so dispatch stays generic.
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
  COUNTRY_META,
  INDEED_ALLOWED,
  ROLE_SYNONYMS,
  legacySourceForRegistryId,
} from "../_shared/constants.ts";

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");

function buildApifyInput(source: SourceRow, job: ScrapeJobRow): Record<string, unknown> | null {
  const country = job.country ?? "";
  const keyword = job.keyword ?? "";
  const meta = COUNTRY_META[country];
  const synonyms = ROLE_SYNONYMS[keyword] ?? [keyword];
  const baseInput = { ...(source.default_input ?? {}), ...(job.input ?? {}) };

  switch (source.id) {
    case "linkedin_official":
    case "linkedin_bebity": {
      return {
        ...baseInput,
        location: country,
        keyword: synonyms.slice(0, 2).join(" OR "),
      };
    }
    case "indeed": {
      if (!meta || !INDEED_ALLOWED.has(meta.iso2)) return null;
      const syns = synonyms.slice(0, 3);
      const position = `(${syns.join(" OR ")}) (hiring OR urgent OR "visa sponsorship")`;
      return { ...baseInput, country: meta.iso2, position };
    }
    case "google_jobs": {
      const queries = synonyms.slice(0, 3).map((s) => `${s} ${country} hiring`);
      return {
        ...baseInput,
        queries: queries.join("\n"),
        countryCode: meta?.iso2.toLowerCase() ?? "us",
        languageCode: meta?.langs[0] ?? "en",
      };
    }
    case "facebook_public": {
      const urls = synonyms.slice(0, 3).flatMap((s) => [
        { url: `https://www.facebook.com/search/posts/?q=${encodeURIComponent(`${s} ${country} hiring`)}` },
      ]);
      return { ...baseInput, startUrls: urls };
    }
    default:
      return baseInput;
  }
}

async function runApifyActor(actorId: string, input: unknown, timeoutMs: number) {
  const url =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&timeout=${Math.floor(timeoutMs / 1000)}`;
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
      throw new Error(`APIFY ${r.status}: ${t.slice(0, 400)}`);
    }
    const items = await r.json();
    const apifyRunId = r.headers.get("x-apify-actor-run-id") ?? null;
    return { items: items as unknown[], apifyRunId };
  } finally {
    clearTimeout(t);
  }
}

function pickItemUrl(it: any): string | null {
  return it?.url ?? it?.link ?? it?.jobUrl ?? it?.applyUrl ?? it?.companyUrl ?? null;
}

function pickCompanyDomain(it: any): string | null {
  const candidates = [it?.companyUrl, it?.companyWebsite, it?.company?.website, it?.applyUrl];
  for (const c of candidates) {
    const d = extractDomain(c);
    if (d && !["linkedin.com", "indeed.com", "google.com", "facebook.com"].includes(d)) return d;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");
    const supa = adminClient();
    const body = await req.json().catch(() => ({}));
    const scrapeJobId: string | undefined = body.scrape_job_id;
    if (!scrapeJobId) return jsonResponse({ ok: false, error: "scrape_job_id required" }, 400);

    const { data: job, error: jobErr } = await supa
      .from("scrape_jobs")
      .select("id, source, source_id, actor_id, country, keyword, input")
      .eq("id", scrapeJobId)
      .single<ScrapeJobRow>();
    if (jobErr || !job) throw jobErr ?? new Error("scrape_job not found");

    if (!job.source_id) throw new Error(`scrape_job ${job.id} missing source_id`);
    const { data: source, error: srcErr } = await supa
      .from("source_registry")
      .select("id, source_family, adapter, actor_or_endpoint, default_input, trust_tier, confidence_weight, enabled")
      .eq("id", job.source_id)
      .single<SourceRow>();
    if (srcErr || !source) throw srcErr ?? new Error(`source_registry ${job.source_id} not found`);
    if (source.adapter !== "apify") throw new Error(`source ${source.id} is not an apify adapter`);

    const actorId = job.actor_id || source.actor_or_endpoint;
    if (!actorId) throw new Error(`no actor_id for source ${source.id}`);

    await supa.from("scrape_jobs").update({ status: "running" }).eq("id", job.id);
    await logRunEvent(supa, job.id, "actor.start", `Starting ${actorId}`, { source: source.id });

    const input = buildApifyInput(source, job);
    if (!input) {
      await supa.from("scrape_jobs").update({
        status: "failed", error: "skipped: country not supported by source", finished_at: new Date().toISOString(),
      }).eq("id", job.id);
      await logRunEvent(supa, job.id, "actor.skip", "country not supported", {}, "warn");
      return jsonResponse({ ok: true, skipped: true });
    }

    const timeoutMs =
      source.id === "indeed" ? 90_000 :
      source.id === "google_jobs" ? 90_000 :
      source.id.startsWith("linkedin") ? 75_000 : 120_000;

    const { items, apifyRunId } = await runApifyActor(actorId, input, timeoutMs);
    await logRunEvent(supa, job.id, "actor.done", `Got ${items.length} items`, { apifyRunId });

    const legacy = legacySourceForRegistryId(source.id);
    let inserted = 0;
    for (const it of items.slice(0, 80)) {
      const url = pickItemUrl(it);
      const text = JSON.stringify(it).slice(0, 8000);
      const fpInput = `${source.id}|${job.country}|${job.keyword}|${url ?? text.slice(0, 200)}`;
      const fp = await sha256Hex(fpInput);
      const domain = pickCompanyDomain(it);
      const { error: insErr } = await supa.from("raw_signals").insert({
        job_id: job.id,
        source: legacy,
        source_id: source.id,
        source_url: url,
        raw_text: text,
        payload: it,
        fingerprint: fp,
        company_domain: domain,
      });
      if (!insErr) inserted++;
    }

    await supa.from("scrape_jobs").update({
      status: "succeeded",
      apify_run_id: apifyRunId,
      items_found: items.length,
      items_structured: inserted,
      finished_at: new Date().toISOString(),
    }).eq("id", job.id);
    await logRunEvent(supa, job.id, "signals.persisted", `Inserted ${inserted}`, { items: items.length });

    return jsonResponse({ ok: true, items: items.length, inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const supa = adminClient();
      const body = await req.clone().json().catch(() => ({}));
      if (body?.scrape_job_id) {
        await supa.from("scrape_jobs").update({
          status: "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString(),
        }).eq("id", body.scrape_job_id);
        await logRunEvent(supa, body.scrape_job_id, "actor.error", msg, {}, "error");
      }
    } catch (_) { /* swallow */ }
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});