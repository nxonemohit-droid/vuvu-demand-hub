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

// Min/max national digit lengths (excluding country code)
const PHONE_LEN_BY_ISO: Record<string, [number, number]> = {
  RS: [8, 9], HR: [8, 9], SI: [8, 8], BA: [8, 8], ME: [8, 8], MK: [8, 8],
  AL: [9, 9], BG: [8, 9], RO: [9, 9], HU: [8, 9], PL: [9, 9], CZ: [9, 9], SK: [9, 9],
  DE: [10, 11], AT: [10, 11], NL: [9, 9], GR: [10, 10], IT: [9, 10], ES: [9, 9],
  PT: [9, 9], CY: [8, 8],
};

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
  if (iso && dial) {
    if (!digits.startsWith(dial)) return null;
    const local = digits.slice(dial.length);
    const range = PHONE_LEN_BY_ISO[iso];
    if (range && (local.length < range[0] || local.length > range[1])) return null;
  }
  return digits;
}

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

async function scrapeText(apiKey: string, url: string, timeoutMs = 12000): Promise<string> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false }),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return "";
    const j = await r.json();
    return j?.data?.markdown ?? j?.markdown ?? "";
  } catch { return ""; }
}

async function hunterDomainSearch(domain: string, timeoutMs = 8000): Promise<string | null> {
  const key = Deno.env.get("HUNTER_API_KEY");
  if (!key) return null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&limit=1&api_key=${key}`,
      { signal: ctl.signal },
    );
    clearTimeout(timer);
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
    const limit = Math.min(Math.max(Number(body?.limit) || 8, 1), 25);
    const concurrency = Math.min(Math.max(Number(body?.concurrency) || 3, 1), 4);
    const emailOnly: boolean = body?.email_only === true;
    const maxAttempts: number = Number.isFinite(body?.max_attempts) ? body.max_attempts : 2;

    const selectCols =
      "id, employer_name, source_url, country, contact_email, contact_phone, discovered_board_domain, enrichment_attempts";
    let q;
    if (ids?.length) {
      q = admin.from("demand_leads").select(selectCols).in("id", ids);
    } else {
      q = admin.from("demand_leads").select(selectCols);
      if (emailOnly) {
        q = q.or("contact_email.is.null,contact_email.eq.");
      } else {
        q = q.or("contact_email.is.null,contact_phone.is.null");
      }
      // Need *some* anchor for derivation
      q = q
        .or("employer_name.not.is.null,source_url.not.is.null,discovered_board_domain.not.is.null")
        .lte("enrichment_attempts", maxAttempts)
        .order("lead_score", { ascending: false })
        .limit(limit);
    }

    const { data: leads, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const processLead = async (lead: any) => {
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
        let source: string = "missing";
        if (chosen) source = "scraped";
        if (!chosen && domain) {
          chosen = await hunterDomainSearch(domain);
          if (chosen) source = "hunter";
        }
        if (!chosen && domain) {
          chosen = guessEmail(domain);
          if (chosen) source = "guessed";
        }
        if (chosen) {
          update.contact_email = chosen;
          update.email_enriched = true;
          update.email_source = source;
        }
      }

      const rawCandidates = extractPhones(pageText, dial);
      let validPhone: string | null = null;
      for (const candidate of rawCandidates) {
        const e164 = normalizeE164(candidate, iso);
        if (e164) { validPhone = e164; break; }
      }
      if (validPhone) {
        if (!lead.contact_phone) {
          update.contact_phone = validPhone;
          update.phone_enriched = true;
        }
        update.phone_e164 = validPhone;
      }

      update.last_enriched_at = new Date().toISOString();
      update.enrichment_attempts = (lead.enrichment_attempts ?? 0) + 1;

      if (Object.keys(update).length > 1) {
        await admin.from("demand_leads").update(update).eq("id", lead.id);
      }
    };

    // Run in background to avoid CPU/wall-clock limits on the request handler.
    const queue = [...(leads ?? [])];
    const run = async () => {
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length) {
          const lead = queue.shift();
          if (!lead) break;
          try { await processLead(lead); }
          catch (e) { console.error("lead enrich failed", lead.id, e); }
        }
      });
      await Promise.all(workers);
    };
    // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(run());
    } else {
      // Fallback: fire and forget
      run().catch((e) => console.error("enrich-contacts bg", e));
    }

    return json({ ok: true, queued: leads?.length ?? 0, background: true });
  } catch (e) {
    console.error("enrich-contacts error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});