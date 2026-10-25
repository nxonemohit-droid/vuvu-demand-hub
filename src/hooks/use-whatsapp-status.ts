import { useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { TemplateState } from "../../supabase/functions/_shared/whatsapp-template-policy";

export const useWhatsAppStatus = () => useQuery({
  queryKey: ["whatsapp-template-status"],
  queryFn: async (): Promise<TemplateState> => {
    const { data, error } = await supabase.functions.invoke("whatsapp-status", { body: {} });
    if (error) throw new Error(error instanceof FunctionsHttpError ? await error.context.text() : error.message);
    return data as TemplateState;
  },
  refetchInterval: 30000,
  retry: 1,
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