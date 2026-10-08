import path from "node:path";
import { readFile } from "node:fs/promises";
import { getNovelByFileName, uploadDirectory } from "@/lib/community-db";
import { novelContentDisposition } from "@/lib/novel-download";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
  azw: "application/vnd.amazon.ebook",
  azw3: "application/vnd.amazon.ebook",
};

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const match = /^([0-9a-f-]{36})\.(epub|mobi|azw3?)$/i.exec(name);
  if (!match) return new Response("Not found", { status: 404 });
  const novel = getNovelByFileName(name);
  if (!novel) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(/* turbopackIgnore: true */ uploadDirectory, "books", name));
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": MIME[match[2].toLowerCase()] ?? "application/octet-stream",
        "Content-Disposition": novelContentDisposition(novel.title, match[2]),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
