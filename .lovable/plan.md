# Fix: Run actors in waves of 4 (and stop losing jobs to runtime shutdown)

## What's broken right now

- The dashboard shows 0 demand leads because most `scrape_jobs` rows never finish — they stay stuck on `queued` or `running`.
- Cause: the previous fix queued ~18 jobs and ran them in the background with `EdgeRuntime.waitUntil`. The Edge Function runtime shuts down soon after responding, so most actors get killed mid-run. Only a few jobs ever reach `succeeded`, and `structure-leads` runs before raw signals are inserted, so `demand_leads` stays empty.
- Secondary issue: the Indeed actor rejects `country: "RS"` (Serbia not in its allowed list) — those jobs fail fast and add noise.

## New approach: waves of 4, synchronous, drainable queue

Each invocation does a small, bounded amount of work that fits inside the 150s limit, then returns. The dashboard (or a cron) calls it again to process the next wave. This guarantees jobs finish and results land in the database.

### Behaviour

1. **Plan + queue (fast):** First call inserts all planned jobs as `status = 'queued'` in `scrape_jobs` and returns immediately with `{ queued: N }`. The dashboard sees jobs right away.
2. **Drain in waves of 4 (synchronous):** Same function, called with `{ mode: "drain" }`, picks the next 4 `queued` jobs, runs them in parallel with a strict per-actor timeout (e.g. 60s), writes results to `raw_signals`, marks each job `succeeded` / `failed`, then returns `{ processed: 4, remaining: M }`.
3. **Auto-chain waves:** After each drain returns, the dashboard immediately calls drain again until `remaining = 0`. Because each call is its own invocation, the runtime shutdown problem disappears.
4. **Structuring runs at the end:** Only after `remaining = 0` does the dashboard call `structure-leads`, so AI runs against actual data.

### Indeed country fix

- Skip Indeed for countries it doesn't support (Serbia `RS`, Croatia `HR` if rejected). Map only allowed ISO codes; for unsupported countries route the same keyword through `google` / `classifieds` / `facebook` instead.

### Per-actor robustness

- Hard per-actor timeout: 60s (down from 90s) so one slow actor can't blow the wave budget.
- Wave budget cap: stop accepting new jobs in a wave once 120s of wall time elapsed; return early with `remaining`.
- Keep the existing intent prefilter (role synonym + hiring intent term) so we don't insert noise.

## Technical changes

### `supabase/functions/apify-discover/index.ts`

- Accept `mode` in body: `"plan"` (default, queues jobs and returns) or `"drain"` (processes next wave).
- `mode: "plan"`:
  - Build the plan (existing `expandQueries` + round-robin logic).
  - Filter out unsupported source/country combos (Indeed allowed-country list).
  - Insert all rows into `scrape_jobs` with `status = 'queued'`.
  - Return `{ ok: true, queued: N }`.
- `mode: "drain"`:
  - `select … from scrape_jobs where status = 'queued' order by started_at asc limit 4`.
  - Mark them `running`.
  - `Promise.all` of 4 actor runs with 60s timeout each.
  - Insert filtered items into `raw_signals`, update job to `succeeded` / `failed`.
  - Return `{ ok: true, processed: 4, remaining: count_of_queued }`.
- Remove `EdgeRuntime.waitUntil` entirely — everything is synchronous within one invocation.

### `src/pages/Index.tsx` — "Run discovery now" button

- Step 1: invoke `apify-discover` with `{ mode: "plan" }`. Toast: "Queued N jobs".
- Step 2: loop:
  ```
  while (true) {
    const { processed, remaining } = await invoke('apify-discover', { mode: 'drain' })
    refresh dashboard panels
    if (remaining === 0) break
  }
  ```
- Step 3: invoke `structure-leads` once. Toast: "Structuring leads…".
- Step 4: invoke `hunter-enrich`.
- Disable the button while running; show a small progress line: "Wave 2/5 · 8 jobs done · 12 remaining".

### Optional: pg_cron fallback

- Add a 2-minute cron that calls `apify-discover` with `{ mode: "drain" }` so any leftover queued jobs are eventually processed even if the user closes the tab. (Will set up after confirming the wave logic works.)

## Out of scope for this slice

- New tables or schema changes — `scrape_jobs.status` already supports `queued / running / succeeded / failed`.
- Changes to `structure-leads` and `hunter-enrich` internals.

## Acceptance

- Clicking "Run discovery now" creates jobs immediately (visible in "Recent discovery runs").
- Jobs progress in waves of 4 from `queued` -> `running` -> `succeeded` / `failed`.
- After all waves complete, "Latest demand leads" populates with structured rows.
- No more 504 IDLE_TIMEOUT errors.
