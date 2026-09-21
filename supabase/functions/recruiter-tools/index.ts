// Recruiter engine tools: priority scoring, duplicate detection and merging
// for supply partners (manpower agencies, agents, study / visa counsellors).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/supabase.ts";
import { dedupeKeys, detectPartnerType, priorityFor } from "../_shared/recruiters.ts";

type Lead = Record<string, unknown> & { id: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Fields we copy from a duplicate into the primary when the primary is empty. */
const MERGE_FIELDS = [
  "website", "city", "sector", "role", "contact_name", "contact_role", "email", "phone",
  "whatsapp", "linkedin", "address", "opening_hours", "place_id", "email_source",
  "profile_summary", "programs", "trades", "workforce_size", "intake_info", "notes",
  "supply_capacity", "partner_type",
];

async function loadPartners(supa: ReturnType<typeof adminClient>) {
  const { data, error } = await supa
    .from("leads")
    .select("*")
    .eq("kind", "supply")
    .is("merged_into", null)
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as Lead[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "score");
    const supa = adminClient();

    if (action === "score") {
      const leads = await loadPartners(supa);
      let updated = 0;
      for (const lead of leads) {
        const partnerType = String(lead.partner_type ?? "") || detectPartnerType(lead);
        const p = priorityFor({ ...lead, partner_type: partnerType });
        const keys = dedupeKeys(lead);
        const { error } = await supa
          .from("leads")
          .update({
            partner_type: partnerType,
            priority_score: p.score,
            priority_reason: p.reason,
            supply_capacity: lead.supply_capacity ?? p.capacity,
            dedupe_key: keys[0] ?? null,
          })
          .eq("id", lead.id);
        if (!error) updated++;
      }
      return json({ scored: updated, total: leads.length });
    }

    if (action === "duplicates") {
      const leads = await loadPartners(supa);
      const byKey = new Map<string, Lead[]>();
      for (const lead of leads) {
        for (const key of dedupeKeys(lead)) {
          const list = byKey.get(key) ?? [];
          list.push(lead);
          byKey.set(key, list);
        }
      }
      // Build groups, avoiding the same pair appearing under several keys.
      const seen = new Set<string>();
      const groups: Array<{ key: string; reason: string; leads: Lead[] }> = [];
      for (const [key, list] of byKey) {
        if (list.length < 2) continue;
        const ids = list.map((l) => l.id).sort();
        const sig = ids.join("|");
        if (seen.has(sig)) continue;
        seen.add(sig);
        const reason = key.startsWith("email:")
          ? "Same email"
          : key.startsWith("phone:")
          ? "Same phone number"
          : key.startsWith("site:")
          ? "Same website"
          : "Same agency name";
        groups.push({
          key,
          reason,
          leads: list
            .map((l) => ({
              id: l.id,
              company: l.company,
              country: l.country,
              city: l.city,
              email: l.email,
              phone: l.whatsapp ?? l.phone,
              website: l.website,
              contact_name: l.contact_name,
              priority_score: l.priority_score,
              stage: l.stage,
              created_at: l.created_at,
            }) as unknown as Lead)
            .sort((a, b) => Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0)),
        });
      }
      groups.sort((a, b) => b.leads.length - a.leads.length);
      return json({ groups: groups.slice(0, 200), total_groups: groups.length });
    }

    if (action === "merge") {
      const primaryId = String(body.primary_id ?? "");
      const duplicateIds: string[] = Array.isArray(body.duplicate_ids) ? body.duplicate_ids : [];
      if (!primaryId || !duplicateIds.length) {
        return json({ error: "primary_id and duplicate_ids are required" }, 400);
      }

      const { data: rows, error } = await supa
        .from("leads")
        .select("*")
        .in("id", [primaryId, ...duplicateIds]);
      if (error) throw error;
      const primary = (rows ?? []).find((r) => r.id === primaryId) as Lead | undefined;
      if (!primary) return json({ error: "Primary lead not found" }, 404);
      const dupes = (rows ?? []).filter((r) => r.id !== primaryId) as Lead[];

      const patch: Record<string, unknown> = {};
      for (const field of MERGE_FIELDS) {
        const current = primary[field];
        if (current !== null && current !== undefined && String(current).trim() !== "") continue;
        const donor = dupes.find(
          (d) => d[field] !== null && d[field] !== undefined && String(d[field]).trim() !== "",
        );
        if (donor) patch[field] = donor[field];
      }
      const merged = { ...primary, ...patch };
      const p = priorityFor(merged);
      patch.priority_score = p.score;
      patch.priority_reason = p.reason;

      const { error: upErr } = await supa.from("leads").update(patch).eq("id", primaryId);
      if (upErr) throw upErr;

      const { error: mergeErr } = await supa
        .from("leads")
        .update({ merged_into: primaryId, merged_at: new Date().toISOString(), stage: "rejected" })
        .in("id", dupes.map((d) => d.id));
      if (mergeErr) throw mergeErr;

      return json({ merged: dupes.length, primary_id: primaryId, fields_filled: Object.keys(patch) });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("recruiter-tools failed", e);
    return json({ error: String(e) }, 500);
  }
});
