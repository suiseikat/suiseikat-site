import { NextResponse } from "next/server";
import { getUserCredentials, getUserById } from "@/lib/community-db";
import { createSession, verifyPassword, SESSION_COOKIE, SESSION_SECONDS, cookieSecurity } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { identity?: unknown; password?: unknown } | null;
  const identity = typeof body?.identity === "string" ? body.identity.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const account = identity ? getUserCredentials(identity) : undefined;
  if (!account || !verifyPassword(password, account.password_hash)) return NextResponse.json({ error: "用户名、邮箱或密码不正确。" }, { status: 401 });
  if (account.disabled) return NextResponse.json({ error: "这个账号已被停用。" }, { status: 403 });
  const session = createSession(account.id);
  const response = NextResponse.json({ user: getUserById(account.id) });
  response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: cookieSecurity(request), sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
