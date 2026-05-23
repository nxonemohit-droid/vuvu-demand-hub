import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

const JOB_SCHEMA = {
  type: "object",
  properties: {
    is_job_posting: { type: "boolean" },
    role_title: { type: "string" },
    company_name: { type: "string" },
    country: { type: "string" },
    city: { type: "string" },
    contact_email: { type: "string" },
    contact_phone: { type: "string" },
    website: { type: "string" },
    posted_at: { type: "string" },
    salary_min: { type: "number" },
    salary_max: { type: "number" },
    salary_currency: { type: "string" },
    headcount: { type: "number" },
    summary: { type: "string" },
  },
  required: ["is_job_posting"],
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fingerprint(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 120);
}

function normEmployer(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

async function firecrawlSearch(apiKey: string, query: string, limit: number) {
  const r = await fetch(`${FIRECRAWL_V2}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, tbs: "qdr:m" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`firecrawl search ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const web = j?.data?.web ?? j?.web ?? j?.data ?? [];
  return Array.isArray(web) ? web : [];
}

async function firecrawlScrape(apiKey: string, url: string) {
  const r = await fetch(`${FIRECRAWL_V2}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: [{ type: "json", schema: JOB_SCHEMA }, "markdown"],
      onlyMainContent: true,
    }),
  });
  const j = await r.json();
  if (!r.ok) return null;
  return j?.data ?? j;
}

const TRADE_CAT_MAP: Array<{ cat: string; words: string[] }> = [
  { cat: "welding", words: ["welder","welding","varilac","sudor","spawacz","schweißer","hegesztő"] },
  { cat: "construction", words: ["construction","mason","carpenter","plumber","electrician","painter","roofer","scaffold","tiler","labourer","građevin","zidar","tesar","muncitor construc","bauarbeiter","építőipar","budowlan","οικοδομ"] },
  { cat: "driver", words: ["driver","truck driver","vozač","șofer","kierowca","fahrer","sofőr","шофьор","οδηγός"] },
  { cat: "warehouse", words: ["warehouse","forklift","skladišt","depozit","raktár","magazyn","lager","viljuškar","stivuitor"] },
  { cat: "factory", words: ["factory","manufacturing","fabryk","fabrik","gyár","fabric"] },
  { cat: "hospitality", words: ["kitchen","housekeeping","dishwasher","chef","cook","kuhinj","bucătar","szakács"] },
  { cat: "caregiving", words: ["caregiver","nurse aide","carer","negovatelj","îngrijitor","gondoz","pflege"] },
  { cat: "cleaning", words: ["cleaner","cleaning","čistač","curățenie","takarít","sprzątacz","reinig"] },
  { cat: "security", words: ["security guard","obezbeđenj","agent securitate","biztons","wachschutz"] },
  { cat: "agriculture", words: ["agriculture","farm","poljoprivred","fermă","mezőgazd","rolnictw","landwirt"] },
  { cat: "logistics", words: ["logistic","lojistic","logisztik","logistyka","logistik"] },
];

function detectTradeCategory(title: string, desc: string): string | null {
  const hay = (title + " " + desc).toLowerCase();
  for (const { cat, words } of TRADE_CAT_MAP) {
    if (words.some((w) => hay.includes(w))) return cat;
  }
  return null;
}

function isWhiteCollar(title: string, exclusionWords: string[]): boolean {
  const t = title.toLowerCase();
  return exclusionWords.some((w) => t.includes(w.toLowerCase()));
}

function detectDirectEmployer(text: string, agencyWords: string[]): boolean {
  const t = text.toLowerCase();
  return !agencyWords.some((w) => t.includes(w.toLowerCase()));
}

function extractVacancyCount(text: string, phrases: string[]): number {
  for (const p of phrases) {
    try {
      const re = new RegExp(p, "i");
      const m = text.match(re);
      if (m && m[1]) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > 0 && n < 1000) return n;
      }
    } catch { /* bad regex */ }
  }
  return 1;
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
    const countries: string[] | undefined = body?.countries;
    const perBoardLimit: number = Math.min(Math.max(Number(body?.per_board_limit) || 8, 1), 20);

    // load keywords
    const { data: kwRows } = await admin
      .from("discovery_keywords").select("kind, lang, keyword").eq("enabled", true);
    const agencyWords = (kwRows ?? []).filter((k) => k.kind === "agency_exclude").map((k) => k.keyword);
    const whiteCollarWords = (kwRows ?? []).filter((k) => k.kind === "whitecollar_exclude").map((k) => k.keyword);
    const vacancyPhrases = (kwRows ?? []).filter((k) => k.kind === "vacancy_phrase").map((k) => k.keyword);

    let q = admin.from("source_boards").select("*").eq("enabled", true);
    if (countries?.length) q = q.in("country_iso2", countries);
    const { data: boards, error: bErr } = await q.order("priority");
    if (bErr) return json({ error: bErr.message }, 500);

    const summary: Array<Record<string, unknown>> = [];
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);

    for (const board of boards ?? []) {
      let leadsFound = 0;
      let leadsReposted = 0;
      let leadsRejected = 0;
      const errors: string[] = [];

      // enforce daily cap
      const { count: todayCount } = await admin
        .from("demand_leads")
        .select("id", { count: "exact", head: true })
        .eq("discovered_board_domain", board.board_domain)
        .gte("created_at", todayStart.toISOString());
      const cap = board.daily_cap ?? 75;
      const remaining = Math.max(0, cap - (todayCount ?? 0));
      if (remaining === 0) {
        summary.push({ board: board.board_domain, leads: 0, skipped: "daily_cap" });
        continue;
      }

      const queries: string[] = (board.search_queries?.length ? board.search_queries : ["radnik", "worker", "job"]) as string[];
      let processed = 0;

      for (const kw of queries) {
        if (processed >= remaining) break;
        try {
          const query = `site:${board.board_domain} ${kw}`;
          const results = await firecrawlSearch(FIRECRAWL_API_KEY, query, perBoardLimit);

          for (const hit of results.slice(0, perBoardLimit)) {
            if (processed >= remaining) break;
            const url: string | undefined = hit?.url ?? hit?.link;
            if (!url) continue;

            const fp = fingerprint(url);
            const { data: existingSignal } = await admin
              .from("raw_signals").select("id").eq("fingerprint", fp).maybeSingle();
            if (existingSignal) continue;

            const scraped = await firecrawlScrape(FIRECRAWL_API_KEY, url);
            const parsed = scraped?.json ?? {};
            const md = scraped?.markdown ?? hit?.description ?? "";

            if (parsed?.is_job_posting === false) { leadsRejected++; continue; }

            const title = String(parsed?.role_title ?? hit?.title ?? "");
            const desc = String(parsed?.summary ?? md ?? "");

            // white-collar filter
            if (isWhiteCollar(title, whiteCollarWords)) { leadsRejected++; continue; }

            const tradeCat = detectTradeCategory(title, desc);
            if (!tradeCat) { leadsRejected++; continue; }

            const direct = detectDirectEmployer(title + " " + (parsed?.company_name ?? "") + " " + desc, agencyWords);
            const vacancy = Math.max(Number(parsed?.headcount) || 0, extractVacancyCount(desc, vacancyPhrases));
            const employer = parsed?.company_name ?? hit?.title ?? null;
            const employerNorm = normEmployer(employer);
            const country = parsed?.country ?? board.country;

            // smart dedup: same employer + country + trade within 30d → repost
            if (employerNorm) {
              const thirtyDays = new Date(Date.now() - 30 * 86400000).toISOString();
              const { data: existingLead } = await admin
                .from("demand_leads")
                .select("id, repost_count, vacancy_count")
                .ilike("employer_name", employer ?? "")
                .eq("country", country)
                .eq("trade_category", tradeCat)
                .gte("created_at", thirtyDays)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (existingLead) {
                await admin.from("demand_leads").update({
                  repost_count: (existingLead.repost_count ?? 1) + 1,
                  vacancy_count: Math.max(existingLead.vacancy_count ?? 1, vacancy || 1),
                  updated_at: new Date().toISOString(),
                }).eq("id", existingLead.id);
                leadsReposted++;
                processed++;
                continue;
              }
            }

            // raw signal
            const { data: rs, error: rsErr } = await admin
              .from("raw_signals")
              .insert({
                source: "classifieds" as never,
                source_url: url,
                source_id: board.id,
                raw_text: typeof md === "string" ? md.slice(0, 8000) : null,
                payload: { ...parsed, board: board.board_domain },
                fingerprint: fp,
                structured: true,
              })
              .select("id").single();
            if (rsErr) { errors.push(rsErr.message); continue; }

            const { error: dlErr } = await admin.from("demand_leads").insert({
              source: "classifieds" as never,
              source_url: url,
              raw_signal_id: rs?.id,
              employer_name: employer,
              role: title || kw,
              country,
              city: parsed?.city ?? null,
              contact_email: parsed?.contact_email ?? null,
              contact_phone: parsed?.contact_phone ?? null,
              salary_min: parsed?.salary_min ?? null,
              salary_max: parsed?.salary_max ?? null,
              salary_currency: parsed?.salary_currency ?? null,
              demand_size: parsed?.headcount ?? null,
              vacancy_count: vacancy || 1,
              trade_category: tradeCat,
              is_direct_employer: direct,
              notes: parsed?.summary ?? null,
              discovered_board: board.board_name ?? board.board_domain,
              discovered_board_domain: board.board_domain,
              local_lang: board.lang,
              posted_at_local: parsed?.posted_at ? safeDate(parsed.posted_at) : null,
              matched_keywords: [kw, tradeCat],
              review_status: "new",
              email_source: parsed?.contact_email ? "scraped" : "missing",
            });
            if (dlErr) { errors.push(dlErr.message); continue; }
            leadsFound++;
            processed++;
          }
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      await admin.from("source_boards").update({
        last_run_at: new Date().toISOString(),
        last_success_at: errors.length === 0 ? new Date().toISOString() : board.last_success_at,
        last_error: errors[0] ?? null,
        total_runs: (board.total_runs ?? 0) + 1,
        total_leads_found: (board.total_leads_found ?? 0) + leadsFound,
      }).eq("id", board.id);

      summary.push({ board: board.board_domain, leads: leadsFound, reposts: leadsReposted, rejected: leadsRejected, errors: errors.length });
    }

    return json({ ok: true, boards_scanned: boards?.length ?? 0, summary });
  } catch (e) {
    console.error("discover-local-jobs error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function safeDate(v: unknown): string | null {
  try {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch { return null; }
}