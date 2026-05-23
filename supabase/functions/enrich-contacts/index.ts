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

function deriveDomain(employer?: string | null, url?: string | null): string | null {
  if (url) {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return u.host.replace(/^www\./, "").toLowerCase();
    } catch { /* ignore */ }
  }
  if (employer) {
    const slug = employer.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
    if (slug.length >= 3) return `${slug}.com`;
  }
  return null;
}

function guessEmail(domain: string): string {
  return `info@${domain}`;
}

function extractEmails(text: string): string[] {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(m.map((e) => e.toLowerCase()))];
}

function extractPhones(text: string, dialCode?: string): string[] {
  const candidates = text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? [];
  const cleaned = candidates
    .map((p) => p.replace(/[^\d+]/g, ""))
    .filter((p) => p.length >= 9 && p.length <= 16);
  if (dialCode) {
    const cc = dialCode.replace("+", "");
    const local = cleaned.filter((p) => p.startsWith("+" + cc) || p.startsWith(cc) || p.startsWith("0"));
    if (local.length) return [...new Set(local)];
  }
  return [...new Set(cleaned)];
}

async function scrapeText(apiKey: string, url: string): Promise<string> {
  try {
    const r = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return j?.data?.markdown ?? j?.markdown ?? "";
  } catch { return ""; }
}

async function hunterDomainSearch(domain: string): Promise<string | null> {
  const key = Deno.env.get("HUNTER_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&limit=1&api_key=${key}`,
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data?.emails?.[0]?.value ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) return json({ error: "FIRECRAWL_API_KEY missing" }, 500);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceCall = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "___");
    if (!isServiceCall) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: role } = await admin
        .from("user_roles").select("role")
        .eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      if (!role) return json({ error: "Admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const ids: string[] | undefined = body?.ids;
    const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 200);

    let q = admin.from("demand_leads")
      .select("id, employer_name, source_url, country, contact_email, contact_phone, discovered_board_domain")
      .or("contact_email.is.null,contact_phone.is.null")
      .not("discovered_board_domain", "is", null)
      .limit(limit);
    if (ids?.length) q = admin.from("demand_leads")
      .select("id, employer_name, source_url, country, contact_email, contact_phone, discovered_board_domain")
      .in("id", ids);

    const { data: leads, error } = await q;
    if (error) return json({ error: error.message }, 500);

    let enriched = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const lead of leads ?? []) {
      const iso = COUNTRY_TO_ISO[lead.country ?? ""] ?? null;
      const dial = iso ? DIAL_BY_ISO[iso] : undefined;
      const update: Record<string, unknown> = {};

      const domain = deriveDomain(lead.employer_name, lead.source_url);
      let pageText = "";
      if (domain) {
        pageText = await scrapeText(FIRECRAWL_API_KEY, `https://${domain}`);
        if (pageText.length < 200) {
          pageText += "\n" + (await scrapeText(FIRECRAWL_API_KEY, `https://${domain}/contact`));
        }
      }

      if (!lead.contact_email) {
        const fromPage = extractEmails(pageText).find((e) => domain && e.endsWith("@" + domain));
        let chosen = fromPage ?? null;
        if (!chosen && domain) chosen = await hunterDomainSearch(domain);
        if (!chosen && domain) chosen = guessEmail(domain);
        if (chosen) {
          update.contact_email = chosen;
          update.email_enriched = true;
        }
      }

      if (!lead.contact_phone) {
        const phones = extractPhones(pageText, dial);
        if (phones[0]) {
          update.contact_phone = phones[0];
          update.phone_enriched = true;
        }
      }

      update.last_enriched_at = new Date().toISOString();
      update.enrichment_attempts = 1;

      if (Object.keys(update).length > 1) {
        await admin.from("demand_leads").update(update).eq("id", lead.id);
        if (update.contact_email && update.contact_phone) enriched++;
      }
      details.push({ id: lead.id, domain, ...update });
    }

    return json({ ok: true, processed: leads?.length ?? 0, enriched, details });
  } catch (e) {
    console.error("enrich-contacts error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});