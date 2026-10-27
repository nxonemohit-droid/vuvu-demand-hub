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
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return Response.json({ ok: false, code: "not_configured" }, { status: 500 });

        let payload: unknown;
        try {
          ({ payload } = await verifyWebhookRequest<unknown>({ req: request, secret, maxBodyBytes: 4 * 1024 * 1024 }));
        } catch {
          return Response.json({ ok: false, code: "invalid_signature" }, { status: 401 });
        }

        const deliveryId = request.headers.get("x-lovable-delivery")?.trim();
        const eventType = request.headers.get("x-lovable-event")?.trim();
        if (!deliveryId || !eventType) return Response.json({ ok: false, code: "missing_delivery_headers" }, { status: 400 });
        try {
          const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
          const db = supabaseAdmin();
          const { error: inboxError } = await db.from("whatsapp_webhook_events")
            .upsert({ delivery_id: deliveryId, event: eventType, payload: payload as never }, { onConflict: "delivery_id", ignoreDuplicates: true });
          if (inboxError) throw inboxError;
          const processEvent = async (id: string, body: unknown) => {
            const receipts = extractReceipts(body);
            const { error } = await db.rpc("complete_whatsapp_event", {
              p_delivery_id: id,
              p_receipts: receipts.map((r) => ({
                provider_message_id: r.providerMessageId, status: r.status, recipient: r.recipient,
                occurred_at: r.occurredAt, errors: r.errors,
              })) as never,
            });
            if (error) throw error;
          };
          await processEvent(deliveryId, payload);
          // Recovery is invoked on subsequent traffic; quiet periods delay retries.
          const { data: pending, error: pendingError } = await db.from("whatsapp_webhook_events")
            .select("delivery_id,payload").is("processed_at", null).lte("next_attempt_at", new Date().toISOString())
            .neq("delivery_id", deliveryId).order("next_attempt_at").limit(3);
          if (pendingError) throw pendingError;
          for (const row of pending ?? []) {
            try { await processEvent(row.delivery_id, row.payload); }
            catch (error) {
              const { error: retryError } = await db.from("whatsapp_webhook_events").update({
                processing_error: String(error), next_attempt_at: new Date(Date.now() + 60000).toISOString(),
              }).eq("delivery_id", row.delivery_id);
              if (retryError) throw retryError;
            }
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error("whatsapp-webhook store failed", error);
          // 5xx lets the gateway retry this delivery.
          return Response.json({ ok: false, code: "store_failed" }, { status: 500 });
        }
      },
    },
  },
});
