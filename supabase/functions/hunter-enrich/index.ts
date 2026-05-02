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

// Default Hunter actor on Apify. Override via request body { actor_id }.
const DEFAULT_HUNTER_ACTOR = "vdrmota~hunter-io-email-finder";

function extractDomain(url?: string | null, employer?: string | null): string | null {
  if (url) {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      const host = u.hostname.replace(/^www\./, "");
      // skip social/job aggregator domains — they aren't the employer's site
      const skip = ["facebook.com","linkedin.com","indeed.com","google.com","olx.","gumtree.","kijiji."];
      if (!skip.some((s) => host.includes(s))) return host;
    } catch { /* fallthrough */ }
  }
  if (employer) {
    const slug = employer.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (slug.length >= 3) return `${slug}.com`;
  }
  return null;
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
  // Hunter actor returns array with { emails: [{ value, first_name, last_name, position, type, confidence }] }
  // Different actors flatten differently — handle both shapes.
  const emails: any[] = [];
  for (const it of items) {
    if (Array.isArray(it?.emails)) emails.push(...it.emails);
    else if (it?.value && typeof it.value === "string" && it.value.includes("@")) emails.push(it);
    else if (it?.email && typeof it.email === "string") emails.push({ value: it.email, ...it });
  }
  if (!emails.length) return {};
  // Prefer HR/recruiting/hiring contacts, then highest confidence
  const score = (e: any) => {
    const role = `${e.position ?? ""} ${e.department ?? ""} ${e.first_name ?? ""}`.toLowerCase();
    let s = e.confidence ?? 0;
    if (/(hr|recruit|talent|hiring|people)/.test(role)) s += 50;
    if (e.type === "personal") s += 10;
    return s;
  };
  emails.sort((a, b) => score(b) - score(a));
  const best = emails[0];
  const name = [best.first_name, best.last_name].filter(Boolean).join(" ").trim() || undefined;
  return { email: best.value ?? best.email, name, phone: best.phone ?? best.phone_number };
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
      .select("id, employer_name, source_url, contact_email")
      .is("contact_email", null)
      .not("employer_name", "is", null)
      .order("urgency_score", { ascending: false })
      .limit(limit);
    if (leadIds?.length) q = supabase.from("demand_leads")
      .select("id, employer_name, source_url, contact_email")
      .in("id", leadIds);

    const { data: leads, error } = await q;
    if (error) throw error;

    const results: any[] = [];
    for (const lead of leads ?? []) {
      const domain = extractDomain(lead.source_url, lead.employer_name);
      if (!domain) { results.push({ id: lead.id, skipped: "no_domain" }); continue; }

      const { data: jobRow } = await supabase.from("scrape_jobs").insert({
        source: "other", actor_id: actorId, country: null, keyword: `hunter:${domain}`, status: "running",
      }).select().single();

      try {
        const items = await runActor(actorId, { domain, maxResults: 10 });
        const best = pickBestEmail(Array.isArray(items) ? items : []);
        if (best.email) {
          await supabase.from("demand_leads").update({
            contact_email: best.email,
            contact_name: best.name ?? undefined,
            contact_phone: best.phone ?? undefined,
          }).eq("id", lead.id);
        }
        if (jobRow) await supabase.from("scrape_jobs").update({
          status: "succeeded",
          items_found: Array.isArray(items) ? items.length : 0,
          items_structured: best.email ? 1 : 0,
          finished_at: new Date().toISOString(),
        }).eq("id", jobRow.id);
        results.push({ id: lead.id, domain, email: best.email ?? null });
      } catch (e) {
        if (jobRow) await supabase.from("scrape_jobs").update({
          status: "failed", error: String(e).slice(0, 500), finished_at: new Date().toISOString(),
        }).eq("id", jobRow.id);
        results.push({ id: lead.id, domain, error: String(e).slice(0, 200) });
      }
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