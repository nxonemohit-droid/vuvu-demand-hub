// Enrich a URL: Firecrawl scrape → Lovable AI structured extraction → Hunter fallback for email.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, sha256Hex, extractDomain } from "../_shared/supabase.ts";
import { detectRegion } from "../_shared/hm-regions.ts";

const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const HUNTER_KEY = Deno.env.get("HUNTER_API_KEY");
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

async function firecrawlScrape(url: string): Promise<{ markdown?: string; metadata?: any } | null> {
  if (!FIRECRAWL_KEY) return null;
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { markdown: j?.data?.markdown || j?.markdown, metadata: j?.data?.metadata || j?.metadata };
  } catch { return null; }
}

async function aiExtract(markdown: string, bucket: string): Promise<any | null> {
  if (!LOVABLE_KEY) return null;
  const prompt = `Extract structured data from this ${bucket === "institute" ? "hotel management institute" : "career consultancy"} website content.
Return JSON with EXACTLY these keys:
{
  "name": "official name",
  "contact_name": "principal/director/owner/HR manager/placement head/CEO/counsellor full name or null",
  "contact_role": "their role or null",
  "email": "primary contact email or null",
  "phone": "primary phone or null",
  "linkedin": "linkedin url or null",
  "city": "city or null",
  "students_meta": { "batch_size": number or null, "courses": [], "pass_out_years": [] }
}
Only JSON, no prose. Content:
${markdown.slice(0, 6000)}`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text);
  } catch { return null; }
}

async function hunterFind(domain: string): Promise<{ email?: string; name?: string; role?: string } | null> {
  if (!HUNTER_KEY || !domain) return null;
  try {
    const r = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_KEY}&limit=5`);
    if (!r.ok) return null;
    const j = await r.json();
    const emails = j?.data?.emails || [];
    // prefer director/principal/owner/hr/placement/ceo
    const pref = ["director","principal","owner","hr","placement","ceo","admin","info","contact"];
    let best = emails[0];
    for (const p of pref) {
      const hit = emails.find((e: any) => (e.position || "").toLowerCase().includes(p) || (e.first_name || "").toLowerCase().includes(p));
      if (hit) { best = hit; break; }
    }
    if (!best) return null;
    return {
      email: best.value,
      name: [best.first_name, best.last_name].filter(Boolean).join(" ") || undefined,
      role: best.position || undefined,
    };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const url: string = body.url;
    const bucket: "institute" | "consultancy" = body.bucket === "consultancy" ? "consultancy" : "institute";
    const jobId: string | null = body.job_id || null;
    if (!url) return jsonResponse({ error: "url required" }, 400);

    const supa = adminClient();

    // Skip if URL already ingested
    const { data: dupe } = await supa.from("hm_leads").select("id").eq("source_url", url).maybeSingle();
    if (dupe) return jsonResponse({ ok: true, skipped: "duplicate" });

    const scraped = await firecrawlScrape(url);
    if (!scraped?.markdown) return jsonResponse({ ok: false, reason: "scrape_failed" });

    const meta = scraped.metadata || {};
    const extracted = await aiExtract(scraped.markdown, bucket) || {};
    const domain = extractDomain(url);

    let email = extracted.email || null;
    let contactName = extracted.contact_name || null;
    let contactRole = extracted.contact_role || null;

    if (!email && domain) {
      const hunter = await hunterFind(domain);
      if (hunter) {
        email = hunter.email || null;
        contactName = contactName || hunter.name || null;
        contactRole = contactRole || hunter.role || null;
      }
    }

    const region = detectRegion([extracted.name, extracted.city, meta.title, meta.description, scraped.markdown.slice(0,2000)].filter(Boolean).join(" "));

    const name = extracted.name || meta.title || domain || "Unknown";
    const dedupHash = await sha256Hex(`${(name || "").toLowerCase()}|${domain || url}`);

    const { error: insErr } = await supa.from("hm_leads").insert({
      type: bucket,
      name,
      website: domain ? `https://${domain}` : url,
      country: region?.country || "India",
      region: region?.region || null,
      state: region?.region || null,
      city: extracted.city || region?.city || null,
      contact_name: contactName,
      contact_role: contactRole,
      email,
      phone: extracted.phone || null,
      linkedin: extracted.linkedin || null,
      students_meta: extracted.students_meta || {},
      source: "firecrawl",
      source_url: url,
      dedup_hash: dedupHash,
      status: email ? "enriched" : "new",
      score: (email ? 40 : 0) + (contactName ? 20 : 0) + (extracted.phone ? 15 : 0) + (region ? 15 : 0) + (extracted.linkedin ? 10 : 0),
    });

    if (jobId && !insErr) {
      await supa.rpc("increment_source_spend", { _source_id: "hm-enrich", _amount: 0 }).catch(() => null);
      const { data: cur } = await supa.from("hm_scrape_jobs").select("leads_created").eq("id", jobId).maybeSingle();
      await supa.from("hm_scrape_jobs").update({ leads_created: (cur?.leads_created || 0) + 1 }).eq("id", jobId);
    }

    if (insErr) return jsonResponse({ ok: false, error: insErr.message });
    return jsonResponse({ ok: true, name, email, region: region?.region });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});