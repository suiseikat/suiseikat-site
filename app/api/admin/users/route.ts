import { NextResponse } from "next/server";
import { searchUsers } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const viewer = sessionUser(request);
  if (viewer?.role !== "admin") return NextResponse.json({ error: "无权访问。" }, { status: 403 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ users: searchUsers(query) }, { headers: { "Cache-Control": "no-store" } });
}
