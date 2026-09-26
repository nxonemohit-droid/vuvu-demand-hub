# Outreach page ko saaf aur user-friendly banana

## Abhi ki problem
Outreach page ek lambi scroll hai: 2 auto-mail blocks, manual WhatsApp, draft list, aur sabse neeche ek chhoti "Queue" table. Isme pata nahi chalta ki kis audience ko kitne mail gaye, kaun fail hua, aur WhatsApp kaise bhejna hai.

Aapke database me abhi ka asli data:

| Audience | Email bheja | Email queue | Email fail | WhatsApp bheja | WhatsApp queue | WhatsApp fail |
|---|---|---|---|---|---|---|
| Employers | 94 | 11 | 4 | 59 | 422 | 27 |
| Colleges | 110 | 0 | 2 | 0 | 130 | 26 |
| Recruiters | 93 | 264 | 2 | 0 | 792 | 0 |

Ye sab numbers page pe seedha dikhne chahiye.

## Naya layout — 4 tabs, har audience alag

```text
Outreach
[ Overview ] [ Employers ] [ Recruiters ] [ Colleges ]
```

### 1. Overview tab (pehli screen)
- Upar upar wali table jaisi summary: har audience ke liye Email aur WhatsApp — Bheja / Queue me / Fail / Aaj bheje.
- Har engine ka status saaf: "Chal raha hai / Ruka hua", agla mail kab jayega, aaj kitne gaye (limit ke saath).
- Kisi number pe click karo to us audience ke tab me wahi list khul jaye (jaise "Recruiter fail 2" → Recruiters tab, Fail filter).

### 2. Employers / Recruiters / Colleges tabs (ek jaisa design)
Har tab me upar:
- Engine Start / Pause button aur uska status (sirf us audience ka).
- 4 counter cards: Bheja, Queue me, Fail, Reply.

Uske neeche ek **badi lead table** — har lead ek row:
- Company / agency naam, country, contact person
- Email: status badge (Bheja 26/09/2026 14:05, Queue me, Fail + wajah, Nahi bheja)
- WhatsApp: status badge + number
- Konsa PDF gaya (Latvia employer, Nepal recruiter, etc.)
- Actions: "Mail dekho" (jo mail gaya uska preview), "WhatsApp bhejo" (ek click), "Dobara bhejo" (fail pe), "Queue se hatao"

Filters: Sab / Bheja / Queue / Fail / Abhi tak kuch nahi, country, search. Pagination 50 rows.

### 3. WhatsApp bhejna — table ke andar hi
- Har row me "WhatsApp bhejo" button: aapka WhatsApp message ke saath khulega.
- Wapas aane pe chhota popup: "Kya aapne Send dabaya?" → **Haan, Contacted karo** / **Nahi**. Isse galat "Contacted" nahi hoga.
- Alag "Manual WhatsApp" block hata denge (wahi kaam table me aa jayega), aur saaf likha hoga ki automatic WhatsApp abhi band hai.

### 4. Mail preview
- "Mail dekho" pe side panel: subject, pura body, attached PDF ka link, kab gaya, error (agar fail).

## Kya nahi badlega
- Mail bhejne ka engine, timing (40 sec), PDFs, Gemini drafting — sab waisa hi.
- Draft review wala block Employers/Recruiters tab ke andar chala jayega, hataya nahi jayega.

## Technical details
- `src/pages/Outreach.tsx` ko shadcn `Tabs` me todna; naye components: `OutreachOverview`, `AudienceOutreachTab` (prop `kind`), `OutreachLeadTable`, `SendPreviewSheet`, `WhatsappConfirmDialog`.
- Queries ek hook `src/hooks/use-outreach.ts` me: counts via `outreach_sends` join `leads.kind` (count head queries per kind/channel/status), paginated lead list (`leads` + nested `outreach_sends`) with `.range()`.
- Existing `AutoMailPanel` ko per-audience tab me reuse; `ManualWhatsappPanel` ka `mark()` logic table action me move, "sent" sirf confirm ke baad; open par status nahi badlega.
- "Dobara bhejo" = row ko `pending`, `attempts=0`, `scheduled_for=now`; "Queue se hatao" = `status='skipped'`.
- Auto-refresh 30s, skeleton loaders, dates DD/MM/YYYY. Koi database change nahi chahiye.
