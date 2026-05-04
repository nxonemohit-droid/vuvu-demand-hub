# Fix Discovery Runs 404

## Problem
The sidebar in `src/components/AppLayout.tsx` links to `/runs` ("Discovery Runs"), but `src/App.tsx` has no matching `<Route>`, so React Router falls through to `NotFound` and logs `404 Error: User attempted to access non-existent route: /runs`.

There is no `DiscoveryRuns.tsx` page — only the dashboard's small "Recent discovery runs" card on `Index.tsx` and an `ActorHealth` page exist.

## Fix

### 1. Create `src/pages/DiscoveryRuns.tsx`
A full-page view of `scrape_jobs` (the same table the dashboard card reads from). It will include:

- Header: title "Discovery Runs", subtitle, refresh button, and a "Actor health" button linking to `/actor-health`.
- Stats strip (cards):
  - Total runs (last 100)
  - Succeeded / Failed / Running counts
  - Items found vs items structured (sum)
- Filters: source dropdown (distinct sources), status dropdown (succeeded / failed / running / queued / all), country search input.
- Main table (shadcn `Table`, sticky header, zebra striping) with columns:
  Started · Source · Country · Keyword · Status (StatusBadge) · Found · Kept · Duration · Error (truncated, hover for full).
- Pagination: load latest 100, "Load more" button fetching next 100 by `started_at desc`.
- Empty state using the same `EmptyState` style as Index (icon `PlayCircle`, "No discovery runs yet").
- Loading: skeleton rows.
- Reuses styling tokens (rounded-xl, Voynova palette already in Tailwind config); icons from `lucide-react` only.

Data source: `supabase.from("scrape_jobs").select("id,source,country,keyword,status,items_found,items_structured,started_at,finished_at,error").order("started_at", { ascending: false }).range(...)`.

RLS: `scrape_jobs` is already readable by team members (same pattern used by `Index.tsx` and `ActorHealth.tsx`), so no migration needed.

### 2. Register the route in `src/App.tsx`
Add inside the `<AppLayout>` group:
```tsx
<Route path="/runs" element={<DiscoveryRuns />} />
```
and the matching import.

### 3. Sidebar
Already points to `/runs` — no change.

## Out of scope
- No DB changes.
- No changes to the existing `Recent discovery runs` card on the dashboard or to `ActorHealth`.
- The unrelated `demand_leads_review_status_check` console error is a separate issue and not addressed here.
