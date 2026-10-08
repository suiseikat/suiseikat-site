import { NextResponse } from "next/server";
import { getUserCredentialsByEmail, updatePassword } from "@/lib/community-db";
import { hashPassword } from "@/lib/session";

export const runtime = "nodejs";
const attempts = new Map<string, number>();

export async function POST(request: Request) {
  const address = (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  if (now - (attempts.get(address) ?? 0) < 8_000) return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: 429 });
  attempts.set(address, now);
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown; confirmPassword?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const confirmation = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  if (!email) return NextResponse.json({ error: "请填写注册时使用的邮箱。" }, { status: 400 });
  if (password.length < 8 || password.length > 128) return NextResponse.json({ error: "新密码长度需要在 8—128 位之间。" }, { status: 400 });
  if (password !== confirmation) return NextResponse.json({ error: "两次输入的新密码不一致。" }, { status: 400 });
  const account = getUserCredentialsByEmail(email);
  if (!account) return NextResponse.json({ error: "没有找到使用这个邮箱的账号。" }, { status: 404 });
  updatePassword(account.id, hashPassword(password));
  return NextResponse.json({ ok: true });
}
