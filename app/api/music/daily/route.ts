import { getDailyMusic } from "@/lib/netease-music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const track = await getDailyMusic();
    return Response.json({ track }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
  } catch (error) {
    return Response.json({ track: null, error: error instanceof Error ? error.message : "音乐接口暂时不可用。" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  try {
    const track = await getDailyMusic(true);
    return Response.json({ track }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ track: null, error: error instanceof Error ? error.message : "音乐接口暂时不可用。" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
