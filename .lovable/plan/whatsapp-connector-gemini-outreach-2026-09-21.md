# WhatsApp Connector + Gemini Outreach

## Pehle connection fix
- Lovable mobile app ke embedded browser ko use nahi karenge; WhatsApp connection desktop Chrome me isi project ko kholkar complete karenge.
- Chrome me pop-ups aur third-party cookies allow rahenge, phir Meta login, Business portfolio selection aur `+91 9650645553` OTP verification complete hoga.
- Connection banne ke baad connected WhatsApp Business number aur approved message templates verify karenge.

## App integration
- Existing direct Meta API sending ko Lovable WhatsApp Business connector ke secure gateway par move karenge.
- Business-initiated outreach sirf approved Meta template se bhejenge; personalised Gemini text template variables me jayega.
- Phone numbers E.164 digits-only format me validate honge, failures ka real Meta error Outreach screen par dikhega, aur retry sirf temporary errors par hoga.

## Gemini scoring and drafting
- Paid Gemini key ko server-side secret ke through use karenge; key browser me expose nahi hogi.
- Company/college profile se 0–100 lead score, short score reason, personalised email aur separate WhatsApp message generate honge.
- Pipeline me score/reason aur editable email/WhatsApp preview dikhega; user preview ke baad email ya WhatsApp queue kar sakega.

## Verification
- Ek selected lead par Gemini scoring + both drafts test karenge.
- Connected WhatsApp number par approved template test send karenge and gateway response confirm karenge.
- Outreach queue, sent/failed status aur build health verify karenge.

## Connection blocker
Meta login screen Lovable mobile app ke embedded browser se open nahi ho rahi. Connection setup desktop Chrome me karna hoga; code changes uske baad deploy aur live-test honge.
