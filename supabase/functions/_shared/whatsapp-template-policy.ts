export type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  buttons?: unknown[];
};

export type WhatsAppTemplate = {
  name: string;
  status: string;
  language: string;
  rejected_reason?: string;
  components: TemplateComponent[];
};

export type TemplateState = {
  name: string;
  status: "PENDING" | "APPROVED" | "FAILED";
  provider_status: string;
  reason: string | null;
  can_send: boolean;
  language: string | null;
  checked_at: string;
};

/** Fail closed for unknown statuses, missing templates and unsupported parameters. */
export function templateState(name: string, template?: WhatsAppTemplate, error?: string): TemplateState {
  const base = { name, provider_status: template?.status ?? "UNKNOWN", language: template?.language ?? null, checked_at: new Date().toISOString() };
  if (error || !template) return { ...base, status: "FAILED", can_send: false, reason: error ?? "Template not found on the connected WhatsApp account." };
  if (template.status === "PENDING" || template.status === "IN_APPEAL") {
    return { ...base, status: "PENDING", can_send: false, reason: "Waiting for Meta approval. Queued messages are on hold." };
  }
  if (template.status !== "APPROVED") {
    return { ...base, status: "FAILED", can_send: false, reason: template.rejected_reason && template.rejected_reason !== "NONE" ? template.rejected_reason : `Meta template status: ${template.status}` };
  }
  const body = template.components.find((c) => c.type.toUpperCase() === "BODY");
  const variables = [...new Set(body?.text?.match(/\{\{\d+\}\}/g) ?? [])].sort();
  const supported = variables.join(",") === "{{1}},{{2}},{{3}}" && template.components.every((c) => ["BODY", "FOOTER"].includes(c.type.toUpperCase()));
  if (!supported) return { ...base, status: "FAILED", can_send: false, reason: "Approved template has unsupported parameters or media. Sending is held to prevent failed messages." };
  return { ...base, status: "APPROVED", can_send: true, reason: null };
}