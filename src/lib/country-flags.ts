// Map of country names → emoji flag (used for compact LeadCard headers).
// Covers Voynova target countries (Balkans + EU) and worker-origin countries
// (S. Asia). Falls back to a globe emoji for anything we don't recognise.

const FLAGS: Record<string, string> = {
  // Worker-origin countries
  India: "🇮🇳",
  Nepal: "🇳🇵",
  Bangladesh: "🇧🇩",
  // Balkans
  Serbia: "🇷🇸",
  Croatia: "🇭🇷",
  Slovenia: "🇸🇮",
  "Bosnia and Herzegovina": "🇧🇦",
  Montenegro: "🇲🇪",
  "North Macedonia": "🇲🇰",
  Albania: "🇦🇱",
  Kosovo: "🇽🇰",
  Bulgaria: "🇧🇬",
  Romania: "🇷🇴",
  // EU
  Germany: "🇩🇪",
  Poland: "🇵🇱",
  Czechia: "🇨🇿",
  Hungary: "🇭🇺",
  Slovakia: "🇸🇰",
  Austria: "🇦🇹",
  Italy: "🇮🇹",
  Portugal: "🇵🇹",
  Greece: "🇬🇷",
  Cyprus: "🇨🇾",
  Malta: "🇲🇹",
  Netherlands: "🇳🇱",
};

export function countryFlag(country: string | null | undefined): string {
  if (!country) return "🌐";
  return FLAGS[country] ?? "🌐";
}