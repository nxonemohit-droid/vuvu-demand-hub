import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Map country names as stored in demand_leads.country to ISO-3166-1 alpha-2 codes
 * used by libphonenumber-js as the default region when parsing local numbers.
 */
const COUNTRY_NAME_TO_ISO2: Record<string, CountryCode> = {
  // Europe — primary markets
  Serbia: "RS",
  Greece: "GR",
  Croatia: "HR",
  Hungary: "HU",
  Romania: "RO",
  Bulgaria: "BG",
  Poland: "PL",
  Portugal: "PT",
  Spain: "ES",
  Netherlands: "NL",
  "The Netherlands": "NL",
  Austria: "AT",
  Germany: "DE",
  Slovakia: "SK",
  Czechia: "CZ",
  "Czech Republic": "CZ",
  Slovenia: "SI",
  Belgium: "BE",
  France: "FR",
  Cyprus: "CY",
  "United Kingdom": "GB",
  UK: "GB",
  Ireland: "IE",
  Italy: "IT",
  Switzerland: "CH",
  Malta: "MT",
  Albania: "AL",
  Montenegro: "ME",
  Macedonia: "MK",
  "North Macedonia": "MK",
  "Bosnia and Herzegovina": "BA",
  Kosovo: "XK",
  // South Asia — worker origin
  India: "IN",
  Nepal: "NP",
  Bangladesh: "BD",
  Pakistan: "PK",
  "Sri Lanka": "LK",
  // Other common
  "United States": "US",
  USA: "US",
  Canada: "CA",
  Turkey: "TR",
  Ukraine: "UA",
  Norway: "NO",
  Sweden: "SE",
  Finland: "FI",
  Denmark: "DK",
};

export function countryToIso2(country: string | null | undefined): CountryCode | undefined {
  if (!country) return undefined;
  const trimmed = country.trim();
  if (!trimmed) return undefined;
  return COUNTRY_NAME_TO_ISO2[trimmed];
}

/**
 * Sanitize a raw phone string: strip extensions, letters, punctuation,
 * convert international "00" prefix to "+", and keep one leading "+".
 */
function preCleanRaw(raw: string): string {
  let v = raw.trim();
  // Drop common extension markers (x, ext, #) and everything after
  v = v.replace(/\s*(?:ext\.?|x|#)\s*\d+.*$/i, "");
  // Remove letters and most punctuation, keep digits, +, space, dash, parens
  v = v.replace(/[^\d+\s\-().]/g, "");
  // Replace leading "00" international prefix with "+"
  v = v.replace(/^\s*00/, "+");
  // Strip all whitespace, dashes, dots and parens
  v = v.replace(/[\s\-().]/g, "");
  // Collapse multiple leading + to one
  v = v.replace(/^\++/, "+");
  return v;
}

export type ParsedPhone = {
  /** E.164 string including leading "+" (e.g. "+381641234567") */
  e164: string;
  /** Digits only, suitable for wa.me (no "+") */
  waDigits: string;
  /** Human-friendly international format */
  display: string;
  /** Detected country ISO-2 */
  country?: CountryCode;
  /** Whether libphonenumber considers it a valid number */
  valid: boolean;
};

/**
 * Parse any phone input into E.164 and WhatsApp-ready digits.
 * Falls back gracefully when libphonenumber cannot parse, so users can still
 * try wa.me with a best-effort digit string.
 */
export function parsePhone(
  raw: string | null | undefined,
  defaultCountry?: CountryCode | string | null,
): ParsedPhone | null {
  if (!raw) return null;
  const cleaned = preCleanRaw(raw);
  if (!cleaned || cleaned.replace(/\D/g, "").length < 6) return null;

  const iso2: CountryCode | undefined =
    typeof defaultCountry === "string"
      ? defaultCountry.length === 2
        ? (defaultCountry.toUpperCase() as CountryCode)
        : countryToIso2(defaultCountry)
      : (defaultCountry ?? undefined);

  try {
    const parsed = parsePhoneNumberFromString(cleaned, iso2);
    if (parsed && parsed.isPossible()) {
      const e164 = parsed.number; // includes "+"
      return {
        e164,
        waDigits: e164.replace(/\D/g, ""),
        display: parsed.formatInternational(),
        country: parsed.country,
        valid: parsed.isValid(),
      };
    }
  } catch {
    /* fall through to best-effort */
  }

  // Best-effort fallback so the user can still try to open WhatsApp
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (cleaned.startsWith("+")) {
    return {
      e164: `+${digitsOnly}`,
      waDigits: digitsOnly,
      display: `+${digitsOnly}`,
      country: iso2,
      valid: false,
    };
  }
  return {
    e164: `+${digitsOnly}`,
    waDigits: digitsOnly,
    display: digitsOnly,
    country: iso2,
    valid: false,
  };
}

/**
 * Pick the best available phone source from a demand lead and parse it.
 * Priority: explicit E.164 fields → WhatsApp number → raw contact_phone.
 */
export function pickLeadPhone(lead: {
  phone_e164?: string | null;
  whatsapp_number?: string | null;
  contact_phone?: string | null;
  country?: string | null;
}): ParsedPhone | null {
  const iso2 = countryToIso2(lead.country);
  const candidates = [lead.phone_e164, lead.whatsapp_number, lead.contact_phone];
  for (const cand of candidates) {
    const parsed = parsePhone(cand, iso2);
    if (parsed && parsed.valid) return parsed;
  }
  // No fully valid candidate — return the first best-effort parse instead
  for (const cand of candidates) {
    const parsed = parsePhone(cand, iso2);
    if (parsed) return parsed;
  }
  return null;
}

export { isValidPhoneNumber };