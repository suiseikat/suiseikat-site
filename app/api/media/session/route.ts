import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/session";
import { canUseMedia, mediaConfigured, mediaToken } from "@/lib/fn-media";
import { isSameOrigin } from "@/lib/request-origin";

export const runtime="nodejs";
export async function GET(request:Request) {
  const user=sessionUser(request);
  return NextResponse.json({allowed:canUseMedia(user),configured:mediaConfigured(),signedIn:Boolean(user)},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
  if(!isSameOrigin(request)) return NextResponse.json({error:"请求来源无效。"},{status:403});
  const user=sessionUser(request);
  if(!user) return NextResponse.json({error:"请先登录网站。"},{status:401});
  if(!canUseMedia(user)) return NextResponse.json({error:"影视库仅限管理员授权的 SVIP 使用。"},{status:403});
  try {
    await mediaToken(user);
    return NextResponse.json({url:"/v/"},{headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.json({error:"影视库连接失败，请稍后重试或联系管理员。"},{status:503}); }
}
