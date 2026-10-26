// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { extractEmails, findContactLinks, scanSiteContacts } from "../../supabase/functions/_shared/site-contacts";

afterEach(() => vi.unstubAllGlobals());

describe("site contact extraction", () => {
  it("drops junk emails and puts company-domain emails first", () => {
    const html = 'a@gmail.com <a href="mailto:info@acme.lv">x</a> noreply@acme.lv logo@2x.png user@example.com';
    expect(extractEmails(html, "acme.lv")).toEqual(["info@acme.lv", "a@gmail.com"]);
  });
  it("finds same-site contact links only", () => {
    const html = '<a href="/kontakti">K</a><a href="https://other.com/contact">O</a>';
    expect(findContactLinks(html, "https://acme.lv")).toEqual(["https://acme.lv/kontakti"]);
  });
  it("starts both contact pages together and preserves extracted details", async () => {
    let contactsStarted = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "https://acme.lv") return new Response('<a href="/contact">Contact</a><a href="/about">About</a>', { headers: { "content-type": "text/html" } });
      contactsStarted++;
      if (contactsStarted === 2) release?.();
      await gate;
      return new Response(url.endsWith("/contact") ? "info@acme.lv" : '<a href="tel:+37112345678">Call</a>', { headers: { "content-type": "text/html" } });
    }));
    const budget = { firecrawlLeft: 10, firecrawlUsed: 0 };
    const result = await scanSiteContacts("acme.lv", budget);
    expect(contactsStarted).toBe(2);
    expect(result.emails).toEqual(["info@acme.lv"]);
    expect(result.phones).toEqual(["+37112345678"]);
    expect(budget.firecrawlUsed).toBe(0);
  });
  it("counts each Firecrawl request, never exceeding the shared allowance", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "test-only" } });
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = { firecrawlLeft: 1, firecrawlUsed: 0 };
    await scanSiteContacts("acme.lv", budget);
    expect(fetchMock.mock.calls.length).toBe(4);
    expect(budget).toEqual({ firecrawlLeft: 0, firecrawlUsed: 1 });
  });
});
