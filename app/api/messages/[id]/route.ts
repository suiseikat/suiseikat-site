import path from "node:path";
import { unlink } from "node:fs/promises";
import { deleteMessage, messageImageName, setMessagePinned, uploadDirectory } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = sessionUser(request);
  if (!viewer) return Response.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await context.params;
  const imageName = messageImageName(id);
  if (!deleteMessage(id, viewer)) return Response.json({ error: "你没有权限删除这条留言。" }, { status: 403 });
  if (imageName) await unlink(path.join(uploadDirectory, imageName)).catch(() => undefined);
  return Response.json({ ok: true });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = sessionUser(request);
  if (!viewer || viewer.role !== "admin") return Response.json({ error: "仅管理员可以置顶留言。" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { pinned?: unknown } | null;
  if (!body || typeof body.pinned !== "boolean") return Response.json({ error: "参数不正确。" }, { status: 400 });
  if (!setMessagePinned(id, body.pinned, viewer)) return Response.json({ error: "留言不存在。" }, { status: 404 });
  return Response.json({ ok: true });
}
