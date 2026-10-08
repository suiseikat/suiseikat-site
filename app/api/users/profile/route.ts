import path from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { updateProfile, uploadDirectory } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function PATCH(request: Request) {
  const user = sessionUser(request);
  if (!user || user.disabled) return Response.json({ error: "请先登录。" }, { status: 401 });
  const body = await request.json().catch(() => null) as { bio?: string; displayName?: string } | null;
  if (!body || (typeof body.bio !== "string" && typeof body.displayName !== "string")) return Response.json({ error: "没有可保存的资料。" }, { status: 400 });
  const displayName = typeof body.displayName === "string" ? body.displayName.normalize("NFKC").trim() : undefined;
  if (displayName !== undefined && displayName.length > 32) return Response.json({ error: "展示名称不能超过 32 个字符。" }, { status: 400 });
  const result = updateProfile(user.id, {
    bio: typeof body.bio === "string" ? body.bio.trim().slice(0, 160) : undefined,
    displayName,
  });
  return Response.json({ viewer: result?.viewer }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = sessionUser(request);
  if (!user || user.disabled) return Response.json({ error: "请先登录。" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const upload = form?.get("background");
  if (!(upload instanceof File) || !upload.size) return Response.json({ error: "请选择背景图片。" }, { status: 400 });
  if (upload.size > MAX_BYTES) return Response.json({ error: "背景图片不能超过 12 MB。" }, { status: 413 });
  if (!ALLOWED.has(upload.type)) return Response.json({ error: "只支持 JPG、PNG 或 WebP。" }, { status: 415 });
  const name = `${crypto.randomUUID()}-profile.webp`;
  try {
    const output = await sharp(Buffer.from(await upload.arrayBuffer()), { failOn: "warning" })
      .rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    await writeFile(path.join(/* turbopackIgnore: true */ uploadDirectory, name), output, { flag: "wx" });
    const result = updateProfile(user.id, { backgroundName: name });
    if (!result) throw new Error("User not found");
    if (result.previousBackground) await unlink(path.join(/* turbopackIgnore: true */ uploadDirectory, result.previousBackground)).catch(() => undefined);
    return Response.json({ viewer: result.viewer }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await unlink(path.join(/* turbopackIgnore: true */ uploadDirectory, name)).catch(() => undefined);
    return Response.json({ error: "背景图片处理失败。" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = sessionUser(request);
  if (!user || user.disabled) return Response.json({ error: "请先登录。" }, { status: 401 });
  const result = updateProfile(user.id, { backgroundName: null });
  if (result?.previousBackground) await unlink(path.join(/* turbopackIgnore: true */ uploadDirectory, result.previousBackground)).catch(() => undefined);
  return Response.json({ viewer: result?.viewer }, { headers: { "Cache-Control": "no-store" } });
}
