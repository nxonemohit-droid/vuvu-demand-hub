# WhatsApp direct (automatic) sending chalu karna

## Abhi ki sthiti (check kiya)
- Naya WhatsApp Business number connected hai: +91 87967 99544 (Cloud API, phone app par bhi chalu).
- Is number par ek hi approved template hai: `voynova_ad_v1` — 3 jagah bharni hoti hain: (1) headline, (2) short detail, (3) link.
- Yeh connection abhi app se linked nahi hai, aur app ka code purane template `voynova` (image + naam) ko bhejta hai — isliye abhi direct send fail hoga.

## Kya karenge
1. WhatsApp connection ko app se link karna (ek approval card aayega).
2. Sending ko naye template `voynova_ad_v1` par switch karna:
   - {{1}} = audience ke hisaab se headline (Employer: "Skilled workers ready for your company in <country>", Recruiter: "Partnership for Europe job orders", College: "Student partnership with Voynova")
   - {{2}} = Gemini ka personalised chhota message (company naam ke saath, 1 line, safe wording)
   - {{3}} = voynovaglobal.com link
3. Pehle aapke number par 1 test message, Meta response check.
4. Phir employer queue se dheere-dheere auto send (har 3 minute me 1, din me max 200) taaki number ka quality kharab na ho; Pause button WhatsApp bhi rokega (pehle se hai).
5. Outreach page par har message ka status dikhega — sent / failed + reason.

## Dhyaan rakhne wali baatein
- Template body me "Free food, stay and flight tickets" jaisa example hai; employer ko bhejne ke liye bhi chalega, par agar Meta quality gire to hum ruk jayenge.
- Yeh number phone app par bhi hai, isliye replies aapke phone par aayenge.
- Manual WhatsApp (bulk sheet) waisa hi rahega.

## Technical details
- `standard_connectors--connect` (whatsapp, std connection) → `WHATSAPP_API_KEY`.
- `process-outreach/index.ts`: `WA_TEMPLATE_NAME = "voynova_ad_v1"`, header image component hatana, 3 body params; text me newline/tab strip, length limit.
- Draft (`whatsapp` body) se {{2}} lena, fallback deterministic line.
- Pending WhatsApp rows ko 3-min gap par reschedule; deploy + test send.
