import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Webhook } from "https://esm.sh/svix@1.24.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

/**
 * Resend inbound webhook — fires when a recipient REPLIES to one of our
 * outreach emails. We look up the original lead by message_id (Resend
 * threads via In-Reply-To / References headers) or by sender email, then
 * mark the lead as replied and stop any active sequence.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const raw = await req.text();

  let evt: any;
  try {
    if (secret) {
      const wh = new Webhook(secret);
      evt = wh.verify(raw, {
        "svix-id": req.headers.get("svix-id") ?? "",
        "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
        "svix-signature": req.headers.get("svix-signature") ?? "",
      });
    } else {
      evt = JSON.parse(raw);
    }
  } catch (e) {
    console.error("inbound signature verify failed", e);
    return new Response("Invalid signature", { status: 401 });
  }

  const data = evt?.data ?? evt ?? {};
  const fromEmail: string | undefined =
    data?.from?.email ?? data?.from ?? data?.envelope?.from;
  const inReplyTo: string | undefined =
    data?.in_reply_to ?? data?.headers?.["in-reply-to"] ?? data?.headers?.["In-Reply-To"];
  const references: string | undefined =
    data?.references ?? data?.headers?.references ?? data?.headers?.References;
  const text: string = data?.text ?? data?.body_text ?? data?.snippet ?? "";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve lead: 1) by sender email, 2) by message_id from In-Reply-To/References
  let leadId: string | null = null;

  if (fromEmail) {
    const { data: lead } = await admin
      .from("recruiter_leads")
      .select("id")
      .ilike("contact_email", fromEmail)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }

  if (!leadId) {
    const idCandidate =
      inReplyTo?.replace(/[<>]/g, "").split("@")[0] ??
      references?.split(/\s+/)[0]?.replace(/[<>]/g, "").split("@")[0];
    if (idCandidate) {
      const { data: lead } = await admin
        .from("recruiter_leads")
        .select("id")
        .eq("resend_message_id", idCandidate)
        .maybeSingle();
      leadId = lead?.id ?? null;
    }
  }

  if (!leadId) {
    console.log("inbound: could not resolve lead", { fromEmail, inReplyTo });
    return new Response(JSON.stringify({ ok: true, matched: false }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nowIso = new Date().toISOString();

  await admin.from("recruiter_leads").update({
    replied_at: nowIso,
    email_last_event: "email.replied",
  }).eq("id", leadId);

  await admin.from("email_events").insert({
    lead_id: leadId,
    event_type: "email.replied",
    recipient: fromEmail ?? null,
    payload: evt,
  });

  await admin.from("lead_outreach_log").insert({
    lead_id: leadId,
    channel: "email_reply",
    note: `[REPLY from ${fromEmail ?? "?"}]\n\n${(text ?? "").slice(0, 4000)}`,
  });

  // Stop any pending scheduled emails to this lead
  await admin.from("scheduled_emails").update({
    status: "cancelled", error: "stopped: lead replied",
  }).eq("lead_id", leadId).eq("status", "pending");

  return new Response(JSON.stringify({ ok: true, leadId }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});