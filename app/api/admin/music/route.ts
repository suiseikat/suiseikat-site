import { getSiteSetting, setSiteSetting } from "@/lib/community-db";
import { extractPlaylistId, inspectPlaylist } from "@/lib/netease-music";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin(request: Request) { return sessionUser(request)?.role === "admin"; }

export async function GET(request: Request) {
  if (!admin(request)) return Response.json({ error: "无权访问。" }, { status: 403 });
  return Response.json({ playlistUrl: getSiteSetting("netease_playlist_url") ?? "", playlistId: getSiteSetting("netease_playlist_id") ?? "" }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!admin(request)) return Response.json({ error: "无权访问。" }, { status: 403 });
  const body = await request.json().catch(() => null) as { playlistUrl?: string } | null;
  const playlistUrl = body?.playlistUrl?.trim() ?? "";
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) return Response.json({ error: "请输入有效的网易云歌单链接或歌单 ID。" }, { status: 400 });
  try {
    const playlist = await inspectPlaylist(playlistId);
    setSiteSetting("netease_playlist_url", playlistUrl);
    setSiteSetting("netease_playlist_id", playlistId);
    setSiteSetting("netease_daily_track", "");
    return Response.json({ playlistId, playlist });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "歌单解析失败。" }, { status: 502 });
  }
}
