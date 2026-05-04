# Implementation Plan

This is a large multi-file batch. Several pieces already exist from earlier work (Bookmarked toggle, Pipeline funnel, /candidates, /settings, contact log table) — I'll skip rebuilding those and focus on what's missing or upgrading.

## 1. Database migrations (one migration)

Create the two missing tables (lead_outreach_log, lead_blacklist). The existing `lead_contact_log` will be repurposed/aliased — but to match the spec exactly I'll add `lead_outreach_log` as the canonical name and migrate the detail page to use it.

```text
lead_outreach_log
  id, lead_id, user_id, channel (email|linkedin|phone|whatsapp),
  note, created_at

lead_blacklist
  id, domain (unique), reason, created_by, created_at
```

RLS: team read/insert, user updates own outreach log, admin delete. Public read on outreach log to match other tables. Blacklist: team read/insert, admin delete.

## 2. Leads page (`src/pages/Leads.tsx`)

Already present: search, presets, bookmarked-only, recruiter mode, multi-export, breadcrumb.

Add / upgrade:
- **Sort dropdown**: Priority (default), Date Added, Country, Employer Name
- **Load More button**: paginate 21-at-a-time from Supabase using `.range()`; replace any current "load all" pattern; "Load more" button below results
- **Hide Stale Leads toggle** (>45d since `created_at`)
- **Min Trust Tier filter** (All / High / Medium / Low) — derive tier from `source` enum (company_site, linkedin → High; indeed, directory → Medium; facebook, classifieds → Low)
- **Role Type filter** (All / Decision Maker / Recruiter) — keyword classifier on `contact_role`/`role` (CEO/CTO/Founder/Head/Director/Owner = decision-maker; Recruiter/Talent/HR/Sourcer = recruiter)
- **Data Quality bar**: top of results, 5 stat pills (% email / phone / linkedin / fresh / high-trust) recomputed from filtered set
- **Stats sidebar** (collapsible right rail, "Stats" toggle button): top-5 countries (bar), top-5 industries (bar), source pie, avg score — uses `recharts` (already a dep)
- **Compare modal**: when 2+ rows selected → "Compare (N)" button → side-by-side dialog with employer/contact rows; best value highlighted green per row (highest score, freshest date, has-email/phone/linkedin)
- **Empty state**: when filtered=0 and rawCount>0, show centered icon + "No leads match these filters" + Clear filters button

## 3. Lead card (`src/components/leads/LeadCard.tsx`)

- Freshness badge (Fresh/Aging/Stale) by `created_at` age
- Trust tier dot (green/amber/red)
- Contact role classifier badge (Decision Maker / Recruiter / Other)
- Blacklisted red tag if employer domain in fetched blacklist set (parent passes a `Set<string>` to avoid N queries)

## 4. Lead detail page (`src/pages/LeadDetail.tsx`)

- **Score Breakdown card**: replace single "Score X" badge with expandable card showing total + colored progress bar (red <40 / amber 40–69 / green ≥70) and per-signal +/− rows derived from existing `score_breakdown` jsonb (email, phone, linkedin, website, freshness, generic-domain penalty)
- **Duplicate Detection banner**: yellow dismissible banner if `select id, employer_name where employer_name=? and country=? and id<>?` returns rows; clickable links
- **My Notes card** (extend existing `LeadCrmCard`): keep status dropdown / notes / bookmark; when status = `rejected`, show "Add domain to blacklist" checkbox → inserts into `lead_blacklist`
- **Outreach Templates card**: 3 tabs (Cold Intro, Follow-up, Final Nudge) using `buildOutreachTemplate` (already exists) variations; Copy button each
- **Outreach Log**: replace the contact-log section I added last turn with the spec's `lead_outreach_log` table — channel dropdown (Email/LinkedIn/Phone/WhatsApp) + note + Save; timeline with channel icon, note, relative date

## 5. Dashboard (`src/pages/Index.tsx`)

- Add **Recent Activity feed** card: last 20 from `lead_outreach_log` joined with `demand_leads.employer_name` (two queries + client-side join), formatted as "2h ago — Logged Email to Acme Corp". Empty state if none.
- Funnel already present, leave as-is.

## 6. Global

- **`useHotkeys` hook** (`src/hooks/use-hotkeys.ts`): "/" focuses `[data-search-input]` on /leads, Esc clears all leads filters (when on /leads), "N" focuses `[data-notes-input]` on detail page. Ignored when typing in input/textarea (except Esc).
- **Shortcut help button**: floating "?" bottom-right (in `AppLayout`), Popover with cheat sheet
- Wire hotkeys in Leads + LeadDetail

## 7. Files touched

- `supabase/migrations/...` (new tables)
- `src/pages/Leads.tsx` (sort, load-more, new filters, data quality bar, stats sidebar, compare modal, empty state, hotkeys)
- `src/components/leads/LeadCard.tsx` (badges)
- `src/components/leads/LeadCrmCard.tsx` (blacklist checkbox on Rejected)
- `src/pages/LeadDetail.tsx` (score breakdown, duplicates banner, outreach templates tabs, outreach log swap)
- `src/pages/Index.tsx` (recent activity feed)
- `src/components/AppLayout.tsx` (shortcut help button)
- `src/hooks/use-hotkeys.ts` (new)
- `src/lib/lead-classifiers.ts` (new — trust tier, role type, freshness helpers, shared)

## Notes / assumptions

- I'll keep `lead_contact_log` table in the DB (already created) but the detail page UI will switch to `lead_outreach_log` per spec. No data to migrate.
- "Match score" on /candidates stays static placeholder (already built).
- Compare highlighting: per-field best-value computed client-side, no styling tokens added — uses existing `text-emerald-600`/`bg-emerald-500/10` accents already in the project.
- Stats sidebar uses recharts (already a dep) and existing chart wrapper if present, otherwise raw recharts components.

Approve to implement.