import path from "node:path";
import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { deleteNovel, getNovelRow, setNovelFeatured, updateNovelMeta, uploadDirectory } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = sessionUser(request);
  if (viewer?.role !== "admin") return NextResponse.json({ error: "无权访问。" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { featured?: unknown; title?: unknown; author?: unknown; genre?: unknown; description?: unknown } | null;
  if (typeof body?.featured === "boolean") {
    const row = setNovelFeatured(id, body.featured);
    if (!row) return NextResponse.json({ error: "小说不存在。" }, { status: 404 });
    return NextResponse.json({ ok: true, featured: row.featured === 1 });
  }
  const row = updateNovelMeta(id, {
    title: typeof body?.title === "string" ? body.title.slice(0, 120) : undefined,
    author: typeof body?.author === "string" ? body.author.slice(0, 120) : undefined,
    genre: typeof body?.genre === "string" ? body.genre.slice(0, 40) : undefined,
    description: typeof body?.description === "string" ? body.description.slice(0, 300) : undefined,
  });
  if (!row) return NextResponse.json({ error: "小说不存在。" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = sessionUser(request);
  if (viewer?.role !== "admin") return NextResponse.json({ error: "无权访问。" }, { status: 403 });
  const { id } = await context.params;
  const existing = getNovelRow(id);
  if (!existing) return NextResponse.json({ error: "小说不存在。" }, { status: 404 });
  const row = deleteNovel(id);
  if (row) {
    // Remove the stored book and cover once the row is soft-deleted.
    if (row.file_name) await unlink(path.join(/* turbopackIgnore: true */ uploadDirectory, "books", row.file_name)).catch(() => undefined);
    if (row.cover_name) await unlink(path.join(/* turbopackIgnore: true */ uploadDirectory, row.cover_name)).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
