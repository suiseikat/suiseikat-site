import path from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { updateAvatar, uploadDirectory } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const user = sessionUser(request);
  if (!user || user.disabled) return Response.json({ error: "请先登录。" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const upload = form?.get("avatar");
  if (!(upload instanceof File) || !upload.size) return Response.json({ error: "请选择头像图片。" }, { status: 400 });
  if (upload.size > MAX_BYTES) return Response.json({ error: "头像不能超过 5 MB。" }, { status: 413 });
  if (!ALLOWED.has(upload.type)) return Response.json({ error: "只支持 JPG、PNG 或 WebP。" }, { status: 415 });
  const avatarName = `${crypto.randomUUID()}.webp`;
  try {
    const output = await sharp(Buffer.from(await upload.arrayBuffer()), { failOn: "warning" })
      .rotate().resize(512, 512, { fit: "cover", position: "attention" }).webp({ quality: 88 }).toBuffer();
    await writeFile(path.join(/* turbopackIgnore: true */ uploadDirectory, avatarName), output, { flag: "wx" });
    const result = updateAvatar(user.id, avatarName);
    if (!result) throw new Error("User not found");
    if (result.previous) await unlink(path.join(/* turbopackIgnore: true */ uploadDirectory, result.previous)).catch(() => undefined);
    return Response.json({ viewer: result.viewer }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await unlink(path.join(/* turbopackIgnore: true */ uploadDirectory, avatarName)).catch(() => undefined);
    return Response.json({ error: "头像处理失败，请换一张图片。" }, { status: 400 });
  }
}
