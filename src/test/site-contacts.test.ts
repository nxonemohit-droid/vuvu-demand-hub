import { describe, it, expect } from "vitest";
import { extractEmails, findContactLinks } from "../../supabase/functions/_shared/site-contacts";

describe("site contact extraction", () => {
  it("drops junk emails and puts company-domain emails first", () => {
    const html = 'a@gmail.com <a href="mailto:info@acme.lv">x</a> noreply@acme.lv logo@2x.png user@example.com';
    expect(extractEmails(html, "acme.lv")).toEqual(["info@acme.lv", "a@gmail.com"]);
  });
  it("finds same-site contact links only", () => {
    const html = '<a href="/kontakti">K</a><a href="https://other.com/contact">O</a>';
    expect(findContactLinks(html, "https://acme.lv")).toEqual(["https://acme.lv/kontakti"]);
  });
});
