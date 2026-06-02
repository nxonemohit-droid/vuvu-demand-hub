// Periodic sweeper: clears blocking_reason for rows that have become sendable,
// re-enriches missing emails, applies reply-stop, and discards permanently broken rows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { DEFAULT_SETTINGS, EngineSettings } from "../_shared/sequence-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNRESOLVED_VAR_RE = /\{\{\s*[\w.]+\s*\}\}/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const { data: s } = await admin
    .from("email_send_settings").select("*").eq("id", 1).maybeSingle();
  const settings: EngineSettings = { ...DEFAULT_SETTINGS, ...(s ?? {}) } as EngineSettings;
  if (!settings.auto_unblock_enabled) {
    return json({ ok: true, skipped: "auto_unblock_disabled" });
  }

  // Pull stuck pending rows (blocked > 30 min OR has blocking_reason but still pending).
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stuck } = await admin
    .from("scheduled_emails")
    .select("*")
    .eq("status", "pending")
    .or(`blocked_at.lt.${cutoff},blocking_reason.not.is.null`)
    .limit(200);

  const rows = stuck ?? [];
  const summary = {
    scanned: rows.length,
    reenriched: 0,
    rerendered: 0,
    reply_stopped: 0,
    discarded: 0,
    cleared: 0,
  };

  // Gather leads needing re-enrichment in one batch.
  const needsEnrich: string[] = [];

  for (const row of rows) {
    // Reply-stop sweep.
    if (settings.reply_stop_enabled && row.lead_id) {
      const { data: lead } = await admin
        .from("recruiter_leads")
        .select("replied_at,email_status,contact_email,contact_name")
        .eq("id", row.lead_id)
        .maybeSingle();
      if (lead && (lead.replied_at || lead.email_status === "replied")) {
        await admin.from("scheduled_emails").update({
          status: "cancelled",
          cancelled_reason: "reply_stop",
          blocking_reason: "replied",
          blocked_at: new Date().toISOString(),
        }).eq("id", row.id);
        summary.reply_stopped++;
        continue;
      }

      // Missing email → enrich.
      const toBad = !row.to_email || !EMAIL_RE.test(row.to_email);
      if (toBad && lead?.contact_email && EMAIL_RE.test(lead.contact_email)) {
        await admin.from("scheduled_emails").update({
          to_email: lead.contact_email,
          blocking_reason: null,
          blocked_at: null,
          unblocked_at: new Date().toISOString(),
        }).eq("id", row.id);
        summary.cleared++;
        continue;
      }
      if (toBad) {
        needsEnrich.push(row.lead_id);
        continue;
      }

      // Unresolved template var → try to render from lead.
      const hay = `${row.subject ?? ""}\n${row.body ?? ""}`;
      if (UNRESOLVED_VAR_RE.test(hay) && lead?.contact_name) {
        const first = (lead.contact_name as string).split(/\s+/)[0] ?? "";
        const rendered = {
          subject: (row.subject ?? "").replace(/\{\{\s*first_name\s*\}\}/gi, first),
          body: (row.body ?? "").replace(/\{\{\s*first_name\s*\}\}/gi, first),
        };
        if (!UNRESOLVED_VAR_RE.test(`${rendered.subject}\n${rendered.body}`)) {
          await admin.from("scheduled_emails").update({
            subject: rendered.subject,
            body: rendered.body,
            blocking_reason: null,
            blocked_at: null,
            unblocked_at: new Date().toISOString(),
          }).eq("id", row.id);
          summary.rerendered++;
          continue;
        }
      }
    }

    // Discard permanently broken rows: bad email AND no lead.
    if ((!row.to_email || !EMAIL_RE.test(row.to_email)) && !row.lead_id) {
      await admin.from("scheduled_emails").update({
        status: "cancelled",
        cancelled_reason: "permanently_broken",
        blocking_reason: "missing_email",
        blocked_at: new Date().toISOString(),
      }).eq("id", row.id);
      summary.discarded++;
      continue;
    }

    // Clear stale per_domain_cap / outside_window flags so the next tick reconsiders.
    if (row.blocking_reason && ["per_domain_cap", "outside_window", "weekend"].includes(row.blocking_reason)) {
      await admin.from("scheduled_emails").update({
        blocking_reason: null, blocked_at: null,
        unblocked_at: new Date().toISOString(),
      }).eq("id", row.id);
      summary.cleared++;
    }
  }

  // Batch-invoke enrichment for any pending rows that need it.
  if (needsEnrich.length > 0) {
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/enrich-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SVC_KEY}`,
        },
        body: JSON.stringify({ lead_ids: Array.from(new Set(needsEnrich)).slice(0, 50) }),
      });
      summary.reenriched = needsEnrich.length;
      if (!res.ok) console.warn("enrich-email batch returned", res.status);
    } catch (e) {
      console.warn("enrich-email batch failed", e);
    }
  }

  return json({ ok: true, summary });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}