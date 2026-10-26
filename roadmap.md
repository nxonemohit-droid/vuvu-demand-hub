# Voynova Lead Engine — rebuild roadmap

- [ ] Speed up lead search without increasing paid-provider calls: bounded requests, overlapping discovery, parallel contact-page checks, tests and live verification.

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
- [ ] WhatsApp outreach delivery verification: waiting for Meta approval of `voynova_partner_v1` on the Estonia connection; 1,240 messages held. Runtime approval gate resumes eligible queued sends only when the audience engine is running.
- [ ] Employer engine: detailed master proposal mail + premium branded PDF (company profile & proposal) attached to every employer mail, auto-mail engine for employers/colleges
- [ ] PDF must follow voynovaglobal.com branding: deep navy + gold, premium/luxury layout
- [ ] Demand Scout Pro Phase 1: Multi-language localized outreach (Serbian/BCMS, Greek, Latvian/Estonian, English) — language toggle in draft generator, country-adapted tone + compliance refs (Boravišna dozvola etc.)
- [ ] Demand Scout Pro Phase 2: Deliverability shield — email validation status (syntax/MX), decision-maker vs generic (info@/office@) flags, daily send pacing + volume caps
- [ ] Demand Scout Pro Phase 3: Hiring intent / vacancy signals — open-positions field on leads, templates dynamically reference active openings
- [ ] Demand Scout Pro Phase 4: Case study & candidate video sample links — 1-click proof/one-pager link insertion into draft templates

- [x] All email outreach 24x7 (no Mon–Fri / hours limit), ~30–40s gap, all audiences, both engines on
