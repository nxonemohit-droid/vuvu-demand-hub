# Architecture rules

- Share WhatsApp template lookup and approval validation between the status endpoint and queue processor so the displayed approval state and sending gate use the same provider data.
- Query WhatsApp panel status and failure records through a dedicated hook; never expose connector credentials to the browser.
- Lead discovery prefetches only one query ahead and contact scans fetch at most two pages concurrently; bound provider requests and reserve each Firecrawl scrape from the shared budget before awaiting to improve speed without uncontrolled paid calls.
- Explicit Hunter-only contact refresh uses authenticated, bounded lead-ID batches and skips Firecrawl/AI so existing leads can gain provider contacts without unrelated enrichment spend.
- Explicit WhatsApp-only queue tests require an authenticated user and a bounded batch size; preserve approval and audience pause gates and leave normal scheduled processing unchanged.
- Keep WhatsApp recipient-delivery presentation in a shared utility; an outreach send response or manual send confirmation is not a delivery receipt.