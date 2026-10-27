import { describe, expect, it } from "vitest";
import { bestReceiptStatus, extractReceipts } from "../lib/whatsapp-receipts";

const metaPayload = {
  type: "whatsapp.status",
  data: { entry: [{ changes: [{ value: { statuses: [
    { id: "wamid.A", status: "delivered", timestamp: "1793077755", recipient_id: "919876543210" },
    { id: "wamid.B", status: "failed", timestamp: "1793077756", errors: [{ code: 131026, title: "Message undeliverable" }] },
  ] } }] }] },
};

describe("WhatsApp delivery receipts", () => {
  it("reads delivered and failed statuses from a Meta callback", () => {
    const r = extractReceipts(metaPayload);
    expect(r.map((x) => `${x.providerMessageId}:${x.status}`)).toEqual(["wamid.A:delivered", "wamid.B:failed"]);
    expect(r[1]?.errors).toHaveLength(1);
  });
  it("creates no receipt from an incoming message or unknown payload", () => {
    expect(extractReceipts({ messages: [{ id: "wamid.C", type: "text" }] })).toEqual([]);
  });
  it("read beats delivered; no receipts means unknown", () => {
    expect(bestReceiptStatus(["sent", "delivered", "read"])).toBe("read");
    expect(bestReceiptStatus([])).toBeNull();
  });
});
