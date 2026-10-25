import { templateState, type WhatsAppTemplate, type TemplateState } from "./whatsapp-template-policy.ts";

export const WHATSAPP_GATEWAY = "https://connector-gateway.lovable.dev/whatsapp";
// Matches the template submitted on the currently linked Estonia connection.
export const selectedTemplateName = () => Deno.env.get("WHATSAPP_TEMPLATE_NAME")?.trim() || "voynova_partner_v1";

export async function lookupWhatsAppTemplate(): Promise<{ state: TemplateState; template?: WhatsAppTemplate }> {
  const name = selectedTemplateName();
  const key = Deno.env.get("LOVABLE_API_KEY");
  const connectionKey = Deno.env.get("WHATSAPP_API_KEY");
  if (!key || !connectionKey) return { state: templateState(name, undefined, "WhatsApp connection is not configured.") };
  try {
    const query = new URLSearchParams({ name, fields: "name,status,language,components,rejected_reason", limit: "100" });
    const response = await fetch(`${WHATSAPP_GATEWAY}/message_templates?${query}`, {
      headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": connectionKey },
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`WhatsApp template lookup [${response.status}]: ${text}`);
      return { state: templateState(name, undefined, `WhatsApp ${response.status}: ${text}`) };
    }
    const result = JSON.parse(text) as { data?: WhatsAppTemplate[] };
    const template = result.data?.find((t) => t.name === name);
    return { state: templateState(name, template), template };
  } catch (error) {
    return { state: templateState(name, undefined, `Template status check failed: ${String(error)}`) };
  }
}