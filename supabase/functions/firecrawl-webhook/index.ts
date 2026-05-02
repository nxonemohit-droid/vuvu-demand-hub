// firecrawl-webhook — receives async crawl callbacks from Firecrawl.
// Verifies HMAC signature, persists each page into raw_signals, and finalises
// the parent scrape_job + firecrawl_job rows.
//
// Firecrawl sends events: { type: "page" | "completed" | "failed", id, data, ... }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  adminClient,
  extractDomain,
  logRunEvent,
  sha256Hex,
} from "../_shared/supabase.ts";
import { legacySourceForRegistryId } from "../_shared/constants.ts";

const WEBHOOK_SECRET = Deno.env.get("FIRECRAWL_WEBHOOK_SECRET");

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // dev mode — no secret configured
  if (!signatureHeader) return false;
  // Firecrawl sends "sha256=<hex>" in x-firecrawl-signature.
  const provided = signatureHeader.replace(/^sha256=/, "").trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time comparison
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "POST only" }, 405);

  const rawBody = await req.text();
  const sig = req.headers.get("x-firecrawl-signature");
  if (!(await verifySignature(rawBody, sig))) {
    return jsonResponse({ ok: false, error: "invalid signature" }, 401);
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return jsonResponse({ ok: false, error: "bad json" }, 400); }

  const supa = adminClient();
  const firecrawlJobId: string | null = payload?.id ?? payload?.crawlId ?? null;
  const eventType: string = payload?.type ?? payload?.event ?? "page";

  // Look up the firecrawl_jobs row to find the parent scrape_job + source + company.
  const { data: fcJob } = firecrawlJobId
    ? await supa.from("firecrawl_jobs").select("*").eq("firecrawl_job_id", firecrawlJobId).maybeSingle()
    : { data: null };

  // Fallback: webhook metadata may include scrape_job_id directly.
  const meta = payload?.metadata ?? {};
  const scrapeJobId: string | null = fcJob?.scrape_job_id ?? meta?.scrape_job_id ?? null;
  const sourceId: string | null = fcJob?.source_id ?? meta?.source_id ?? null;
  const companyId: string | null = fcJob?.company_id ?? meta?.company_id ?? null;

  if (!sourceId || !scrapeJobId) {
    // Acknowledge but log — Firecrawl will retry if we 5xx.
    console.warn("firecrawl-webhook: missing context", { firecrawlJobId, eventType });
    return jsonResponse({ ok: true, ignored: true });
  }

  const legacy = legacySourceForRegistryId(sourceId);
  let inserted = 0;

  if (eventType === "page" || eventType === "crawl.page") {
    const page = payload?.data ?? payload?.page ?? payload;
    const url: string | null = page?.metadata?.sourceURL ?? page?.url ?? null;
    const text = page?.markdown ?? page?.summary ?? JSON.stringify(page).slice(0, 8000);
    const fpInput = `${sourceId}|${url ?? text.slice(0, 200)}`;
    const fp = await sha256Hex(fpInput);
    const domain = extractDomain(url);
    const { error } = await supa.from("raw_signals").insert({
      job_id: scrapeJobId,
      source: legacy,
      source_id: sourceId,
      source_url: url,
      raw_text: typeof text === "string" ? text.slice(0, 10000) : null,
      payload: page,
      fingerprint: fp,
      company_domain: domain,
    });
    if (!error) inserted = 1;
    if (fcJob) {
      await supa.from("firecrawl_jobs").update({
        page_count: (fcJob.page_count ?? 0) + 1,
        pages_persisted: (fcJob.pages_persisted ?? 0) + inserted,
      }).eq("id", fcJob.id);
    }
    await logRunEvent(supa, scrapeJobId, "firecrawl.webhook.page", `+${inserted} from ${url ?? "?"}`, {});
  } else if (eventType === "completed" || eventType === "crawl.completed") {
    const total = payload?.total ?? payload?.completed ?? fcJob?.page_count ?? 0;
    const credits = payload?.creditsUsed ?? null;
    if (fcJob) {
      await supa.from("firecrawl_jobs").update({
        status: "completed",
        finished_at: new Date().toISOString(),
        credits_used: credits,
        webhook_payload: payload,
      }).eq("id", fcJob.id);
    }
    await supa.from("scrape_jobs").update({
      status: "succeeded",
      items_found: total,
      items_structured: fcJob?.pages_persisted ?? 0,
      finished_at: new Date().toISOString(),
    }).eq("id", scrapeJobId);
    if (companyId) {
      await supa.from("companies").update({ last_crawled_at: new Date().toISOString() }).eq("id", companyId);
    }
    await logRunEvent(supa, scrapeJobId, "firecrawl.webhook.completed", `total ${total}, credits ${credits}`, {});
  } else if (eventType === "failed" || eventType === "crawl.failed") {
    const errMsg = String(payload?.error ?? "crawl failed").slice(0, 500);
    if (fcJob) {
      await supa.from("firecrawl_jobs").update({
        status: "failed", error: errMsg, finished_at: new Date().toISOString(), webhook_payload: payload,
      }).eq("id", fcJob.id);
    }
    await supa.from("scrape_jobs").update({
      status: "failed", error: errMsg, finished_at: new Date().toISOString(),
    }).eq("id", scrapeJobId);
    await logRunEvent(supa, scrapeJobId, "firecrawl.webhook.failed", errMsg, {}, "error");
  }

  return jsonResponse({ ok: true, inserted });
});