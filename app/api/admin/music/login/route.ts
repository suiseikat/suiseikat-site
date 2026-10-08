import { checkLoginQr, clearNeteaseCookie, createLoginQr, neteaseLoginStatus } from "@/lib/netease-music";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function admin(request: Request) { return sessionUser(request)?.role === "admin"; }
export async function GET(request: Request) {
  if (!admin(request)) return Response.json({ error: "无权访问。" }, { status: 403 });
  const key = new URL(request.url).searchParams.get("key");
  try { return Response.json(key ? await checkLoginQr(key) : await neteaseLoginStatus(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "网易云登录暂时不可用。" }, { status: 502 }); }
}
export async function POST(request: Request) {
  if (!admin(request)) return Response.json({ error: "无权访问。" }, { status: 403 });
  try { return Response.json(await createLoginQr(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "二维码生成失败。" }, { status: 502 }); }
}
export async function DELETE(request: Request) {
  if (!admin(request)) return Response.json({ error: "无权访问。" }, { status: 403 });
  clearNeteaseCookie(); return Response.json({ connected: false });
}
