import { useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { TemplateState } from "../../supabase/functions/_shared/whatsapp-template-policy";

export const useWhatsAppStatus = () => useQuery({
  queryKey: ["whatsapp-template-status"],
  queryFn: async (): Promise<TemplateState> => {
    const { data, error } = await supabase.functions.invoke("whatsapp-status", { body: {} });
    if (error) {
      const details = error instanceof FunctionsHttpError ? await error.context.text().catch(() => "") : error.message;
      // Temporary hosting outage (503) — show plain text, the query retries automatically.
      if (/SERVICE_DEGRADED|temporarily unavailable|503/i.test(details)) {
        throw new Error("Status service is busy right now. Retrying automatically…");
      }
      throw new Error(details || "Could not load WhatsApp status.");
    }
    return data as TemplateState;
  },
  refetchInterval: 30000,
  retry: 3,
  retryDelay: (n) => Math.min(2000 * 2 ** n, 15000),
});

export const useWhatsAppFailures = () => useQuery({
  queryKey: ["whatsapp-recent-failures"],
  queryFn: async () => {
    const { data, error } = await supabase.from("outreach_sends")
      .select("id,to_address,error,attempts,scheduled_for,leads(company)")
      .eq("channel", "whatsapp").eq("status", "failed")
      .order("scheduled_for", { ascending: false }).limit(10);
    if (error) throw error;
    return data ?? [];
  },
  refetchInterval: 30000,
});

export const useWhatsAppAccepted = () => useQuery({
  queryKey: ["whatsapp-recent-accepted"],
  queryFn: async () => {
    const { data, error } = await supabase.from("outreach_sends")
      .select("id,to_address,sent_at,provider_message_id,leads(company)")
      .eq("channel", "whatsapp").eq("status", "sent")
      .not("provider_message_id", "is", null)
      .order("sent_at", { ascending: false }).limit(10);
    if (error) throw error;
    return data ?? [];
  },
  refetchInterval: 30000,
});