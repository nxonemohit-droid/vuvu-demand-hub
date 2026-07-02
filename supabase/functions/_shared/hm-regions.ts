// Region presets for HM Mauritius engine.
export const HM_REGIONS: Record<string, { country: string; state?: string; cities: string[] }> = {
  "Manipur":            { country: "India", state: "Manipur",            cities: ["Imphal","Bishnupur","Thoubal"] },
  "Meghalaya":          { country: "India", state: "Meghalaya",          cities: ["Shillong","Tura","Jowai"] },
  "Assam":              { country: "India", state: "Assam",              cities: ["Guwahati","Dibrugarh","Jorhat","Silchar"] },
  "Nagaland":           { country: "India", state: "Nagaland",           cities: ["Kohima","Dimapur"] },
  "Mizoram":            { country: "India", state: "Mizoram",            cities: ["Aizawl"] },
  "Tripura":            { country: "India", state: "Tripura",            cities: ["Agartala"] },
  "Arunachal Pradesh":  { country: "India", state: "Arunachal Pradesh",  cities: ["Itanagar","Naharlagun"] },
  "Sikkim":             { country: "India", state: "Sikkim",             cities: ["Gangtok"] },
  "Uttarakhand":        { country: "India", state: "Uttarakhand",        cities: ["Dehradun","Haldwani","Nainital","Rishikesh","Haridwar","Mussoorie"] },
  "Nepal":              { country: "Nepal",                              cities: ["Kathmandu","Pokhara","Chitwan","Biratnagar","Butwal","Lalitpur"] },
};

export const HM_KEYWORDS_INSTITUTE = [
  "hotel management institute",
  "IHM",
  "institute of hotel management",
  "culinary institute",
  "hospitality college",
  "diploma hotel management",
  "hotel management college",
];

export const HM_KEYWORDS_CONSULTANCY = [
  "hotel management consultancy",
  "overseas hospitality admissions",
  "study abroad hotel management",
  "Mauritius admissions consultant",
  "hospitality career consultant",
  "study abroad consultant hotel management",
];

export function buildQueries(bucket: "institute" | "consultancy", regions: string[]): string[] {
  const kws = bucket === "institute" ? HM_KEYWORDS_INSTITUTE : HM_KEYWORDS_CONSULTANCY;
  const out: string[] = [];
  for (const region of regions) {
    const preset = HM_REGIONS[region];
    if (!preset) continue;
    const scopes = [region, ...preset.cities];
    for (const kw of kws) {
      for (const scope of scopes) {
        out.push(`"${kw}" ${scope}`);
      }
    }
  }
  return out;
}

export function detectRegion(text: string): { region: string; city?: string; country: string } | null {
  const t = text.toLowerCase();
  for (const [region, meta] of Object.entries(HM_REGIONS)) {
    if (t.includes(region.toLowerCase())) {
      const city = meta.cities.find((c) => t.includes(c.toLowerCase()));
      return { region, city, country: meta.country };
    }
    for (const city of meta.cities) {
      if (t.includes(city.toLowerCase())) return { region, city, country: meta.country };
    }
  }
  return null;
}