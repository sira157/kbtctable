import { NextResponse, type NextRequest } from "next/server";
import { authToken, COOKIE } from "@/lib/auth";

// tiny brute-force brake: per-IP failures in memory
const fails = new Map<string, { n: number; until: number }>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "local";
  const f = fails.get(ip);
  if (f && f.until > Date.now()) {
    return NextResponse.json({ message: "ใส่รหัสผิดหลายครั้ง กรุณารอ 1 นาที" }, { status: 429 });
  }

  const { password, next } = (await req.json().catch(() => ({}))) as { password?: string; next?: string };
  const expected = process.env.APP_PASSWORD;
  if (!expected || password !== expected) {
    const n = (f?.n ?? 0) + 1;
    fails.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    return NextResponse.json({ message: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  fails.delete(ip);

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.json({ ok: true, next: safeNext });
  res.cookies.set(COOKIE, await authToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
  return res;
}
