"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Film, LoaderCircle } from "lucide-react";

export default function MediaEntry() {
  const [access,setAccess]=useState<{allowed:boolean;configured:boolean;signedIn:boolean}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{fetch("/api/media/session",{cache:"no-store"}).then(r=>r.json() as Promise<{allowed:boolean;configured:boolean;signedIn:boolean}>).then(setAccess).catch(()=>setError("无法读取访问权限，请刷新重试。"));},[]);
  async function enter() {
    setBusy(true);setError("");
    try {const response=await fetch("/api/media/session",{method:"POST"});const data=await response.json() as {url?:string;error?:string};if(!response.ok || data.url!=="/v/") throw new Error(data.error || "连接失败。");window.location.assign(data.url);}
    catch(error){setError(error instanceof Error?error.message:"连接失败，请重试。");setBusy(false);}
  }
  return <main className="community-page"><section className="message-login-gate" style={{maxWidth:600,margin:"80px auto",padding:32}}><Film size={32}/><span>SVIP / CINEMA</span><h1>影视库</h1><p>使用你的独立影视账户，浏览海报、搜索影片并在线播放。</p>{!access&&!error?<p>正在检查权限…</p>:!access?.signedIn?<Link href="/login">登录网站</Link>:!access.allowed?<p>此服务仅向管理员授权的 SVIP 开放。</p>:!access.configured?<p>影视库正在连接，请联系管理员。</p>:<button type="button" className="account-submit" onClick={enter} disabled={busy}>{busy?<><LoaderCircle size={18}/>正在登录影视库…</>:"进入影视库 →"}</button>}{error&&<p role="alert">{error}</p>}</section></main>;
}
