import { NextResponse } from "next/server";
import { weeklyLeaderboard } from "@/lib/community-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ users: weeklyLeaderboard() }, { headers: { "Cache-Control": "no-store" } });
}
