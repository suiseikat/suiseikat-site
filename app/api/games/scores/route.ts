import { gameLeaderboard, saveGameScore, type GameName } from "@/lib/community-db";
import { sessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const games = new Set<GameName>(["reaction", "cps", "runner", "2048"]);

export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get("game") as GameName;
  if (!games.has(game)) return Response.json({ error: "未知游戏。" }, { status: 400 });
  return Response.json({ leaderboard: gameLeaderboard(game) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = sessionUser(request);
  if (!user) return Response.json({ error: "登录后才会记录排行榜成绩。" }, { status: 401 });
  const body = await request.json().catch(() => null) as { game?: GameName; score?: number; details?: string } | null;
  if (!body?.game || !games.has(body.game) || typeof body.score !== "number") return Response.json({ error: "成绩格式错误。" }, { status: 400 });
  saveGameScore(user.id, body.game, body.score, body.details ?? "");
  return Response.json({ ok: true, leaderboard: gameLeaderboard(body.game) });
}
