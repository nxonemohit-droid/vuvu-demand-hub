import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import { extractReceipts } from "@/lib/whatsapp-receipts";


/**
 * Receives WhatsApp callbacks forwarded by the connector gateway.
 * Signature is checked with the project key; each delivery is stored once
 * (by X-Lovable-Delivery) and Meta statuses become delivery receipts.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_API_KEY"];
        if (!secret) return Response.json({ ok: false, code: "not_configured" }, { status: 500 });

        let payload: unknown;
        try {
          ({ payload } = await verifyWebhookRequest<unknown>({ req: request, secret }));
        } catch {
          return Response.json({ ok: false, code: "invalid_signature" }, { status: 401 });
        }

        const deliveryId = request.headers.get("x-lovable-delivery") ?? crypto.randomUUID();
        const eventType = typeof payload === "object" && payload !== null && "type" in payload
          ? String((payload as { type: unknown }).type) : null;
        try {
          const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
          const db = supabaseAdmin();
          const { error: inboxError } = await db.from("whatsapp_webhook_inbox")
            .upsert({ delivery_id: deliveryId, event_type: eventType, payload: payload as never }, { onConflict: "delivery_id", ignoreDuplicates: true });
          if (inboxError) throw inboxError;

          const receipts = extractReceipts(payload);
          if (receipts.length) {
            const { error } = await db.from("whatsapp_delivery_receipts").upsert(
              receipts.map((r) => ({
                provider_message_id: r.providerMessageId, status: r.status, recipient: r.recipient,
                occurred_at: r.occurredAt, errors: r.errors as never, delivery_id: deliveryId,
              })),
              { onConflict: "provider_message_id,status", ignoreDuplicates: true },
            );
            if (error) throw error;
          }
          console.log(`whatsapp-webhook delivery=${deliveryId} type=${eventType} receipts=${receipts.length}`);
          return Response.json({ ok: true, receipts: receipts.length });
        } catch (error) {
          console.error("whatsapp-webhook store failed", error);
          // 5xx lets the gateway retry this delivery.
          return Response.json({ ok: false, code: "store_failed" }, { status: 500 });
        }
      },
    },
  },
});
