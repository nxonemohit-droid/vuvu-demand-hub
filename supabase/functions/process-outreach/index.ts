import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/supabase.ts";
import { attachmentFor } from "../_shared/employers.ts";
import { lookupWhatsAppTemplate, WHATSAPP_GATEWAY } from "../_shared/whatsapp-template.ts";
import type { TemplateState } from "../_shared/whatsapp-template-policy.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "Voynova <onboarding@resend.dev>";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
const WA_CONNECTOR_KEY = Deno.env.get("WHATSAPP_API_KEY");

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachment: { path: string; filename: string } | null = null,
) {
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
      // Each lead type gets its own profile PDF (employer / recruiter / supplier).
      ...(attachment ? { attachments: [attachment] } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).id as string;
}

const WA_LINK = "https://voynovaglobal.com";

const clean = (s: string, max: number) =>
  s.replace(/[\n\t\r]+/g, " ").replace(/\s{4,}/g, "   ").replace(/\s{2,}/g, " ").trim().slice(0, max);

type WaLead = { kind?: string | null; company?: string | null; country?: string | null };

async function sendWhatsapp(to: string, lead: WaLead, draft: string, state: TemplateState) {
  if (!LOVABLE_KEY || !WA_CONNECTOR_KEY || !state.can_send || !state.language) {
    throw new Error("WhatsApp connector or approved template not configured");
  }
  const digits = to.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("WhatsApp number is not valid E.164");
  const name = clean(lead.company || "", 60);
  const detail = clean(
    draft ||
      `${name ? `Dear ${name}, ` : ""}Voynova Global Solutions supplies trained blue-collar workers from India, Nepal and Bangladesh to European employers, with full compliance support.`,
    400,
  );
  const payload = {
    messaging_product: "whatsapp",
    to: digits,
    type: "template",
    template: {
      name: state.name,
      language: { code: state.language },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: clean(lead.company || "there", 60) },
            { type: "text", text: detail },
            { type: "text", text: WA_LINK },
          ],
        },
      ],
    },
  };

  const res = await fetch(`${WHATSAPP_GATEWAY}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_KEY}`,
      "X-Connection-Api-Key": WA_CONNECTOR_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${text}`);
  const id = JSON.parse(text).messages?.[0]?.id;
  if (!id) throw new Error(`WhatsApp did not accept the message: ${text}`);
  return id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = adminClient();
    const body: unknown = await req.json().catch(() => ({}));
    const options = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const whatsappOnly = options.channel === "whatsapp";
    const runLimit = whatsappOnly ? Math.max(1, Math.min(5, Number(options.limit) || 3)) : 5;
    if (whatsappOnly) {
      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      const { data: auth } = await supa.auth.getUser(token ?? "");
      if (!auth.user) return new Response(JSON.stringify({ error: "Sign in to run WhatsApp queue" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Check the actual connected account every run; never trust the secret as proof
    // of approval. Exclude held WhatsApp rows so they cannot starve due emails.
    const { state: whatsappTemplate } = await lookupWhatsAppTemplate();
    let dueQuery = supa
      .from("outreach_sends")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(60);
    if (whatsappOnly && !whatsappTemplate.can_send) return new Response(JSON.stringify({
      sent: 0, failed: 0, paused: true, whatsapp_template: whatsappTemplate,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (whatsappOnly) dueQuery = dueQuery.eq("channel", "whatsapp");
    else if (!whatsappTemplate.can_send) dueQuery = dueQuery.eq("channel", "email");
    const { data: due, error } = await dueQuery;
    if (error) throw error;

    // Which of the due leads are employers? Those mails get the PDF attached.
    const leadIds = [...new Set((due ?? []).map((r) => r.lead_id).filter(Boolean))];
    const attachments = new Map<string, { path: string; filename: string } | null>();
    const waLeads = new Map<string, WaLead>();
    if (leadIds.length) {
      const { data: leadRows } = await supa.from("leads").select("id, kind, company, country").in("id", leadIds);
      for (const l of leadRows ?? []) {
        attachments.set(l.id, attachmentFor(l.kind, l.country));
        waLeads.set(l.id, l);
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

    let attempted = 0;
    for (const row of due ?? []) {
      if (attempted >= runLimit) break;
      // Per-audience pause applies to BOTH channels: pausing a panel stops its
      // emails and its WhatsApp messages (supply → recruiter switch, else employer).
      if ((row.channel === "email" || row.channel === "whatsapp") && row.lead_id) {
        const on = supplyLeads.has(row.lead_id) ? recruiterOn : employerOn;
        if (!on) {
          paused++;
          continue;
        }
      }
      if (row.channel === "whatsapp" && !whatsappTemplate.can_send) {
        paused++;
        continue;
      }
      if (row.channel === "email" && !RESEND_KEY) {
        paused++;
        continue;
      }
      attempted++;
      try {
        const id =
          row.channel === "email"
            ? await sendEmail(
              row.to_address,
              row.subject ?? "Voynova Global Solutions",
              row.body,
              attachments.get(row.lead_id) ?? null,
            )
            : await sendWhatsapp(row.to_address, waLeads.get(row.lead_id) ?? {}, row.body ?? "", whatsappTemplate);

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
            error: msg,
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

    return new Response(JSON.stringify({ sent, failed, paused, due: due?.length ?? 0, whatsapp_template: whatsappTemplate }), {
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
