import { describe, expect, it } from "vitest";
import { whatsappSendLabel } from "../lib/whatsapp-delivery";

describe("WhatsApp recipient delivery evidence", () => {
  it("does not claim delivery from a Meta message ID", () => {
    expect(whatsappSendLabel("sent", "wamid.accepted")).toBe("Accepted · delivery unknown");
  });
  it("does not treat a manual send record as provider acceptance", () => {
    expect(whatsappSendLabel("sent", null)).toBe("Manually marked sent · delivery unknown");
  });
});
