import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLACEHOLDER_EMAILS = new Set([
  "", "not specified", "not provided", "unknown", "n/a", "none", "null",
]);

const COMMON_TLDS = [".com", ".co", ".net", ".org", ".io", ".rs", ".gr", ".eu"];

function extractDomain(website?: string | null, agency?: string | null): string | null {
  if (website) {
    try {
      const u = new URL(website.startsWith("http") ? website : `https://${website}`);
      return u.host.replace(/^www\./, "").toLowerCase();
    } catch { /* fall through */ }
  }
  if (agency) {
    const slug = agency
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "")
      .trim();
    if (slug.length >= 3) return `${slug}.com`;
  }
  return null;
}

function firstLast(name?: string | null): { first?: string; last?: string } {
  if (!name) return {};
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  const first = parts[0]
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
  const last = parts.length > 1
    ? parts[parts.length - 1]
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z]/g, "")
    : undefined;
  return { first: first || undefined, last };
}

function buildCandidates(domain: string, contactName?: string | null): string[] {
  const { first, last } = firstLast(contactName);
  const out: string[] = [];
  if (first && last) {
    out.push(`${first}.${last}@${domain}`);
    out.push(`${first}@${domain}`);
    out.push(`${first[0]}${last}@${domain}`);
  } else if (first) {
    out.push(`${first}@${domain}`);
  }
  out.push(`info@${domain}`, `contact@${domain}`, `hr@${domain}`, `jobs@${domain}`, `careers@${domain}`, `hello@${domain}`);
  return [...new Set(out)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const mode: "single" | "bulk" = body?.mode === "bulk" ? "bulk" : "single";

    if (mode === "single") {
      const { agency_name, website_url, contact_name } = body ?? {};
      const domain = extractDomain(website_url, agency_name);
      if (!domain) return json({ ok: false, error: "Could not derive domain" });
      const candidates = buildCandidates(domain, contact_name);
      return json({ ok: true, domain, best: candidates[0], candidates });
    }

    // bulk: scan recruiter_leads with missing/placeholder email
    const limit = Math.min(Math.max(Number(body?.limit) || 500, 1), 2000);
    const leadIds: string[] | undefined = Array.isArray(body?.lead_ids) ? body.lead_ids : undefined;
    let query = admin
      .from("recruiter_leads")
      .select("id, agency_name, contact_name, contact_email, website, source_url")
      .limit(limit);
    if (leadIds?.length) {
      query = query.in("id", leadIds.slice(0, 2000));
    } else {
      query = query.eq("status", "active").eq("email_enriched", false);
    }
    const { data: rows, error } = await query;
    if (error) return json({ error: error.message }, 500);

    // Per-invocation cache so multiple leads at the same domain share one derivation.
    const domainCache = new Map<string, string[]>();
    let enriched = 0, skipped = 0, failed = 0;
    for (const r of rows ?? []) {
      const current = (r.contact_email ?? "").trim().toLowerCase();
      const isPlaceholder = !current || PLACEHOLDER_EMAILS.has(current) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current);
      if (!isPlaceholder) {
        await admin.from("recruiter_leads")
          .update({
            email_enriched: true, email_source: "verified",
            last_enrichment_at: new Date().toISOString(), last_enrichment_error: null,
          })
          .eq("id", r.id);
        skipped++;
        continue;
      }
      const domain = extractDomain(r.website ?? r.source_url, r.agency_name);
      if (!domain) {
        await admin.from("recruiter_leads")
          .update({
            email_source: "missing",
            last_enrichment_at: new Date().toISOString(),
            last_enrichment_error: "Could not derive a domain from website / source / agency name",
          })
          .eq("id", r.id);
        failed++;
        continue;
      }
      let candidates = domainCache.get(domain);
      if (!candidates) {
        candidates = buildCandidates(domain, r.contact_name);
        domainCache.set(domain, candidates);
      }
      const { error: upErr } = await admin.from("recruiter_leads")
        .update({
          contact_email: candidates[0],
          email_enriched: true,
          email_source: "guessed",
          last_enrichment_at: new Date().toISOString(),
          last_enrichment_error: null,
        })
        .eq("id", r.id);
      if (upErr) {
        failed++;
        await admin.from("recruiter_leads")
          .update({
            last_enrichment_at: new Date().toISOString(),
            last_enrichment_error: upErr.message.slice(0, 500),
          })
          .eq("id", r.id);
      } else {
        enriched++;
      }
    }

    return json({ ok: true, scanned: rows?.length ?? 0, enriched, already_ok: skipped, failed, cached_domains: domainCache.size });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("enrich-email error", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}