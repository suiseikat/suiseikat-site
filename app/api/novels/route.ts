import path from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { createNovel, listNovels, uploadDirectory } from "@/lib/community-db";
import { parseNovel } from "@/lib/novel-parse";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";

const FORMATS = new Set(["epub", "mobi", "azw", "azw3"]);
// Book files live beside the generated covers so a single volume mount holds both.
export const bookDirectory = path.join(uploadDirectory, "books");

export async function GET() {
  // 数据库在某些运行时不可用（例如受限的 dev worker）时返回空列表而不是抛错，
  // 这样作品页会退化为灰色占位封面，而不是整页报错。
  try {
    return Response.json({ novels: listNovels() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ novels: [], unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }
}

type StoredResult = { name: string; ok: true; id: string; title: string } | { name: string; ok: false; error: string };

/** 处理单个文件：解析元信息 → 保存原文件 → 抽取封面转 webp → 入库。 */
async function storeOne(upload: File, userId: string): Promise<StoredResult> {
  const name = upload.name || "未命名";
  if (!upload.size) return { name, ok: false, error: "空文件。" };

  const extension = (name.split(".").pop() ?? "").toLowerCase();
  if (!FORMATS.has(extension)) return { name, ok: false, error: "格式不支持（仅 epub / mobi / azw / azw3）。" };

  const buffer = Buffer.from(await upload.arrayBuffer());
  const parsed = parseNovel(buffer, name);
  const id = crypto.randomUUID();
  const fileName = `${id}.${extension}`;

  try {
    await writeFile(path.join(/* turbopackIgnore: true */ bookDirectory, fileName), buffer, { flag: "wx" });
  } catch {
    return { name, ok: false, error: "文件写入失败。" };
  }

  // 有封面就转成 webp；没有封面保持 null，前端会回退到灰色占位图。
  let savedCover: string | null = null;
  if (parsed.cover) {
    try {
      const output = await sharp(parsed.cover.data, { failOn: "none" })
        .rotate().resize(900, 1300, { fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
      const coverName = `${id}.webp`;
      await writeFile(path.join(/* turbopackIgnore: true */ uploadDirectory, coverName), output, { flag: "wx" });
      savedCover = coverName;
    } catch {
      savedCover = null;
    }
  }

  try {
    const row = createNovel({
      title: parsed.title, author: parsed.author, kana: "", genre: parsed.genre,
      description: parsed.description, format: extension, fileName, coverName: savedCover,
      uploadedBy: userId,
    });
    if (!row) throw new Error("insert failed");
    return { name, ok: true, id: row.id, title: row.title };
  } catch {
    await unlink(path.join(/* turbopackIgnore: true */ bookDirectory, fileName)).catch(() => undefined);
    if (savedCover) await unlink(path.join(/* turbopackIgnore: true */ uploadDirectory, savedCover)).catch(() => undefined);
    return { name, ok: false, error: "入库失败。" };
  }
}

export async function POST(request: Request) {
  const user = sessionUser(request);
  if (!user) return Response.json({ error: "请先登录管理员账号。" }, { status: 401 });
  if (user.disabled || user.role !== "admin") return Response.json({ error: "只有管理员可以添加小说。" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "上传数据无法解析。" }, { status: 400 });

  // 兼容两种字段名：files（多选）与 file（单个），支持一次上传多本。
  const uploads = [...form.getAll("files"), ...form.getAll("file")].filter((entry): entry is File => entry instanceof File);
  if (!uploads.length) return Response.json({ error: "请选择 epub 或 mobi 文件。" }, { status: 400 });

  try { await mkdir(bookDirectory, { recursive: true }); } catch { /* 目录可能已存在 */ }

  const results: StoredResult[] = [];
  // 串行处理：sharp 解码大图很吃内存，并发跑多个大文件容易把容器打爆。
  for (const upload of uploads) results.push(await storeOne(upload, user.id));

  const succeeded = results.filter((item) => item.ok).length;
  return Response.json({
    results,
    succeeded,
    failed: results.length - succeeded,
    // 单文件上传时保留旧字段，便于旧客户端继续工作。
    novel: results.length === 1 && results[0].ok ? { id: results[0].id, title: results[0].title } : undefined,
  });
}
