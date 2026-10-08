import { NextResponse } from "next/server";
import { listNovels } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = sessionUser(request);
  if (viewer?.role !== "admin") return NextResponse.json({ error: "无权访问。" }, { status: 403 });
  try {
    return NextResponse.json({ novels: listNovels() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ novels: [], unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
