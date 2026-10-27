/** A recipient-side status Meta reported for one outgoing WhatsApp message. */
export type WhatsAppReceipt = {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipient: string | null;
  occurredAt: string;
  errors: unknown[];
};

const STATUSES = new Set(["sent", "delivered", "read", "failed"]);

/**
 * Extracts Meta status objects (`{ id: "wamid…", status, timestamp }`) from a
 * webhook payload, wherever they are nested. Unknown shapes yield no receipts,
 * so nothing is ever marked delivered without an explicit provider status.
 */
export function extractReceipts(payload: unknown): WhatsAppReceipt[] {
  const found = new Map<string, WhatsAppReceipt>();
  const walk = (node: unknown, depth: number): void => {
    if (depth > 12 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    const o = node as Record<string, unknown>;
    if (typeof o["id"] === "string" && typeof o["status"] === "string" && STATUSES.has(o["status"])) {
      const ts = Number(o["timestamp"]);
      const receipt: WhatsAppReceipt = {
        providerMessageId: o["id"],
        status: o["status"] as WhatsAppReceipt["status"],
        recipient: typeof o["recipient_id"] === "string" ? o["recipient_id"] : null,
        occurredAt: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
        errors: Array.isArray(o["errors"]) ? o["errors"] : [],
      };
      found.set(`${receipt.providerMessageId}:${receipt.status}`, receipt);
    }
    Object.values(o).forEach((v) => walk(v, depth + 1));
  };
  walk(payload, 0);
  return [...found.values()];
}

const RANK = { failed: 4, read: 3, delivered: 2, sent: 1 } as const;

/** Strongest proven recipient status for one message, or null with no receipt. */
export function bestReceiptStatus(statuses: string[]): WhatsAppReceipt["status"] | null {
  let best: WhatsAppReceipt["status"] | null = null;
  for (const s of statuses) {
    if (!(s in RANK)) continue;
    const st = s as WhatsAppReceipt["status"];
    if (!best || RANK[st] > RANK[best]) best = st;
  }
  return best;
}
