import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE, cookieSecurity } from "@/lib/session";

export const runtime = "nodejs";
export async function POST(request: Request) {
  destroySession(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: cookieSecurity(request), sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
