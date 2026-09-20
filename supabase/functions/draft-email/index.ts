// Personalised mail drafting for Voynova leads.
// Employer leads get a blue-collar mobilisation pitch, education leads get a
// student-pipeline pitch. Both are written from the enriched lead profile.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/supabase.ts";
import { marketFor } from "../_shared/markets.ts";

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

const SIGNATURE = `Mohit Gururani
Founder & CEO | Voynova Global Solutions Pvt. Ltd.
Bridging Indian & Nepali talent with global opportunities
https://voynovaglobal.com | https://voy-nova-profiles.live/company-profile`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
};

type Lead = Record<string, string | number | null>;

function leadFacts(lead: Lead): string {
  const m = marketFor(String(lead.country ?? ""));
  const rows: Array<[string, unknown]> = [
    ["Type", lead.kind === "education" ? "College / vocational institute" : "Employer / recruiter"],
    ["Name", lead.company],
    ["Country", lead.country],
    ["City", lead.city],
    ["Sector", lead.sector],
    ["Website", lead.website],
    ["Address", lead.address],
    ["Contact person", lead.contact_name],
    ["Contact role", lead.contact_role],
    ["What they do", lead.profile_summary],
    ["Courses offered", lead.programs],
    ["Programme type", lead.program_type],
    ["Intake info", lead.intake_info],
    ["Trades they employ", lead.trades],
    ["Workforce size", lead.workforce_size],
    ["Hiring signal", lead.hiring_signal],
    ["Work permit route", m ? `${m.permit}, typically ${m.days}` : null],
  ];
  return rows
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function instructionFor(lead: Lead): string {
  const shared = [
    "You write B2B outreach email for Voynova Global Solutions Pvt. Ltd. (India), a compliance-first international workforce partner that mobilises skilled and semi-skilled workers and students from India, Nepal and Bangladesh to Europe and the Balkans.",
    "Sender: Mohit Gururani, Founder & CEO.",
    "Tone: warm, consultative, professional. Simple B1-B2 English. Short paragraphs, 130-200 words.",
    "Personalise using the facts given: name the organisation, its city, its actual courses or trades, and its country's permit timeline. Never invent facts that are not listed.",
    "Never promise guaranteed jobs, guaranteed visas, salary figures or processing guarantees.",
    "End with ONE clear call to action: a short 15-minute call this week.",
    "Do not include a signature block, the sender name, or links in the body — those are appended separately.",
    "Return json with a subject line (max 78 characters, no emoji) and the email body starting with the greeting.",
  ];
  if (lead.kind === "education") {
    shared.push(
      "Angle: Voynova can send this institute screened, document-ready applicants from India and Nepal for their short skill / vocational programmes, handling document preparation, English readiness and visa paperwork so admissions receive complete files.",
    );
  } else {
    shared.push(
      "Angle: Voynova can supply vetted, trade-tested blue-collar workers for the trades this employer actually uses, handling screening, documents, permit and visa paperwork, travel and arrival support. Workers pay no placement fee — the model is employer-funded and compliance-first. First shortlist in 7-10 days.",
    );
  }
  return shared.join(" ");
}

/** Deterministic fallback so drafting never blocks the campaign. */
function fallback(lead: Lead) {
  const first = String(lead.contact_name ?? "").trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hello,";
  const company = lead.company ?? "your team";
  const country = lead.country ?? "Europe";
  const m = marketFor(String(country));
  if (lead.kind === "education") {
    return {
      subject: `Student pipeline from India & Nepal for ${company}`,
      body: `${greeting}

I am Mohit Gururani from Voynova Global Solutions. We prepare and place students from India and Nepal into short skill and vocational programmes in ${country}${lead.city ? `, including ${lead.city}` : ""}.

${lead.programs ? `Your ${lead.programs} courses match what our applicants are looking for.` : ""} We handle document preparation, English readiness and visa paperwork, so your admissions team only receives complete files.

Would a 15-minute call this week work to agree intake numbers and entry requirements?

Best regards,`,
    };
  }
  return {
    subject: `Work-ready ${lead.trades ?? lead.sector ?? "blue-collar"} workers for ${company}`,
    body: `${greeting}

I am Mohit Gururani from Voynova Global Solutions. We supply vetted blue-collar workers from India and Nepal to employers in ${country}${lead.city ? ` and around ${lead.city}` : ""}.

${lead.trades ? `For trades like ${lead.trades}, ` : ""}we handle screening and trade testing, documents, permit and visa paperwork, travel and arrival support. Workers pay no placement fee — our side is employer-funded and compliance-first.${m ? ` ${country} issues its permit in roughly ${m.days} (${m.permit}), subject to approval by the competent authority.` : ""}

We can usually present a first shortlist within 7-10 days of your requirement.

Would a 15-minute call this week work to share profiles and rates?

Best regards,`,
  };
}

async function draft(lead: Lead): Promise<{ subject: string; body: string }> {
  if (!LOVABLE_KEY) return fallback(lead);

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
      store: false,
      instructions: instructionFor(lead),
      input: [{ role: "user", content: [{ type: "input_text", text: leadFacts(lead) }] }],
      text: { format: { type: "json_schema", name: "mail", strict: true, schema: SCHEMA } },
    }),
  });

  if (!res.ok) {
    console.error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return fallback(lead);
  }

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
    const out = JSON.parse(text);
    if (out?.subject && out?.body) return { subject: String(out.subject), body: String(out.body) };
  } catch { /* fall through */ }
  return fallback(lead);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const leadIds: string[] | null = Array.isArray(body.lead_ids) && body.lead_ids.length
      ? body.lead_ids
      : null;
    const limit = Math.min(Number(body.limit) || 5, 10);
    const redraft = body.redraft === true;
    const preview = body.preview === true;

    const supa = adminClient();
    let q = supa.from("leads").select("*").neq("stage", "rejected");
    if (leadIds) q = q.in("id", leadIds);
    else {
      q = q.not("email", "is", null).order("visa_fit_score", { ascending: false }).limit(limit);
      if (!redraft) q = q.is("draft_body", null);
    }
    const { data: leads, error } = await q;
    if (error) throw error;

    const drafts: Array<{ id: string; company: string; subject: string; body: string }> = [];
    for (const lead of leads ?? []) {
      if (!redraft && !leadIds && lead.draft_body) continue;
      const d = await draft(lead as Lead);
      const full = `${d.body.trimEnd()}\n\n${SIGNATURE}`;
      drafts.push({ id: lead.id, company: lead.company, subject: d.subject, body: full });
      if (!preview) {
        await supa
          .from("leads")
          .update({ draft_subject: d.subject, draft_body: full, drafted_at: new Date().toISOString() })
          .eq("id", lead.id);
      }
    }

    const { count } = await supa
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("email", "is", null)
      .is("draft_body", null)
      .neq("stage", "rejected");

    return new Response(JSON.stringify({ drafted: drafts.length, remaining: count ?? 0, drafts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("draft-email failed", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
