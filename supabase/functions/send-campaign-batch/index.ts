import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderTemplate(
  tpl: string,
  vars: Record<string, string | null | undefined>,
): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => {
    const v = vars[k.toLowerCase()];
    return v == null || v === "" ? "" : String(v);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Allow either an authed admin or a cron call signed with service-role key
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const isCron =
      req.headers.get("x-cron-source") === "campaign-batch" &&
      authHeader === `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!isServiceRole && !isCron) {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const supa = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: u } = await supa.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roleRow } = await admin.from("user_roles").select("role")
        .eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ error: "Admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id : null;
    const maxBatch = Math.min(Math.max(Number(body?.limit) || 100, 1), 500);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) return json({ error: "Email gateway not configured" }, 500);
    const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "Mohit Gururani <mohit@voynovaglobal.com>";

    // pick eligible campaigns
    const campaignFilter = campaignId
      ? admin.from("email_campaigns").select("*").eq("id", campaignId)
      : admin.from("email_campaigns").select("*").eq("status", "active");
    const { data: campaigns, error: cErr } = await campaignFilter;
    if (cErr) return json({ error: cErr.message }, 500);

    let totalSent = 0, totalFailed = 0, totalSkipped = 0;
    const perCampaign: Array<{ id: string; sent: number; failed: number; skipped: number }> = [];

    for (const camp of campaigns ?? []) {
      if (camp.status !== "active" && !campaignId) continue;
      const nowIso = new Date().toISOString();
      const remaining = Math.max((camp.daily_limit ?? 100), 1);
      const { data: emails } = await admin
        .from("campaign_emails")
        .select("id, campaign_id, recruiter_id, email_to, subject, body_html, body_text")
        .eq("campaign_id", camp.id)
        .eq("status", "pending")
        .lte("scheduled_for", nowIso)
        .order("scheduled_for", { ascending: true })
        .limit(Math.min(remaining, maxBatch));

      let sent = 0, failed = 0, skipped = 0;
      for (const e of emails ?? []) {
        // Re-render with latest recruiter data
        let subject = e.subject ?? camp.subject_template ?? "";
        let html = e.body_html ?? camp.body_template ?? "";
        if (e.recruiter_id) {
          const { data: lead } = await admin
            .from("recruiter_leads")
            .select("agency_name, contact_name, hq_country, operating_eu_country, trades")
            .eq("id", e.recruiter_id)
            .maybeSingle();
          if (lead) {
            const vars: Record<string, string> = {
              agency_name: lead.agency_name ?? "",
              first_name: (lead.contact_name ?? "").split(" ")[0] || "there",
              contact_name: lead.contact_name ?? "",
              hq_country: lead.hq_country ?? "",
              eu_country: lead.operating_eu_country ?? "Europe",
              trade: (lead.trades ?? [])[0] ?? "skilled workers",
              trades: (lead.trades ?? []).join(", "),
            };
            subject = renderTemplate(subject, vars);
            html = renderTemplate(html, vars);
          }
        }
        const text = e.body_text ? renderTemplate(e.body_text, {}) : htmlToText(html);

        // Suppression check
        const { data: sup } = await admin
          .from("email_suppressions").select("email").eq("email", e.email_to.toLowerCase()).maybeSingle();
        if (sup) {
          await admin.from("campaign_emails")
            .update({ status: "skipped", error: "suppressed" })
            .eq("id", e.id);
          skipped++;
          continue;
        }

        try {
          const r = await fetch(`${GATEWAY_URL}/emails`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": RESEND_API_KEY,
            },
            body: JSON.stringify({ from, to: [e.email_to], subject, html, text }),
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            await admin.from("campaign_emails")
              .update({ status: "failed", error: `[${r.status}] ${JSON.stringify(data).slice(0, 400)}` })
              .eq("id", e.id);
            failed++;
            continue;
          }
          const messageId = data?.id ?? null;
          await admin.from("campaign_emails")
            .update({ status: "sent", sent_at: new Date().toISOString(), resend_message_id: messageId, error: null })
            .eq("id", e.id);
          if (e.recruiter_id) {
            await admin.from("recruiter_leads").update({
              email_status: "sent",
              email_sent_at: new Date().toISOString(),
              resend_message_id: messageId,
              email_delivery_status: "sent",
              email_delivery_updated_at: new Date().toISOString(),
              email_last_event: "email.sent",
              email_error: null,
            }).eq("id", e.recruiter_id);
            if (messageId) {
              await admin.from("email_events").insert({
                message_id: messageId, lead_id: e.recruiter_id,
                event_type: "email.sent", recipient: e.email_to, payload: data,
              });
            }
          }
          sent++;
          // small spacing
          await new Promise((res) => setTimeout(res, 150));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "send error";
          await admin.from("campaign_emails")
            .update({ status: "failed", error: msg }).eq("id", e.id);
          failed++;
        }
      }

      // refresh counts
      const { count: sentTotal } = await admin
        .from("campaign_emails").select("*", { count: "exact", head: true })
        .eq("campaign_id", camp.id).eq("status", "sent");
      const { count: failedTotal } = await admin
        .from("campaign_emails").select("*", { count: "exact", head: true })
        .eq("campaign_id", camp.id).eq("status", "failed");
      const { count: pendingTotal } = await admin
        .from("campaign_emails").select("*", { count: "exact", head: true })
        .eq("campaign_id", camp.id).eq("status", "pending");
      const newStatus = (pendingTotal ?? 0) === 0 && camp.status === "active" ? "completed" : camp.status;
      await admin.from("email_campaigns").update({
        sent_count: sentTotal ?? 0,
        failed_count: failedTotal ?? 0,
        status: newStatus,
      }).eq("id", camp.id);

      totalSent += sent; totalFailed += failed; totalSkipped += skipped;
      perCampaign.push({ id: camp.id, sent, failed, skipped });
    }

    return json({ ok: true, sent: totalSent, failed: totalFailed, skipped: totalSkipped, campaigns: perCampaign });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("send-campaign-batch error", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}