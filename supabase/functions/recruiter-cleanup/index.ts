// Hard-deletes recruiter_leads rows that have no email AND no phone AND no LinkedIn.
// Admin-only: caller must have an admin role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ ok: false, error: "missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonResponse({ ok: false, error: "invalid token" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResponse({ ok: false, error: "admin only" }, 403);

    // Count first so we can return it.
    const noContactFilter = (q: ReturnType<typeof admin.from>) =>
      q.or("contact_email.is.null,contact_email.eq.")
       .or("contact_phone.is.null,contact_phone.eq.")
       .or("contact_linkedin.is.null,contact_linkedin.eq.");

    // Use a single query with raw OR not trivial; do it via select then delete by id.
    const { data: targets, error: selErr } = await admin
      .from("recruiter_leads")
      .select("id, contact_email, contact_phone, contact_linkedin");
    if (selErr) return jsonResponse({ ok: false, error: selErr.message }, 500);

    const toDelete = (targets ?? []).filter((r) => {
      const e = (r.contact_email ?? "").trim();
      const p = (r.contact_phone ?? "").trim();
      const l = (r.contact_linkedin ?? "").trim();
      return !e && !p && !l;
    }).map((r) => r.id);

    if (toDelete.length === 0) {
      return jsonResponse({ ok: true, deleted: 0 });
    }

    // Chunk deletes to avoid huge IN lists.
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 500) {
      const chunk = toDelete.slice(i, i + 500);
      const { error: delErr, count } = await admin
        .from("recruiter_leads")
        .delete({ count: "exact" })
        .in("id", chunk);
      if (delErr) return jsonResponse({ ok: false, error: delErr.message, deleted }, 500);
      deleted += count ?? chunk.length;
    }
    void noContactFilter;
    return jsonResponse({ ok: true, deleted });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});