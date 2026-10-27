import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { TemplateState } from "../../supabase/functions/_shared/whatsapp-template-policy";
import { lookupWhatsAppTemplate } from "./whatsapp-template.server";
import { userFromAuthHeader } from "./supabase-admin.server";

/** Live approval state of the selected WhatsApp template, for signed-in users only. */
export const getWhatsAppStatus = createServerFn({ method: "POST" }).handler(async (): Promise<TemplateState> => {
  const user = await userFromAuthHeader(getRequestHeader("Authorization"));
  if (!user) throw new Error("Sign in to check WhatsApp status.");
  return lookupWhatsAppTemplate();
});
