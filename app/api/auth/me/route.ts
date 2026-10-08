import { NextResponse } from "next/server";
import { viewerDetails } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = sessionUser(request);
  return NextResponse.json({ user: user ? viewerDetails(user.id) : null }, { headers: { "Cache-Control": "no-store" } });
}
