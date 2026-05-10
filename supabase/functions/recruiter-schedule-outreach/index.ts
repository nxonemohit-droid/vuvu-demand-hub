// Schedules outreach emails to recruiter leads in 3 priority blocks at a
// configurable daily cap (default 50/day). Inserts rows into scheduled_emails
// with staggered send_at within the configured send window. The existing
// process-scheduled-emails cron drains them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Lead = {
  id: string;
  agency_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_linkedin: string | null;
  hq_country: string | null;
  hq_city: string | null;
  operating_eu_country: string | null;
};

function priorityBlock(l: Lead): 1 | 2 | 3 | 0 {
  const e = (l.contact_email ?? "").trim();
  const p = (l.contact_phone ?? "").trim();
  const li = (l.contact_linkedin ?? "").trim();
  if (!e) return 0;
  if (p && li) return 1;
  if (p || li) return 2;
  return 3;
}

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

const FALLBACK_SUBJECT = "Partnership opportunity for {{agency_name}}";
const FALLBACK_BODY = `Hello {{contact_name_or_team}},

I'm reaching out from Voynova Global Solutions. We help blue-collar recruitment agencies in {{hq_country}} place workers from Nepal, India, and Bangladesh into employers across Europe.

If {{agency_name}} is currently sourcing workers for {{operating_eu_country}}, I'd love to share how we can support your active orders — free recruitment model, no advance fees from candidates.

Would a 15-minute call this week work?

Best regards,
Voynova Global Solutions
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ ok: false, error: "missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonResponse({ ok: false, error: "invalid token" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResponse({ ok: false, error: "admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const dailyCap: number = Math.max(1, Math.min(500, Number(body?.dailyCap ?? 50)));
    const templateId: string | undefined = body?.templateId;
    const blockFilter: number[] | undefined = Array.isArray(body?.blocks)
      ? body.blocks.map((b: unknown) => Number(b)).filter((n: number) => [1,2,3].includes(n))
      : undefined;

    // Fetch template (optional).
    let subjectTpl = FALLBACK_SUBJECT;
    let bodyTpl = FALLBACK_BODY;
    let templateName: string | null = null;
    if (templateId) {
      const { data: t } = await admin.from("email_templates").select("name, subject, body").eq("id", templateId).maybeSingle();
      if (t) { subjectTpl = t.subject; bodyTpl = t.body; templateName = t.name; }
    } else {
      const { data: t } = await admin.from("email_templates").select("name, subject, body")
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (t) { subjectTpl = t.subject; bodyTpl = t.body; templateName = t.name; }
    }

    // Fetch send window settings.
    const { data: settingsRow } = await admin.from("email_send_settings").select("*").eq("id", 1).maybeSingle();
    const startHour: number = settingsRow?.send_window_start_hour ?? 8;
    const endHour: number = settingsRow?.send_window_end_hour ?? 19;
    const tz: string = settingsRow?.send_window_timezone ?? "Europe/Belgrade";

    // Pull all active leads with at least an email.
    const { data: leads, error: leadsErr } = await admin
      .from("recruiter_leads")
      .select("id, agency_name, contact_name, contact_email, contact_phone, contact_linkedin, hq_country, hq_city, operating_eu_country, status")
      .eq("status", "active")
      .not("contact_email", "is", null);
    if (leadsErr) return jsonResponse({ ok: false, error: leadsErr.message }, 500);

    // Already-scheduled emails — skip them.
    const { data: existing } = await admin
      .from("scheduled_emails")
      .select("lead_id, to_email")
      .in("status", ["pending", "sending", "sent"]);
    const skipLeadIds = new Set((existing ?? []).map((r) => r.lead_id).filter(Boolean));
    const skipEmails = new Set((existing ?? []).map((r) => (r.to_email ?? "").toLowerCase()));

    // Suppressions.
    const { data: suppressed } = await admin.from("email_suppressions").select("email");
    const suppressedSet = new Set((suppressed ?? []).map((r) => (r.email ?? "").toLowerCase()));

    // Bucket and prioritize.
    type Bucketed = Lead & { block: 1 | 2 | 3 };
    const buckets: Bucketed[] = [];
    for (const l of (leads ?? []) as Lead[]) {
      const b = priorityBlock(l);
      if (b === 0) continue;
      if (blockFilter && !blockFilter.includes(b)) continue;
      const email = (l.contact_email ?? "").trim().toLowerCase();
      if (!email) continue;
      if (skipLeadIds.has(l.id)) continue;
      if (skipEmails.has(email)) continue;
      if (suppressedSet.has(email)) continue;
      buckets.push({ ...l, block: b });
    }
    // Sort: block 1 first, then 2, then 3; within block, by agency name for stability.
    buckets.sort((a, b) => a.block - b.block || (a.agency_name ?? "").localeCompare(b.agency_name ?? ""));

    if (buckets.length === 0) {
      return jsonResponse({ ok: true, scheduled: 0, days: 0, templateName });
    }

    // Compute send_at slots: dailyCap per day, evenly spaced inside [startHour, endHour) in tz.
    // Day 0 starts today (clamped to next start of window if we're past endHour).
    const now = new Date();
    const windowMinutes = (endHour - startHour) * 60;
    const slotMinutes = Math.max(1, Math.floor(windowMinutes / dailyCap));

    const daysNeeded = Math.ceil(buckets.length / dailyCap);
    const rows: Array<Record<string, unknown>> = [];

    // Helper: build an ISO timestamp at a given local hour:minute in tz, n days from today.
    // Approximation: we compute the offset of the tz vs UTC at "now" and apply it.
    const tzOffsetMinutes = (() => {
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      const parts = dtf.formatToParts(now).reduce((acc: Record<string, string>, p) => {
        if (p.type !== "literal") acc[p.type] = p.value; return acc;
      }, {});
      const asUtc = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute),
      );
      return Math.round((asUtc - now.getTime()) / 60000);
    })();

    // Today in tz, base = midnight in tz expressed as UTC ms.
    const todayInTz = new Date(now.getTime() + tzOffsetMinutes * 60000);
    const baseUtcMs = Date.UTC(
      todayInTz.getUTCFullYear(), todayInTz.getUTCMonth(), todayInTz.getUTCDate(),
    ) - tzOffsetMinutes * 60000;

    // If we're past endHour today, start tomorrow.
    const currentHourInTz = todayInTz.getUTCHours();
    let dayOffset = currentHourInTz >= endHour ? 1 : 0;

    for (let i = 0; i < buckets.length; i++) {
      const lead = buckets[i];
      const slotInDay = i % dailyCap;
      const dayIdx = Math.floor(i / dailyCap) + dayOffset;
      let minuteInWindow = slotInDay * slotMinutes;
      // For day 0, ensure send_at is in the future and within the window.
      const dayStartMs = baseUtcMs + dayIdx * 86_400_000 + startHour * 3_600_000;
      let sendAtMs = dayStartMs + minuteInWindow * 60_000;
      if (dayIdx === dayOffset && sendAtMs < now.getTime() + 60_000) {
        // Push to the next available slot after now.
        const minutesPastWindowStart = Math.max(0, Math.ceil((now.getTime() + 60_000 - dayStartMs) / 60_000));
        const adjustedSlot = Math.max(slotInDay, Math.ceil(minutesPastWindowStart / slotMinutes));
        minuteInWindow = adjustedSlot * slotMinutes;
        sendAtMs = dayStartMs + minuteInWindow * 60_000;
      }

      const vars = {
        agency_name: lead.agency_name ?? "your agency",
        contact_name: lead.contact_name ?? "",
        contact_name_or_team: lead.contact_name?.trim() || "team",
        hq_country: lead.hq_country ?? "your country",
        hq_city: lead.hq_city ?? "",
        operating_eu_country: lead.operating_eu_country ?? lead.hq_country ?? "Europe",
      };
      rows.push({
        lead_id: lead.id,
        to_email: (lead.contact_email ?? "").trim(),
        subject: render(subjectTpl, vars),
        body: render(bodyTpl, vars),
        send_at: new Date(sendAtMs).toISOString(),
        status: "pending",
        template_name: templateName,
        created_by: userData.user.id,
      });
    }

    // Insert in chunks.
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await admin.from("scheduled_emails").insert(chunk);
      if (error) return jsonResponse({ ok: false, error: error.message, inserted }, 500);
      inserted += chunk.length;
    }

    return jsonResponse({
      ok: true,
      scheduled: inserted,
      days: daysNeeded,
      dailyCap,
      templateName,
      blocks: {
        block1: buckets.filter((b) => b.block === 1).length,
        block2: buckets.filter((b) => b.block === 2).length,
        block3: buckets.filter((b) => b.block === 3).length,
      },
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});