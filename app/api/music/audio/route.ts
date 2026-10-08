import { getMusicAudioUrl } from "@/lib/netease-music";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("id") ?? "";
  const id = Number(value);
  if (!/^\d{1,16}$/.test(value) || !Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "无效的歌曲编号。" }, { status: 400 });
  }
  return Response.json({ url: await getMusicAudioUrl(id) }, { headers: { "Cache-Control": "no-store" } });
}
