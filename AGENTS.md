# Architecture rules

- Share WhatsApp template lookup and approval validation between the status endpoint and queue processor so the displayed approval state and sending gate use the same provider data.
- Query WhatsApp panel status and failure records through a dedicated hook; never expose connector credentials to the browser.