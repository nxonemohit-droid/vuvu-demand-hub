# WhatsApp queue ko chalu karna + delivery report

## Goal
Meta se `voynova_partner_outreach` template approve hote hi, jitne WhatsApp messages queue me hain (lagbhag 763), wo bina rukawat bhej do aur app me ek saaf delivery report dikhao.

## Steps

1. **Approval check (sabse pehle)**
   - Meta pe template ka live status check karna. Agar abhi bhi PENDING hai to kuch nahi bhejenge, sirf status batayenge.
   - Template ka structure (kitne variables hain) padh ke confirm karna ki humara message usme sahi fit hota hai.

2. **Ek test message**
   - Approval ke baad pehle sirf 1 message bhejna (aapke apne number pe, ya queue ka pehla lead) aur Meta ka response check karna.
   - Test pass hua tabhi pura queue chalu.

3. **Queue safe tarike se chalu karna**
   - WhatsApp hold hataana, jo purane messages template ki wajah se fail hue the unhe wapas queue me daalna.
   - Message text ko Meta ke rules ke hisaab se saaf karna (line breaks / lambai), taaki "invalid parameter" error na aaye.
   - Pacing: WhatsApp aur email ka alag-alag hisaab, taaki WhatsApp ki galti se email engine na ruke (abhi dono ek hi failure counter share karte hain).
   - Daily limit: Meta naye number ko pehle din sirf limited logon (aam taur pe 250/din) ko message karne deta hai. Isliye 763 messages lagbhag 3–4 din me jayenge — ek din me nahi. Limit badhne pe speed apne aap badhegi.

4. **Delivery report (Outreach page pe naya block)**
   - Counters: Queue me / Bheja gaya / Fail / Aaj bheje.
   - Country-wise (India, Nepal, Bangladesh, Sri Lanka) breakdown.
   - Fail hue messages ki list, saaf wajah ke saath (galat number, Meta limit, payment, etc.) aur "Dobara try karo" button.
   - Auto-refresh har 30 second.

## Ek zaroori limitation
Is app me Meta se wapas aane wale "Delivered / Read" signals receive nahi ho sakte. Report me "Bheja gaya" ka matlab hoga Meta ne message accept kar liya. Asli "Delivered/Read" WhatsApp Manager me dikhega — report me uska link de denge.

## Aapko karna hai
- WhatsApp Manager me payment method add karna (marketing messages ke liye zaroori).

## Technical details
- `process-outreach`: WhatsApp aur email ke liye alag `consecutive_failures` / circuit breaker; WhatsApp ke liye alag daily cap (default 250) aur gap; template param se newlines/tabs hatana, 4+ spaces collapse; template components `GET /message_templates` se match karna.
- Meta error codes (131049, 131026, 131047, 131056, 130472, 131042 billing) ko readable reason me map karke `outreach_sends.error` me save karna; 130429/131056 pe retry with backoff.
- Failed WhatsApp rows (template pending wale) ko `pending` pe reset.
- Naya `WhatsappReportPanel` component, queries ek service hook me, `outreach_sends` channel=whatsapp join `leads.country`.
