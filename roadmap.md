# Voynova Lead Engine — rebuild roadmap

- [ ] Publish corrected WhatsApp receiver and verify actual Meta callbacks: connection-key signature fix, transactional durable receipts, invoked fair recovery and 5-second Outreach refresh implemented; signed diagnostic persisted once across retries in preview. Published receiver still rejects the connection-key signature (401). Latest batch: 40 accepted, zero stored Delivered/Read receipts; publishing and a fresh real callback remain required.

- [x] Send bounded 40-employer WhatsApp batch: 5 new attempts plus 35 previously Accepted recipients resent at user's request; all 40 accepted with provider IDs saved, prior references preserved in lead notes; no delivery receipts received.

- [x] Run requested 20-message WhatsApp batch: 20 pending recruiter mobile numbers accepted by Meta, 0 send failures; other future queue schedules unchanged.
- [ ] Reconcile user's four visible WhatsApp messages with recorded employer sends: employer pending queue is zero, not proof of delivery; 503 historical sent records include 63 without provider references. Current +372 connection is GREEN; new 20 recruiter sends have provider references and appear as Accepted · delivery unknown in the signed-in Outreach panel. Actual visible/delivered count remains blocked by absent receipts and requires identification of the user's phone view.

- [x] Check WhatsApp evidence and show Meta acceptance separately from actual delivery on Outreach. Two tests passed; signed-in panel shows ten accepted messages with delivery unknown. No callback storage exists; actual Delivered/Read tracking is blocked by Classic connector support and requires approved migration.
- [x] Show contact roles, contact-source labels and hiring/admissions evidence with source links in employer/college tables. Verified four Latvia prospects: Europlast has undated blue-collar vacancies, LU international degree admissions supported; Pillar/LVPIC excluded. LU already emailed, so no duplicate institution outreach. One new Europlast enquiry sent; signed-in preview reads sent at 26/10/2026 22:01. Remaining leads are source-reported, not individually verified.

- [x] Speed up lead search: bounded requests, one-query lookahead, parallel contact-page checks and per-request Firecrawl budget; 4 scanner tests passed; live Latvia education search completed with 36 URLs and 1 new lead.
- [ ] Finish Hunter lookup for all leads: live batches saved contacts on 1,884 leads, with 2,200 total Hunter-sourced contacts now stored; blocked by Hunter's billing-period search allowance (429), not a transient rate limit. No further Hunter calls until allowance is restored.
- [x] Confirm `voynova_partner_v1` approval and run a small WhatsApp batch: APPROVED, 3 accepted, 0 failed; live panel shows 919 queued, 527 accepted, 5 historical failures. Only the three test rows were moved from future scheduling; the remaining queue schedule was unchanged.

- [x] Search all 10 listed European markets for employers and colleges: 347 employer and 227 education prospects saved; visible in authenticated Find Leads. Broad discovery is not hiring/admissions verification; some large jobs hit CPU limits, smaller batches reached every market. Public research separately verified 10 employers and 4 existing colleges; exact duplicate-skip total is not recorded.

- [x] WhatsApp panel: live template approval status, approval-gated automatic sends, and failure reasons
- [x] Lead search: ran current Firecrawl/Hunter-enabled pipeline; Latvia search created 18 leads and enrichment processed 3 (individual provider success not separately confirmed)

- [x] Delete legacy pages, components, edge functions (five retained deployed functions need separate live cleanup)
- [x] Migration: new `leads`, `outreach_sends`, `find_jobs` tables (+ RLS + grants)
- [x] Country/visa config incl. Cyprus; education (Learn & Earn) lead mode
- [x] Edge functions: find-leads, enrich-lead, draft-email, schedule-outreach, process-outreach
- [x] UI: Find Leads / Outreach / Pipeline (3 screens) + export
- [x] Cron for process-outreach
- [ ] Outreach page: Gemini drafts block — personalised drafts list + preview + edit + queue (in progress; background drafting of ~496 email leads running)
- [x] WhatsApp Business connector — connected +91 98705 88554 (old +91 9650645553 released via new number)
- [ ] Drop legacy tables (needs user to run DROP in SQL editor — migration tool blocks drops)
- [x] Light, friendly UI theme across all screens
- [x] Apify, Google CSE, Firecrawl and website fallbacks in lead discovery/enrichment
- [x] Google Maps Places (New) as primary lead source
- [x] Paid Gemini key for AI scoring + personalised email/WhatsApp drafting
- [x] Supply-side leads (`supply` kind): manpower agencies, agents, study abroad / visa counsellors in India, Nepal, Bangladesh, Sri Lanka, Uzbekistan, Philippines
- [x] Separate partnership outreach block (email + WhatsApp, `kinds: ["supply"]` filter in schedule-outreach)
- [x] Two separate engines: Europe Employers & Colleges (/find) and Recruiter Engine (/recruiters)
- [x] Recruiter Engine: per-country blocks (India, Nepal, Bangladesh, Sri Lanka + Uzbekistan, Philippines), partner-type filters, per-country search + enrichment
- [x] Country-specific recruiter email + WhatsApp pitches (India eMigrate, Nepal DoFE, Bangladesh BAIRA, Sri Lanka SLBFE) with Europe job orders + Learn & Earn seats
- [x] Recruiter pipeline stages: New, Qualified, Contacted, Replied, Meeting booked, Partner onboarded
- [x] Duplicate detection + merge for recruiter leads (email, phone, website, agency name) via `recruiter-tools`
- [x] 0–100 partner priority score (country, partner type, contact quality, supply capacity)
- [ ] WhatsApp recipient delivery verification: no stored delivery callbacks; current Classic connector cannot receive receipts. Requires modern-stack migration approval; do not infer delivery from acceptance.
- [ ] Employer engine: detailed master proposal mail + premium branded PDF (company profile & proposal) attached to every employer mail, auto-mail engine for employers/colleges
- [ ] PDF must follow voynovaglobal.com branding: deep navy + gold, premium/luxury layout
- [ ] Demand Scout Pro Phase 1: Multi-language localized outreach (Serbian/BCMS, Greek, Latvian/Estonian, English) — language toggle in draft generator, country-adapted tone + compliance refs (Boravišna dozvola etc.)
- [ ] Demand Scout Pro Phase 2: Deliverability shield — email validation status (syntax/MX), decision-maker vs generic (info@/office@) flags, daily send pacing + volume caps
- [ ] Demand Scout Pro Phase 3: Hiring intent / vacancy signals — open-positions field on leads, templates dynamically reference active openings
- [ ] Demand Scout Pro Phase 4: Case study & candidate video sample links — 1-click proof/one-pager link insertion into draft templates

- [x] All email outreach 24x7 (no Mon–Fri / hours limit), ~30–40s gap, all audiences, both engines on
