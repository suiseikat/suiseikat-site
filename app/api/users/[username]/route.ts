import { NextResponse } from "next/server";
import { publicProfile } from "@/lib/community-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const profile = publicProfile(decodeURIComponent(username));
  return profile ? NextResponse.json({ profile }) : NextResponse.json({ error: "没有找到这个用户。" }, { status: 404 });
}
