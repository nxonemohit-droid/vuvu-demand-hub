import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/supabase.ts";
import { marketFor } from "../_shared/markets.ts";
import { pitchFor, recruiterWhatsApp } from "../_shared/recruiters.ts";

const IST_OFFSET_MIN = 330;
const WINDOW_START = 9;
const WINDOW_END = 18;

/** Next valid send slot at/after `from`, inside Mon–Fri 09:00–18:00 IST. */
function nextSlot(from: Date): Date {
  const d = new Date(from.getTime());
  for (let i = 0; i < 24 * 14; i++) {
    const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
    const day = ist.getUTCDay();
    const hour = ist.getUTCHours();
    if (day >= 1 && day <= 5 && hour >= WINDOW_START && hour < WINDOW_END) return d;
    // jump to the next window opening
    const next = new Date(ist.getTime());
    if (day === 0 || day === 6 || hour >= WINDOW_END) {
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours(WINDOW_START, 0, 0, 0);
    } else {
      next.setUTCHours(WINDOW_START, 0, 0, 0);
    }
    d.setTime(next.getTime() - IST_OFFSET_MIN * 60000);
  }
  return d;
}

const SIGNATURE = `Mohit Gururani
Founder & CEO | Voynova Global Solutions Pvt. Ltd.
Bridging Indian & Nepali talent with global opportunities
https://voynovaglobal.com | https://voy-nova-profiles.live/company-profile`;

function emailFor(lead: Record<string, string | null>) {
  // Supply partners keep their personalised AI draft; employers and colleges
  // get the dedicated audience templates below (owner's choice).
  if (lead.kind === "supply" && lead.draft_body) {
    return {
      subject: lead.draft_subject ?? `Voynova Global Solutions — ${lead.company ?? "partnership"}`,
      body: lead.draft_body,
    };
  }
  const first = (lead.contact_name ?? "").trim().split(/\s+/)[0];
  const greeting = first ? `Dear ${first},` : "Dear Hiring Team,";
  const company = lead.company ?? "your team";
  const country = lead.country ?? "Europe";
  const market = marketFor(country);
  const sector = lead.sector ? ` in ${lead.sector}` : "";

  if (lead.kind === "supply") {
    const pitch = pitchFor(country);
    return {
      subject: `${country} partnership: Europe job orders & Learn and Earn seats`,
      body: `${greeting}

I am reaching out from Voynova Global Solutions. ${pitch.corridor}

${pitch.ask}

Two things we can share with ${company} from week one: our live Europe job orders for blue-collar trades, and Learn & Earn college seats where students study and work alongside. ${pitch.proof}

Would a 15-minute call this week work to share our current requirements?

Best regards,
${SIGNATURE}`,
    };
  }

  if (lead.kind === "education") {
    const admissions = first ? `Dear ${first},` : "Dear Admissions Team,";
    return {
      subject: `International students from India, Nepal, Bangladesh & Sri Lanka for ${company}`,
      body: `${admissions}

I am Mohit Gururani from Voynova Global Solutions, India. We work as a student recruitment partner for colleges and training institutes in ${country}.

We would like to send ${company} international students from India, Nepal, Bangladesh and Sri Lanka${lead.program_type ? ` for your ${lead.program_type} programmes` : ""}.

How we support your admissions team:
- Pre-screened applicants: academic records, English level and genuine study intent checked
- Complete files: application forms, documents and translations ready before submission
- Visa paperwork support and pre-departure briefing for every student
- Arrival and settling-in coordination, so students start on time

We can start with a small pilot batch for your next intake and grow from there.

Could you share your intake dates, entry requirements and student recruitment terms? A 15-minute call this week would also work well.

Best regards,
${SIGNATURE}`,
    };
  }

  return {
    subject: `Skilled workers for ${company} — from India, Nepal, Bangladesh & Sri Lanka`,
    body: `${greeting}

I am Mohit Gururani from Voynova Global Solutions, India. We supply screened skilled and semi-skilled workers from India, Nepal, Bangladesh and Sri Lanka to employers in ${country}${sector}.

${lead.hiring_signal ? `I noticed ${company} is currently hiring, so this may be good timing.` : `If ${company} is planning to hire this season, we would be glad to help.`}

What we provide:
- Candidates for construction, welding, factory, warehouse, hospitality, cleaning, agriculture and driving roles
- Screening, trade tests and video interviews before you select anyone
- Full documentation, work permit and visa paperwork support${market ? ` (${market.permit} in ${country})` : ""}
- Travel, arrival and onboarding support
- Ethical hiring: workers pay no recruitment fee

We can share a first shortlist of CVs within 7–10 days after we receive your requirement. Small batches and large volumes are both fine.

Could you send me the roles and number of workers you need? I will share matching profiles. Our company profile is attached.

Best regards,
${SIGNATURE}`,
  };
}

function whatsappFor(lead: Record<string, string | null>) {
  if (lead.draft_whatsapp) return lead.draft_whatsapp;
  const first = (lead.contact_name ?? "").trim().split(/\s+/)[0];
  const hello = first ? `Hello ${first}` : "Hello";
  const company = lead.company ?? "your company";
  if (lead.kind === "supply") {
    return recruiterWhatsApp({ hello, company, country: lead.country ?? "your country" });
  }
  if (lead.kind === "education") {
    return `${hello}, this is Mohit from Voynova Global Solutions. We place students from India and Nepal into short skill programmes in ${lead.country}. Can we send ${company} a first batch of screened applicants? More: https://voynovaglobal.com`;
  }
  return `${hello}, this is Mohit from Voynova Global Solutions. We supply vetted ${lead.sector ?? "blue-collar"} workers from India and Nepal to employers in ${lead.country}, with permits and visas handled end to end. Would you like a shortlist for ${company}? More: https://voynovaglobal.com`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const leadIds: string[] | null = Array.isArray(body.lead_ids) && body.lead_ids.length
      ? body.lead_ids
      : null;
    const allowedChannels = new Set(["email", "whatsapp"]);
    const channels: string[] = Array.isArray(body.channels) && body.channels.length
      ? body.channels.filter((channel: unknown): channel is string =>
          typeof channel === "string" && allowedChannels.has(channel)
        )
      : ["email", "whatsapp"];
    if (!channels.length) {
      return new Response(JSON.stringify({ error: "Choose email or WhatsApp" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const dailyCap = Math.min(Number(body.daily_cap) || 50, 200);
    const dryRun = body.dry_run === true;

    const supa = adminClient();

    // Optional filter so a campaign can target only one audience
    // (employer / education / supply partners).
    const kinds: string[] = Array.isArray(body.kinds)
      ? body.kinds.filter((k: unknown): k is string =>
          k === "employer" || k === "education" || k === "supply"
        )
      : [];

    let q = supa.from("leads").select("*").neq("stage", "rejected").is("merged_into", null);
    if (leadIds) q = q.in("id", leadIds);
    if (kinds.length) q = q.in("kind", kinds);
    // Email-only runs: skip leads without an email so the 1000-row page is not wasted.
    if (channels.length === 1 && channels[0] === "email") q = q.not("email", "is", null);
    const { data: leads, error } = await q.limit(1000);
    if (error) throw error;

    // Suppression list
    const { data: suppressed } = await supa.from("email_suppressions").select("email");
    const blocked = new Set((suppressed ?? []).map((s: { email: string }) => s.email.toLowerCase()));

    // Already queued/sent (paged — default select caps at 1000 rows)
    const already = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supa
        .from("outreach_sends")
        .select("lead_id, channel")
        .range(from, from + 999);
      for (const r of (page ?? []) as { lead_id: string; channel: string }[]) {
        already.add(`${r.lead_id}:${r.channel}`);
      }
      if (!page || page.length < 1000) break;
    }

    // Email runs 24x7 for every audience (owner's choice); WhatsApp keeps the office window.
    void nextSlot;

    const result: Record<string, number> = { email: 0, whatsapp: 0, skipped: 0 };
    const rows: Record<string, unknown>[] = [];

    for (const channel of channels) {
      const noWindow = channel === "email";
      const slot = (d: Date) => (noWindow ? d : nextSlot(d));
      const override = Math.min(Math.max(Number(body.gap_seconds) || 0, 0), 600);
      const gap = override || (channel === "email" ? 35 : 120);
      // continue after the last thing already queued on this channel
      const { data: last } = await supa
        .from("outreach_sends")
        .select("scheduled_for")
        .eq("channel", channel)
        .order("scheduled_for", { ascending: false })
        .limit(1);
      let cursor = slot(
        new Date(Math.max(Date.now() + 60000, last?.[0] ? new Date(last[0].scheduled_for).getTime() + gap * 1000 : 0)),
      );
      let perDay = 0;
      let dayKey = cursor.toISOString().slice(0, 10);

      for (const lead of leads ?? []) {
        const to = channel === "email" ? lead.email : (lead.whatsapp ?? lead.phone);
        if (!to) { result.skipped++; continue; }
        if (channel === "email" && blocked.has(String(to).toLowerCase())) { result.skipped++; continue; }
        if (already.has(`${lead.id}:${channel}`)) { result.skipped++; continue; }

        const key = cursor.toISOString().slice(0, 10);
        if (key !== dayKey) { dayKey = key; perDay = 0; }
        if (!noWindow && perDay >= dailyCap) {
          const tomorrow = new Date(cursor.getTime());
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          tomorrow.setUTCHours(3, 30, 0, 0); // 09:00 IST
          cursor = slot(tomorrow);
          dayKey = cursor.toISOString().slice(0, 10);
          perDay = 0;
        }

        const content = channel === "email" ? emailFor(lead) : { subject: null, body: whatsappFor(lead) };
        rows.push({
          lead_id: lead.id,
          channel,
          to_address: String(to),
          subject: content.subject,
          body: content.body,
          scheduled_for: cursor.toISOString(),
          status: "pending",
        });
        result[channel]++;
        perDay++;
        cursor = slot(new Date(cursor.getTime() + gap * 1000));
      }
    }

    if (!dryRun && rows.length) {
      const { error: insErr } = await supa
        .from("outreach_sends")
        .upsert(rows, { onConflict: "lead_id,channel", ignoreDuplicates: true });
      if (insErr) throw insErr;
    }

    return new Response(
      JSON.stringify({
        ...result,
        dry_run: dryRun,
        sample: rows.slice(0, 2),
        first_send: rows[0]?.scheduled_for ?? null,
        last_send: rows[rows.length - 1]?.scheduled_for ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("schedule-outreach failed", e);
    const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null
      ? JSON.stringify(e)
      : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
