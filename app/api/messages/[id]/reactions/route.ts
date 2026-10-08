import { randomBytes } from "node:crypto";
import { toggleReaction } from "@/lib/community-db";
import type { ReactionType } from "@/lib/community-types";
import { actorKey, cookieSecurity, GUEST_COOKIE, sessionUser } from "@/lib/session";

const TYPES = new Set<ReactionType>(["like", "dislike", "heart", "laugh", "party"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = sessionUser(request);
  const knownActor = actorKey(request, viewer);
  const guestToken = knownActor ? null : randomBytes(20).toString("base64url");
  const reactionActor = knownActor ?? `g:${guestToken}`;
  const body = await request.json().catch(() => null) as { type?: ReactionType } | null;
  if (!body?.type || !TYPES.has(body.type)) return Response.json({ error: "不支持这个表情。" }, { status: 400 });
  const { id } = await context.params;
  const result = toggleReaction(id, reactionActor, body.type);
  const response = Response.json(result);
  if (guestToken) response.headers.append("Set-Cookie", `${GUEST_COOKIE}=${guestToken}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${cookieSecurity(request) ? "; Secure" : ""}`);
  return response;
}
