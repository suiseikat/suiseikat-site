import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/session";
import { canUseMedia, mediaToken } from "@/lib/fn-media";
import { fnOrigin, fnSignature } from "@/lib/fn-media-protocol";
import { isSameOrigin, requestOrigin } from "@/lib/request-origin";

export const runtime="nodejs";
const SENTINEL="site-managed";
const allowedPosts=new Set(["/item/list","/item/info","/item/watched","/person/list","/person/item/list","/stream","/play/info","/play/play","/play/quality","/play/record","/play/setConfigByItem","/media","/media/p","/favorite","/favorite/list","/favorite/add","/favorite/delete","/user/getData","/user/setData","/subtitle/list","/subtitle/search","/subtitle/predownload","/subtitle/download"]);
function apiAllowed(path:string,method:string) {
  const endpoint=path.replace(/^\/v\/api\/(?:intl\/)?v[12]/,"");
  if(/^\/(manager|auth|login|server\/oauth|user\/(login|passwd|info$|logout))/.test(endpoint)) return method==="GET" && endpoint==="/user/info";
  if(method==="GET" || method==="HEAD") return true;
  // These mutate only the signed-in viewer's favourites and watch history.
  if(endpoint==="/item/favorite" && ["PUT","DELETE"].includes(method)) return true;
  if(["/item/watched","/play/record"].includes(endpoint) && method==="DELETE") return true;
  return method==="POST" && (allowedPosts.has(endpoint) || /^\/person\/list\/[a-zA-Z0-9]+$/.test(endpoint) || /^\/item\/[a-zA-Z0-9]+\/playing$/.test(endpoint));
}
async function proxy(request:Request,context:{params:Promise<{path?:string[]}>}) {
  const user=sessionUser(request),isDocument=request.headers.get("accept")?.includes("text/html");
  if(!user || !canUseMedia(user)) {
    if(isDocument) return NextResponse.redirect(new URL(user?"/media":"/login",requestOrigin(request)));
    return NextResponse.json({code:403,msg:"影视访问权限不足。"},{status:user?403:401});
  }
  if(!["GET","HEAD"].includes(request.method) && !isSameOrigin(request)) return NextResponse.json({code:403,msg:"请求来源无效。"},{status:403});
  const {path=[]}=await context.params;
  if(path.some(part=>part==="." || part===".." || /[\\/\u0000]/.test(part))) return new Response(null,{status:400});
  const pathname="/v/"+path.map(encodeURIComponent).join("/");
  if(pathname.startsWith("/v/api/") && !apiAllowed(pathname,request.method)) return NextResponse.json({code:403,msg:"网站影视账户不能修改服务器或账户设置。"},{status:403});
  if(/^\/v\/(login|init|welcome|oauth|settings\/(users|server|library|task))/.test(pathname)) return NextResponse.redirect(new URL("/media",requestOrigin(request)));
  try {
    const token=await mediaToken(user),upstream=new URL(pathname,fnOrigin());
    if(!canUseMedia(sessionUser(request))) return NextResponse.json({code:403,msg:"影视授权已撤销。"},{status:403});
    upstream.search=new URL(request.url).search;
    for(const [name,value] of upstream.searchParams) if(value===SENTINEL) upstream.searchParams.set(name,token);
    const body=["GET","HEAD"].includes(request.method)?undefined:await request.text();
    const headers=new Headers({Authorization:token,"X-Trim-Client":"web","X-Trim-Client-Version":"631",authx:fnSignature(upstream,request.method,body)});
    for(const name of ["content-type","range","accept","accept-language"]) {const value=request.headers.get(name);if(value) headers.set(name,value);}
    // Bound connection/header latency, not the lifetime of a long video stream.
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    let response:Response;
    try { response=await fetch(upstream,{method:request.method,headers,body,cache:"no-store",redirect:"manual",signal:controller.signal}); }
    finally { clearTimeout(timer); }
    const outgoing=new Headers({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin"});
    for(const name of ["content-type","content-range","accept-ranges"]) {const value=response.headers.get(name);if(value) outgoing.set(name,value);}
    const location=response.headers.get("location");
    if(location) {
      const target=new URL(location,upstream);
      if(target.origin!==upstream.origin || !target.pathname.startsWith("/v/")) return new Response(null,{status:502});
      outgoing.set("location",target.pathname+target.search);
    }
    const type=response.headers.get("content-type")||"";
    let result:BodyInit|null=response.body;
    if(request.method==="HEAD" || [204,304].includes(response.status)) result=null;
    else if(type.includes("application/json") || type.includes("mpegurl")) {
      // Never send upstream login credentials to the browser. Media URLs stay on
      // the website so every segment/range request rechecks current SVIP status.
      result=(await response.text()).split(token).join(SENTINEL).split(fnOrigin()).join(requestOrigin(request));
    } else if(type.includes("text/html")) {
      outgoing.set("Set-Cookie",`Trim-MC-token=${SENTINEL}; Path=/v; SameSite=Strict${requestOrigin(request).startsWith("https:")?"; Secure":""}`);
    }
    return new Response(result,{status:response.status,headers:outgoing});
  } catch { return NextResponse.json({code:503,msg:"影视服务器暂时不可用，请稍后重试。"},{status:503}); }
}
export {proxy as GET,proxy as HEAD,proxy as POST,proxy as PUT,proxy as PATCH,proxy as DELETE};
