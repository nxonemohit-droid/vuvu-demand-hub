// Drains hm_campaign_sends where scheduled_for <= now and status='pending'.
// Sends via Resend, respects 429 backoff. Cron every minute.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "Mohit Gururani <mohit@voynovaglobal.com>";
const GATEWAY = "https://connector-gateway.lovable.dev/resend";

async function sendEmail(to: string, subject: string, textBody: string): Promise<{ id?: string; error?: string; status: number }> {
  const htmlBody = textBody
    .split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
  const r = await fetch(`${GATEWAY}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html: htmlBody, text: textBody }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: JSON.stringify(j), status: r.status };
  return { id: j?.id || j?.data?.id, status: 200 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) return jsonResponse({ error: "email keys missing" }, 500);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 20);

    const supa = adminClient();
    const now = new Date().toISOString();
    const { data: due } = await supa.from("hm_campaign_sends")
      .select("id,campaign_id,lead_id,to_email,personalized_subject,personalized_body,attempts")
      .eq("status", "pending").lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true }).limit(limit);

    let sent = 0, failed = 0;
    for (const row of due || []) {
      // Check suppression
      const { data: sup } = await supa.from("email_suppressions").select("email").eq("email", row.to_email).maybeSingle();
      if (sup) {
        await supa.from("hm_campaign_sends").update({ status: "skipped", error: "suppressed" }).eq("id", row.id);
        continue;
      }
      await supa.from("hm_campaign_sends").update({ status: "sending", attempts: row.attempts + 1 }).eq("id", row.id);
      const res = await sendEmail(row.to_email, row.personalized_subject, row.personalized_body);
      if (res.status === 200) {
        await supa.from("hm_campaign_sends").update({
          status: "sent", sent_at: new Date().toISOString(), resend_message_id: res.id,
        }).eq("id", row.id);
        await supa.from("hm_leads").update({ status: "sent" }).eq("id", row.lead_id);
        sent++;
      } else if (res.status === 429) {
        // Reschedule +5 min
        await supa.from("hm_campaign_sends").update({
          status: "pending",
          scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          error: `rate-limited ${res.error?.slice(0,120)}`,
        }).eq("id", row.id);
      } else {
        await supa.from("hm_campaign_sends").update({
          status: row.attempts >= 2 ? "failed" : "pending",
          error: res.error?.slice(0, 400),
          scheduled_for: row.attempts >= 2 ? undefined : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }).eq("id", row.id);
        failed++;
      }
      // small pacing between sends within one invocation
      await new Promise((r) => setTimeout(r, 700));
    }

    // Update campaign counts
    if (sent || failed) {
      const campaignIds = [...new Set((due || []).map((d: any) => d.campaign_id))];
      for (const cid of campaignIds) {
        const { count: sentCount } = await supa.from("hm_campaign_sends").select("id", { count: "exact", head: true })
          .eq("campaign_id", cid).eq("status", "sent");
        const { count: failCount } = await supa.from("hm_campaign_sends").select("id", { count: "exact", head: true })
          .eq("campaign_id", cid).eq("status", "failed");
        await supa.from("hm_campaigns").update({
          total_sent: sentCount || 0, total_failed: failCount || 0,
        }).eq("id", cid);
      }
    }

    return jsonResponse({ ok: true, processed: due?.length || 0, sent, failed });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});