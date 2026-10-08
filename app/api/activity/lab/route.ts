import { NextResponse } from "next/server";
import { recordLabUse } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = sessionUser(request);
  if (!user || user.disabled) return NextResponse.json({ awarded: false }, { status: 401 });
  const body = await request.json().catch(() => null) as { tool?: unknown } | null;
  const tool = typeof body?.tool === "string" && /^[a-z0-9-]{2,40}$/.test(body.tool) ? body.tool : "";
  if (!tool) return NextResponse.json({ error: "工具标识无效。" }, { status: 400 });
  return NextResponse.json(recordLabUse(user.id, tool));
}
