import { siteConfig } from "@/lib/site-config";
import { cookies } from "next/headers";
import { registerVisit } from "@/lib/community-db";

export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  let visitorKey = jar.get("suieikat_visitor")?.value;
  if (!visitorKey) visitorKey = crypto.randomUUID();
  const visitors = registerVisit(visitorKey);
  const response = Response.json({
    ok: true,
    site: "Suieikat的小站",
    launchTime: siteConfig.launchDate,
    serverTime: new Date().toISOString(),
    visitors,
  }, { headers: { "Cache-Control": "no-store" } });
  response.headers.append("Set-Cookie", `suieikat_visitor=${visitorKey}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  return response;
}
