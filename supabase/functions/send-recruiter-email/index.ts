import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Admin-only sending
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRow } = await adminClient
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Only admins can send emails" }, 403);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Invalid JSON" }, 400);

    let { leadId, to, subject, html, text } = body as {
      leadId?: string;
      to?: string;
      subject?: string;
      html?: string;
      text?: string;
    };
    to = typeof to === "string" ? to.trim() : to;

    if (!to || !subject || (!html && !text)) {
      return json({ error: "Missing to / subject / body" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({ error: `Invalid recipient email: ${JSON.stringify(to)}` }, 400);
    }
    if (subject.length > 300 || (html ?? text ?? "").length > 50000) {
      return json({ error: "Subject or body too long" }, 400);
    }

    // Suppression check
    const { data: sup } = await adminClient
      .from("email_suppressions").select("email,reason").eq("email", to.toLowerCase()).maybeSingle();
    if (sup) {
      return json({ error: `Recipient is suppressed (${sup.reason})` }, 409);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const from =
      Deno.env.get("RESEND_FROM_EMAIL") ??
      "Voynova Global Solutions <onboarding@resend.dev>";

    const payload: Record<string, unknown> = {
      from,
      to: [to],
      subject,
    };
    if (html) payload.html = html;
    if (text) payload.text = text;

    // Throttle to stay under Resend's 2 req/sec limit and retry once on 429.
    async function sendWithRetry(attempt = 0): Promise<Response> {
      const r = await fetch(`${GATEWAY_URL}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": RESEND_API_KEY,
        },
        body: JSON.stringify(payload),
      });
      if (r.status === 429 && attempt < 3) {
        const retryAfter = Number(r.headers.get("retry-after")) || 1;
        await new Promise((res) => setTimeout(res, Math.max(retryAfter * 1000, 600 * (attempt + 1))));
        return sendWithRetry(attempt + 1);
      }
      return r;
    }
    await new Promise((res) => setTimeout(res, 600));
    const res = await sendWithRetry();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend gateway error", res.status, data);
      return json(
        { error: `Resend failed [${res.status}]`, details: data },
        502,
      );
    }

    // Update lead + log outreach using service role to bypass any per-user friction.
    const admin = adminClient;
    const nowIso = new Date().toISOString();
    if (leadId) {
      await admin
        .from("recruiter_leads")
        .update({
          email_status: "sent",
          email_sent_at: nowIso,
          resend_message_id: data?.id ?? null,
          email_delivery_status: "sent",
          email_delivery_updated_at: nowIso,
          email_last_event: "email.sent",
          email_error: null,
        })
        .eq("id", leadId);
      await admin.from("lead_outreach_log").insert({
        lead_id: leadId,
        channel: "email",
        user_id: userId,
        note: `[resend:${data?.id ?? "ok"}] ${subject}\n\n${text ?? html}`,
      });
      if (data?.id) {
        await admin.from("email_events").insert({
          message_id: data.id,
          lead_id: leadId,
          event_type: "email.sent",
          recipient: to,
          payload: data,
        });
      }
    }

    return json({ ok: true, id: data?.id, sent_at: nowIso });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("send-recruiter-email error", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}