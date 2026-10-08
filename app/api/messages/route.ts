import path from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { createMessage, listMessages, uploadDirectory } from "@/lib/community-db";
import { actorKey, sessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recentPosts = new Map<string, number>();
const cityCache = new Map<string, string | null>();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function resolveCity(ip: string, request: Request) {
  const header = request.headers.get("cf-ipcity") ?? request.headers.get("x-vercel-ip-city");
  if (header) return decodeURIComponent(header).slice(0, 64);
  if (ip === "local" || ip.startsWith("127.") || ip === "::1") return null;
  if (cityCache.has(ip)) return cityCache.get(ip) ?? null;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city&lang=zh-CN`, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    const data = await response.json() as { success?: boolean; city?: string };
    const city = data.success && data.city ? data.city.slice(0, 64) : null;
    if (cityCache.size > 2000) cityCache.clear(); cityCache.set(ip, city); return city;
  } catch { return request.headers.get("cf-ipcountry"); }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 200;
  const viewer = sessionUser(request);
  return Response.json(
    { messages: listMessages(limit, viewer, actorKey(request, viewer)), viewer },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const viewer = sessionUser(request);
  if (!viewer) return Response.json({ error: "请先登录后再留言。" }, { status: 401 });
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  const visitor = forwarded.split(",")[0]?.trim() || "local";
  const now = Date.now();
  if (now - (recentPosts.get(visitor) ?? 0) < 20_000) {
    return Response.json({ error: "发送得太快了，请稍后再试。" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "留言格式不正确。" }, { status: 400 });
  }
  const content = String(form.get("content") ?? "").trim();
  if (!content || content.length > 280) {
    return Response.json({ error: "留言需要填写，且不能超过 280 个字符。" }, { status: 400 });
  }

  let imageName: string | null = null;
  const upload = form.get("image");
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_IMAGE_BYTES) return Response.json({ error: "图片不能超过 5 MB。" }, { status: 413 });
    if (!ALLOWED_IMAGES.has(upload.type)) return Response.json({ error: "只支持 JPG、PNG 或 WebP 图片。" }, { status: 415 });
    imageName = `${crypto.randomUUID()}.webp`;
    try {
      const output = await sharp(Buffer.from(await upload.arrayBuffer()), { failOn: "warning" })
        .rotate()
        .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer();
      await writeFile(path.join(/* turbopackIgnore: true */ uploadDirectory, imageName), output, { flag: "wx" });
    } catch {
      return Response.json({ error: "这张图片无法处理，请换一张再试。" }, { status: 400 });
    }
  }

  recentPosts.set(visitor, now);
  if (recentPosts.size > 1_000) {
    for (const [address, postedAt] of recentPosts) if (now - postedAt > 60_000) recentPosts.delete(address);
  }
  const city = await resolveCity(visitor, request);
  return Response.json({ message: createMessage(viewer, content, imageName, city) }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
