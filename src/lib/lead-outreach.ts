import { sectorLabel, type Lead } from "@/lib/lead-shape";

/**
 * Build a recommended outreach email tailored for Voynova's blue-collar
 * recruitment pitch (S. Asia → EU/Balkans). Picks angle based on sectors,
 * worker-origin focus, and audience type (employer vs agent vs platform).
 */
export function buildOutreachTemplate(lead: Lead): { subject: string; body: string } {
  const company = lead.employer_name?.trim() || "your team";
  const contactFirst = (lead.contact_name ?? "").trim().split(/\s+/)[0] || "";
  const greeting = contactFirst ? `Hi ${contactFirst},` : `Hello ${company} team,`;
  const country = lead.country || "your market";
  const role = (lead.role || "blue-collar roles").toLowerCase();

  const sectors = (lead.sector_tags ?? [])
    .map(sectorLabel)
    .filter(Boolean)
    .slice(0, 2)
    .join(" and ");
  const sectorLine = sectors ? ` in ${sectors}` : "";

  const origins = (lead.worker_origin_focus ?? []).filter(Boolean);
  const originLine = origins.length
    ? origins.join(", ")
    : "India, Nepal and Bangladesh";

  const audience = lead.target_audience_type ?? "";
  let pitch = "";
  if (audience === "employer_direct") {
    pitch =
      `I noticed ${company} is hiring for ${role}${sectorLine} in ${country}. ` +
      `At Voynova Global Solutions we place vetted, work-ready blue-collar workers from ${originLine} ` +
      `with EU and Balkan employers — including full visa, permit and onboarding support.`;
  } else if (audience === "recruitment_agency" || audience === "agent") {
    pitch =
      `I saw ${company} works on ${role} placements${sectorLine} in ${country}. ` +
      `Voynova Global Solutions can be your supply partner from ${originLine}: pre-screened blue-collar candidates, ` +
      `language-ready, with documentation and visa workflow handled end-to-end.`;
  } else {
    pitch =
      `I came across your post about ${role}${sectorLine} in ${country}. ` +
      `Voynova Global Solutions specialises in connecting employers in Europe with vetted blue-collar workers ` +
      `from ${originLine}, including full compliance and visa sponsorship support.`;
  }

  const demand = lead.demand_size && lead.demand_size > 1
    ? `\n\nIf the requirement is around ${lead.demand_size} workers, we can typically present a shortlist within 7–10 days.`
    : "\n\nWe can usually present a first shortlist within 7–10 days of a brief.";

  const subject = lead.employer_name
    ? `Vetted blue-collar workers for ${lead.employer_name} — ${country}`
    : `Vetted blue-collar workers for ${country} (${role})`;

  const body =
    `${greeting}\n\n${pitch}${demand}\n\n` +
    `Would a 15-minute call this week make sense to share profiles and rates?\n\n` +
    `Best regards,\n` +
    `Voynova Global Solutions\n` +
    `International blue-collar recruitment · India · Nepal · Bangladesh → EU & Balkans`;

  return { subject, body };
}