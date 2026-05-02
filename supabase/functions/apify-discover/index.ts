// Demand Discovery edge function — runs APIFY actors across multiple sources,
// stores raw signals, then calls structuring function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Default actor map. Admins can override per-call via request body.
const DEFAULT_ACTORS: Record<string, string> = {
  indeed: "misceres~indeed-scraper",
  facebook: "apify~facebook-posts-scraper",
  classifieds: "apify~web-scraper",
  career_page: "apify~web-scraper",
  google: "apify~google-search-scraper",
  linkedin: "bebity~linkedin-jobs-scraper",
};

// Country -> { iso2, language hints, local job board hosts }
// Full Balkans + EU coverage. Boards we don't know are omitted; google/career_page still work.
const COUNTRY_META: Record<string, { iso2: string; langs: string[]; boards: string[] }> = {
  // Balkans
  Serbia:                 { iso2: "RS", langs: ["en","sr"], boards: ["poslovi.infostud.com","helloworld.rs","halooglasi.com","oglasi.rs"] },
  Croatia:                { iso2: "HR", langs: ["en","hr"], boards: ["mojposao.net","posao.hr","njuskalo.hr","moj-posao.net"] },
  Slovenia:               { iso2: "SI", langs: ["en","sl"], boards: ["mojedelo.com","optius.com","zaposlitev.net"] },
  "Bosnia and Herzegovina": { iso2: "BA", langs: ["en","bs","hr","sr"], boards: ["posao.ba","kolektiv.ba","olx.ba","posao.hr"] },
  Montenegro:             { iso2: "ME", langs: ["en","sr"], boards: ["posao.me","poslovi.me","hoso.me"] },
  "North Macedonia":      { iso2: "MK", langs: ["en","mk"], boards: ["vrabotuvanje.com.mk","mojakariera.com.mk","najdiposao.mk"] },
  Albania:                { iso2: "AL", langs: ["en","sq"], boards: ["duapune.com","njoftime.com","mjaft.org"] },
  Kosovo:                 { iso2: "XK", langs: ["en","sq"], boards: ["telegrafi.com/punesim","kosovojob.com"] },
  Bulgaria:               { iso2: "BG", langs: ["en","bg"], boards: ["jobs.bg","zaplata.bg","rabota.bg"] },
  Moldova:                { iso2: "MD", langs: ["en","ro","ru"], boards: ["rabota.md","999.md","delogo.md"] },
  Romania:                { iso2: "RO", langs: ["en","ro"], boards: ["ejobs.ro","bestjobs.eu","olx.ro","hipo.ro"] },
  // Central & Eastern EU
  Hungary:                { iso2: "HU", langs: ["en","hu"], boards: ["profession.hu","jobline.hu","allas.hu"] },
  Poland:                 { iso2: "PL", langs: ["en","pl"], boards: ["pracuj.pl","olx.pl","gowork.pl","praca.pl"] },
  Czechia:                { iso2: "CZ", langs: ["en","cs"], boards: ["jobs.cz","prace.cz"] },
  Slovakia:               { iso2: "SK", langs: ["en","sk"], boards: ["profesia.sk","kariera.sk"] },
  Estonia:                { iso2: "EE", langs: ["en","et"], boards: ["cv.ee","cvkeskus.ee","tootukassa.ee"] },
  Latvia:                 { iso2: "LV", langs: ["en","lv"], boards: ["cv.lv","cvonline.lv"] },
  Lithuania:              { iso2: "LT", langs: ["en","lt"], boards: ["cvbankas.lt","cvonline.lt"] },
  // Western & Northern EU
  Germany:                { iso2: "DE", langs: ["en","de"], boards: ["stepstone.de","xing.com","arbeitsagentur.de","kimeta.de"] },
  Austria:                { iso2: "AT", langs: ["en","de"], boards: ["karriere.at","stepstone.at","willhaben.at"] },
  Switzerland:            { iso2: "CH", langs: ["en","de","fr","it"], boards: ["jobs.ch","jobup.ch","jobscout24.ch"] },
  Luxembourg:             { iso2: "LU", langs: ["en","fr","de"], boards: ["jobs.lu","monster.lu","jobfinder.lu"] },
  Netherlands:            { iso2: "NL", langs: ["en","nl"], boards: ["nationalevacaturebank.nl","monsterboard.nl","werk.nl"] },
  Belgium:                { iso2: "BE", langs: ["en","nl","fr"], boards: ["vdab.be","stepstone.be","jobat.be","references.be"] },
  France:                 { iso2: "FR", langs: ["en","fr"], boards: ["pole-emploi.fr","apec.fr","hellowork.com","indeed.fr"] },
  Ireland:                { iso2: "IE", langs: ["en"],      boards: ["irishjobs.ie","jobs.ie","monster.ie"] },
  Sweden:                 { iso2: "SE", langs: ["en","sv"], boards: ["arbetsformedlingen.se","blocket.se/jobb"] },
  Denmark:                { iso2: "DK", langs: ["en","da"], boards: ["jobindex.dk","jobnet.dk"] },
  Finland:                { iso2: "FI", langs: ["en","fi"], boards: ["te-palvelut.fi","duunitori.fi","oikotie.fi"] },
  Norway:                 { iso2: "NO", langs: ["en","no"], boards: ["finn.no/job","nav.no"] },
  // Southern EU
  Italy:                  { iso2: "IT", langs: ["en","it"], boards: ["infojobs.it","monster.it","subito.it/offerte-lavoro"] },
  Spain:                  { iso2: "ES", langs: ["en","es"], boards: ["infojobs.net","tecnoempleo.com","milanuncios.com/empleo"] },
  Portugal:               { iso2: "PT", langs: ["en","pt"], boards: ["net-empregos.com","sapo.pt/emprego","ofertas-emprego.com"] },
  Greece:                 { iso2: "GR", langs: ["en","el"], boards: ["kariera.gr","skywalker.gr","xe.gr"] },
  Cyprus:                 { iso2: "CY", langs: ["en","el"], boards: ["ergodotisi.com","carierista.com"] },
  Malta:                  { iso2: "MT", langs: ["en"],      boards: ["jobsplus.gov.mt","keepmeposted.com.mt","maltapark.com"] },
};
const COUNTRIES = Object.keys(COUNTRY_META);

// Subset of countries Voynova prioritises for blue-collar placements (used by bulk mode).
const PRIORITY_COUNTRIES = [
  "Serbia","Romania","Poland","Germany","Greece","Croatia","Slovenia","Bulgaria",
  "Czechia","Hungary","Austria","Netherlands","Italy","Spain","Portugal","Malta",
  "Slovakia","Bosnia and Herzegovina","North Macedonia","Montenegro","Albania",
];

// Roles Voynova actively places (used by bulk mode).
const PRIORITY_KEYWORDS = [
  "nurse","caregiver","construction worker","welder","electrician",
  "driver","factory worker","warehouse","mason","plumber","carpenter",
  "hotel staff","cleaner","chef",
];

// Role -> multilingual synonyms (used in query expansion)
const ROLE_SYNONYMS: Record<string, string[]> = {
  mason: ["mason","bricklayer","zidar","murarz","Maurer","ziditelj","kőműves"],
  plumber: ["plumber","vodoinstalater","hydraulik","Klempner","instalator","υδραυλικός"],
  electrician: ["electrician","električar","elektryk","Elektriker","electrician","ηλεκτρολόγος"],
  caregiver: ["caregiver","care worker","negovateljica","opiekun","Pflegekraft","badante"],
  nurse: ["nurse","medicinska sestra","pielęgniarka","Krankenpfleger","νοσηλευτής"],
  "factory worker": ["factory worker","production operator","radnik u fabrici","pracownik produkcji","Produktionsmitarbeiter"],
  driver: ["driver","truck driver","vozač","kierowca","Fahrer","LKW Fahrer"],
  "construction worker": ["construction worker","građevinski radnik","pracownik budowlany","Bauarbeiter","εργάτης οικοδομών"],
  welder: ["welder","varilac","spawacz","Schweißer","συγκολλητής"],
  carpenter: ["carpenter","stolar","cieśla","Zimmermann","ξυλουργός"],
  warehouse: ["warehouse worker","picker packer","magacioner","magazynier","Lagerarbeiter"],
  cleaner: ["cleaner","housekeeping","čistačica","sprzątaczka","Reinigungskraft"],
  chef: ["chef","cook","kuvar","kucharz","Koch","μάγειρας"],
  waiter: ["waiter","waitress","konobar","kelner","Kellner","σερβιτόρος"],
  "hotel staff": ["hotel staff","reception","hotel receptionist","recepcionista","Hotelmitarbeiter"],
};
const KEYWORDS = Object.keys(ROLE_SYNONYMS);

const INTENT_TERMS = [
  "hiring","urgent hiring","walk in","mass hiring","bulk hiring","visa sponsorship",
  "work permit","accommodation provided","apply now","immediate joining",
  "zapošljavamo","tražimo","zatrudnimy","poszukujemy","Wir stellen ein","suchen",
  "ζητείται","ζητούνται","cerchiamo",
];

function fingerprint(s: string) {
  // Cheap stable hash for dedup
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return `${h}`;
}

// Indeed actor only supports a fixed list of countries
const INDEED_ALLOWED = new Set([
  "AQ","AR","AU","AT","BH","BE","BR","CA","CL","CN","CO","CR","CZ","DK","EC","EG","FI","FR","DE","GR",
  "HK","HU","IN","ID","IE","IL","IT","JP","KW","LU","MY","MX","NL","NZ","NG","NO","OM","PK","PA","PE",
  "PH","PL","PT","QA","RO","SA","SG","ZA","KR","ES","SE","CH","TW","TH","TR","AE","UA","GB","US","UY","VE","VN",
]);

async function runActor(actorId: string, input: unknown, timeoutMs = 120_000) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${Math.floor(timeoutMs/1000)}`;
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
      throw new Error(`APIFY ${r.status}: ${t.slice(0, 300)}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function expandQueries(keyword: string, country: string): string[] {
  const meta = COUNTRY_META[country];
  const syns = ROLE_SYNONYMS[keyword] ?? [keyword];
  const intents = ["hiring","urgent","visa sponsorship","walk in","apply now"];
  const out = new Set<string>();
  for (const s of syns.slice(0, 4)) {
    for (const it of intents) out.add(`${s} ${it} ${country}`);
    out.add(`${s} jobs ${country}`);
    if (meta?.langs.includes("de")) out.add(`${s} Stelle ${country}`);
    if (meta?.langs.includes("pl")) out.add(`${s} praca ${country}`);
    if (meta?.langs.includes("sr")) out.add(`${s} posao ${country}`);
  }
  return Array.from(out).slice(0, 6);
}

function buildInput(source: string, country: string, keyword: string) {
  const meta = COUNTRY_META[country] ?? { iso2: country.slice(0,2).toUpperCase(), langs: ["en"], boards: [] };
  const queries = expandQueries(keyword, country);
  const synonyms = ROLE_SYNONYMS[keyword] ?? [keyword];

  switch (source) {
    case "indeed":
      return {
        country: meta.iso2,
        position: synonyms.slice(0, 3).join(" OR "),
        maxItems: 40,
        parseCompanyDetails: true,
        saveOnlyUniqueItems: true,
      };
    case "linkedin":
      return {
        location: country,
        keyword: synonyms.slice(0, 2).join(" OR "),
        rows: 30,
        publishedAt: "r604800", // last 7 days
      };
    case "facebook": {
      const urls = queries.flatMap((q) => [
        { url: `https://www.facebook.com/search/posts/?q=${encodeURIComponent(q)}` },
        { url: `https://www.facebook.com/search/groups/?q=${encodeURIComponent(`${keyword} ${country} hiring`)}` },
      ]);
      return { startUrls: urls.slice(0, 8), maxPosts: 25, maxPostsPerSource: 25 };
    }
    case "google": {
      const boardFilter = meta.boards.length
        ? "(" + meta.boards.map((b) => `site:${b}`).join(" OR ") + ")"
        : "";
      const urls = queries.map((q) => ({
        url: `https://www.google.com/search?q=${encodeURIComponent(`${q} ${boardFilter}`)}&hl=en&gl=${meta.iso2.toLowerCase()}`,
      }));
      return {
        queries: queries.join("\n"),
        countryCode: meta.iso2.toLowerCase(),
        languageCode: meta.langs[0] ?? "en",
        maxPagesPerQuery: 2,
        resultsPerPage: 20,
        startUrls: urls,
      };
    }
    case "classifieds": {
      const urls = meta.boards.flatMap((b) =>
        queries.slice(0, 2).map((q) => ({
          url: `https://www.google.com/search?q=${encodeURIComponent(`${q} site:${b}`)}`,
        })),
      );
      return {
        startUrls: urls.slice(0, 10),
        pageFunction:
          "async function pageFunction(ctx){return{title:ctx.request.url,text:await ctx.page.evaluate(()=>document.body.innerText.slice(0,6000))}}",
        maxPagesPerCrawl: 12,
        maxRequestRetries: 2,
      };
    }
    case "career_page": {
      const urls = queries.slice(0, 3).map((q) => ({
        url: `https://www.google.com/search?q=${encodeURIComponent(`${q} (inurl:careers OR inurl:jobs OR inurl:vacancies)`)}`,
      }));
      return {
        startUrls: urls,
        pageFunction:
          "async function pageFunction(ctx){return{title:ctx.request.url,text:await ctx.page.evaluate(()=>document.body.innerText.slice(0,6000))}}",
        maxPagesPerCrawl: 10,
      };
    }
    default:
      return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const mode: "plan" | "drain" = body.mode === "drain" ? "drain" : "plan";

    // ---------- DRAIN MODE: process up to 4 queued jobs synchronously ----------
    if (mode === "drain") {
      const WAVE_SIZE = 4;
      const WAVE_BUDGET_MS = 140_000;
      const startedAt = Date.now();
      const actors: Record<string, string> = { ...DEFAULT_ACTORS, ...(body.actors ?? {}) };

      const { data: queuedJobs, error: pickErr } = await supabase
        .from("scrape_jobs")
        .select("id, source, country, keyword, actor_id")
        .eq("status", "queued")
        .order("started_at", { ascending: true })
        .limit(WAVE_SIZE);
      if (pickErr) throw pickErr;

      const jobs = queuedJobs ?? [];
      if (jobs.length > 0) {
        await supabase.from("scrape_jobs").update({ status: "running" }).in("id", jobs.map((j) => j.id));
      }

      await Promise.all(jobs.map(async (job) => {
        if (Date.now() - startedAt > WAVE_BUDGET_MS) {
          await supabase.from("scrape_jobs").update({ status: "queued" }).eq("id", job.id);
          return;
        }
        const actorId = job.actor_id || actors[job.source];
        try {
          const input = buildInput(job.source, job.country ?? "", job.keyword ?? "");
          // Indeed is fast, others crawl multiple pages — give them more time
          const perActorTimeout = job.source === "indeed" || job.source === "linkedin" ? 60_000 : 120_000;
          const items: any[] = await runActor(actorId, input, perActorTimeout);
          let inserted = 0;
          const synonyms = (ROLE_SYNONYMS[job.keyword ?? ""] ?? [job.keyword ?? ""]).map((s) => s.toLowerCase());
          for (const it of items.slice(0, 60)) {
            const text = JSON.stringify(it).slice(0, 8000);
            const lower = text.toLowerCase();
            const hasRole = synonyms.some((s) => s && lower.includes(s));
            // Trust Indeed/LinkedIn job listings — they're already hiring posts.
            // Only require explicit hiring intent for noisy sources (facebook/classifieds/google).
            const trustedSource = job.source === "indeed" || job.source === "linkedin" || job.source === "career_page";
            const hasIntent = trustedSource ? true : INTENT_TERMS.some((t) => lower.includes(t.toLowerCase()));
            if (!hasRole || !hasIntent) continue;
            const fp = fingerprint(`${job.source}|${job.country}|${job.keyword}|${(it.url ?? it.link ?? it.id ?? text.slice(0,200))}`);
            const { error: insErr } = await supabase.from("raw_signals").insert({
              job_id: job.id,
              source: job.source,
              source_url: it.url ?? it.link ?? null,
              source_id: it.id ?? null,
              raw_text: text,
              payload: it,
              fingerprint: fp,
            });
            if (!insErr) inserted++;
          }
          await supabase.from("scrape_jobs").update({
            status: "succeeded", items_found: items.length, items_structured: inserted, finished_at: new Date().toISOString(),
          }).eq("id", job.id);
        } catch (e) {
          await supabase.from("scrape_jobs").update({
            status: "failed", error: String(e).slice(0, 500), finished_at: new Date().toISOString(),
          }).eq("id", job.id);
        }
      }));

      const { count: remaining } = await supabase
        .from("scrape_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued");

      return new Response(JSON.stringify({
        ok: true, mode: "drain", processed: jobs.length, remaining: remaining ?? 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------- PLAN MODE: build the plan and queue jobs ----------
    const sources: string[] = body.sources ?? Object.keys(DEFAULT_ACTORS);
    const countries: string[] = body.countries ?? COUNTRIES;
    const keywords: string[] = body.keywords ?? KEYWORDS;
    const actors: Record<string,string> = { ...DEFAULT_ACTORS, ...(body.actors ?? {}) };
    // Cap fan-out — higher default for robust coverage; admin can override.
    const maxJobs = body.maxJobs ?? 18;

    // Round-robin (source, country, keyword) so we don't exhaust one source first.
    const plan: Array<{source:string;country:string;keyword:string}> = [];
    const maxLen = Math.max(sources.length, countries.length, keywords.length);
    outer: for (let i = 0; i < maxLen * maxLen; i++) {
      for (let j = 0; j < sources.length; j++) {
        const s = sources[j];
        const c = countries[(i + j) % countries.length];
        const k = keywords[(i * 2 + j) % keywords.length];
        // Skip Indeed for unsupported countries
        if (s === "indeed") {
          const iso = COUNTRY_META[c]?.iso2;
          if (!iso || !INDEED_ALLOWED.has(iso)) continue;
        }
        if (!plan.find((p) => p.source === s && p.country === c && p.keyword === k)) {
          plan.push({ source: s, country: c, keyword: k });
          if (plan.length >= maxJobs) break outer;
        }
      }
    }

    // Insert all planned jobs as 'queued' and return immediately.
    // The dashboard then calls this same function in mode:"drain" repeatedly,
    // processing 4 jobs per call (well under the 150s limit per invocation).
    let queuedCount = 0;
    for (const job of plan) {
      const actorId = actors[job.source];
      if (!actorId) continue;
      const { error: insErr } = await supabase.from("scrape_jobs").insert({
        source: job.source,
        actor_id: actorId,
        country: job.country,
        keyword: job.keyword,
        status: "queued",
      });
      if (!insErr) queuedCount++;
    }

    return new Response(JSON.stringify({
      ok: true, mode: "plan", queued: queuedCount,
      message: `Queued ${queuedCount} jobs. Drain them with mode:"drain" in waves of 4.`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});