import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/supabase.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "Voynova <onboarding@resend.dev>";
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_NAME");

async function sendEmail(to: string, subject: string, body: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      text: body,
      html: body.replace(/\n/g, "<br/>"),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).id as string;
}

async function sendWhatsapp(to: string, body: string) {
  if (!WA_PHONE_ID || !WA_TOKEN) throw new Error("WhatsApp not configured");
  const digits = to.replace(/[^\d]/g, "");
  const payload = WA_TEMPLATE
    ? {
        messaging_product: "whatsapp",
        to: digits,
        type: "template",
        template: {
          name: WA_TEMPLATE,
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: body.slice(0, 900) }] }],
        },
      }
    : { messaging_product: "whatsapp", to: digits, type: "text", text: { body: body.slice(0, 4000) } };

  const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).messages?.[0]?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = adminClient();
    const { data: due, error } = await supa
      .from("outreach_sends")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(5);
    if (error) throw error;

    let sent = 0;
    let failed = 0;
    let paused = 0;

    for (const row of due ?? []) {
      if (row.channel === "whatsapp" && (!WA_PHONE_ID || !WA_TOKEN)) {
        paused++;
        continue;
      }
      if (row.channel === "email" && !RESEND_KEY) {
        paused++;
        continue;
      }
      try {
        const id =
          row.channel === "email"
            ? await sendEmail(row.to_address, row.subject ?? "Voynova Global Solutions", row.body)
            : await sendWhatsapp(row.to_address, row.body);

        await supa
          .from("outreach_sends")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_message_id: id,
            attempts: row.attempts + 1,
            error: null,
          })
          .eq("id", row.id);

        await supa
          .from("leads")
          .update({ stage: "contacted" })
          .eq("id", row.lead_id)
          .eq("stage", "new");

        sent++;
      } catch (e) {
        const msg = String(e);
        const retryable = msg.includes("429") || msg.includes("5 0") || /\s5\d\d:/.test(msg);
        const attempts = row.attempts + 1;
        await supa
          .from("outreach_sends")
          .update({
            attempts,
            error: msg.slice(0, 400),
            status: retryable && attempts < 3 ? "pending" : "failed",
            scheduled_for: retryable && attempts < 3
              ? new Date(Date.now() + 10 * 60000).toISOString()
              : row.scheduled_for,
          })
          .eq("id", row.id);
        failed++;
      }
      await new Promise((r) => setTimeout(r, 700));
    }

    return new Response(JSON.stringify({ sent, failed, paused, due: due?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-outreach failed", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
