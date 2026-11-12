// SSRF guard for app/api/audit/route.ts: User URLs -> public hosts only, https, timeout/size/redirect limits.
import dns from "node:dns/promises";
import net from "node:net";

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateIp(m[1]);
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
  }
  return true; // unrecognized -> reject
}

export function parseStoreUrl(raw: string): URL {
  const s = raw.trim();
  if (s.length === 0 || s.length > 253) throw new Error("Invalid URL");
  const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  if (u.protocol !== "https:") throw new Error("Only https is allowed");
  if (u.username || u.password) throw new Error("Credentials in URL rejected");
  if (u.port && u.port !== "443") throw new Error("Non-standard port rejected");
  if (!u.hostname.includes(".") || net.isIP(u.hostname)) throw new Error("Only public domain names allowed");
  return new URL(`https://${u.hostname}`);
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const addrs = await dns.lookup(hostname, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Non-public host rejected");
}

export async function safeFetchText(
  url: string,
  { timeoutMs = 12000, maxBytes = 5_000_000, maxRedirects = 3 } = {},
): Promise<{ status: number; text: string }> {
  let current = parseStoreUrl(url).origin + new URL(url.startsWith("http") ? url : `https://${url}`).pathname +
    new URL(url.startsWith("http") ? url : `https://${url}`).search;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = new URL(current);
    if (u.protocol !== "https:") throw new Error("Non-https redirect rejected");
    await assertPublicHost(u.hostname);
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { await reader.cancel(); throw new Error("Response too large"; }
      chunks.push(value);)
    }
    return { status: res.status, text: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("Too many redirects");
}

/** Drop-in replacement for fetch(): validates public host on each redirect, size limit, https only. */
export async function safeFetch(
  url: string,
  init: RequestInit & { next?: unknown } = {},
  { maxBytes = 5_000_000, maxRedirects = 3 } = {},
): Promise<Response> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = new URL(current);
    if (u.protocol !== "https:") throw new Error("Only https is allowed");
    if (u.username || u.password || (u.port && u.port !== "443")) throw new Error("URL rejected");
    await assertPublicHost(u.hostname);
    const { next: _next, ...rest } = init;
    const res = await fetch(u, { ...rest, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(12000) });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, u).toString(); continue; }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { await reader.cancel(); throw new Error("Response too large"); }
      chunks.push(value);
    }
    return new Response(Buffer.concat(chunks), { status: res.status, headers: res.headers });
  }
  throw new Error("Too many redirects");
}
