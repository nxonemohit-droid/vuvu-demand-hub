# Voynova Lead Engine — rebuild roadmap

- [x] Delete legacy pages, components, edge functions (five retained deployed functions need separate live cleanup)
- [x] Migration: new `leads`, `outreach_sends`, `find_jobs` tables (+ RLS + grants)
- [x] Country/visa config incl. Cyprus; education (Learn & Earn) lead mode
- [x] Edge functions: find-leads, enrich-lead, draft-email, schedule-outreach, process-outreach
- [x] UI: Find Leads / Outreach / Pipeline (3 screens) + export
- [x] Cron for process-outreach
- [ ] BLOCKED: WhatsApp Business connector — Meta Embedded Signup must be completed in desktop Chrome for +91 9650645553
- [ ] Drop legacy tables (needs user to run DROP in SQL editor — migration tool blocks drops)
- [x] Light, friendly UI theme across all screens
- [x] Apify, Google CSE, Firecrawl and website fallbacks in lead discovery/enrichment
- [x] Google Maps Places (New) as primary lead source
- [x] Paid Gemini key for AI scoring + personalised email/WhatsApp drafting
