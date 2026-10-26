/**
 * Direct website contact scanner: fetches homepage + contact pages with plain
 * fetch and extracts emails/phones. Firecrawl scrape is only a budgeted fallback.
 * Required secrets (optional fallback): FIRECRAWL_API_KEY, LOVABLE_API_KEY
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK_EMAIL = /(example\.|sentry|wixpress|noreply|no-reply|donotreply|\.(png|jpe?g|gif|svg|webp)$|@domain\.|yourname|email@)/i;
const CONTACT_WORDS = /(contact|kontakt|kontakti|epikoinonia|about|sazinai|yhteys)/i;

/** Extract clean emails from html/text; company-domain emails first. */
export function extractEmails(html: string, domain?: string | null): string[] {
  const decoded = html.replace(/&#64;|\[at\]|\(at\)/gi, "@");
  const set = new Set<string>();
  for (const m of decoded.match(EMAIL_RE) ?? []) {
    const e = m.toLowerCase().replace(/^mailto:/, "").replace(/\.+$/, "");
    if (!JUNK_EMAIL.test(e)) set.add(e);
  }
  const base = domain?.replace(/^www\./, "").toLowerCase();
  return [...set].sort((a, b) => {
    const ad = base && a.endsWith(base) ? 0 : 1;
    const bd = base && b.endsWith(base) ? 0 : 1;
    return ad - bd;
  });
}

/** Extract phone numbers from tel: links. */
export function extractPhones(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const p = decodeURIComponent(m[1]).replace(/[^\d+]/g, "");
    if (p.replace(/\D/g, "").length >= 7) set.add(p);
  }
  return [...set];
}

/** Find same-site contact page links. */
export function findContactLinks(html: string, origin: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, "");
    if (!CONTACT_WORDS.test(href) && !CONTACT_WORDS.test(text)) continue;
    try {
      const u = new URL(href, origin);
      if (u.origin === origin) out.add(u.toString());
    } catch { /* ignore */ }
  }
  return [...out].slice(0, 2);
}

async function getHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    return (await res.text()).slice(0, 400_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type ScanBudget = { firecrawlLeft: number; firecrawlUsed: number };

async function firecrawlScrape(url: string, budget: ScanBudget): Promise<string | null> {
  const env = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  const fc = env?.get("FIRECRAWL_API_KEY");
  const lk = env?.get("LOVABLE_API_KEY");
  if (!fc || !lk || budget.firecrawlLeft <= 0) return null;
  // Reserve each actual request before awaiting, including fallback requests.
  budget.firecrawlLeft--;
  budget.firecrawlUsed++;
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
      method: "POST",
      signal: AbortSignal.timeout(6000),
      headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": fc, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.data?.markdown ?? d.markdown ?? null;
  } catch {
    return null;
  }
}

export type SiteContacts = { emails: string[]; phones: string[]; usedFirecrawl: boolean };

/** Scan a domain's homepage + contact pages. */
export async function scanSiteContacts(domain: string, budget: ScanBudget): Promise<SiteContacts> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 14000);
  try {
  const origin = `https://${domain}`;
  const home = await getHtml(origin);
  let all = home ?? "";
  const pages = home ? findContactLinks(home, new URL(origin).origin) : [];
  if (!pages.length) pages.push(`${origin}/contact`, `${origin}/contact-us`);
  // Contact pages are independent: fetch both together instead of serially.
  all += (await Promise.all(pages.slice(0, 2).map(getHtml))).map((html) => html ?? "").join("\n");
  let emails = extractEmails(all, domain);
  let usedFirecrawl = false;
  if (!emails.length && !home && budget.firecrawlLeft > 0 && !deadline.signal.aborted) {
    const before = budget.firecrawlUsed;
    const contact = await firecrawlScrape(`${origin}/contact`, budget);
    const md = contact ?? (!deadline.signal.aborted ? await firecrawlScrape(origin, budget) : null);
    usedFirecrawl = budget.firecrawlUsed > before;
    if (md) { all += md; emails = extractEmails(all, domain); }
  }
  return { emails: emails.slice(0, 3), phones: extractPhones(all).slice(0, 2), usedFirecrawl };
  } finally {
    clearTimeout(timer);
  }
}
