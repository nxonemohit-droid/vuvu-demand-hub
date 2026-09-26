# WhatsApp: multi-select karke ek ke baad ek bhejna

## Sach kya hai
Manual WhatsApp (wa.me link) me app khud Send nahi daba sakta — WhatsApp har message pe aapka Send maangta hai. Aur browser ek click me 10-15 WhatsApp windows ek saath khulne nahi deta (popup block). Isliye "sab apne aap chale jayein" manual me possible nahi hai.

Jo possible hai aur fast hai: **Bulk Send Mode** — 10/12/15 leads select karo, phir har lead ke liye bas 2 click: "Agla kholo" → WhatsApp me Send.

## Kya banega
1. **Table me checkbox** — har row pe, upar "Sab select karo" (sirf wo leads jinka number hai aur WhatsApp abhi nahi gaya). Neeche bar dikhega: "12 select — WhatsApp Bulk Send shuru karo".
2. **Bulk Send panel** (side me khulta hai):
   - Progress: "3 / 12 bheje".
   - Current lead ka naam, number, message (edit kar sakte ho).
   - Bada button **"WhatsApp kholo"** → chat message ke saath khulti hai, aap Send dabao.
   - Wapas aao → **"Bhej diya, agla"** (lead Contacted + next lead turant ready) ya **"Skip"**.
   - Keyboard shortcut: Enter = kholo / agla, taaki speed bane.
   - Beech me band karo to baaki select leads yaad rahengi.
3. End me summary: kitne bheje, kitne skip.

## Automatic ka option (baad me)
Pura automatic sirf WhatsApp Cloud API se hota hai (dedicated second number + approved template). Pehle isi se number phone pe band ho gaya tha, isliye abhi nahi — agar chaaho to naye alag number pe alag se plan karenge.

## Technical details
- `OutreachLeadTable`: shadcn `Checkbox` column + selection state (Set of lead ids), sticky action bar.
- New `WhatsappBulkSheet` component: queue of selected leads, index pointer, reuses existing manual `mark()` upsert logic (onConflict `lead_id,channel`) and the confirm-before-Contacted rule.
- `window.open` only on direct button click (one per click) to avoid popup blocking.
- Invalidate outreach counts after each confirm. No database change.
