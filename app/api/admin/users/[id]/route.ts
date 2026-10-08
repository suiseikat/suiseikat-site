import { NextResponse } from "next/server";
import { updateUserAdmin } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";
import type { UserTier } from "@/lib/community-types";
import { syncMediaAccess } from "@/lib/fn-media";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = sessionUser(request);
  if (viewer?.role !== "admin") return NextResponse.json({ error: "无权访问。" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { tier?: unknown; disabled?: unknown } | null;
  const tier = typeof body?.tier === "string" && ["free", "vip", "svip"].includes(body.tier) ? body.tier as UserTier : undefined;
  const disabled = typeof body?.disabled === "boolean" ? body.disabled : undefined;
  if (id === viewer.id && disabled) return NextResponse.json({ error: "不能停用自己的管理员账号。" }, { status: 400 });
  const user = updateUserAdmin(id, { tier, disabled });
  if (!user) return NextResponse.json({ error: "用户不存在。" }, { status: 404 });
  try { await syncMediaAccess(user);return NextResponse.json({user}); }
  catch { return NextResponse.json({user,mediaWarning:"网站权限已更新；影视账户暂未同步，可重新保存权限以重试。"}); }
}
