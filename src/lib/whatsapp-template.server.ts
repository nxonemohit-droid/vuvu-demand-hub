import { templateState, type TemplateState, type WhatsAppTemplate } from "../../supabase/functions/_shared/whatsapp-template-policy";

/** Gateway base for the linked WhatsApp connection. Paths carry no account IDs. */
export const WHATSAPP_GATEWAY = "https://connector-gateway.lovable.dev/whatsapp";

/** Template the queue processor sends; mirrors the backend function's default. */
export const selectedTemplateName = (): string =>
  process.env["WHATSAPP_TEMPLATE_NAME"]?.trim() || "voynova_partner_v1";

/**
 * Reads the selected template from the connected account and applies the shared
 * approval policy, so the panel and the sending gate judge the same provider data.
 */
export async function lookupWhatsAppTemplate(): Promise<TemplateState> {
  const name = selectedTemplateName();
  const key = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["WHATSAPP_API_KEY"];
  if (!key || !connectionKey) return templateState(name, undefined, "WhatsApp connection is not configured.");
  try {
    const query = new URLSearchParams({ name, fields: "name,status,language,components,rejected_reason", limit: "100" });
    const response = await fetch(`${WHATSAPP_GATEWAY}/message_templates?${query}`, {
      headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": connectionKey },
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`WhatsApp template lookup [${response.status}]: ${text}`);
      return templateState(name, undefined, `WhatsApp ${response.status}: ${text}`);
    }
    const result = JSON.parse(text) as { data?: WhatsAppTemplate[] };
    return templateState(name, result.data?.find((t) => t.name === name));
  } catch (error) {
    return templateState(name, undefined, `Template status check failed: ${String(error)}`);
  }
}
