// Hunter.io email enrichment via APIFY.
// For demand_leads missing contact_email but having an employer_name (and ideally a source_url),
// derive a domain and call the Hunter Domain Search actor on Apify to fetch likely contacts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Apify "Contact Info Scraper" — officially maintained, scrapes emails/phones from a domain.
// Override via request body { actor_id }.
const DEFAULT_HUNTER_ACTOR = "vdrmota~contact-info-scraper";

function extractDomains(url?: string | null, employer?: string | null, country?: string | null): string[] {
  const out = new Set<string>();
  if (url) {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      const host = u.hostname.replace(/^www\./, "");
      const skip = ["facebook.com","linkedin.com","indeed.com","google.com","olx.","gumtree.","kijiji.","glassdoor.","monster."];
      if (!skip.some((s) => host.includes(s))) out.add(host);
    } catch { /* ignore */ }
  }
  if (employer) {
    const slug = employer.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (slug.length >= 3) {
      const tldByCountry: Record<string,string[]> = {
        Serbia:["rs"], Romania:["ro"], Poland:["pl"], Germany:["de"], Malta:["mt","com.mt"],
        Greece:["gr"], Croatia:["hr"], Hungary:["hu"], Czechia:["cz"], Slovakia:["sk"],
      };
      const tlds = ["com", ...(country ? tldByCountry[country] ?? [] : []), "eu","net"];
      for (const t of tlds) out.add(`${slug}.${t}`);
    }
  }
  return Array.from(out).slice(0, 4);
}

async function runActor(actorId: string, input: unknown, timeoutMs = 90_000) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${Math.floor(timeoutMs / 1000)}`;
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
      const txt = await r.text();
      throw new Error(`APIFY ${r.status}: ${txt.slice(0, 300)}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function pickBestEmail(items: any[]): { email?: string; name?: string; phone?: string } {
  // Handles three shapes:
  //   1. Hunter-style: { emails: [{ value, first_name, ... }] }
  //   2. contact-info-scraper: { emails: ["a@b.com", ...], phones: [...] }
  //   3. Flat: { email: "...", phone: "..." }
  const emails: any[] = [];
  const phones: string[] = [];
  for (const it of items) {
    if (Array.isArray(it?.emails)) {
      for (const e of it.emails) {
        if (typeof e === "string") emails.push({ value: e });
        else if (e?.value || e?.email) emails.push(e);
      }
    }
    if (Array.isArray(it?.phones)) phones.push(...it.phones.filter((p: any) => typeof p === "string"));
    if (it?.value && typeof it.value === "string" && it.value.includes("@")) emails.push(it);
    if (it?.email && typeof it.email === "string") emails.push({ value: it.email, ...it });
    if (it?.phone && typeof it.phone === "string") phones.push(it.phone);
  }
  if (!emails.length) return {};
  // Prefer HR/recruiting/hiring contacts, then highest confidence
  const score = (e: any) => {
    const role = `${e.position ?? ""} ${e.department ?? ""} ${e.first_name ?? ""}`.toLowerCase();
    const addr = String(e.value ?? e.email ?? "").toLowerCase();
    let s = e.confidence ?? 0;
    if (/(hr|recruit|talent|hiring|people)/.test(role)) s += 50;
    if (/(hr|recruit|jobs|careers|hiring|talent|people|kariera|praca)/.test(addr)) s += 30;
    if (/(info|contact|hello)@/.test(addr)) s += 5;
    if (/(noreply|no-reply|donotreply|privacy|legal|abuse)/.test(addr)) s -= 50;
    if (e.type === "personal") s += 10;
    return s;
  };
  emails.sort((a, b) => score(b) - score(a));
  const best = emails[0];
  const name = [best.first_name, best.last_name].filter(Boolean).join(" ").trim() || undefined;
  return { email: best.value ?? best.email, name, phone: best.phone ?? best.phone_number ?? phones[0] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const limit: number = Math.min(Number(body.limit ?? 10), 25);
    const actorId: string = body.actor_id ?? DEFAULT_HUNTER_ACTOR;
    const leadIds: string[] | undefined = body.lead_ids;

    let q = supabase
      .from("demand_leads")
      .select("id, employer_name, source_url, contact_email, country")
      .is("contact_email", null)
      .not("employer_name", "is", null)
      .order("urgency_score", { ascending: false })
      .limit(limit);
    if (leadIds?.length) q = supabase.from("demand_leads")
      .select("id, employer_name, source_url, contact_email, country")
      .in("id", leadIds);

    const { data: leads, error } = await q;
    if (error) throw error;

    const results: any[] = [];
    for (const lead of leads ?? []) {
      const domains = extractDomains(lead.source_url, lead.employer_name, (lead as any).country);
      if (!domains.length) { results.push({ id: lead.id, skipped: "no_domain" }); continue; }

      let best: { email?: string; name?: string; phone?: string } = {};
      let triedDomain = "";
      let totalItems = 0;
      let lastError = "";
      for (const domain of domains) {
        triedDomain = domain;
        try {
          // contact-info-scraper expects startUrls; build a homepage + /contact crawl
          const items = await runActor(actorId, {
            startUrls: [
              { url: `https://${domain}` },
              { url: `https://${domain}/contact` },
              { url: `https://${domain}/careers` },
            ],
            maxDepth: 2,
            maxRequestsPerStartUrl: 8,
          });
          const arr = Array.isArray(items) ? items : [];
          totalItems += arr.length;
          const candidate = pickBestEmail(arr);
          if (candidate.email) { best = candidate; break; }
        } catch (e) {
          lastError = String(e).slice(0, 200);
        }
      }

      const { data: jobRow } = await supabase.from("scrape_jobs").insert({
        source: "other", actor_id: actorId, country: (lead as any).country ?? null,
        keyword: `hunter:${triedDomain}`,
        status: best.email ? "succeeded" : (lastError ? "failed" : "succeeded"),
        items_found: totalItems,
        items_structured: best.email ? 1 : 0,
        error: best.email ? null : lastError || null,
        finished_at: new Date().toISOString(),
      }).select().single();

      if (best.email) {
        await supabase.from("demand_leads").update({
          contact_email: best.email,
          contact_name: best.name ?? undefined,
          contact_phone: best.phone ?? undefined,
        }).eq("id", lead.id);
      }
      results.push({ id: lead.id, domains, email: best.email ?? null, error: best.email ? null : lastError || null, job_id: jobRow?.id });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});