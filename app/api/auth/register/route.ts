import { NextResponse } from "next/server";
import { createUser } from "@/lib/community-db";
import { createSession, hashPassword, SESSION_COOKIE, SESSION_SECONDS, cookieSecurity } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: unknown; email?: unknown; password?: unknown; confirmPassword?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.normalize("NFKC").trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const confirmation = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username)) return NextResponse.json({ error: "用户名需为 2—24 个文字、数字、下划线或连字符。" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return NextResponse.json({ error: "请填写有效邮箱。" }, { status: 400 });
  if (password.length < 8 || password.length > 128) return NextResponse.json({ error: "密码长度需要在 8—128 位之间。" }, { status: 400 });
  if (password !== confirmation) return NextResponse.json({ error: "两次输入的密码不一致。" }, { status: 400 });
  try {
    const user = createUser(username, email, hashPassword(password));
    const session = createSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: cookieSecurity(request), sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("username_key")) return NextResponse.json({ error: "这个用户名已经被使用。" }, { status: 409 });
    if (message.includes("email_key")) return NextResponse.json({ error: "这个邮箱已经注册过账号。" }, { status: 409 });
    return NextResponse.json({ error: "注册暂时失败，请稍后再试。" }, { status: 500 });
  }
}
