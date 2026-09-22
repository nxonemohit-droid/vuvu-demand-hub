# WhatsApp Number "Already Connected" Fix

## Problem
Workspace me koi WhatsApp connection nahi hai (checked — list khali hai). Phir bhi Meta "number already connected to another account" bol raha hai. Iska matlab: **+91 9650645553 Meta ke kisi purane WhatsApp Business account / Business Platform se juda hua hai** — ho sakta hai pehle WhatsApp Business mobile app se ya kisi purane Lovable/Meta attempt se. Jab tak Meta ki taraf se wo purana link nahi tootta, naya connection nahi banega.

## Fix — step by step (aapko phone pe karna hai)

### Step 1: WhatsApp Business app me purana connection todo
1. Phone pe **WhatsApp Business app** kholo (usi number se — +91 9650645553)
2. **Settings → Account → Business Platform** pe jao
3. Wahan agar koi connected account dikhe → **Disconnect Account** dabao
4. Agar "Business Platform" option hi nahi dikhta, to number kabhi Business Platform se juda hi nahi — tab Step 2 pe jao

### Step 2: Meta Business Manager me check karo
1. Desktop Chrome pe https://business.facebook.com/latest/whatsapp_manager kholo
2. Apne business portfolio me **WhatsApp Accounts** dekho
3. Agar +91 9650645553 kisi purane WhatsApp Business Account (WABA) me dikhe, to wo purana WABA hai — ya to usi portfolio se connect karenge, ya Meta support se number release karwana padega

### Step 3: Lovable me dobara connect
1. Number disconnect/release hone ke baad, main yahan se WhatsApp connect card dobara kholunga
2. Desktop Chrome me Meta Embedded Signup complete karo: login → business portfolio chuno → number dobara add karo → OTP verify
3. Connection banne ke baad main use project se link kar dunga

### Step 4: Connect hone ke baad (main karunga)
- `process-outreach` function me WhatsApp sending test — approved template se connected number pe test message
- Outreach page ka WhatsApp queue resume
- Template banane honge (Meta approval 24–48 hrs) — tab tak free-form replies sirf 24-hour window me

## Agar purana WABA hai jise delete nahi kar sakte
- Option A: Meta Business Support se number migration/release request
- Option B: Koi **naya phone number** (jo pehle WhatsApp Business Platform pe na ho) se connect karo — sabse fast rasta

## Technical details
- Workspace me abhi 0 WhatsApp connections hain — kuch clean karne ki zaroorat nahi
- `process-outreach` already gateway-ready hai (connector-gateway.lovable.dev/whatsapp, template-only sends, E.164 validation) — connect hote hi kaam karega
- `WHATSAPP_TEMPLATE_NAME` secret baad me set hoga jab pehla template approve ho
