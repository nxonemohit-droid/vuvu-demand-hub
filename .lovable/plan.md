# Voynova Lead Engine — full reset

Ek hi simple app: **Lead Finder → Email → WhatsApp**. Baaki sab delete.

---

## 1) Country research (deep dive — visa ≤ 2 months + real blue-collar demand)

| Rank | Country | Permit | Typical time | Demand | Verdict |
|---|---|---|---|---|---|
| 1 | **Serbia** | Unified permit (jedinstvena dozvola), fully online via eUprava | **19–60 din** — Europe ka sabse fast legal route | Construction, manufacturing, food processing, agriculture | **Tier 1** |
| 2 | **Latvia** | Seasonal work visa (5,000+ slots 2026) | **15–45 din** seasonal route | Agri/horticulture, construction support, food processing, summer hospitality | **Tier 1 — tera main focus** |
| 3 | **North Macedonia** | Temp residence + work permit / D visa | ~30–60 din | Construction, textile, TIDZ factories | **Tier 1** |
| 4 | **Montenegro** | Single permit (MUP), new Foreigners Act Jan 2026 | ~30–60 din | Hospitality, construction, yacht/marine | **Tier 1** |
| 5 | **Bosnia & Herzegovina** | Work + residence permit | ~45–60 din | Construction, manufacturing | **Tier 2** |
| 6 | **Albania** | Unique permit | ~45–60 din | Hospitality, construction | **Tier 2** |
| 7 | **Moldova** | D visa (employment) + temp stay | 45–60 din | Construction, agri | **Tier 2** |
| 8 | **Estonia / Lithuania** | Short-term registered employment | ~30–60 din (short-term route) | Logistics, food processing, construction | **Tier 2** |

**Drop kar rahe hain** (2 mahine se upar): Poland (90–180), Germany (60–120+), Czechia (120–180), Romania (120), Croatia/Netherlands (~90+).

**Latvia ka catch (honest):** full work-residence permit route me labour-market test 2–4 hafte lagta hai, total 2 mahine ke border pe. Seasonal visa route hi 15–45 din wala hai — isliye Latvia leads me **seasonal-friendly employers** (farms, greenhouses, food plants, hotels, construction subcontractors) ko priority score milegi.

App ke andar har country pe **visa speed badge** (Fast / Medium) aur har lead pe **Visa-fit score** dikhega, taaki 2-mahine rule automatically enforce ho.

---

## 2) Kya delete hoga (permanent)

**Pages:** HM Mauritius, OTHM, Campaign, Demand Intelligence, Demand Lead Detail, Local Hiring, Recruiters, Discovery Runs, Archived Leads, Actor Health, Keyword Audit, Candidates, Diagnostics, Discovery Settings, Guide, Placeholder, Mail (purana), Leads (purana).

**Edge functions:** hm-* (5), othm-related, apify-discover, adapter-apify, apify-quota-check, actor-test-run, discover-local-jobs, demand/recruiter wale (recruiter-discover, recruiter-cleanup, recruiter-schedule-outreach, send-recruiter-email, queue-demand-lead-outreach, queue-whatsapp-outreach, match-candidates, structure-leads, push-lead-to-outreach, ingest-dispatch, daily-discovery-summary, retry-failed-runs, firecrawl-webhook, schedule-campaign, send-campaign-batch, enrich-low-quality-leads, auto-unblock-scheduled-emails, enrich-whatsapp-numbers, enrich-email, hunter-enrich, adapter-firecrawl, firecrawl-search).

**Tables (permanent drop):** hm_leads, hm_campaigns, hm_campaign_sends, hm_scrape_jobs, othm_leads, demand_leads, recruiter_leads, leads, candidates, discovery_runs, discovery_query_stats, email_campaigns, campaign_sends, scheduled_emails, whatsapp_outreach, email_templates, archived tables, actor health tables.

Jo rehta hai: user_roles, profiles, email_suppressions, auth.

---

## 3) Naya system (3 screens, bas)

```text
[ Find Leads ]   [ Outreach ]   [ Pipeline ]
```

### Screen 1 — Find Leads
- Country chips (visa-speed badge ke saath), sector chips (construction, hospitality, agri/food, logistics, manufacturing, cleaning), role keywords.
- **"Find leads" button** → background job: Google CSE + Firecrawl se employer sites/job posts → AI extraction (company, contact person, role, email, phone/WhatsApp, website, city, hiring signal) → Hunter fallback for email.
- Live progress + duplicate-safe insert.
- Har lead pe auto **Visa-fit score** (country speed + sector demand + contact completeness).

### Screen 2 — Outreach
- Ek table: har lead pe **Email** aur **WhatsApp** status.
- **Email:** Resend, AI-personalised per lead, 50/day cap, 90s gap, Mon–Fri 09:00–18:00 IST, reply-stop, suppression check.
- **WhatsApp:** **fully automatic** via Meta WhatsApp Cloud API — approved template message + personalised variables, 50/day cap, 120s gap. Ye tab chalega jab tu credentials de de (neeche dekh).
- One "Start outreach" button dono channels ke liye; live counter: queued / sent today / replied / failed.

### Screen 3 — Pipeline
Stages: New → Contacted → Replied → Interested → Deal. Drag-drop + Excel/CSV export.

---

## 4) Naya schema (3 tables)

- **`leads`** (fresh) — company, website, country, city, sector, role, contact_name, contact_role, email, phone, whatsapp, linkedin, hiring_signal, visa_speed, visa_fit_score, status, stage, source, source_url, dedup_hash, notes, timestamps.
- **`outreach_sends`** — lead_id, channel ('email'|'whatsapp'), scheduled_for, sent_at, status, provider_message_id, subject, body, error.
- **`find_jobs`** — countries[], sectors[], keywords[], status, found, created.

RLS: admin + bd read/write, viewer read. Grants included.

## 5) Edge functions (4 only)
1. `find-leads` — Google CSE + Firecrawl discovery, dedupe, queue.
2. `enrich-lead` — Firecrawl scrape + AI extract + Hunter email fallback + scoring.
3. `schedule-outreach` — personalise (AI) + distribute into caps/gaps/window, dono channels.
4. `process-outreach` — cron har minute: Resend email bhejta hai + WhatsApp Cloud API message bhejta hai, 429 backoff, reply-stop.

---

## 6) Tujhse ek cheez chahiye — WhatsApp automatic ke liye

Meta WhatsApp Cloud API ke 3 values chahiye (Meta Business → WhatsApp → API Setup):
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN` (permanent system-user token)
- `WHATSAPP_BUSINESS_ACCOUNT_ID`

Plus ek **approved message template** (Meta approve karta hai, 1–2 din). Jab tak ye nahi aata, WhatsApp queue ban jayegi par sends paused rahenge — email full chalega. Approve karte hi main secret form bhej dunga.

---

## 7) Build order
1. Purane pages + functions delete, nav 3 items pe.
2. Migration: purane tables drop + 3 naye tables.
3. `find-leads` + `enrich-lead` + country/visa config.
4. `schedule-outreach` + `process-outreach` (email live, WhatsApp behind credentials).
5. 3 screens UI + export.
6. Smoke test: Latvia + Serbia pe 20 leads nikaal ke 3 test mail bhejna.

Approve kar de toh delete + rebuild shuru.
