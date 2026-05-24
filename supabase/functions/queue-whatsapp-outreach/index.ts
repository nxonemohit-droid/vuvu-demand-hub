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

function titleize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
function firstName(full: string | null | undefined): string {
  if (!full) return "";
  const t = full.trim().split(/\s+/)[0];
  return t ? titleize(t) : "";
}

const TRADE_MAP: Array<{ cat: string; kws: string[] }> = [
  { cat: "welding", kws: ["weld", "fabricat", "mig", "tig"] },
  { cat: "construction", kws: ["construct", "civil", "mason", "concret", "scaffold", "carpenter", "plaster", "tiler", "rebar", "steel fixer"] },
  { cat: "driving", kws: ["driver", "hgv", "cdl"] },
  { cat: "electrical", kws: ["electric", "wiring", "electrician"] },
  { cat: "plumbing", kws: ["plumb", "pipefitter"] },
  { cat: "mechanical", kws: ["mechanic", "fitter", "millwright", "hvac", "technician"] },
  { cat: "warehouse", kws: ["warehouse", "picker", "packer", "forklift"] },
  { cat: "factory", kws: ["factory", "production", "assembly", "operator"] },
  { cat: "hospitality", kws: ["hotel", "kitchen", "chef", "waiter", "housekeep", "restaurant"] },
  { cat: "agriculture", kws: ["farm", "harvest", "agricultur", "greenhouse"] },
  { cat: "logistics", kws: ["logistic", "courier", "dispatch"] },
  { cat: "healthcare", kws: ["nurse", "caregiver", "carer"] },
  { cat: "cleaning", kws: ["clean", "janitor"] },
];
function deriveTrade(role: string | null, sectorTags: string[] | null, matched: string[] | null, notes: string | null): string {
  const hay = [role ?? "", (sectorTags ?? []).join(" "), (matched ?? []).join(" "), notes ?? ""].join(" ").toLowerCase();
  for (const { cat, kws } of TRADE_MAP) if (kws.some((k) => hay.includes(k))) return cat;
  return "";
}
function deriveRole(role: string | null, sectorTags: string[] | null, matched: string[] | null, trade: string): string {
  const r = (role ?? "").trim();
  if (r) return r.toLowerCase();
  const s = (sectorTags ?? []).find((s) => s && s.trim().length > 1);
  if (s) return s.toLowerCase();
  const k = (matched ?? []).find((s) => s && s.trim().length > 1);
  if (k) return k.toLowerCase();
  return trade ? `skilled ${trade} workers` : "skilled workers";
}

/**
 * Personalized WhatsApp template. Short, conversational, B2B-friendly.
 * Vars: contact_name, employer_name, role, city, country, trade_category
 */
function buildMessage(v: Record<string, string>): string {
  const greet = v.contact_name ? `Hi ${v.contact_name}` : "Hello";
  const where = v.city && v.city !== v.country ? `${v.city}, ${v.country}` : v.country;
  const role = v.role || "skilled workers";
  const company = v.employer_name && v.employer_name !== "your company"
    ? `at ${v.employer_name}`
    : "";
  return [
    `${greet}! I'm Komal from Voynova Global Solutions — we supply vetted, work-ready blue-collar talent (India / Nepal / Bangladesh) to European employers.`,
    ``,
    `I noticed you're hiring ${role} ${company ? company + " " : ""}in ${where}. We can provide pre-screened, English-speaking candidates with relevant trade certificates, ready to relocate on EU work permits within 60–90 days.`,
    ``,
    `Typical placements: welders, construction crews, drivers, warehouse, hospitality, factory. We handle the full pipeline (sourcing, documentation, visa support, pre-departure training) so you only see CVs that already match.`,
    ``,
    `Would it be useful to send 3–5 sample CVs for your ${role.replace(/^skilled\s+|\s+workers$/g, "") || "current"} roles, with no obligation?`,
    ``,
    `Voynova Global Solutions`,
    `🌐 voynova.com  ·  ✉️ partners@voynova.com`,
  ].join("\n");
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
    const dryRun: boolean = body?.dry_run === true;
    const templateName: string = body?.template_name ?? "voynova_demand_whatsapp";

    // Read daily cap from settings (default 50)
    const { data: settings } = await admin
      .from("whatsapp_send_settings")
      .select("daily_cap")
      .eq("id", 1)
      .maybeSingle();
    const dailyCap: number = Math.max(1, Math.min(500, settings?.daily_cap ?? 50));

    // Already-queued lead_ids for idempotency
    const { data: existing } = await admin
      .from("whatsapp_outreach")
      .select("lead_id")
      .eq("template_name", templateName);
    const alreadyQueued = new Set((existing ?? []).map((r: any) => r.lead_id));

    // Load enriched leads (paged)
    const leads: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from("demand_leads")
        .select("id, employer_name, role, country, city, contact_name, whatsapp_number, trade_category, sector_tags, matched_keywords, notes")
        .not("whatsapp_number", "is", null)
        .neq("whatsapp_number", "")
        .order("lead_score", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) return json({ error: error.message }, 500);
      if (!data || data.length === 0) break;
      leads.push(...data);
      if (data.length < pageSize) break;
    }

    // Resume from the last queued date so re-runs continue forward.
    const { data: lastRow } = await admin
      .from("whatsapp_outreach")
      .select("queue_date")
      .eq("template_name", templateName)
      .order("queue_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Count how many already queued on that latest day, so we don't break the cap
    let startOffset = 0;
    let baseDate: Date;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (lastRow?.queue_date) {
      const last = new Date(lastRow.queue_date + "T00:00:00Z");
      baseDate = last >= today ? last : today;
      const { count: lastCount } = await admin
        .from("whatsapp_outreach")
        .select("*", { head: true, count: "exact" })
        .eq("template_name", templateName)
        .eq("queue_date", baseDate.toISOString().slice(0, 10));
      startOffset = lastCount ?? 0;
    } else {
      baseDate = today;
    }

    const rows: any[] = [];
    const seenNumbers = new Set<string>();
    let skippedDup = 0;
    let skippedDupNumber = 0;

    let i = 0;
    for (const lead of leads) {
      if (alreadyQueued.has(lead.id)) { skippedDup++; continue; }

      const e164 = String(lead.whatsapp_number).trim();
      if (!/^\+\d{8,16}$/.test(e164)) continue;
      if (seenNumbers.has(e164)) { skippedDupNumber++; continue; }
      seenNumbers.add(e164);

      const trade = (lead.trade_category && lead.trade_category.trim()) ||
        deriveTrade(lead.role, lead.sector_tags, lead.matched_keywords, lead.notes) ||
        "blue-collar";
      const role = deriveRole(lead.role, lead.sector_tags, lead.matched_keywords, trade);

      const vars: Record<string, string> = {
        contact_name: firstName(lead.contact_name),
        employer_name: lead.employer_name?.trim() || "your company",
        role,
        country: (lead.country && lead.country.trim()) || "Europe",
        city: (lead.city && lead.city.trim()) || (lead.country && lead.country.trim()) || "your region",
        trade_category: trade,
      };

      const message = buildMessage(vars);
      const digits = e164.replace(/[^\d]/g, "");
      const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

      // Distribute across days: first (dailyCap - startOffset) go on baseDate, then dailyCap/day after.
      const adjusted = i + startOffset;
      const dayOffset = Math.floor(adjusted / dailyCap);
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() + dayOffset);
      const queueDate = d.toISOString().slice(0, 10);

      rows.push({
        lead_id: lead.id,
        to_number: digits,
        display_number: e164,
        message,
        wa_link: waLink,
        queue_date: queueDate,
        status: "queued",
        template_name: templateName,
      });
      i++;
    }

    const estimatedDays = Math.max(1, Math.ceil((rows.length + startOffset) / dailyCap));

    if (dryRun) {
      const sampleIdx = rows.length === 0 ? [] : Array.from(new Set([0, Math.floor(rows.length / 2), rows.length - 1]));
      return json({
        dry_run: true,
        candidates: leads.length,
        would_queue: rows.length,
        skipped_duplicate_lead: skippedDup,
        skipped_duplicate_number: skippedDupNumber,
        first_queue_date: rows[0]?.queue_date ?? null,
        last_queue_date: rows[rows.length - 1]?.queue_date ?? null,
        daily_cap: dailyCap,
        estimated_days: estimatedDays,
        samples: sampleIdx.map((idx) => ({
          display_number: rows[idx].display_number,
          message: rows[idx].message,
          wa_link: rows[idx].wa_link,
          queue_date: rows[idx].queue_date,
        })),
      });
    }

    let inserted = 0;
    const chunk = 200;
    for (let k = 0; k < rows.length; k += chunk) {
      const slice = rows.slice(k, k + chunk);
      const { error } = await admin.from("whatsapp_outreach").insert(slice);
      if (error) return json({ error: error.message, inserted }, 500);
      inserted += slice.length;
    }

    // Mark leads as queued
    if (rows.length > 0) {
      const ids = rows.map((r) => r.lead_id);
      // Update in chunks
      for (let k = 0; k < ids.length; k += 500) {
        await admin.from("demand_leads")
          .update({ whatsapp_queued: true })
          .in("id", ids.slice(k, k + 500));
      }
    }

    return json({
      ok: true,
      candidates: leads.length,
      queued: inserted,
      skipped_duplicate_lead: skippedDup,
      skipped_duplicate_number: skippedDupNumber,
      first_queue_date: rows[0]?.queue_date ?? null,
      last_queue_date: rows[rows.length - 1]?.queue_date ?? null,
      daily_cap: dailyCap,
      estimated_days: estimatedDays,
    });
  } catch (e) {
    console.error("queue-whatsapp-outreach", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});