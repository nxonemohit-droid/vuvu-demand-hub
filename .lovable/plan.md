## Voynova Pivot → HM Mauritius Admissions Engine (500 admissions)

Ek hi consolidated system: **scrape leads → AI-personalize → bulk mail** — sab ek page, one-click.

---

### 1) Kya hataana hai (cleanup)
- **Sidebar/routes remove:** Demand Intelligence, Recruiters, Employers, Local Hiring, Discovery Runs, Actor Health, Archived Leads, Keyword Audit (archive UI, not DB).
- **DB tables retain hoti hain** (data safe) but hidden from nav. Migration sirf naye tables banayegi, purani ko touch nahi karegi.
- Nayi default landing: **`/hm-mauritius`** (single command center).

### 2) Lead Discovery — naya focused mode

**Target audience (2 buckets):**

| Bucket | Kya scrape ho | Filters/Keywords |
|---|---|---|
| **A. Hotel Management Institutes** (NE India + Uttarakhand + Nepal) | Institute name, website, principal/director/owner/HR manager/placement head, email, phone, LinkedIn, current + passed-out students list (jahaan available) | `hotel management institute`, `IHM`, `culinary institute`, `hospitality college`, `diploma hotel management` **+ region:** Manipur, Meghalaya, Assam, Nagaland, Mizoram, Tripura, Arunachal Pradesh, Sikkim, Uttarakhand, Nepal (Kathmandu, Pokhara, Chitwan) |
| **B. Career Consultancies** (hotel management + overseas study focus) | Agency name, founder/CEO/counsellor, email, phone, LinkedIn, city | `hotel management consultancy`, `overseas hospitality admissions`, `study abroad hotel management`, `Mauritius admissions consultant` |

**Region enum (hardcoded, editable via UI chips):**
```
NE India: Manipur, Meghalaya, Assam, Nagaland, Mizoram,
          Tripura, Arunachal Pradesh, Sikkim
Uttarakhand: Dehradun, Haldwani, Nainital, Rishikesh, Haridwar
Nepal: Kathmandu, Pokhara, Chitwan, Biratnagar, Butwal
```

### 3) Best scraping stack (recommendation)

**Layered — use best tool per job:**

```text
Discovery layer  → Google CSE  (cheap, precise site: + region queries)
Enrichment layer → Firecrawl   (already integrated; scrape institute site
                                for director/HR/email/phone/students)
Bulk pages       → Apify       (already integrated; run when >200 URLs
                                queued — LinkedIn people search actor,
                                Google Maps actor for institute contacts)
Email finder     → Hunter      (already integrated; domain → verified emails)
```

Reason: Google CSE deta hai precise SERP without burn; Firecrawl har hit ka clean markdown/JSON extraction karta hai; Apify sirf tab jab volume ho (LinkedIn/GMaps); Hunter final email verification. Sab 4 already project me connected hain — no new secret needed.

### 4) Naya DB schema (1 migration)

**`hm_leads`** — main table
- `id, type ('institute'|'consultancy'), name, website, region, country, city, state`
- `contact_name, contact_role (Director/Owner/HR/Placement/CEO/Counsellor), email, phone, linkedin`
- `students_meta jsonb` (current batch size, pass-out years, courses offered)
- `source ('gcse'|'firecrawl'|'apify'|'hunter'|'manual'), source_url, dedup_hash`
- `status ('new'|'enriched'|'queued'|'sent'|'replied'|'admitted'|'rejected')`
- `admission_stage ('lead'|'interested'|'docs_sent'|'application'|'offer'|'visa'|'admitted')`
- `score int, notes, tags text[], imported_by, timestamps`

**`hm_campaigns`** — id, name, template_1/2/3 (subject+body), daily_cap=50, gap_seconds=90, window (9-18 IST, Mon-Fri), status, counts.

**`hm_campaign_sends`** — id, campaign_id, lead_id, template_variant (1|2|3), scheduled_for, sent_at, status, resend_message_id, personalized_subject/body snapshot, error.

**`hm_scrape_jobs`** — id, mode ('discover'|'enrich'), region, keywords[], provider, status, leads_found, cost_estimate, timestamps.

RLS: admin + bd read/write, viewer read.

### 5) Edge functions (5 new, reuse 1)

1. **`hm-discover`** — takes region + bucket (institute/consultancy) → runs Google CSE queries → dedupes URLs → queues Firecrawl scrape jobs.
2. **`hm-enrich`** — Firecrawl scrape per URL → AI (`gemini-3-flash-preview`) extracts structured fields (name, contact_name, role, email, phone, students_meta) → if email missing, Hunter domain search → insert into `hm_leads`.
3. **`hm-apify-bulk`** — trigger only when queue > 200 URLs, calls Apify actor (LinkedIn people search / GMaps) for extra contacts.
4. **`hm-generate-templates`** — Lovable AI generates 3 draft variants using **voynova-outreach skill** rules, tailored for **HM Mauritius admissions pitch** (partnership for institutes, referral for consultancies, admissions for students-post-passout). Signature: Mohit Gururani, Voynova Global Solutions Pvt. Ltd., + `https://voynovaglobal.com` + `https://voy-nova-profiles.live/company-profile`.
5. **`hm-schedule-campaign`** — locks templates + leads → distributes 50/day, 90s gap, Mon-Fri 9:00–18:00 IST, weekend skip, random variant per lead, personalizes merge tags (`{{first_name}} {{institute}} {{region}} {{role}}`).
6. **Reuse `send-campaign-batch`** — add `hm` channel branch reading `hm_campaign_sends`, respects 90s gap + Resend 429 backoff + reply-stop via inbound webhook.

### 6) Frontend — single page `/hm-mauritius`

Tabs (top of page):

```text
[ 1. Discover ] [ 2. Leads ] [ 3. Templates ] [ 4. Campaign ] [ 5. Pipeline ]
```

- **Discover:** region chips (multi-select), bucket toggle (Institute/Consultancy/Both), keyword preset dropdown, "Start scrape" button. Live progress: URLs found → enriched → leads created. Cost/quota meter (Firecrawl/Hunter/Apify).
- **Leads:** filterable table (region, type, has_email, stage), bulk select, "Add to campaign" button, CSV import fallback, export.
- **Templates:** "Generate 3 AI drafts" (HM Mauritius pitch) → 3 editable cards → "Regenerate this one" per card → Lock.
- **Campaign:** select leads + locked templates → shows schedule preview ("312 leads → 7 days, first send Mon 9:00 IST") → Launch. Live counter: queued/sent today/total sent/failed/replied.
- **Pipeline:** admissions funnel (Lead → Interested → Docs → Application → Offer → Visa → **Admitted**). Target progress bar: **X / 500 admissions**. Per-stage lead table, drag-drop stage change.

### 7) One-click "Auto Run" (top-right on `/hm-mauritius`)
Single button that chains: **Discover (default regions) → Enrich → Generate templates (if none) → Preview → Wait for user Launch confirm**. User sirf approve karta hai, baaki background me chalta hai (edge function `EdgeRuntime.waitUntil`).

### 8) Sending rules (locked, same as before)
- Cap: **50/day** per campaign
- Gap: **90 seconds** between sends
- Window: **09:00–18:00 Asia/Kolkata, Mon–Fri**
- Weekend skip + auto rollover
- Resend 429 → `Retry-After` backoff, 1 retry
- Reply-stop via existing `resend-inbound` webhook
- Suppression check via `email_suppressions`

### 9) AI template rules (HM Mauritius specific)
3 variants baked into prompt:
- **V1 Formal (institute partnership)** — ~220 words, pitch: Voynova × [Institute] partnership to place hotel management students in Mauritius (hospitality), zero worker-fee, compliance-first, visa + travel support.
- **V2 Warm (consultancy referral)** — ~160 words, revenue-share angle for career consultancies, quick sample-batch pitch.
- **V3 Short (direct student/passout)** — ~90 words, "Mauritius hospitality opportunities — apply now" CTA to voynovaglobal.com.

### 10) Build order
1. Migration (4 tables + grants + RLS).
2. `hm-discover` + `hm-enrich` edge functions + Google CSE integration (needs `GOOGLE_CSE_ID` + `GOOGLE_CSE_KEY` — will ask user before build).
3. `hm-generate-templates` + `hm-schedule-campaign`.
4. Wire `send-campaign-batch` to drain `hm_campaign_sends`.
5. `/hm-mauritius` page with 5 tabs + Auto Run button.
6. Sidebar cleanup: remove old routes, add "HM Mauritius" as primary nav.
7. Smoke test: scrape 20 Uttarakhand IHMs → enrich → 3 templates → launch 5 test sends.

---

**Ek confirmation chahiye build shuru karne se pehle:** Google CSE ke liye `GOOGLE_CSE_ID` aur `GOOGLE_CSE_API_KEY` chahiye honge (free 100 queries/day, phir $5/1000). Approve kare toh main add_secret request bhejunga; agar tu Google CSE skip karna chahe, main sirf Firecrawl search + Apify pe chala sakta hu (thoda mehnga par already-connected).

Approve karega toh build start.
