import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

const DIAL_BY_ISO: Record<string, string> = {
  RS: "+381", HR: "+385", SI: "+386", BA: "+387", ME: "+382", MK: "+389",
  AL: "+355", BG: "+359", RO: "+40", HU: "+36", PL: "+48", CZ: "+420", SK: "+421",
  DE: "+49", AT: "+43", NL: "+31", GR: "+30", IT: "+39", ES: "+34", PT: "+351", CY: "+357",
};
const COUNTRY_TO_ISO: Record<string, string> = {
  Serbia: "RS", Croatia: "HR", Slovenia: "SI", "Bosnia and Herzegovina": "BA",
  Montenegro: "ME", "North Macedonia": "MK", Albania: "AL", Bulgaria: "BG",
  Romania: "RO", Hungary: "HU", Poland: "PL", Czechia: "CZ", Slovakia: "SK",
  Germany: "DE", Austria: "AT", Netherlands: "NL", Greece: "GR", Italy: "IT",
  Spain: "ES", Portugal: "PT", Cyprus: "CY",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeE164(raw: string, iso: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const dial = iso ? DIAL_BY_ISO[iso] : null;
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (!digits.startsWith("+")) {
    if (dial && digits.startsWith(dial.slice(1))) digits = "+" + digits;
    else if (dial && digits.startsWith("0")) digits = dial + digits.slice(1);
    else if (dial) digits = dial + digits;
    else digits = "+" + digits;
  }
  if (!/^\+\d{8,16}$/.test(digits)) return null;
  return digits;
}

// Validate it looks like a mobile (heuristic — drops obvious landline-only ranges).
// For most EU countries mobile prefixes start with 6/7. We are permissive here
// because business owners often list a mobile as their main contact.
function looksLikeMobile(e164: string, iso: string | null): boolean {
  if (!e164) return false;
  const dial = iso ? DIAL_BY_ISO[iso] : null;
  if (!dial || !e164.startsWith(dial)) return true; // unknown country → accept
  const local = e164.slice(dial.length);
  if (!local) return false;
  // Common mobile starts across our markets
  return /^[6-9]/.test(local) || iso === "RS" || iso === "HR" || iso === "BG" || iso === "RO" || iso === "GR";
}

function extractWhatsAppCandidates(text: string, iso: string | null): string[] {
  if (!text) return [];
  const out = new Set<string>();

  // 1. wa.me / api.whatsapp.com links
  const waLink = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\+?\d{8,16})/gi;
  let m: RegExpExecArray | null;
  while ((m = waLink.exec(text)) !== null) {
    const n = normalizeE164(m[1], iso);
    if (n) out.add(n);
  }

  // 2. Numbers near the word "whatsapp"
  const ctx = /whatsapp[^\n+0-9]{0,40}(\+?\d[\d\s\-().]{7,20})/gi;
  while ((m = ctx.exec(text)) !== null) {
    const n = normalizeE164(m[1], iso);
    if (n) out.add(n);
  }

  // 3. Any +XX international number (last-resort, only if the page mentions WhatsApp at all)
  if (/whatsapp/i.test(text)) {
    const intl = /(\+\d{1,3}[\s\-().]?\d[\d\s\-().]{6,18})/g;
    while ((m = intl.exec(text)) !== null) {
      const n = normalizeE164(m[1], iso);
      if (n) out.add(n);
    }
  }

  return Array.from(out);
}

async function firecrawlScrape(url: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown", "links"],
        onlyMainContent: false,
        waitFor: 1500,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const md: string = (data?.data?.markdown ?? data?.markdown ?? "").slice(0, 8000);
    const links: string[] = data?.data?.links ?? data?.links ?? [];
    const linksJoined = Array.isArray(links) ? links.join("\n").slice(0, 4000) : "";
    return [md, linksJoined].filter(Boolean).join("\n");
  } catch {
    return null;
  }
}

async function processLead(
  lead: any,
  firecrawlKey: string | null,
): Promise<{ whatsapp_number: string | null; source: string }> {
  const iso = lead.country ? COUNTRY_TO_ISO[lead.country] ?? null : null;

  // 1. Cheap path — promote existing phone_e164 if it looks mobile.
  if (lead.phone_e164) {
    const e = normalizeE164(lead.phone_e164, iso);
    if (e && looksLikeMobile(e, iso)) {
      return { whatsapp_number: e, source: "phone_e164" };
    }
  }
  if (lead.contact_phone) {
    const e = normalizeE164(lead.contact_phone, iso);
    if (e && looksLikeMobile(e, iso)) {
      return { whatsapp_number: e, source: "contact_phone" };
    }
  }

  // 2. Scrape source_url for WhatsApp links / numbers
  if (lead.source_url && firecrawlKey) {
    const txt = await firecrawlScrape(lead.source_url, firecrawlKey);
    if (txt) {
      const cands = extractWhatsAppCandidates(txt, iso);
      // Prefer mobile-looking
      const mob = cands.find((n) => looksLikeMobile(n, iso));
      const pick = mob ?? cands[0];
      if (pick) return { whatsapp_number: pick, source: "scraped" };
    }
  }

  return { whatsapp_number: null, source: "missing" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", u.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      return json({ error: "Admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const limit: number = Math.min(50, Math.max(1, Number(body?.limit) || 20));
    const concurrency: number = Math.min(4, Math.max(1, Number(body?.concurrency) || 3));
    const maxAttempts: number = Number.isFinite(body?.max_attempts) ? body.max_attempts : 2;

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? null;

    const { data: leads, error: leadsErr } = await admin
      .from("demand_leads")
      .select("id, country, source_url, phone_e164, contact_phone, whatsapp_enrich_attempts")
      .is("whatsapp_number", null)
      .lte("whatsapp_enrich_attempts", maxAttempts)
      .order("lead_score", { ascending: false })
      .limit(limit);
    if (leadsErr) return json({ error: leadsErr.message }, 500);
    if (!leads || leads.length === 0) {
      return json({ ok: true, processed: 0, found: 0, message: "No leads to enrich" });
    }

    let found = 0;
    const updates: Promise<any>[] = [];

    // Process in small concurrent batches
    for (let i = 0; i < leads.length; i += concurrency) {
      const slice = leads.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map(async (lead) => ({
          lead,
          res: await processLead(lead, firecrawlKey),
        })),
      );
      for (const { lead, res } of results) {
        const patch: Record<string, unknown> = {
          whatsapp_enrich_attempts: (lead.whatsapp_enrich_attempts ?? 0) + 1,
          whatsapp_last_enriched_at: new Date().toISOString(),
          whatsapp_source: res.source,
        };
        if (res.whatsapp_number) {
          patch.whatsapp_number = res.whatsapp_number;
          patch.whatsapp_enriched = true;
          found++;
        }
        updates.push(
          admin.from("demand_leads").update(patch).eq("id", lead.id),
        );
      }
    }
    await Promise.all(updates);

    return json({ ok: true, processed: leads.length, found });
  } catch (e) {
    console.error("enrich-whatsapp-numbers", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});