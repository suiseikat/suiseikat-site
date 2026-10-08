import path from "node:path";
import { readFile } from "node:fs/promises";
import { uploadDirectory } from "@/lib/community-db";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!/^[0-9a-f-]{36}\.webp$/i.test(name)) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(/* turbopackIgnore: true */ uploadDirectory, name));
    return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
