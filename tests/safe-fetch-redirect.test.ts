import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { safeFetch } from "../lib/safe-fetch.ts";
import { pickContact } from "../lib/contacts.ts";

const map: Record<string, string> = { "public.test": "93.184.216.34", "internal.test": "10.0.0.5", "meta.test": "169.254.169.254" };
(dns as any).lookup = async (h: string) => [{ address: map[h] ?? "93.184.216.34", family: 4 }];
const realFetch = globalThis.fetch;

// 1. public redirect -> private host must be rejected
globalThis.fetch = (async (u: any) => new URL(u).hostname === "public.test"
  ? new Response(null, { status: 302, headers: { location: "https://internal.test/secret" } })
  : new Response("secret")) as any;
await assert.rejects(() => safeFetch("https://public.test/products.json"), /non-public/i);

// 2. redirect to http:// rejected
globalThis.fetch = (async () => new Response(null, { status: 301, headers: { location: "http://public.test/" } })) as any;
await assert.rejects(() => safeFetch("https://public.test/"), /https/i);

// 3. normal path + .json() still works (drop-in)
globalThis.fetch = (async () => new Response(JSON.stringify({ products: [1, 2] }), { status: 200 })) as any;
const ok = await safeFetch("https://public.test/products.json");
assert.equal(ok.status, 200); assert.deepEqual((await ok.json()).products, [1, 2]);

// 4. response too large rejected
globalThis.fetch = (async () => new Response("x".repeat(2000), { status: 200 })) as any;
await assert.rejects(() => safeFetch("https://public.test/", {}, { maxBytes: 1000 }), /too large/i);

// 5. redirect loop limited
globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: "https://public.test/again" } })) as any;
await assert.rejects(() => safeFetch("https://public.test/"), /redirect/i);
globalThis.fetch = realFetch;

// 6. contact ranking
assert.deepEqual(pickContact(["support@acme.com", "hello@acme.com"], "acme.com"), { email: "hello@acme.com", kind: "direct" });
assert.deepEqual(pickContact(["jane@acme.com", "hello@acme.com"], "www.acme.com").email, "jane@acme.com");
assert.deepEqual(pickContact(["support@acme.com"], "acme.com"), { email: "support@acme.com", kind: "generic" });
assert.deepEqual(pickContact(["x@sentry.io", "a@other.com", "logo@acme.com.png"], "acme.com"), { email: "", kind: "" });
console.log("OK: redirect, size, and contact tests passed");
