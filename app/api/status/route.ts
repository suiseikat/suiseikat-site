import { siteConfig } from "@/lib/site-config";

export const runtime = "edge";

export async function GET() {
  return Response.json({
    ok: true,
    site: "Suieikat的小站",
    launchTime: siteConfig.launchDate,
    serverTime: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
