import path from "node:path";
import { readFile } from "node:fs/promises";
import { getNovelRow, uploadDirectory } from "@/lib/community-db";
import { extractNovelContent, type NovelContent } from "@/lib/novel-content";

export const runtime = "nodejs";

// 正文解析比较重（要解压整本书），同一个文件解析一次后缓存在进程内。
const cache = new Map<string, NovelContent>();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "小说不存在。" }, { status: 404 });

  const row = getNovelRow(id);
  if (!row) return Response.json({ error: "小说不存在。" }, { status: 404 });
  if (!row.file_name) return Response.json({ error: "这个条目没有关联的文件。" }, { status: 404 });

  const key = `${row.id}:${row.file_name}`;
  const cached = cache.get(key);
  if (cached) return Response.json(cached, { headers: { "Cache-Control": "private, max-age=600" } });

  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(/* turbopackIgnore: true */ uploadDirectory, "books", row.file_name));
  } catch {
    return Response.json({ error: "文件已丢失，请重新上传。" }, { status: 404 });
  }

  let parsed: ReturnType<typeof extractNovelContent> = null;
  try {
    parsed = extractNovelContent(buffer, row.file_name);
  } catch {
    parsed = null;
  }

  const payload = parsed ?? {
    title: row.title,
    chapters: [] as Array<{ title: string; text: string }>,
    truncated: false,
    unsupported: "无法解析这个文件的正文，请下载后使用本地阅读器打开。",
  };
  if (payload.chapters.length) cache.set(key, payload);
  return Response.json(payload, { headers: { "Cache-Control": "private, max-age=600" } });
}
