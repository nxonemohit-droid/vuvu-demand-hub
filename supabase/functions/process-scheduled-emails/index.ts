import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  DEFAULT_SETTINGS,
  effectiveDailyCap,
  EngineSettings,
  isSendableNow,
} from "../_shared/sequence-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

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
  const settings: EngineSettings = { ...DEFAULT_SETTINGS, ...(s ?? {}) } as EngineSettings;

  const { data: counter } = await admin
    .from("email_sent_today")
    .select("sent_today, sent_last_hour")
    .maybeSingle();
  let sentToday: number = (counter as any)?.sent_today ?? 0;
  const sentLastHour: number = (counter as any)?.sent_last_hour ?? 0;

  const dailyCap = effectiveDailyCap(settings);
  const remaining = Math.max(0, dailyCap - sentToday);
  if (remaining === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "daily_cap_hit", sentToday }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let hourlyRemaining = Math.max(0, settings.hourly_cap - sentLastHour);
  if (hourlyRemaining === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "hourly_cap_hit", sentLastHour }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pull due rows
  const batchSize = Math.min(remaining, hourlyRemaining, 20);
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
    // Reply-stop: if the lead already replied, cancel pending rows for them.
    if (settings.reply_stop_enabled && row.lead_id) {
      const { data: lead } = await admin
        .from("recruiter_leads")
        .select("replied_at,email_status")
        .eq("id", row.lead_id)
        .maybeSingle();
      if (lead && (lead.replied_at || lead.email_status === "replied")) {
        await admin.from("scheduled_emails").update({
          status: "cancelled",
          cancelled_reason: "reply_stop",
          blocking_reason: "replied",
          blocked_at: new Date().toISOString(),
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, error: "reply_stop" });
        continue;
      }
    }

    // Country-aware window + weekend skip (defer, don't fail).
    const windowCheck = isSendableNow(settings, row.recipient_country ?? null);
    if (!windowCheck.ok) {
      await admin.from("scheduled_emails").update({
        blocking_reason: windowCheck.reason ?? "outside_window",
        blocked_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: windowCheck.reason });
      continue;
    }

    const domain = String(row.to_email).split("@")[1]?.toLowerCase() ?? "";
    if (!domain) {
      await admin.from("scheduled_emails").update({
        status: "failed", error: "Invalid recipient",
        blocking_reason: "missing_email", blocked_at: new Date().toISOString(),
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: "invalid_email" });
      continue;
    }

    // Suppression check
    const { data: sup } = await admin
      .from("email_suppressions").select("email").eq("email", row.to_email.toLowerCase()).maybeSingle();
    if (sup) {
      await admin.from("scheduled_emails").update({
        status: "suppressed", error: "Recipient on suppression list",
        blocking_reason: "suppressed", blocked_at: new Date().toISOString(),
        attempts: (row.attempts ?? 0) + 1,
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
      await admin.from("scheduled_emails").update({
        blocking_reason: "per_domain_cap", blocked_at: new Date().toISOString(),
      }).eq("id", row.id);
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
      hourlyRemaining--;
      results.push({ id: row.id, ok: true, messageId: (data as any)?.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send failed";
      const failedAttempts = (row.attempts ?? 0) + 1;
      await admin.from("scheduled_emails").update({
        status: failedAttempts >= 3 ? "failed" : "pending",
        error: msg,
        blocking_reason: failedAttempts >= 3 ? `provider_error: ${msg.slice(0, 200)}` : null,
        blocked_at: failedAttempts >= 3 ? new Date().toISOString() : null,
      }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: msg });
    }

    if (sentToday >= dailyCap || hourlyRemaining <= 0) break;
  }

  return new Response(JSON.stringify({
    ok: true, processed: rows.length, results, sentToday, dailyCap, hourlyRemaining,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});