"use client";

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Adapted from the supplied GlideSelect: retain Radix focus/portal/collision handling. */
export function GlideSelect({ value, onChange, options, label, id }: {
  value: string; onChange: (value: string) => void; label: string; id?: string;
  options: { value: string; label: ReactNode }[];
}) {
  const [active, setActive] = useState(0);
  return <Select value={value} onValueChange={onChange} onOpenChange={open => {
    if (open) setActive(Math.max(0, options.findIndex(item => item.value === value)));
  }}>
    <SelectTrigger id={id} className="orbit-glide-trigger" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent position="popper" align="end" className="orbit-glide-menu" style={{ "--glide-row": active } as CSSProperties}>
      <span className="orbit-glide-pill" aria-hidden="true" />
      {options.map((option, index) => <SelectItem key={option.value} value={option.value} onFocus={() => setActive(index)} onPointerMove={() => setActive(index)}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}

/** SquishSwitch's stretch-and-settle gesture, with no new animation dependency. */
export function SquishSwitch({ checked, onChange, label, id }: { checked: boolean; onChange: (checked: boolean) => void; label: string; id?: string }) {
  const thumb = useRef<HTMLSpanElement>(null);
  const previous = useRef(checked);
  const gesture = useRef<{ x: number; id: number } | null>(null);
  const skipClick = useRef(false);
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (previous.current === checked) return;
    previous.current = checked;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = thumb.current?.animate([{ scale: "1 1" }, { scale: "1.35 .78", offset: .4 }, { scale: "1 1" }], { duration: 460, easing: "cubic-bezier(.22,1,.36,1)" });
    return () => animation?.cancel();
  }, [checked]);
  useEffect(() => () => { if (skipTimer.current) clearTimeout(skipTimer.current); }, []);
  return <button id={id} type="button" role="switch" aria-label={label} aria-checked={checked} className="orbit-squish" data-on={checked}
    onClick={() => { if (!skipClick.current) onChange(!checked); }}
    onPointerDown={event => { if (event.button !== 0) return; gesture.current = { x: event.clientX, id: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerUp={event => {
      const drag = gesture.current; gesture.current = null;
      if (!drag || drag.id !== event.pointerId || Math.abs(event.clientX - drag.x) < 8) return;
      skipClick.current = true; onChange(event.clientX > drag.x);
      if (skipTimer.current) clearTimeout(skipTimer.current);
      skipTimer.current = setTimeout(() => { skipClick.current = false; }, 0);
    }} onPointerCancel={() => { gesture.current = null; }}>
    <span className="orbit-squish-track"><span ref={thumb} className="orbit-squish-thumb" /></span>
  </button>;
}

/** PulseHeart feedback follows server-confirmed counts, never invents a reaction. */
export function PulseReaction({ symbol, count, active, label, onClick, disabled = false }: {
  symbol: string; count: number; active: boolean; label: string; onClick: () => void; disabled?: boolean;
}) {
  const glyph = useRef<HTMLSpanElement>(null);
  const number = useRef<HTMLElement>(null);
  const previous = useRef({ count, active });
  useEffect(() => {
    const changed = previous.current.count !== count || previous.current.active !== active;
    previous.current = { count, active };
    if (!changed || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const beat = glyph.current?.animate([{ transform: "scale(1)" }, { transform: "scale(.35)", offset: .35 }, { transform: "scale(1.28)", offset: .7 }, { transform: "scale(1)" }], { duration: 560, easing: "cubic-bezier(.22,1,.36,1)" });
    const roll = number.current?.animate([{ transform: "translateY(9px)", opacity: .2 }, { transform: "translateY(0)", opacity: 1 }], { duration: 350, easing: "ease-out" });
    return () => { beat?.cancel(); roll?.cancel(); };
  }, [count, active]);
  return <button type="button" className={`orbit-pulse${active ? " is-active" : ""}`} aria-label={`${label}，${count} 个回应`} aria-pressed={active} disabled={disabled} onClick={onClick}>
    <span ref={glyph} aria-hidden="true">{symbol}</span>{count > 0 && <b ref={number}>{count}</b>}
  </button>;
}

/** Inline SwipeToast: swipe down, Escape or close; pause its fuse on hover/focus. */
export function SwipeNotice({ text, onClose }: { text: string; onClose?: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const fuse = useRef<HTMLSpanElement>(null);
  const burn = useRef<Animation | null>(null);
  const drag = useRef<{ y: number; id: number } | null>(null);
  const close = () => { setDismissed(true); onClose?.(); };
  useEffect(() => {
    const animation = fuse.current?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 9000, fill: "forwards" });
    burn.current = animation ?? null;
    if (animation) animation.onfinish = () => { setDismissed(true); };
    const visibility = () => { if (document.hidden) animation?.pause(); else animation?.play(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { animation?.cancel(); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  if (dismissed) return null;
  return <div className="orbit-notice" ref={card} role="status" tabIndex={0}
    onPointerEnter={() => burn.current?.pause()} onPointerLeave={() => { if (!drag.current) burn.current?.play(); }}
    onFocus={() => burn.current?.pause()} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) burn.current?.play(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}
    onPointerDown={event => { if (event.button !== 0 || (event.target as Element).closest("button")) return; drag.current = { y: event.clientY, id: event.pointerId }; burn.current?.pause(); event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (drag.current?.id === event.pointerId) event.currentTarget.style.translate = `0 ${Math.max(-12, event.clientY - drag.current.y)}px`; }}
    onPointerUp={event => { const held = drag.current; drag.current = null; event.currentTarget.style.translate = ""; if (held && event.clientY - held.y > 40) close(); else burn.current?.play(); }}
    onPointerCancel={event => { drag.current = null; event.currentTarget.style.translate = ""; burn.current?.play(); }}>
    <Check size={18} aria-hidden="true" /><p>{text}</p><button type="button" aria-label="关闭提示" onClick={close}><X size={15} /></button><span className="orbit-notice-fuse" ref={fuse} />
  </div>;
}

/** AccordionGallery pattern, confined to recommendations, not the home entries. */
export function AccordionGallery({ items, onPick }: { items: { id: string; title: string; image: string; caption: string }[]; onPick: (id: string) => void }) {
  const [active, setActive] = useState(0);
  return <div className="orbit-gallery" aria-label="书籍推荐">
    {items.map((item, index) => <button type="button" key={item.id} className="orbit-gallery-panel" data-active={active === index} onPointerEnter={event => { if (event.pointerType === "mouse") setActive(index); }} onFocus={() => setActive(index)} onClick={() => onPick(item.id)} aria-label={`查看 ${item.title}`}>
      <img src={item.image} alt="" loading="lazy" onError={event => { if (!event.currentTarget.src.endsWith("/novel-cover-placeholder.webp")) event.currentTarget.src = "/novel-cover-placeholder.webp"; }} /><span><small>{item.caption}</small><strong>{item.title}</strong></span>
    </button>)}
  </div>;
}
