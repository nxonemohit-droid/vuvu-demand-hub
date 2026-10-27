import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { bestReceiptStatus } from "@/lib/whatsapp-receipts";

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
};

/** Live dashboard numbers: verified leads, contacts, WhatsApp sends and real receipts. */
export const useLiveOutreach = () => {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel(`outreach-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_sends" }, () => qc.invalidateQueries({ queryKey: ["live-outreach"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_delivery_receipts" }, () => qc.invalidateQueries({ queryKey: ["live-outreach"] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);

  return useQuery({
    queryKey: ["live-outreach"],
    queryFn: async () => {
      const head = { count: "exact" as const, head: true };
      const [verified, withEmail, withPhone, waSent, waFailed] = await Promise.all([
        count(supabase.from("leads").select("id", head).is("merged_into", null).like("source_url", "http%").not("hiring_signal", "is", null)),
        count(supabase.from("leads").select("id", head).is("merged_into", null).not("email", "is", null)),
        count(supabase.from("leads").select("id", head).is("merged_into", null).or("whatsapp.not.is.null,phone.not.is.null")),
        count(supabase.from("outreach_sends").select("id", head).eq("channel", "whatsapp").eq("status", "sent")),
        count(supabase.from("outreach_sends").select("id", head).eq("channel", "whatsapp").eq("status", "failed")),
      ]);
      const { data: sends, error } = await supabase.from("outreach_sends")
        .select("id,to_address,sent_at,provider_message_id,leads(company)")
        .eq("channel", "whatsapp").eq("status", "sent").not("provider_message_id", "is", null)
        .order("sent_at", { ascending: false }).limit(25);
      if (error) throw error;
      const ids = (sends ?? []).map((s) => s.provider_message_id as string);
      const { data: receipts, error: rErr } = ids.length
        ? await supabase.from("whatsapp_delivery_receipts").select("provider_message_id,status,errors,occurred_at,delivery_id").in("provider_message_id", ids)
        : { data: [], error: null };
      if (rErr) throw rErr;
      const { data: totals, error: totalsError } = await supabase.from("whatsapp_receipt_counts").select("delivered,read,failed").single();
      if (totalsError) throw totalsError;
      const rows = (sends ?? []).map((s) => {
        const mine = (receipts ?? []).filter((r) => r.provider_message_id === s.provider_message_id);
        return { ...s, receipt: bestReceiptStatus(mine.map((r) => r.status)), proof: mine };
      });
      return { verified, withEmail, withPhone, waSent, waFailed, delivered: totals?.delivered ?? 0, read: totals?.read ?? 0, rows };
    },
    refetchInterval: 5000,
  });
};
