import { describe, expect, it } from "vitest";
import { templateState, type WhatsAppTemplate } from "../../supabase/functions/_shared/whatsapp-template-policy";

const template: WhatsAppTemplate = { name: "voynova_partner_v1", language: "en", status: "PENDING", components: [{ type: "BODY", text: "Hello {{1}}, {{2}} Learn more: {{3}}." }] };

describe("WhatsApp approval gate", () => {
  it("holds pending messages", () => {
    expect(templateState(template.name, template)).toMatchObject({ status: "PENDING", can_send: false });
  });
  it("allows approved messages", () => {
    expect(templateState(template.name, { ...template, status: "APPROVED" })).toMatchObject({ status: "APPROVED", can_send: true, language: "en" });
  });
  it("shows rejection reason without sending", () => {
    expect(templateState(template.name, { ...template, status: "REJECTED", rejected_reason: "SCAM" })).toMatchObject({ status: "FAILED", can_send: false, reason: "SCAM" });
  });
  it("holds lookup failures rather than trusting stale approval", () => {
    expect(templateState(template.name, undefined, "WhatsApp 401: invalid credentials")).toMatchObject({ status: "FAILED", can_send: false, reason: "WhatsApp 401: invalid credentials" });
  });
  it("blocks mismatched template parameters", () => {
    expect(templateState(template.name, { ...template, status: "APPROVED", components: [{ type: "BODY", text: "Hello {{1}}" }] }).can_send).toBe(false);
  });
  it("blocks paused and unknown provider states", () => {
    for (const status of ["PAUSED", "DISABLED", "UNKNOWN"]) expect(templateState(template.name, { ...template, status }).can_send).toBe(false);
  });
});
