// Distribute selected hm_leads into hm_campaign_sends respecting cap+gap+window.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

function nextSendWindow(from: Date, startH: number, endH: number, skipWeekends: boolean, tz = "Asia/Kolkata"): Date {
  // Work in IST offset (+05:30) since Deno tz DB is limited.
  const IST_OFFSET_MIN = 330;
  const d = new Date(from.getTime());
  for (let i = 0; i < 30; i++) {
    const istMs = d.getTime() + IST_OFFSET_MIN * 60000;
    const ist = new Date(istMs);
    const day = ist.getUTCDay();
    const hour = ist.getUTCHours();
    if (skipWeekends && (day === 0 || day === 6)) {
      // jump to next Monday 09:00 IST
      const add = day === 6 ? 2 : 1;
      ist.setUTCDate(ist.getUTCDate() + add);
      ist.setUTCHours(startH, 0, 0, 0);
      return new Date(ist.getTime() - IST_OFFSET_MIN * 60000);
    }
    if (hour < startH) {
      ist.setUTCHours(startH, 0, 0, 0);
      return new Date(ist.getTime() - IST_OFFSET_MIN * 60000);
    }
    if (hour >= endH) {
      ist.setUTCDate(ist.getUTCDate() + 1);
      ist.setUTCHours(startH, 0, 0, 0);
      // loop again to check weekend
      d.setTime(ist.getTime() - IST_OFFSET_MIN * 60000);
      continue;
    }
    return d;
  }
  return d;
}

function personalize(tpl: string, lead: any): string {
  const first = (lead.contact_name || "").split(/\s+/)[0] || "Team";
  return tpl
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*institute\s*\}\}/gi, lead.name || "")
    .replace(/\{\{\s*region\s*\}\}/gi, lead.region || lead.state || "your region")
    .replace(/\{\{\s*role\s*\}\}/gi, lead.contact_role || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const campaignId: string = body.campaign_id;
    const leadIds: string[] = body.lead_ids || [];
    if (!campaignId || !leadIds.length) return jsonResponse({ error: "campaign_id and lead_ids required" }, 400);

    const supa = adminClient();
    const { data: camp, error: cErr } = await supa.from("hm_campaigns").select("*").eq("id", campaignId).single();
    if (cErr || !camp) return jsonResponse({ error: cErr?.message || "campaign missing" }, 404);

    const variants = [
      { i: 1, subject: camp.template_1_subject, body: camp.template_1_body },
      { i: 2, subject: camp.template_2_subject, body: camp.template_2_body },
      { i: 3, subject: camp.template_3_subject, body: camp.template_3_body },
    ].filter((v) => v.subject && v.body);
    if (!variants.length) return jsonResponse({ error: "no templates set" }, 400);

    // Get leads with emails, not already in this campaign
    const { data: leads } = await supa.from("hm_leads")
      .select("id,name,region,state,contact_name,contact_role,email")
      .in("id", leadIds).not("email", "is", null);
    const { data: existing } = await supa.from("hm_campaign_sends")
      .select("lead_id").eq("campaign_id", campaignId);
    const already = new Set((existing || []).map((r: any) => r.lead_id));
    const fresh = (leads || []).filter((l: any) => !already.has(l.id));

    // Find latest scheduled_for for this campaign to append after
    const { data: last } = await supa.from("hm_campaign_sends")
      .select("scheduled_for").eq("campaign_id", campaignId)
      .order("scheduled_for", { ascending: false }).limit(1).maybeSingle();

    const startFrom = last?.scheduled_for ? new Date(last.scheduled_for) : new Date();
    let cursor = nextSendWindow(new Date(Math.max(Date.now(), startFrom.getTime() + 1000)), camp.send_window_start_hour, camp.send_window_end_hour, camp.skip_weekends);

    const gapMs = camp.gap_seconds * 1000;
    const dailyCap = camp.daily_cap;
    let sentToday = 0;
    let currentDay = new Date(cursor).toISOString().slice(0,10);

    const rows: any[] = [];
    for (const lead of fresh) {
      const v = variants[Math.floor(Math.random() * variants.length)];
      rows.push({
        campaign_id: campaignId,
        lead_id: lead.id,
        template_variant: v.i,
        scheduled_for: cursor.toISOString(),
        to_email: lead.email,
        personalized_subject: personalize(v.subject, lead),
        personalized_body: personalize(v.body, lead),
        status: "pending",
      });
      sentToday++;
      cursor = new Date(cursor.getTime() + gapMs);
      if (sentToday >= dailyCap) {
        // jump to next day start window
        const next = new Date(cursor.getTime() + 24*3600*1000);
        cursor = nextSendWindow(next, camp.send_window_start_hour, camp.send_window_end_hour, camp.skip_weekends);
        sentToday = 0;
        currentDay = cursor.toISOString().slice(0,10);
      } else {
        cursor = nextSendWindow(cursor, camp.send_window_start_hour, camp.send_window_end_hour, camp.skip_weekends);
        const day = cursor.toISOString().slice(0,10);
        if (day !== currentDay) { sentToday = 0; currentDay = day; }
      }
    }

    if (rows.length) {
      const { error } = await supa.from("hm_campaign_sends").insert(rows);
      if (error) return jsonResponse({ error: error.message }, 500);
    }

    await supa.from("hm_campaigns").update({
      status: "scheduled",
      total_queued: (camp.total_queued || 0) + rows.length,
    }).eq("id", campaignId);

    await supa.from("hm_leads").update({ status: "queued" }).in("id", fresh.map((l:any) => l.id));

    return jsonResponse({
      ok: true, queued: rows.length, skipped: leadIds.length - rows.length,
      first_send: rows[0]?.scheduled_for || null,
      last_send: rows[rows.length - 1]?.scheduled_for || null,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});