UPDATE public.email_templates
SET body = E'Hello {{contact_name}},

I''m reaching out from Voynova Global Solutions regarding your hiring needs for {{role}} in {{city}}, {{country}}.

We specialise in placing vetted blue-collar workers from India, Nepal and Bangladesh with European employers like {{employer_name}}. Many of our partners fill open roles within 2–3 weeks of first contact.

What we bring to the table:
  • Pre-screened, trade-tested candidates (welders, drivers, construction, factory, warehouse and more)
  • Full visa, work permit and compliance handling — no paperwork burden on your side
  • Typical deployment in 7–14 days once candidates are selected

You can learn more here:
  • Voynova website: https://voynovaglobal.com
  • Our company profile: https://voy-nova-profiles.live/company-profile

If bringing in skilled {{trade_category}} workers would help {{employer_name}}, just reply to this email and we''ll set up a quick 15-minute call at a time that suits you.

Warm regards,

Mohit Gururani
Founder & CEO | Voynova Global Solutions Pvt. Ltd.
Bridging Indian Talent with Global Opportunities

Headquarters: T-4, A-608, NX One, Techzone-IV, Greater Noida, India
+91 96506 45553 | mohit@voynovaglobal.com
www.voynovaglobal.com  |  Connecting India to Europe

LinkedIn: linkedin.com/in/mohit-gururani-voynova
Voynova Global: https://voynovaglobal.com'
WHERE name = 'voynova_demand_outreach';