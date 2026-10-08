"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { NOTICE_EVENT, notify, type Notice } from "@/lib/notifications";

/** SwipeToast adaptation: downward dismissal, paused fuse and a persistent route-level queue. */
function SwipeToast({ notice, dismiss }: { notice: Notice; dismiss: (id: string) => void }) {
  const card = useRef<HTMLDivElement>(null), fuse = useRef<HTMLSpanElement>(null);
  const burn = useRef<Animation | null>(null);
  const flags = useRef({ hover: false, focus: false, drag: false });
  const drag = useRef<{ id: number; y: number; time: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    if (timer.current) return;
    burn.current?.pause(); setClosing(true);
    timer.current = setTimeout(() => dismiss(notice.id), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260);
  }, [dismiss, notice.id]);
  const sync = () => {
    if (document.hidden || flags.current.hover || flags.current.focus || flags.current.drag) burn.current?.pause();
    else burn.current?.play();
  };
  useEffect(() => {
    const animation = fuse.current?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: notice.kind === "error" ? 9000 : 5500, fill: "forwards" });
    burn.current = animation ?? null;
    if (animation) animation.onfinish = close;
    sync(); document.addEventListener("visibilitychange", sync);
    return () => { if (animation) { animation.onfinish = null; animation.cancel(); } if (timer.current) clearTimeout(timer.current); document.removeEventListener("visibilitychange", sync); };
  }, [close, notice.kind]);
  const Icon = notice.kind === "error" ? CircleAlert : notice.kind === "success" ? Check : Info;
  return <div className="comet-toast" data-closing={closing} data-kind={notice.kind}>
    <div ref={card} className="comet-toast-card" role={notice.kind === "error" ? "alert" : "status"} aria-atomic="true" tabIndex={0}
      onPointerEnter={e => { if (e.pointerType === "mouse") { flags.current.hover = true; sync(); } }}
      onPointerLeave={() => { flags.current.hover = false; sync(); }}
      onFocus={() => { flags.current.focus = true; sync(); }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { flags.current.focus = false; sync(); } }}
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}
      onPointerDown={e => { if (e.button !== 0 || (e.target as Element).closest("button")) return; drag.current = { id: e.pointerId, y: e.clientY, time: performance.now() }; flags.current.drag = true; sync(); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current?.id === e.pointerId) { const y = e.clientY - drag.current.y; e.currentTarget.style.translate = `0 ${y > 0 ? y : Math.max(-18, y * .2)}px`; } }}
      onPointerUp={e => { const held = drag.current; if (!held || held.id !== e.pointerId) return; drag.current = null; flags.current.drag = false; e.currentTarget.releasePointerCapture(e.pointerId); const dy = e.clientY - held.y; if (dy > 40 || (dy > 12 && dy / (performance.now() - held.time) > .45)) close(); else { e.currentTarget.style.translate = ""; sync(); } }}
      onPointerCancel={e => { drag.current = null; flags.current.drag = false; e.currentTarget.style.translate = ""; sync(); }}>
      <Icon size={20} /><div><small>{notice.kind === "error" ? "PLEASE CHECK" : notice.kind === "success" ? "ALL SET" : "ORBIT NOTICE"}</small><p>{notice.text}</p></div><button type="button" aria-label="关闭提示" onClick={close}><X size={16}/></button><span ref={fuse} className="comet-toast-fuse" />
    </div>
  </div>;
}
export function NotificationCenter() {
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(() => { const receive = (e: Event) => { const item = (e as CustomEvent<Notice>).detail; setItems(prev => [...prev.slice(-2), item]); }; window.addEventListener(NOTICE_EVENT, receive); return () => window.removeEventListener(NOTICE_EVENT, receive); }, []);
  useEffect(() => {
    const download = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[download][href]") : null;
      if (!event.defaultPrevented && link && !link.href.startsWith("blob:")) notify("已请求下载文件，请查看浏览器下载列表。", "info");
    };
    document.addEventListener("click", download);
    return () => document.removeEventListener("click", download);
  }, []);
  const dismiss = useCallback((id: string) => setItems(prev => prev.filter(item => item.id !== id)), []);
  return <aside className="comet-toasts" aria-label="操作提示">{items.map(item => <SwipeToast key={item.id} notice={item} dismiss={dismiss}/>)}</aside>;
}
