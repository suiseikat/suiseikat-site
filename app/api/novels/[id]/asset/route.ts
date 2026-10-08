import path from "node:path";
import { readFile } from "node:fs/promises";
import { getNovelRow, uploadDirectory } from "@/lib/community-db";
import { extractNovelAsset } from "@/lib/novel-content";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const assetPath = new URL(request.url).searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !assetPath || assetPath.length > 1000) return new Response("Not found", { status: 404 });
  const row = getNovelRow(id);
  if (!row?.file_name) return new Response("Not found", { status: 404 });
  try {
    const book = await readFile(path.join(/* turbopackIgnore: true */ uploadDirectory, "books", row.file_name));
    const asset = extractNovelAsset(book, row.file_name, assetPath);
    if (!asset) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(asset.data), { headers: { "Content-Type": asset.contentType, "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
