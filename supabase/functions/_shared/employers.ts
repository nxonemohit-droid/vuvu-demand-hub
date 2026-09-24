// Employer (demand side) outreach: the detailed, compliance-safe proposal body.
// The AI writes only the personalised opening; everything below is fixed so every
// European employer receives the same complete, accurate proposal.

import { marketFor } from "./markets.ts";

/** Public link to the company profile + proposal PDF attached to employer mails. */
export const EMPLOYER_PDF_URL =
  "https://tqzuluaukgwnqbeyvvkc.supabase.co/storage/v1/object/public/voynova-docs/voynova-employer-profile-proposal.pdf";

export const EMPLOYER_PDF_NAME = "Voynova-Company-Profile-and-Employer-Proposal.pdf";

const DOCS = "https://tqzuluaukgwnqbeyvvkc.supabase.co/storage/v1/object/public/voynova-docs";

/**
 * Picks the right profile PDF for a lead:
 * employer → country employer proposal, supply (agency) → recruiter profile,
 * education (college) → supplier profile. Returns null when nothing fits.
 */
export function attachmentFor(
  kind: string | null | undefined,
  country: string | null | undefined,
): { path: string; filename: string } | null {
  const c = (country ?? "").trim().toLowerCase();
  if (kind === "education") {
    return { path: `${DOCS}/voynova-supplier.pdf`, filename: "Voynova-Supplier-and-College-Partner-Profile.pdf" };
  }
  if (kind === "supply") {
    if (["india", "nepal", "bangladesh"].includes(c)) {
      const n = c[0].toUpperCase() + c.slice(1);
      return { path: `${DOCS}/voynova-recruiter-${c}.pdf`, filename: `Voynova-Recruitment-Partner-Profile-${n}.pdf` };
    }
    return null;
  }
  if (["latvia", "estonia", "cyprus"].includes(c)) {
    const n = c[0].toUpperCase() + c.slice(1);
    return { path: `${DOCS}/voynova-employer-${c}.pdf`, filename: `Voynova-Employer-Proposal-${n}.pdf` };
  }
  return { path: EMPLOYER_PDF_URL, filename: EMPLOYER_PDF_NAME };
}

export function employerMasterEmail(opts: {
  opening: string;
  company: string;
  country: string;
  trades?: string | null;
  sector?: string | null;
}): string {
  const market = marketFor(opts.country);
  const trades = (opts.trades ?? opts.sector ?? "").toString().trim();
  const permitLine = market
    ? `For ${opts.country}, the route is the ${market.permit} and the file normally takes about ${market.days}, subject to approval by the competent authority.`
    : `We only work in corridors where the work permit is normally completed in under two months, subject to approval by the competent authority.`;

  return `${opts.opening.trim()}

WHO WE ARE
Voynova Global Solutions Pvt. Ltd. is an India-based international recruitment and workforce mobilisation company. We source skilled and semi-skilled workers from India, Nepal and Bangladesh for employers in Europe and the Balkans, and we work with the employer directly — there is no sub-agent chain between your vacancy and the worker.

TRADES WE MOBILISE${trades ? ` (relevant to ${opts.company}: ${trades})` : ""}
- Construction: masons, shuttering and finish carpenters, steel fixers, helpers
- Metal and fabrication: MIG / TIG / arc welders, fitters, fabricators, CNC operators
- Hospitality: kitchen staff, commis chefs, stewards, housekeeping, waiters
- Logistics and warehouse: warehouse operatives, pickers, packers, forklift operators
- Food processing and factory: production, packaging and machine operators
Other trades can be sourced against a written requirement.

WHAT WE HANDLE FOR YOU
1. Sourcing and screening, with trade testing and recorded skill videos before you interview.
2. Complete document file: passport, experience letters, trade certificates, medical and police clearance.
3. Work permit filing and follow-up. You only sign what the authority requires from the employer.
4. Visa appointment, insurance, flights, pre-departure briefing and airport pickup coordination.
5. Arrival and onboarding support, plus structured follow-up in the first months.
6. A written replacement policy, agreed before anyone is mobilised.

TIMELINE
${permitLine} We can normally present a first shortlist within 7-10 working days of receiving a written requirement.

COMPLIANCE
No placement fee is charged to the worker — our model is employer-funded. Every file respects the source-country emigration and licensing rules and the destination country's documentation requirements. We do not promise visas, permits or outcomes: those are decided by you and by the competent authority.

COMMERCIALS
This is a paid, service-charge based partnership. The charge is quoted per trade and per destination in writing, with payment milestones and the replacement policy, before any candidate file is opened.

ATTACHED
Our company profile and employer proposal is attached as a PDF, with the full process, trade list, compliance notes and what we need from your side.

WHAT WE NEED FROM ${opts.company.toUpperCase()}
Trade, number of workers, salary band, working hours, overtime and the accommodation arrangement. That is enough for us to come back with profiles and written terms.

Would a 15-minute call this week work to go through your current requirement?`;
}
