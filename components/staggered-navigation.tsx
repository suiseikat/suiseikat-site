"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowUpRight, Plus } from "lucide-react";
import { gsap } from "gsap";
import type { Viewer } from "@/lib/community-types";
import { notify } from "@/lib/notifications";
import { NovelUploadDialog } from "@/components/novel-upload-dialog";
import { leaveBorderGlow, moveBorderGlow } from "@/components/border-glow";

const destinations = [
  { en: "Home", zh: "回到首页", href: "/" },
  { en: "Library", zh: "作品 · 轻小说文库", href: "/works" },
  { en: "Laboratory", zh: "实验室 · 工具与游戏", href: "/lab" },
  { en: "Guestbook", zh: "留言板 · 留下你的声音", href: "/messages" },
  { en: "About", zh: "关于我 · 个人空间", href: "/u/suiseikat" },
];
function MenuContents({ close, upload }: { close: () => void; upload: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<Viewer | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; fetch("/api/auth/me", { cache: "no-store" }).then(r => r.json() as Promise<{ user: Viewer | null }>).then(data => { if (alive) setViewer(data.user); }).catch(() => { if (alive) setViewer(null); }); return () => { alive = false; }; }, []);
  const logout = async () => { setBusy(true); try { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) throw new Error("退出失败，请重试。"); setViewer(null); window.dispatchEvent(new Event("comet:auth-change")); notify("已退出登录。"); } catch { notify("退出失败，请重试。", "error"); } finally { setBusy(false); } };
  useLayoutEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(".menu-prelayer", { xPercent: 105 }, { xPercent: 0, duration: .65, stagger: .07, ease: "power4.out" });
      gsap.fromTo(".menu-link-inner", { yPercent: 110, rotate: 3 }, { yPercent: 0, rotate: 0, duration: .8, stagger: .065, delay: .12, ease: "power4.out" });
      gsap.fromTo(".menu-portrait,.menu-foot", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .7, delay: .3, ease: "power3.out" });
    }, root);
    return () => context.revert();
  }, []);
  return <div ref={root} className="editorial-menu-inner">
    <div className="menu-prelayers" aria-hidden="true"><div className="menu-prelayer" /><div className="menu-prelayer" /></div>
    <header className="menu-top"><Dialog.Title className="menu-eyebrow">EXPLORE THE ORBIT</Dialog.Title><Dialog.Close className="menu-close suisei-menu-toggle" aria-label="关闭导航">Close</Dialog.Close></header>
    <Dialog.Description className="sr-only">选择首页、作品、实验室、留言板或个人主页。</Dialog.Description>
    <div className="menu-body"><div className="menu-portrait menu-mascot" aria-hidden="true"><img src="/menu-mascot-transparent.png" alt="" /></div>
      <nav className="menu-destinations" aria-label="网站分区">{destinations.map((item,index)=><Link href={item.href} key={item.href} onClick={close} className="menu-destination"><span className="menu-link-inner"><small>0{index+1}</small><span>{item.en}<em>{item.zh}</em></span><ArrowUpRight /></span></Link>)}</nav>
    </div>
    <div className="menu-account" aria-label="账户导航">{viewer === undefined ? <span>正在读取账户…</span> : viewer ? <><Link className="menu-profile-link border-glow-action" onPointerMove={moveBorderGlow} onPointerLeave={leaveBorderGlow} href={`/u/${encodeURIComponent(viewer.username)}`} onClick={close}><span>{viewer.displayName || viewer.username}</span> 我的主页 <ArrowUpRight size={16}/></Link>{viewer.role === "admin" && <><Link href="/admin" onClick={close}>管理后台</Link><button type="button" onClick={upload}>上传小说 <Plus size={14}/></button></>}<button type="button" disabled={busy} onClick={logout}>{busy ? "正在退出…" : "退出登录"}</button></> : <><span>YOUR OWN LITTLE UNIVERSE</span><Link className="border-glow-action" onPointerMove={moveBorderGlow} onPointerLeave={leaveBorderGlow} href="/login" onClick={close}>登录 <ArrowUpRight size={16}/></Link><Link className="border-glow-action" onPointerMove={moveBorderGlow} onPointerLeave={leaveBorderGlow} href="/register" onClick={close}>注册 <Plus size={16}/></Link></>}</div>
    <footer className="menu-foot"><span>COMET SHINING</span><Link href="/leaderboard" onClick={close}>本周活跃榜 <ArrowUpRight size={14} /></Link><span>HK / 22.3°N</span></footer>
  </div>;
}
/** React Bits StaggeredMenu timing, with Radix focus trapping and Escape handling. */
export function StaggeredNavigation({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open,setOpen]=useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const change=(value:boolean)=>{setOpen(value);onOpenChange?.(value);};
  return <><Dialog.Root open={open} onOpenChange={change}><Dialog.Trigger className="suisei-menu-toggle" aria-label="Suisei · 打开导航菜单">Suisei</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="editorial-menu-overlay" /><Dialog.Content className="editorial-menu"><MenuContents close={()=>change(false)} upload={() => { change(false); setUploadOpen(true); }}/></Dialog.Content></Dialog.Portal></Dialog.Root>{uploadOpen && <NovelUploadDialog onClose={() => setUploadOpen(false)} onUploaded={() => window.dispatchEvent(new Event("novels-updated"))}/>}</>;
}
