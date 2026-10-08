import { NextResponse } from "next/server";
import { checkIn } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = sessionUser(request);
  if (!user || user.disabled) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  return NextResponse.json(checkIn(user.id));
}
