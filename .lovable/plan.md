# Lead search: website contact page se direct email + website

## Goal
Har naye lead ke liye company website ke homepage/contact page ko seedha (free fetch) padhkar email, phone aur sahi website link nikalna — Firecrawl ka use kam karna.

## What changes
1. **Direct website contact scan** (lead search ke andar, har lead save hone se pehle):
   - Homepage fetch karo (plain fetch, 6s timeout, normal browser header).
   - Homepage se "contact / kontakti / kontakt / about / epikoinonia" jaise links dhundo; max 2 pages aur fetch karo (`/contact`, `/kontakti`, `/kontakt`, `/contact-us` bhi try).
   - `mailto:` links + text se email regex; phone `tel:` links; junk emails (example.com, sentry, image files, noreply) hatao; company domain wale emails ko pehle rakho.
   - Agar hit ka URL kisi directory/job board ka hai, page par company ki apni website link milne par use website maano.
2. **Firecrawl hits kam**:
   - Firecrawl search sirf tab chalega jab Google + Perplexity dono se 3 se kam results aayein (pehle har query par chalta tha).
   - Firecrawl scrape fallback sirf tab jab direct fetch blocked/empty ho (JS-heavy site), aur ek search run me max 10 scrapes.
3. **Save**: email lead ke `email` field me, phone khali ho to fill, `source` me "+site" note; same domain ek baar hi scan (cache per run).
4. Run summary me count: kitne leads ko website se email mila, kitne Firecrawl calls hue.

## Technical details
- New `supabase/functions/_shared/site-contacts.ts`: `scanSiteContacts(domain, {allowFirecrawl})` returning `{emails, phones, website, usedFirecrawl}`; concurrency 3, total budget per run.
- `find-leads/index.ts`: gate `firecrawlSearch` behind low-result condition; call scanner in hit loop; add email/phone to insert.
- Check `leads` table has `email` column before insert (add migration only if missing).
- Small vitest for email extraction/junk filtering in `src/test/`.
- Deploy `find-leads`, run one Latvia search, verify emails saved and fewer Firecrawl calls in logs.
