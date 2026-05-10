import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

type Settings = {
  daily_cap: number;
  per_domain_daily_cap: number;
  send_window_start_hour: number;
  send_window_end_hour: number;
  send_window_timezone: string;
  respect_send_window: boolean;
};

function inSendWindow(s: Settings): boolean {
  if (!s.respect_send_window) return true;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: s.send_window_timezone,
    hour: "numeric",
    hour12: false,
  });
  const h = parseInt(fmt.format(new Date()), 10);
  return h >= s.send_window_start_hour && h < s.send_window_end_hour;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("RESEND_FROM_EMAIL") ??
    "Voynova Global Solutions <onboarding@resend.dev>";
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing keys" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load settings + counters
  const { data: s } = await admin.from("email_send_settings").select("*").eq("id", 1).maybeSingle();
  const settings = (s ?? {
    daily_cap: 200, per_domain_daily_cap: 25,
    send_window_start_hour: 8, send_window_end_hour: 19,
    send_window_timezone: "Europe/Belgrade", respect_send_window: true,
  }) as Settings;

  if (!inSendWindow(settings)) {
    return new Response(JSON.stringify({ ok: true, skipped: "outside_send_window" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: counter } = await admin.from("email_sent_today").select("sent_today").maybeSingle();
  let sentToday: number = (counter as any)?.sent_today ?? 0;
  const remaining = Math.max(0, settings.daily_cap - sentToday);
  if (remaining === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "daily_cap_hit", sentToday }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pull due rows
  const batchSize = Math.min(remaining, 20);
  const { data: due } = await admin
    .from("scheduled_emails")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .order("send_at", { ascending: true })
    .limit(batchSize);

  const rows = due ?? [];
  const results: Array<{ id: string; ok: boolean; error?: string; messageId?: string }> = [];

  // Per-domain in-batch counter (cheap heuristic; full per-day per-domain enforced via suppression list + DB query)
  const perDomainBatch = new Map<string, number>();

  for (const row of rows) {
    const domain = String(row.to_email).split("@")[1]?.toLowerCase() ?? "";
    if (!domain) {
      await admin.from("scheduled_emails").update({
        status: "failed", error: "Invalid recipient", attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: "invalid_email" });
      continue;
    }

    // Suppression check
    const { data: sup } = await admin
      .from("email_suppressions").select("email").eq("email", row.to_email.toLowerCase()).maybeSingle();
    if (sup) {
      await admin.from("scheduled_emails").update({
        status: "suppressed", error: "Recipient on suppression list", attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: "suppressed" });
      continue;
    }

    // Per-domain daily cap (lead_outreach_log proxy)
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const { count: domainCount } = await admin
      .from("lead_outreach_log")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", todayStart.toISOString())
      .ilike("note", `%@${domain}%`);
    const inBatch = perDomainBatch.get(domain) ?? 0;
    if ((domainCount ?? 0) + inBatch >= settings.per_domain_daily_cap) {
      // leave pending — try again tomorrow / next cycle
      results.push({ id: row.id, ok: false, error: "per_domain_cap" });
      continue;
    }

    // Mark sending
    await admin.from("scheduled_emails").update({ status: "sending", attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id);

    try {
      const res = await fetch(`${GATEWAY_URL}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: FROM,
          to: [row.to_email],
          subject: row.subject,
          text: row.body,
          headers: { "List-Unsubscribe": "<mailto:unsubscribe@voynovaglobal.com>" },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);

      const nowIso = new Date().toISOString();
      await admin.from("scheduled_emails").update({
        status: "sent", sent_at: nowIso, message_id: (data as any)?.id ?? null, error: null,
      }).eq("id", row.id);

      if (row.lead_id) {
        await admin.from("recruiter_leads").update({
          email_status: "sent", email_sent_at: nowIso,
          resend_message_id: (data as any)?.id ?? null,
          email_delivery_status: "sent",
          email_delivery_updated_at: nowIso,
          email_last_event: "email.sent", email_error: null,
        }).eq("id", row.lead_id);
        await admin.from("lead_outreach_log").insert({
          lead_id: row.lead_id, channel: "email", user_id: row.created_by ?? null,
          note: `[scheduled:${(data as any)?.id ?? "ok"}] ${row.subject}\n\n${row.body}\n\n(sent to ${row.to_email})`,
        });
        if ((data as any)?.id) {
          await admin.from("email_events").insert({
            message_id: (data as any).id, lead_id: row.lead_id,
            event_type: "email.sent", recipient: row.to_email, payload: data,
          });
        }
      } else {
        // log even without lead so per-domain cap counts
        await admin.from("lead_outreach_log").insert({
          lead_id: "00000000-0000-0000-0000-000000000000",
          channel: "email", user_id: row.created_by ?? null,
          note: `[scheduled-adhoc] ${row.subject} (sent to ${row.to_email})`,
        }).then(() => {}, () => {});
      }

      perDomainBatch.set(domain, inBatch + 1);
      sentToday++;
      results.push({ id: row.id, ok: true, messageId: (data as any)?.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send failed";
      const failedAttempts = (row.attempts ?? 0) + 1;
      await admin.from("scheduled_emails").update({
        status: failedAttempts >= 3 ? "failed" : "pending",
        error: msg,
      }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: msg });
    }

    if (sentToday >= settings.daily_cap) break;
  }

  return new Response(JSON.stringify({ ok: true, processed: rows.length, results, sentToday }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});