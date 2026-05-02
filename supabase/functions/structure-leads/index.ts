// Take unstructured raw_signals, ask Lovable AI to extract structured fields,
// score urgency, tag priority, create demand_leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const URGENCY_KEYWORDS = ["urgent","urgent hiring","bulk hiring","visa sponsorship","immediate","immediately","asap","walk in","walk-in","mass hiring"];
const EU_PRIORITY = ["Serbia","Romania","Poland","Germany","Malta","Greece"];

function score(lead: any, rawText: string): { urgency: number; priority: "high"|"medium"|"low"; matched: string[] } {
  const t = (rawText || "").toLowerCase();
  const matched = URGENCY_KEYWORDS.filter(k => t.includes(k));
  let s = 0;
  s += matched.length * 18;
  if (lead.demand_size && lead.demand_size >= 5) s += 15;
  if (lead.demand_size && lead.demand_size >= 20) s += 15;
  if (lead.contact_email || lead.contact_phone) s += 20;
  if (lead.visa_sponsorship) s += 10;
  if (EU_PRIORITY.includes(lead.country)) s += 10;
  s = Math.max(0, Math.min(100, s));
  const priority = s >= 65 ? "high" : s >= 35 ? "medium" : "low";
  return { urgency: s, priority, matched };
}

async function aiStructure(rawText: string, source: string): Promise<any | null> {
  if (!LOVABLE_API_KEY) return null;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You extract employer hiring demand from scraped text. Return ONLY via the tool. Set unknown fields to null. Country must be one of: Serbia, Romania, Poland, Germany, Malta, Greece, or other." },
        { role: "user", content: `Source: ${source}\n\nRaw item:\n${rawText.slice(0, 6000)}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_demand",
          description: "Extract structured employer demand",
          parameters: {
            type: "object",
            properties: {
              employer_name: { type: ["string","null"] },
              role: { type: "string", description: "blue-collar role e.g. mason, plumber, nurse" },
              country: { type: "string" },
              city: { type: ["string","null"] },
              demand_size: { type: ["integer","null"], description: "number of workers needed" },
              salary_min: { type: ["number","null"] },
              salary_max: { type: ["number","null"] },
              salary_currency: { type: ["string","null"] },
              contact_name: { type: ["string","null"] },
              contact_email: { type: ["string","null"] },
              contact_phone: { type: ["string","null"] },
              visa_sponsorship: { type: "boolean" },
              is_employer_demand: { type: "boolean", description: "true only if this is a real employer hiring need" },
            },
            required: ["role","country","visa_sponsorship","is_employer_demand"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_demand" } },
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try { return JSON.parse(args); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(body.limit ?? 30, 80);

    const { data: signals, error } = await supabase
      .from("raw_signals").select("*").eq("structured", false).order("created_at", { ascending: true }).limit(limit);
    if (error) throw error;

    let created = 0, skipped = 0;
    for (const s of signals ?? []) {
      const extracted = await aiStructure(s.raw_text || "", s.source);
      if (!extracted || !extracted.is_employer_demand) {
        await supabase.from("raw_signals").update({ structured: true }).eq("id", s.id);
        skipped++;
        continue;
      }
      const sc = score(extracted, s.raw_text || "");
      const { error: insErr } = await supabase.from("demand_leads").insert({
        raw_signal_id: s.id,
        source: s.source,
        source_url: s.source_url,
        employer_name: extracted.employer_name,
        role: (extracted.role || "unknown").toLowerCase(),
        country: extracted.country || "Unknown",
        city: extracted.city,
        demand_size: extracted.demand_size,
        salary_min: extracted.salary_min,
        salary_max: extracted.salary_max,
        salary_currency: extracted.salary_currency,
        contact_name: extracted.contact_name,
        contact_email: extracted.contact_email,
        contact_phone: extracted.contact_phone,
        visa_sponsorship: !!extracted.visa_sponsorship,
        urgency_score: sc.urgency,
        priority: sc.priority,
        matched_keywords: sc.matched,
      });
      if (!insErr) created++;
      await supabase.from("raw_signals").update({ structured: true }).eq("id", s.id);
    }

    // Fire Hunter enrichment for newly-created leads missing email
    if (created > 0) {
      fetch(`${SUPABASE_URL}/functions/v1/hunter-enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ limit: Math.min(created, 10) }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true, processed: signals?.length ?? 0, created, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});