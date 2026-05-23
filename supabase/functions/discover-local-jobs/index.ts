import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

const DEFAULT_KEYWORDS = [
  "welder", "nurse", "caregiver", "driver", "construction worker",
  "electrician", "factory worker", "warehouse", "chef", "cleaner",
];

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

async function firecrawlSearch(apiKey: string, query: string, limit: number) {
  const r = await fetch(`${FIRECRAWL_V2}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, tbs: "qdr:w" }),
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

function fingerprint(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 120);
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

    // Auth check (admin only) unless invoked with service key from cron
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
    const keywords: string[] = Array.isArray(body?.keywords) && body.keywords.length
      ? body.keywords : DEFAULT_KEYWORDS;
    const perBoardLimit: number = Math.min(Math.max(Number(body?.per_board_limit) || 8, 1), 20);

    let q = admin.from("source_boards").select("*").eq("enabled", true);
    if (countries?.length) q = q.in("country_iso2", countries);
    const { data: boards, error: bErr } = await q.order("priority");
    if (bErr) return json({ error: bErr.message }, 500);

    const summary: Array<Record<string, unknown>> = [];

    for (const board of boards ?? []) {
      let leadsFound = 0;
      const errors: string[] = [];

      for (const kw of keywords.slice(0, 4)) {
        try {
          const query = `site:${board.board_domain} ${kw}`;
          const results = await firecrawlSearch(FIRECRAWL_API_KEY, query, perBoardLimit);

          for (const hit of results.slice(0, perBoardLimit)) {
            const url: string | undefined = hit?.url ?? hit?.link;
            if (!url) continue;

            const fp = fingerprint(url);
            // dedupe via raw_signals fingerprint
            const { data: existing } = await admin
              .from("raw_signals").select("id").eq("fingerprint", fp).maybeSingle();
            if (existing) continue;

            const scraped = await firecrawlScrape(FIRECRAWL_API_KEY, url);
            const parsed = scraped?.json ?? {};
            const md = scraped?.markdown ?? hit?.description ?? "";

            if (parsed?.is_job_posting === false) continue;

            const payload = {
              employer_name: parsed?.company_name ?? hit?.title ?? null,
              role: parsed?.role_title ?? kw,
              country: parsed?.country ?? board.country,
              city: parsed?.city ?? null,
              contact_email: parsed?.contact_email ?? null,
              contact_phone: parsed?.contact_phone ?? null,
              posted_at: parsed?.posted_at ?? null,
              salary_min: parsed?.salary_min ?? null,
              salary_max: parsed?.salary_max ?? null,
              salary_currency: parsed?.salary_currency ?? null,
              headcount: parsed?.headcount ?? null,
              summary: parsed?.summary ?? null,
              url,
              board: board.board_domain,
            };

            const { data: rs, error: rsErr } = await admin
              .from("raw_signals")
              .insert({
                source: "classifieds" as never,
                source_url: url,
                source_id: board.id,
                raw_text: md?.slice?.(0, 8000) ?? null,
                payload,
                fingerprint: fp,
                structured: true,
              })
              .select("id").single();

            if (rsErr) { errors.push(rsErr.message); continue; }

            // create demand_lead immediately
            const { error: dlErr } = await admin.from("demand_leads").insert({
              source: "classifieds" as never,
              source_url: url,
              raw_signal_id: rs?.id,
              employer_name: payload.employer_name,
              role: payload.role,
              country: payload.country,
              city: payload.city,
              contact_email: payload.contact_email,
              contact_phone: payload.contact_phone,
              salary_min: payload.salary_min,
              salary_max: payload.salary_max,
              salary_currency: payload.salary_currency,
              demand_size: payload.headcount,
              notes: payload.summary,
              discovered_board: board.board_name ?? board.board_domain,
              discovered_board_domain: board.board_domain,
              local_lang: board.lang,
              posted_at_local: payload.posted_at ? new Date(payload.posted_at).toISOString() : null,
              matched_keywords: [kw],
              review_status: "new",
            });
            if (dlErr) { errors.push(dlErr.message); continue; }
            leadsFound++;
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

      summary.push({ board: board.board_domain, leads: leadsFound, errors: errors.length });
    }

    return json({ ok: true, boards_scanned: boards?.length ?? 0, summary });
  } catch (e) {
    console.error("discover-local-jobs error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});