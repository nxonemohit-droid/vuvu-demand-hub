import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? "").toString());
}

function titleize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function firstName(full: string | null | undefined): string {
  if (!full) return "";
  const t = full.trim().split(/\s+/)[0];
  return t ? titleize(t) : "";
}

// Map a role/sector haystack into a coarse trade category.
const TRADE_MAP: Array<{ cat: string; kws: string[] }> = [
  { cat: "welding", kws: ["weld", "fabricat", "mig", "tig", "boilermaker"] },
  { cat: "construction", kws: ["construct", "civil", "mason", "concret", "scaffold", "carpenter", "plaster", "tiler", "rebar", "steel fixer", "shuttering"] },
  { cat: "driving", kws: ["driver", "trucker", "hgv", "cdl", "delivery driver", "chauffeur"] },
  { cat: "electrical", kws: ["electric", "wiring", "electrician"] },
  { cat: "plumbing", kws: ["plumb", "pipefitter", "pipe fitter"] },
  { cat: "mechanical", kws: ["mechanic", "fitter", "millwright", "hvac", "technician"] },
  { cat: "warehouse", kws: ["warehouse", "picker", "packer", "forklift", "loader"] },
  { cat: "factory", kws: ["factory", "production", "assembly", "machine operator", "operator"] },
  { cat: "hospitality", kws: ["hotel", "kitchen", "chef", "waiter", "waitress", "housekeep", "restaurant", "barista"] },
  { cat: "agriculture", kws: ["farm", "harvest", "agricultur", "greenhouse"] },
  { cat: "logistics", kws: ["logistic", "courier", "dispatch"] },
  { cat: "healthcare", kws: ["nurse", "caregiver", "carer", "healthcare"] },
  { cat: "cleaning", kws: ["clean", "janitor", "housekeep"] },
];

function deriveTradeCategory(
  role: string | null | undefined,
  sectorTags: string[] | null | undefined,
  matchedKeywords: string[] | null | undefined,
  notes: string | null | undefined,
): string {
  const hay = [
    role ?? "",
    (sectorTags ?? []).join(" "),
    (matchedKeywords ?? []).join(" "),
    notes ?? "",
  ].join(" ").toLowerCase();
  for (const { cat, kws } of TRADE_MAP) {
    if (kws.some((k) => hay.includes(k))) return cat;
  }
  return "";
}

function deriveRole(
  role: string | null | undefined,
  sectorTags: string[] | null | undefined,
  matchedKeywords: string[] | null | undefined,
  trade: string,
): string {
  const r = (role ?? "").trim();
  if (r) return r.toLowerCase();
  const fromSector = (sectorTags ?? []).find((s) => s && s.trim().length > 1);
  if (fromSector) return fromSector.toLowerCase();
  const fromKw = (matchedKeywords ?? []).find((s) => s && s.trim().length > 1);
  if (fromKw) return fromKw.toLowerCase();
  if (trade) return `skilled ${trade} workers`;
  return "skilled workers";
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
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run === true;
    const templateName: string = body?.template_name ?? "voynova_demand_outreach";
    const startHourUtc: number = Number.isFinite(body?.start_hour_utc) ? body.start_hour_utc : 7; // ~08:00 Belgrade winter
    const endHourUtc: number = Number.isFinite(body?.end_hour_utc) ? body.end_hour_utc : 17; // ~19:00 Belgrade
    const dailyCap: number = Number.isFinite(body?.daily_cap) ? body.daily_cap : 200;
    // Optional explicit pacing override (e.g. 180 = 3-minute gap between sends)
    const intervalOverride: number | null = Number.isFinite(body?.interval_seconds)
      ? Math.max(30, Math.floor(body.interval_seconds))
      : null;

    // 1. Load template
    const { data: tpl, error: tplErr } = await admin
      .from("email_templates")
      .select("name, subject, body")
      .eq("name", templateName)
      .maybeSingle();
    if (tplErr) return json({ error: tplErr.message }, 500);
    if (!tpl) return json({ error: `Template ${templateName} not found` }, 404);

    // 2. Suppression list
    const { data: supp } = await admin.from("email_suppressions").select("email");
    const suppressed = new Set((supp ?? []).map((r: any) => String(r.email).toLowerCase()));

    // 3. Already-queued lead_ids for this template (idempotency)
    const { data: existing } = await admin
      .from("scheduled_emails")
      .select("lead_id")
      .eq("template_name", templateName)
      .not("lead_id", "is", null);
    const alreadyQueued = new Set((existing ?? []).map((r: any) => r.lead_id));

    // 4. Pull candidate leads (paged to avoid 1000-row cap)
    const leads: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from("demand_leads")
        .select("id, employer_name, role, country, city, contact_email, contact_name, trade_category, sector_tags, matched_keywords, notes")
        .not("contact_email", "is", null)
        .neq("contact_email", "")
        .order("lead_score", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) return json({ error: error.message }, 500);
      if (!data || data.length === 0) break;
      leads.push(...data);
      if (data.length < pageSize) break;
    }

    // 5. Build rows
    const seenEmails = new Set<string>();
    let skippedSuppressed = 0;
    let skippedDuplicate = 0;
    let skippedSameEmail = 0;
    const rows: any[] = [];

    const windowHours = Math.max(1, endHourUtc - startHourUtc);
    const intervalSec = intervalOverride ?? Math.max(30, Math.floor((windowHours * 3600) / dailyCap));
    // When pacing is explicit, recompute how many fit per send window day.
    const effectiveDailyCap = intervalOverride
      ? Math.max(1, Math.floor((windowHours * 3600) / intervalSec))
      : dailyCap;

    // Snap a candidate time into the next in-window slot.
    const snapToWindow = (t: Date): Date => {
      const d = new Date(t);
      const h = d.getUTCHours();
      if (h < startHourUtc) {
        d.setUTCHours(startHourUtc, 0, 0, 0);
      } else if (h >= endHourUtc) {
        d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(startHourUtc, 0, 0, 0);
      }
      return d;
    };

    // Continue after the latest already-pending send_at so a re-queue never collides.
    const { data: lastPending } = await admin
      .from("scheduled_emails")
      .select("send_at")
      .eq("template_name", templateName)
      .eq("status", "pending")
      .order("send_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    let firstSlot: Date;
    if (lastPending?.send_at) {
      firstSlot = snapToWindow(new Date(new Date(lastPending.send_at).getTime() + intervalSec * 1000));
    } else {
      // Start now if we're in the send window, otherwise jump to the next window opening.
      firstSlot = snapToWindow(new Date(now.getTime() + 60_000));
    }

    let queuedIndex = 0;
    for (const lead of leads) {
      const email = String(lead.contact_email).trim().toLowerCase();
      if (!email.includes("@")) continue;
      if (suppressed.has(email)) { skippedSuppressed++; continue; }
      if (alreadyQueued.has(lead.id)) { skippedDuplicate++; continue; }
      if (seenEmails.has(email)) { skippedSameEmail++; continue; }
      seenEmails.add(email);

      const trade =
        (lead.trade_category && lead.trade_category.trim()) ||
        deriveTradeCategory(lead.role, lead.sector_tags, lead.matched_keywords, lead.notes) ||
        "blue-collar";
      const derivedRole = deriveRole(lead.role, lead.sector_tags, lead.matched_keywords, trade);
      const vars: Record<string, string> = {
        contact_name: firstName(lead.contact_name) || "Hiring Manager",
        employer_name: lead.employer_name?.trim() || "your company",
        role: derivedRole,
        country: (lead.country && lead.country.trim()) || "Europe",
        city: (lead.city && lead.city.trim()) || (lead.country && lead.country.trim()) || "your region",
        trade_category: trade,
      };

      const dayOffset = Math.floor(queuedIndex / effectiveDailyCap);
      const slotInDay = queuedIndex % effectiveDailyCap;
      const sendAt = new Date(firstSlot.getTime() + dayOffset * 86_400_000 + slotInDay * intervalSec * 1000);

      // Clean up any stray "x, x" duplicates (e.g. when city == country)
      const cleanSubject = render(tpl.subject, vars).replace(/\s+,/g, ",").replace(/,\s*,/g, ",");
      const cleanBody = render(tpl.body, vars)
        .replace(/\s+,/g, ",")
        .replace(/,\s*,/g, ",")
        .replace(/in ([^,\n]+), \1\b/gi, "in $1");

      rows.push({
        lead_id: lead.id,
        to_email: email,
        subject: cleanSubject,
        body: cleanBody,
        send_at: sendAt.toISOString(),
        status: "pending",
        template_name: templateName,
      });
      queuedIndex++;
    }

    if (dryRun) {
      // Pick a few representative samples: highest score, mid, last
      const sampleIdx = rows.length === 0
        ? []
        : Array.from(new Set([0, Math.floor(rows.length / 2), rows.length - 1]));
      const samples = sampleIdx.map((i) => {
        const r = rows[i];
        return {
          to_email: r.to_email,
          subject: r.subject,
          body: r.body,
          send_at: r.send_at,
        };
      });
      return json({
        dry_run: true,
        candidates: leads.length,
        would_queue: rows.length,
        skipped_suppressed: skippedSuppressed,
        skipped_duplicate: skippedDuplicate,
        skipped_same_email_dedup: skippedSameEmail,
        first_send_at: rows[0]?.send_at ?? null,
        last_send_at: rows[rows.length - 1]?.send_at ?? null,
        interval_seconds: intervalSec,
        daily_cap: dailyCap,
        estimated_days: Math.max(1, Math.ceil(rows.length / dailyCap)),
        samples,
      });
    }

    // 6. Batch insert
    let inserted = 0;
    const chunk = 200;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { error } = await admin.from("scheduled_emails").insert(slice);
      if (error) return json({ error: error.message, inserted }, 500);
      inserted += slice.length;
    }

    return json({
      ok: true,
      candidates: leads.length,
      queued: inserted,
      skipped_suppressed: skippedSuppressed,
      skipped_duplicate: skippedDuplicate,
      skipped_same_email_dedup: skippedSameEmail,
      first_send_at: rows[0]?.send_at ?? null,
      last_send_at: rows[rows.length - 1]?.send_at ?? null,
      interval_seconds: intervalSec,
      daily_cap: dailyCap,
      estimated_days: Math.max(1, Math.ceil(inserted / dailyCap)),
    });
  } catch (e) {
    console.error("queue-demand-lead-outreach", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});