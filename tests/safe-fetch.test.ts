import assert from "node:assert/strict";
import { isPrivateIp, parseStoreUrl, assertPublicHost, safeFetchText } from "../lib/safe-fetch.ts";

const bad = ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
  "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"];
const good = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"];
bad.forEach((ip) => assert.equal(isPrivateIp(ip), true, ip));
good.forEach((ip) => assert.equal(isPrivateIp(ip), false, ip));

assert.equal(parseStoreUrl("Example.com/foo").href, "https://example.com/");
for (const u of ["http://example.com", "https://user:pw@example.com", "https://example.com:8443", "https://localhost",
  "https://127.0.0.1", "https://[::1]", "ftp://example.com", "intranet"]) {
  assert.throws(() => parseStoreUrl(u), undefined, u);
}
await assert.rejects(() => assertPublicHost("localhost"), /non-publik/);
await assert.rejects(() => safeFetchText("https://127.0.0.1/products.json"), /domain publik/);
await assert.rejects(() => safeFetchText("https://169.254.169.254/latest/meta-data"), /domain publik/);
console.log("OK: semua tes SSRF lolos");
