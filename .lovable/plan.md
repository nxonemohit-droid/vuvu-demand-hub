# Recruiter Auto-Mail Engine (India / Nepal / Bangladesh / Sri Lanka partners)

Sirf **recruiter (supply) leads** ke liye automatic mail chalu hoga. Employer aur college leads is automation se bahar rahenge.

## 1. Mail draft — pehle aap review karo

Har mail ka **structure same**, sirf upar ka 2-3 line personalisation badlega (agency ka naam, sheher, partner type, unka kaam).

**Subject:** Europe job orders for {Agency Name} — Serbia, Latvia, Estonia (permit in under 60 days)

**Body (sample — Vira International, Delhi, manpower agency):**

```
Dear Vira International team,

I am Mohit Gururani, Founder of Voynova Global Solutions Pvt. Ltd.
I am writing to you because your Delhi office works with blue-collar
deployment to overseas markets, and we have live Europe job orders that
match exactly that profile.

WHO WE ARE
Voynova Global Solutions is an India-based international recruitment and
workforce company. We hold direct demand from employers in Serbia, Latvia,
Estonia, Cyprus, North Macedonia and Montenegro for construction,
hospitality, warehouse, driving and factory roles. We also run a Learn &
Earn college route where students study and work alongside in Europe.

WHY WE ARE DIFFERENT
1. Direct employer demand — no sub-agent chain between you and the employer.
2. Fast corridors only. We work with countries where the work permit is
   issued in under 60 days, so your candidate does not wait a year.
3. Full documentation support — permit file, visa paperwork, contract,
   appointment letter and arrival support are handled from our side.
4. Ethical recruitment — worker side stays compliant with eMigrate rules.
5. Two revenue lines for you: Europe job orders AND Learn & Earn college
   seats, from the same candidate database.

HOW WE HELP YOUR AGENCY
You supply screened candidates from your existing database. We share the
live vacancy list with trade, salary, accommodation and permit timeline.
Our team handles employer coordination, trade testing support, documents
and the permit file. You focus only on sourcing and candidate readiness.

COMMERCIALS — PLEASE NOTE
This is a paid, service-charge based partnership. Service charges are
included in every vacancy we release. We do not offer free vacancies and
we do not work on a no-charge basis. The exact charge, split and payment
terms are shared in writing before any candidate file is opened, so there
are no surprises on either side.

Can we have a 15-minute call this week to share the current requirement
list and the commercial terms?

Mohit Gururani
Founder & CEO | Voynova Global Solutions Pvt. Ltd.
Bridging Indian & Nepali talent with global opportunities
https://voynovaglobal.com | https://voy-nova-profiles.live/company-profile
```

**Personalised hissa** (AI se, har agency ke liye alag): pehla paragraph (sheher + unka kaam + kyun fit hain), aur country line — India me eMigrate, Nepal me DoFE, Bangladesh me BAIRA, Sri Lanka me SLBFE ka zikr.

WhatsApp message bhi isi tone me, 60 word ke andar, service charge line ke saath.

## 2. Automation — kaise chalega

- **Drafting:** sabhi recruiter leads jinke paas email hai, unke drafts Gemini se background me banenge (batch me, dobara nahi banega jo ban chuka hai).
- **Queue:** recruiter leads ka mail queue banega — Mon–Fri, 9:00–18:00 IST window me.
- **Sending:** har **60 second me ek mail** jayega (automatic). Ye safe speed hai — 30 second par inbox spam me girne ka risk zyada hai, isliye 60 second rakh raha hoon. Roz ka cap 150 mail.
- Ek hi agency ko dobara mail nahi jayega; unsubscribe/bounce wale band.
- Agar mail provider error de (rate limit / server), automatic thoda ruk ke retry hoga; baar-baar fail hua to engine khud pause ho jayega aur Outreach page par reason dikhega.

## 3. Control panel (Outreach page par naya block)

- **Start auto-mail / Pause** switch — sirf recruiter part ke liye.
- Live counters: queue me kitne, aaj kitne gaye, fail kitne, agla mail kis time.
- Sample draft preview — bhejne se pehle koi bhi mail khol ke edit kar sakte ho.
- Country filter: India / Nepal / Bangladesh / Sri Lanka.

## 4. Technical notes

- New shared template `recruiterMasterEmail()` in `supabase/functions/_shared/recruiters.ts` — fixed body + AI-personalised opening; `draft-email` supply branch isi ko use karega.
- `schedule-outreach` recruiter run: `kinds: ["supply"]`, gap 60s, daily cap 150, IST business-hours window (already implemented).
- `process-outreach` cron already runs every minute — ek run me ek recruiter mail bhejega, so effective rate = 1/minute.
- Engine state (`running` / `paused` + reason) ek chhoti `outreach_settings` table me; har send se pehle check hoga.
- Frontend: `AutoMailPanel` component Outreach page par.

## Aapse chahiye

1. Upar wala mail draft theek hai? Kuch add/hataana ho to batao.
2. 60 second gap thik hai ya 30 second hi chahiye?

Aap "ok" bologe tabhi implement karunga aur mail chalu honge.
