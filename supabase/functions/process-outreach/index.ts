import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/supabase.ts";
import { EMPLOYER_PDF_NAME, EMPLOYER_PDF_URL } from "../_shared/employers.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "Voynova <onboarding@resend.dev>";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
const WA_CONNECTOR_KEY = Deno.env.get("WHATSAPP_API_KEY");
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_NAME");

async function sendEmail(to: string, subject: string, body: string, attachProfile = false) {
  // Resend is a gateway-backed connection: RESEND_API_KEY is the connection key, not a provider key.
  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_KEY}`,
      "X-Connection-Api-Key": RESEND_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      text: body,
      html: body.replace(/\n/g, "<br/>"),
      // Employer mails carry the branded company profile + proposal PDF.
      ...(attachProfile
        ? { attachments: [{ path: EMPLOYER_PDF_URL, filename: EMPLOYER_PDF_NAME }] }
        : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).id as string;
}

// Approved Meta template "voynova": image header + "Hello {{1}}" body.
const WA_TEMPLATE_NAME = "voynova";
const WA_HEADER_IMAGE =
  "https://tqzuluaukgwnqbeyvvkc.supabase.co/storage/v1/object/public/voynova-docs/wa-banner.jpg";
void WA_TEMPLATE;

async function sendWhatsapp(to: string, name: string) {
  if (!LOVABLE_KEY || !WA_CONNECTOR_KEY) throw new Error("WhatsApp connector not configured");
  const digits = to.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("WhatsApp number is not valid E.164");
  const cleanName = (name || "there").replace(/[\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 60);
  const payload = {
    messaging_product: "whatsapp",
    to: digits,
    type: "template",
    template: {
      name: WA_TEMPLATE_NAME,
      language: { code: "en" },
      components: [
        { type: "header", parameters: [{ type: "image", image: { link: WA_HEADER_IMAGE } }] },
        { type: "body", parameters: [{ type: "text", text: cleanName }] },
      ],
    },
  };

  const res = await fetch("https://connector-gateway.lovable.dev/whatsapp/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_KEY}`,
      "X-Connection-Api-Key": WA_CONNECTOR_KEY,
      "Content-Type": "application/json",
    },
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

    // Engine switch: a paused engine never calls the mail provider.
    const { data: settings } = await supa
      .from("outreach_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (settings?.status === "paused") {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, paused: true, reason: settings.pause_reason ?? "Engine paused" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: due, error } = await supa
      .from("outreach_sends")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(5);
    if (error) throw error;

    // Which of the due leads are employers? Those mails get the PDF attached.
    const leadIds = [...new Set((due ?? []).map((r) => r.lead_id).filter(Boolean))];
    const employerLeads = new Set<string>();
    const leadNames = new Map<string, string>();
    if (leadIds.length) {
      const { data: leadRows } = await supa.from("leads").select("id, kind, company").in("id", leadIds);
      for (const l of leadRows ?? []) {
        if (l.kind !== "education" && l.kind !== "supply") employerLeads.add(l.id);
        leadNames.set(l.id, l.company ?? "");
      }
    }

    let sent = 0;
    let failed = 0;
    let paused = 0;

    // Per-audience switches: recruiter (supply) vs employer/college email engines.
    const supplyLeads = new Set<string>();
    if (leadIds.length) {
      const { data: kindRows } = await supa.from("leads").select("id, kind").in("id", leadIds);
      for (const l of kindRows ?? []) if (l.kind === "supply") supplyLeads.add(l.id);
    }
    const s = settings as Record<string, unknown> | null;
    const recruiterOn = s?.recruiter_auto_enabled !== false;
    const employerOn = s?.employer_auto_enabled !== false;

    for (const row of due ?? []) {
      if (row.channel === "email" && row.lead_id) {
        const on = supplyLeads.has(row.lead_id) ? recruiterOn : employerOn;
        if (!on) {
          paused++;
          continue;
        }
      }
      if (row.channel === "whatsapp" && (!LOVABLE_KEY || !WA_CONNECTOR_KEY)) {
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
            ? await sendEmail(
              row.to_address,
              row.subject ?? "Voynova Global Solutions",
              row.body,
              employerLeads.has(row.lead_id),
            )
            : await sendWhatsapp(row.to_address, leadNames.get(row.lead_id) ?? "");

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
        const retryable = msg.includes("429") || /\s5\d\d:/.test(msg);
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

    // Circuit breaker: a run of failures pauses the engine with a visible reason.
    if (sent || failed) {
      const streak = sent ? 0 : (settings?.consecutive_failures ?? 0) + failed;
      await supa
        .from("outreach_settings")
        .update({
          consecutive_failures: streak,
          ...(sent ? { last_sent_at: new Date().toISOString() } : {}),
          ...(streak >= 5
            ? { status: "paused", pause_reason: "5 mails in a row failed — check the mail provider and start again." }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
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
