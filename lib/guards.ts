// Lightweight safety guard for API routes: per-IP rate limiting (in-memory, per instance), same-origin, body size limit.
import { NextRequest, NextResponse } from "next/server";

const buckets = new Map<string, { n: number; t: number }>();

export function guard(req: NextRequest, { limit = 30, windowMs = 60_000, maxBody = 64_000 } = {}): NextResponse | null {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > maxBody) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const ip = (req.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.t > windowMs) buckets.set(ip, { n: 1, t: now });
  else if (++b.n > limit) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.t > windowMs) buckets.delete(k);
  return null;
}

export const clip = (v: unknown, max: number): string => String(v ?? "").slice(0, max);
