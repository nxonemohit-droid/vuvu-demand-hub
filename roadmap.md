# Voynova Lead Engine — rebuild roadmap

- [ ] Delete legacy pages, components, edge functions
- [ ] Migration: new `leads`, `outreach_sends`, `find_jobs` tables (+ RLS + grants)
- [ ] Country/visa config incl. Cyprus; education (Learn & Earn) lead mode
- [ ] Edge functions: find-leads, enrich-lead, schedule-outreach, process-outreach
- [ ] UI: Find Leads / Outreach / Pipeline (3 screens) + export
- [ ] Cron for process-outreach
- [ ] BLOCKED: WhatsApp Cloud API credentials from user (phone number id, token, WABA id, approved template)
- [ ] Drop legacy tables (needs user to run DROP in SQL editor — migration tool blocks drops)
- [ ] Light, friendly UI theme across all screens
- [ ] Apify Google-search fallback in find-leads (Google CSE + Firecrawl blocked)
- [ ] Google Maps Places (New) as primary lead source — blocked: key needs "Places API (New)" enabled in Google Cloud
- [ ] User's paid Gemini API key for enrichment (secret pending)
