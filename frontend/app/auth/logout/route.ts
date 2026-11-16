import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE);
  return res;
}
