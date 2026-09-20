import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, extractDomain } from "../_shared/supabase.ts";
import { scoreLead } from "../_shared/markets.ts";

const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const HUNTER_KEY = Deno.env.get("HUNTER_API_KEY");
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

async function scrape(url: string): Promise<string | null> {
  if (!FIRECRAWL_KEY) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const md = data.markdown ?? data.data?.markdown ?? null;
    return md ? String(md).slice(0, 8000) : null;
  } catch {
    return null;
  }
}

type HunterHit = { email: string; name: string | null; role: string | null };

/** Prefer a real decision maker (HR / admissions / owner), else any generic inbox. */
async function hunterEmail(domain: string): Promise<HunterHit | null> {
  if (!HUNTER_KEY || !domain) return null;
  try {
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${HUNTER_KEY}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) {
      console.error(`Hunter ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const emails: Array<Record<string, string>> = data.data?.emails ?? [];
    if (!emails.length) return null;

    const priority = /(hr|human resource|recruit|admission|talent|owner|director|manager|ceo|founder)/i;
    const pick =
      emails.find((e) => priority.test(`${e.position ?? ""} ${e.department ?? ""}`)) ??
      emails.find((e) => e.type === "personal") ??
      emails[0];
    if (!pick?.value) return null;
    return {
      email: pick.value,
      name: [pick.first_name, pick.last_name].filter(Boolean).join(" ") || null,
      role: pick.position ?? null,
    };
  } catch (e) {
    console.error("Hunter error", e);
    return null;
  }
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    sector: { type: ["string", "null"] },
    role: { type: ["string", "null"] },
    contact_name: { type: ["string", "null"] },
    contact_role: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    whatsapp: { type: ["string", "null"] },
    linkedin: { type: ["string", "null"] },
    hiring_signal: { type: ["string", "null"] },
    program_type: { type: ["string", "null"] },
  },
  required: [
    "company", "city", "sector", "role", "contact_name", "contact_role",
    "email", "phone", "whatsapp", "linkedin", "hiring_signal", "program_type",
  ],
};

async function extract(markdown: string, kind: string): Promise<Record<string, string | null>> {
  if (!LOVABLE_KEY) return {};
  const instruction =
    kind === "education"
      ? "This is a college/vocational school page. Extract the institution details, admissions contact, and in program_type describe the short skill course or learn-and-earn programme offered."
      : "This is an employer or recruiter page. Extract the company details, hiring/HR contact, the blue-collar roles they hire for, and a short hiring_signal quote showing they are recruiting.";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_KEY,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      instructions: `${instruction} Return json. Use null for anything not clearly stated on the page. Never invent an email address.`,
      input: [{ role: "user", content: [{ type: "input_text", text: markdown }] }],
      text: { format: { type: "json_schema", name: "lead", strict: true, schema: SCHEMA } },
    }),
  });

  if (!res.ok) {
    console.error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return {};
  }

  // Accumulate the SSE output_text deltas.
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
      } catch { /* partial frame */ }
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 5, 10);
    const supa = adminClient();

    const { data: leads, error } = await supa
      .from("leads")
      .select("*")
      .eq("enriched", false)
      .lt("enrich_attempts", 3)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    if (!leads?.length) {
      return new Response(JSON.stringify({ processed: 0, remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const lead of leads) {
      try {
        const md = lead.source_url ? await scrape(lead.source_url) : null;
        const ai = md ? await extract(md, lead.kind) : {};
        const domain = extractDomain(lead.website ?? lead.source_url);

        let email = ai.email ?? lead.email ?? null;
        let contactName = ai.contact_name ?? lead.contact_name ?? null;
        if (!email && domain) {
          const h = await hunterEmail(domain);
          if (h) {
            email = h.email;
            contactName = contactName ?? h.name;
          }
        }

        const phone = ai.phone ?? lead.phone ?? null;
        const merged = {
          company: ai.company || lead.company,
          city: ai.city ?? lead.city,
          sector: ai.sector ?? lead.sector,
          role: ai.role ?? lead.role,
          contact_name: contactName,
          contact_role: ai.contact_role ?? lead.contact_role,
          email,
          phone,
          whatsapp: ai.whatsapp ?? phone,
          linkedin: ai.linkedin ?? lead.linkedin,
          hiring_signal: ai.hiring_signal ?? lead.hiring_signal,
          program_type: ai.program_type ?? lead.program_type,
          country: lead.country,
          website: lead.website,
        };

        await supa
          .from("leads")
          .update({
            ...merged,
            visa_fit_score: scoreLead(merged),
            enriched: true,
            enrich_attempts: lead.enrich_attempts + 1,
            last_error: null,
          })
          .eq("id", lead.id);
        processed++;
      } catch (e) {
        await supa
          .from("leads")
          .update({ enrich_attempts: lead.enrich_attempts + 1, last_error: String(e).slice(0, 300) })
          .eq("id", lead.id);
      }
    }

    const { count } = await supa
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("enriched", false)
      .lt("enrich_attempts", 3);

    return new Response(JSON.stringify({ processed, remaining: count ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-lead failed", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
