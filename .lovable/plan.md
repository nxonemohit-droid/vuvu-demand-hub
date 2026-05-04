# Leads page with contact filter

The sidebar already links to `/leads`, but the route is missing. We'll add it as a full page listing every demand lead that has at least one usable contact handle (email, phone, or LinkedIn URL).

## Contact rule

A lead is shown only if **at least one** of the following is present:
- `contact_email`
- `contact_phone`
- A LinkedIn URL — derived from either:
  - `source_url` containing `linkedin.com/`, or
  - `raw_signals.payload->>'linkedin_url'` (joined via `raw_signal_id`)

## What we'll build

1. **Route** — add `/leads` in `src/App.tsx` pointing to a new `src/pages/Leads.tsx`.
2. **Page** (`src/pages/Leads.tsx`):
   - Fetch `demand_leads` with the related `raw_signals(payload)` so we can extract a LinkedIn URL.
   - Filter client-side to keep only leads passing the contact rule.
   - Search box (employer / role / city) + country filter + priority filter.
   - Table columns: Employer, Role, Country / City, Priority, Score, Email (mailto), Phone (tel), LinkedIn (external link), Source link, Created.
   - Empty state when no contactable leads exist.
   - Header count: "X of Y total leads have contact info".
3. **Reuse** existing shadcn `Table`, `Badge`, `Input`, `Select`, `Button` components — no new deps.

## Technical notes

- Query shape:
  ```ts
  supabase
    .from("demand_leads")
    .select("id, employer_name, role, country, city, priority, score, urgency_score, contact_email, contact_phone, source_url, created_at, raw_signals(payload)")
    .order("urgency_score", { ascending: false })
    .limit(500);
  ```
- LinkedIn extraction helper checks `source_url` first, then `raw_signals.payload.linkedin_url` / `.linkedin` / nested fields.
- Page wrapped to match other pages (no AppLayout currently used by `Index`/`ActorHealth` — follow the same standalone layout pattern with a top header and padded container).

## Out of scope

- Editing leads, bulk actions, CSV export — can be added later if needed.
- Adding a dedicated `linkedin_url` column on `demand_leads` (we read it from `raw_signals.payload` for now).
