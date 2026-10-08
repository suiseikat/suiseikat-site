"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { BookOpen, FlaskConical, LayoutGrid, MessageCircleHeart, UserRound, Info, Layers } from "lucide-react";

type Item = { label: string; href: string };
const colors = ["#6887ef", "#c18bf5", "#ef819f", "#72c8ba"];

/** Pointer distance drives the whole dock; links remain ordinary keyboard-accessible links. */
export function NavigationDock({ items, className = "" }: { items: Item[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  return <div ref={ref} className={`navigation-dock ${className}`} onPointerMove={event => {
    if (event.pointerType !== "mouse") return;
    const box = ref.current?.getBoundingClientRect();
    if (box) setPointer((event.clientX - box.left) / box.width * items.length - .5);
  }} onPointerLeave={() => setPointer(null)}>
    {items.map((item, index) => {
      const active = focused ?? pointer;
      const strength = active === null ? 0 : Math.max(0, 1 - Math.abs(active - index) / 1.6);
      const Icon = item.href.includes("works") || item.label === "Catalogs" ? BookOpen : item.href.includes("lab") ? FlaskConical : item.href.includes("messages") ? MessageCircleHeart : item.href.includes("about") || item.href.includes("/u/") ? UserRound : item.label === "Editions" ? Layers : item.label === "Info" ? Info : LayoutGrid;
      return <Link key={`${item.href}-${item.label}`} href={item.href} className="navigation-dock-item" aria-label={item.label} onFocus={() => setFocused(index)} onBlur={() => setFocused(null)} style={{ "--dock-lift": `${strength * -6}px`, "--dock-scale": 1 + strength * .25, "--dock-color": colors[index % colors.length] } as CSSProperties}>
        <span className="dock-glass-back" /><span className="dock-glass-front"><Icon size={19} strokeWidth={1.6} /></span><span className="navigation-dock-label">{item.label}</span>
      </Link>;
    })}
  </div>;
}
