// Select contact email: domain match, direct > generic, discard junk addresses.
const GENERIC = new Set(["support", "care", "help", "info", "contact", "orders", "service", "customerservice", "cs", "returns", "press", "privacy", "legal", "billing", "noreply", "no-reply"]);
const WARM = new Set(["hello", "hi", "team", "partnerships", "wholesale", "founder", "ceo", "owner"]);
const JUNK = ["sentry", "shopify", "wixpress", "cloudflare", "example.com", "schema.org", "domain.com", "email.com", "test.com", "youremail", "username"];

export function pickContact(emails: string[], domain: string): { email: string; kind: "direct" | "generic" | "" } {
  const label = domain.replace(/^www\./, "").split(".")[0].toLowerCase();
  const ranked = [...new Set(emails.map((e) => e.toLowerCase().trim()))]
    .filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/.test(e) && !JUNK.some((j) => e.includes(j)))
    .filter((e) => (e.split("@")[1] || "").includes(label))
    .map((e) => { const l = e.split("@")[0]; return { e, kind: GENERIC.has(l) ? "generic" as const : "direct" as const, pri: GENERIC.has(l) ? 2 : WARM.has(l) ? 1 : 0 }; })
    .sort((a, b) => a.pri - b.pri);
  return ranked.length ? { email: ranked[0].e, kind: ranked[0].kind } : { email: "", kind: "" };
}
