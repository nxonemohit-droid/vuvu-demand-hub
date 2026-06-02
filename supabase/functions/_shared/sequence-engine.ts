// Shared helpers for the email sequence engine.
// Single shared sender mailbox model: caps are global (per the from address).

export type EngineSettings = {
  daily_cap: number;
  hourly_cap: number;
  per_domain_daily_cap: number;
  send_window_start_hour: number;
  send_window_end_hour: number;
  send_window_timezone: string;
  respect_send_window: boolean;
  warmup_started_at: string | null;
  warmup_daily_increment: number;
  warmup_initial_cap: number;
  skip_weekends: boolean;
  auto_unblock_enabled: boolean;
  reply_stop_enabled: boolean;
  country_window_overrides: Record<
    string,
    { tz?: string; start_hour?: number; end_hour?: number; skip_weekends?: boolean }
  >;
};

// ISO2 → IANA timezone (recipient country). Conservative defaults for our markets.
const COUNTRY_TZ: Record<string, string> = {
  RS: "Europe/Belgrade", HR: "Europe/Zagreb", SI: "Europe/Ljubljana",
  HU: "Europe/Budapest", RO: "Europe/Bucharest", BG: "Europe/Sofia",
  PL: "Europe/Warsaw", CZ: "Europe/Prague", SK: "Europe/Bratislava",
  AT: "Europe/Vienna", DE: "Europe/Berlin", NL: "Europe/Amsterdam",
  BE: "Europe/Brussels", FR: "Europe/Paris", ES: "Europe/Madrid",
  PT: "Europe/Lisbon", IT: "Europe/Rome", GR: "Europe/Athens",
  IE: "Europe/Dublin", GB: "Europe/London", DK: "Europe/Copenhagen",
  SE: "Europe/Stockholm", NO: "Europe/Oslo", FI: "Europe/Helsinki",
  CH: "Europe/Zurich", TR: "Europe/Istanbul",
  AE: "Asia/Dubai", SA: "Asia/Riyadh", QA: "Asia/Qatar", KW: "Asia/Kuwait",
  IN: "Asia/Kolkata", PK: "Asia/Karachi", BD: "Asia/Dhaka",
  PH: "Asia/Manila", ID: "Asia/Jakarta", VN: "Asia/Ho_Chi_Minh",
  US: "America/New_York", CA: "America/Toronto",
};

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  serbia: "RS", croatia: "HR", slovenia: "SI", hungary: "HU", romania: "RO",
  bulgaria: "BG", poland: "PL", "czech republic": "CZ", czechia: "CZ",
  slovakia: "SK", austria: "AT", germany: "DE", netherlands: "NL",
  belgium: "BE", france: "FR", spain: "ES", portugal: "PT", italy: "IT",
  greece: "GR", ireland: "IE", "united kingdom": "GB", uk: "GB",
  denmark: "DK", sweden: "SE", norway: "NO", finland: "FI",
  switzerland: "CH", turkey: "TR", uae: "AE", "united arab emirates": "AE",
  "saudi arabia": "SA", qatar: "QA", kuwait: "KW",
  india: "IN", pakistan: "PK", bangladesh: "BD",
  philippines: "PH", indonesia: "ID", vietnam: "VN",
  "united states": "US", usa: "US", canada: "CA",
};

export function countryToIso(country: string | null | undefined): string | null {
  if (!country) return null;
  const c = country.trim();
  if (c.length === 2) return c.toUpperCase();
  return COUNTRY_NAME_TO_ISO[c.toLowerCase()] ?? null;
}

export function resolveWindow(s: EngineSettings, country: string | null) {
  const iso = countryToIso(country);
  const override = iso ? s.country_window_overrides?.[iso] : undefined;
  return {
    tz: override?.tz ?? (iso ? COUNTRY_TZ[iso] : undefined) ?? s.send_window_timezone,
    start: override?.start_hour ?? s.send_window_start_hour,
    end: override?.end_hour ?? s.send_window_end_hour,
    skipWeekends: override?.skip_weekends ?? s.skip_weekends,
  };
}

function nowInTz(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", hour12: false, weekday: "short",
  });
  const parts = fmt.formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  return { hour, weekday };
}

export function isSendableNow(s: EngineSettings, country: string | null): {
  ok: boolean;
  reason?: "outside_window" | "weekend";
} {
  if (!s.respect_send_window) return { ok: true };
  const w = resolveWindow(s, country);
  const { hour, weekday } = nowInTz(w.tz);
  if (w.skipWeekends && (weekday === "Sat" || weekday === "Sun")) {
    return { ok: false, reason: "weekend" };
  }
  if (hour < w.start || hour >= w.end) return { ok: false, reason: "outside_window" };
  return { ok: true };
}

// Effective daily cap with linear warmup ramp.
export function effectiveDailyCap(s: EngineSettings): number {
  if (!s.warmup_started_at) return s.daily_cap;
  const startMs = new Date(s.warmup_started_at).getTime();
  if (!Number.isFinite(startMs)) return s.daily_cap;
  const days = Math.max(0, Math.floor((Date.now() - startMs) / 86_400_000));
  const ramp = s.warmup_initial_cap + days * s.warmup_daily_increment;
  return Math.max(0, Math.min(s.daily_cap, ramp));
}

export const DEFAULT_SETTINGS: EngineSettings = {
  daily_cap: 200, hourly_cap: 40, per_domain_daily_cap: 25,
  send_window_start_hour: 8, send_window_end_hour: 19,
  send_window_timezone: "Europe/Belgrade", respect_send_window: true,
  warmup_started_at: null, warmup_daily_increment: 10, warmup_initial_cap: 10,
  skip_weekends: true, auto_unblock_enabled: true, reply_stop_enabled: true,
  country_window_overrides: {},
};