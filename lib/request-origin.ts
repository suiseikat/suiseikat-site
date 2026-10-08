/** Next's internal URL can use localhost behind a reverse proxy. Host is the
 * actual authority requested by the browser; the proxy must preserve it. */
export function requestOrigin(request: Request) {
  const protocol=request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(request.url).protocol.replace(":","");
  if(protocol!=="http" && protocol!=="https") throw new Error("Invalid request protocol");
  const host=request.headers.get("host") || new URL(request.url).host;
  const url=new URL(`${protocol}://${host}`);
  if(url.username || url.password || url.pathname!=="/" || url.search || url.hash) throw new Error("Invalid request host");
  return url.origin;
}
export function isSameOrigin(request:Request) {
  try { return request.headers.get("origin")===requestOrigin(request); } catch { return false; }
}
