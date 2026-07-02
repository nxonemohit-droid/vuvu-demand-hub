// Generate 3 email template variants for HM Mauritius admissions campaign via Lovable AI.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

const SIGNATURE = `

Warm regards,
Mohit Gururani
Founder & CEO | Voynova Global Solutions Pvt. Ltd.
Bridging Indian & Nepali Talent with Global Opportunities
🌐 https://voynovaglobal.com
🏢 Company profile: https://voy-nova-profiles.live/company-profile
`.trim();

const SYSTEM = `You write B2B outreach emails for Voynova Global Solutions.
Voynova places hotel management students & graduates from India (NE + Uttarakhand) and Nepal into hospitality jobs in Mauritius.
Zero worker-fee, full compliance, visa + travel support, staged placements.
Tone: professional but warm, B1-B2 English, no jargon.
Always include:
- 1 clear CTA (reply / call / book meeting)
- Merge tags: {{first_name}}, {{institute}}, {{region}}, {{role}} (use where relevant)
- The signature block will be appended automatically — do NOT include one.
Return JSON: { "variants": [ {"name":"V1 Formal Institute Partnership","subject":"...","body":"..."}, {"name":"V2 Warm Consultancy Referral","subject":"...","body":"..."}, {"name":"V3 Short Student/Passout","subject":"...","body":"..."} ] }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_KEY) return jsonResponse({ error: "LOVABLE_API_KEY missing" }, 500);
    const body = await req.json().catch(() => ({}));
    const notes: string = body.notes || "";

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Generate the 3 variants for the HM Mauritius Admissions campaign (target 500 admissions). Extra notes from operator: ${notes || "none"}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return jsonResponse({ error: `AI gateway ${r.status}: ${t}` }, r.status === 429 ? 429 : 500);
    }
    const j = await r.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content || "{}");
    const variants = (parsed.variants || []).slice(0, 3).map((v: any) => ({
      name: v.name || "",
      subject: v.subject || "",
      body: `${v.body || ""}\n\n${SIGNATURE}`,
    }));
    return jsonResponse({ ok: true, variants });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});