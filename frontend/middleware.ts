import { NextResponse, type NextRequest } from "next/server";
import { authToken, COOKIE } from "@/lib/auth";

/**
 * Shared-password gate for every page and every /api call.
 * Password comes from APP_PASSWORD (frontend/.env.local). Cookie holds a SHA-256 of it, never the password.
 */

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/auth/")) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  if (!password) {
    return new NextResponse("APP_PASSWORD is not set — add it to frontend/.env.local", { status: 500 });
  }
  const ok = req.cookies.get(COOKIE)?.value === (await authToken(password));
  if (ok && pathname.startsWith("/api/")) {
    // logged in → proxy to the backend with the shared backend secret (backend rejects calls without it)
    const target = new URL(pathname + req.nextUrl.search, process.env.BACKEND_URL ?? "http://127.0.0.1:3001");
    const headers = new Headers(req.headers);
    headers.delete("cookie");
    if (process.env.BACKEND_TOKEN) headers.set("x-backend-token", process.env.BACKEND_TOKEN);
    return NextResponse.rewrite(target, { request: { headers } });
  }
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // everything except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
