import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getWhatsAppStatus } from "@/lib/whatsapp-status.functions";
import type { TemplateState } from "../../supabase/functions/_shared/whatsapp-template-policy";

export const useWhatsAppStatus = () => useQuery({
  queryKey: ["whatsapp-template-status"],
  queryFn: async (): Promise<TemplateState> => {
    try {
      return await getWhatsAppStatus();
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      // Temporary hosting outage — show plain text, the query retries automatically.
      if (/temporarily unavailable|503/i.test(details)) {
        throw new Error("Status service is busy right now. Retrying automatically…");
      }
      throw new Error(details || "Could not load WhatsApp status.");
    }
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
