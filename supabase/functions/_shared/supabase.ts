import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type ScrapeJobRow = {
  id: string;
  source: string;
  source_id: string | null;
  actor_id: string | null;
  country: string | null;
  keyword: string | null;
  input: Record<string, unknown>;
};

export type SourceRow = {
  id: string;
  source_family: string;
  adapter: string;
  actor_or_endpoint: string | null;
  default_input: Record<string, unknown>;
  trust_tier: number;
  confidence_weight: number;
  enabled: boolean;
};

export async function logRunEvent(
  supa: ReturnType<typeof adminClient>,
  scrape_job_id: string,
  event_type: string,
  message: string,
  data: Record<string, unknown> = {},
  severity: "info" | "warn" | "error" = "info",
) {
  await supa.from("scrape_run_events").insert({
    scrape_job_id, event_type, message, data, severity,
  });
}

// Stable string fingerprint (sha256-like — uses Web Crypto for portability).
export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}