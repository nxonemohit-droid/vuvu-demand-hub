import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Webhook } from "https://esm.sh/svix@1.24.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

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
    console.error("Webhook signature verification failed", e);
    return new Response("Invalid signature", { status: 401 });
  }

  const type: string = evt?.type ?? "unknown";
  const data = evt?.data ?? {};
  const messageId: string | undefined = data?.email_id ?? data?.id;
  const recipient: string | undefined = Array.isArray(data?.to) ? data.to[0] : data?.to;

  console.log("Resend webhook event", type, messageId);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Map event types to delivery status
  const statusMap: Record<string, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.failed": "failed",
  };
  const newStatus = statusMap[type] ?? type;

  // Find the lead by message id
  let leadId: string | null = null;
  if (messageId) {
    const { data: lead } = await admin
      .from("recruiter_leads")
      .select("id")
      .eq("resend_message_id", messageId)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }

  // Log event
  await admin.from("email_events").insert({
    message_id: messageId ?? null,
    lead_id: leadId,
    event_type: type,
    recipient: recipient ?? null,
    payload: evt,
  });

  // Only progress to "stronger" terminal states (don't overwrite delivered with sent)
  const rank: Record<string, number> = {
    sent: 1, delayed: 2, opened: 3, clicked: 4, delivered: 5,
    bounced: 9, complained: 9, failed: 9,
  };

  if (leadId) {
    const { data: current } = await admin
      .from("recruiter_leads")
      .select("email_delivery_status")
      .eq("id", leadId)
      .maybeSingle();
    const currentRank = rank[current?.email_delivery_status ?? ""] ?? 0;
    const newRank = rank[newStatus] ?? 0;
    if (newRank >= currentRank) {
      const update: Record<string, unknown> = {
        email_delivery_status: newStatus,
        email_delivery_updated_at: new Date().toISOString(),
        email_last_event: type,
      };
      if (type === "email.bounced" || type === "email.failed") {
        update.email_error = data?.bounce?.message ?? data?.reason ?? type;
      }
      if (type === "email.complained") {
        update.email_error = "Recipient marked as spam";
      }
      await admin.from("recruiter_leads").update(update).eq("id", leadId);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});