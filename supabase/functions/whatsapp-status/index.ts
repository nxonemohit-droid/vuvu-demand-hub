import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/supabase.ts";
import { lookupWhatsAppTemplate } from "../_shared/whatsapp-template.ts";

Deno.serve(async (req) => {
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET" && req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Sign in to check WhatsApp status." }), { status: 401, headers });
    const { data, error } = await adminClient().auth.getUser(token);
    if (error || !data.user) return new Response(JSON.stringify({ error: "Sign in to check WhatsApp status." }), { status: 401, headers });
    const { state } = await lookupWhatsAppTemplate();
    return new Response(JSON.stringify(state), { headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers });
  }
});