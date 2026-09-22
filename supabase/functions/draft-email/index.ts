// Personalised mail + WhatsApp drafting and AI scoring for Voynova leads.
// Employer leads get a blue-collar mobilisation pitch, education leads get a
// student-pipeline pitch. Both are written from the enriched lead profile.
// Uses the workspace Gemini key when available, else the Lovable AI gateway.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/supabase.ts";
import { marketFor } from "../_shared/markets.ts";
import { aiJson, aiProvider } from "../_shared/ai.ts";
import { pitchFor, recruiterMasterEmail } from "../_shared/recruiters.ts";

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
    whatsapp: { type: "string" },
    score: { type: "integer" },
    reason: { type: "string" },
  },
  required: ["subject", "body", "whatsapp", "score", "reason"],
};

type Lead = Record<string, string | number | null>;

function leadFacts(lead: Lead): string {
  const m = marketFor(String(lead.country ?? ""));
  const rows: Array<[string, unknown]> = [
    [
      "Type",
      lead.kind === "education"
        ? "College / vocational institute"
        : lead.kind === "supply"
        ? "Manpower agency / recruitment agent / study-abroad counsellor (supply partner)"
        : "Employer / recruiter",
    ],
    ["Name", lead.company],
    ["Country", lead.country],
    ["City", lead.city],
    ["Sector", lead.sector],
    ["Website", lead.website],
    ["Address", lead.address],
    ["Contact person", lead.contact_name],
    ["Contact role", lead.contact_role],
    ["Email", lead.email],
    ["Phone / WhatsApp", lead.whatsapp ?? lead.phone],
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
    "You write B2B outreach for Voynova Global Solutions Pvt. Ltd. (India), a compliance-first international workforce partner that mobilises skilled and semi-skilled workers and students from India, Nepal and Bangladesh to Europe and the Balkans.",
    "Sender: Mohit Gururani, Founder & CEO.",
    "Tone: warm, consultative, professional. Simple B1-B2 English. Short paragraphs.",
    "Personalise using the facts given: name the organisation, its city, its actual courses or trades, and its country's permit timeline. Never invent facts that are not listed.",
    "Never promise guaranteed jobs, guaranteed visas, salary figures or processing guarantees.",
    "End with ONE clear call to action: a short 15-minute call this week.",
    "Return json with these fields:",
    "subject: email subject line, max 78 characters, no emoji.",
    "body: the email body, 130-200 words, starting with the greeting. No signature block, no sender name, no links — those are appended separately.",
    "whatsapp: a separate WhatsApp first message, max 60 words, friendly, one short intro line plus one question. No formatting markup. End with https://voynovaglobal.com",
    "score: integer 0-100 for how good this lead is for Voynova right now. Judge on: is this really an employer of blue-collar workers or a vocational institute, does the country allow a work or study permit within about two months, is there a reachable decision maker and contact channel, and any hiring signal. A tiny shop, a consultancy, an agency competitor or a country with slow permits scores low.",
    "reason: one short sentence, max 20 words, explaining the score.",
  ];
  if (lead.kind === "supply") {
    const pitch = pitchFor(String(lead.country ?? ""));
    return [
      shared[0],
      shared[1],
      shared[2],
      shared[4],
      "This is a B2B supply partner — a manpower agency, recruitment agent, study-abroad consultant or visa counsellor in a source country. The rest of the email (who we are, features, supplier dashboard, commercials) is a fixed block added after your text, so DO NOT repeat it.",
      `Country context for ${lead.country ?? "South Asia"}: ${pitch.corridor} ${pitch.ask} ${pitch.proof}`,
      "Return json with these fields:",
      "subject: email subject line, max 78 characters, no emoji. Name the agency and the offer, for example 'Europe job orders for <Agency> — Serbia, Latvia, Estonia'.",
      "body: ONLY the opening of the email — the greeting line plus 2 to 4 sentences, 60-90 words. Say who Mohit is, and personalise with the agency name, its city, what kind of partner it is and why it fits our Europe job orders and Learn & Earn seats. Use only the facts given, never invent. Do not list features, do not mention charges, do not add a signature, do not add links, do not write a closing line.",
      "whatsapp: a separate WhatsApp first message, max 60 words, friendly, one short intro line plus one question. Mention Europe job orders and that the supplier dashboard is free, and that service charges apply on placements. End with https://voynovaglobal.com",
      "score: integer 0-100 for how good this supply partner is. Judge on: do they actually mobilise blue-collar workers or students abroad, are they licensed or registered with the local regulator, do they cover our source countries, and is a decision maker reachable.",
      "reason: one short sentence, max 20 words, explaining the score.",
    ].join(" ");
  }
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

type Draft = { subject: string; body: string; whatsapp: string; score: number | null; reason: string | null };

/** Deterministic fallback so drafting never blocks the campaign. */
function fallback(lead: Lead): Draft {
  const first = String(lead.contact_name ?? "").trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hello,";
  const hello = first ? `Hello ${first}` : "Hello";
  const company = lead.company ?? "your team";
  const country = lead.country ?? "Europe";
  const m = marketFor(String(country));

  if (lead.kind === "supply") {
    const pitch = pitchFor(String(country));
    const opening = `${greeting}

I am Mohit Gururani, Founder of Voynova Global Solutions Pvt. Ltd. I am writing to ${company}${lead.city ? ` in ${lead.city}` : ""} because your team works on overseas deployment, and we have live Europe job orders that match that profile. ${pitch.corridor}`;
    return {
      subject: `Europe job orders for ${company} — Serbia, Latvia, Estonia`,
      body: `${recruiterMasterEmail({ opening, company: String(company), country: String(country) })}

Best regards,`,
      whatsapp: `${hello}, this is Mohit from Voynova Global Solutions. We have live Europe job orders (Latvia, Serbia, Cyprus, Estonia) plus Learn & Earn college seats. Your supplier dashboard on our platform is free; service charges apply only on placements. Can we talk 15 minutes this week about ${company}? https://voynovaglobal.com`,
      score: null,
      reason: null,
    };
  }

  if (lead.kind === "education") {
    return {
      subject: `Student pipeline from India & Nepal for ${company}`,
      body: `${greeting}

I am Mohit Gururani from Voynova Global Solutions. We prepare and place students from India and Nepal into short skill and vocational programmes in ${country}${lead.city ? `, including ${lead.city}` : ""}.

${lead.programs ? `Your ${lead.programs} courses match what our applicants are looking for.` : ""} We handle document preparation, English readiness and visa paperwork, so your admissions team only receives complete files.

Would a 15-minute call this week work to agree intake numbers and entry requirements?

Best regards,`,
      whatsapp: `${hello}, this is Mohit from Voynova Global Solutions. We prepare students from India and Nepal for short skill programmes in ${country}. Can we send ${company} a first batch of screened applicants? More: https://voynovaglobal.com`,
      score: null,
      reason: null,
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
    whatsapp: `${hello}, this is Mohit from Voynova Global Solutions. We supply vetted ${lead.trades ?? lead.sector ?? "blue-collar"} workers from India and Nepal to employers in ${country}, with permits and visas handled end to end. Would you like a shortlist for ${company}? More: https://voynovaglobal.com`,
    score: null,
    reason: null,
  };
}

async function draft(lead: Lead): Promise<Draft> {
  const out = await aiJson(instructionFor(lead), leadFacts(lead), SCHEMA);
  if (!out?.subject || !out?.body) return fallback(lead);
  const fb = fallback(lead);
  const rawScore = Number(out.score);
  return {
    subject: String(out.subject),
    body: String(out.body),
    whatsapp: out.whatsapp ? String(out.whatsapp) : fb.whatsapp,
    score: Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null,
    reason: out.reason ? String(out.reason).slice(0, 200) : null,
  };
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

    const drafts: Array<
      { id: string; company: string; subject: string; body: string; whatsapp: string; score: number | null; reason: string | null }
    > = [];

    for (const lead of leads ?? []) {
      if (!redraft && !leadIds && lead.draft_body) continue;
      const d = await draft(lead as Lead);
      const full = `${d.body.trimEnd()}\n\n${SIGNATURE}`;
      drafts.push({ id: lead.id, company: lead.company, ...d, body: full });
      if (!preview) {
        await supa
          .from("leads")
          .update({
            draft_subject: d.subject,
            draft_body: full,
            draft_whatsapp: d.whatsapp,
            drafted_at: new Date().toISOString(),
            ...(d.score !== null ? { ai_score: d.score, ai_reason: d.reason } : {}),
          })
          .eq("id", lead.id);
      }
    }

    const { count } = await supa
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("email", "is", null)
      .is("draft_body", null)
      .neq("stage", "rejected");

    return new Response(
      JSON.stringify({ drafted: drafts.length, remaining: count ?? 0, provider: aiProvider(), drafts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("draft-email failed", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
