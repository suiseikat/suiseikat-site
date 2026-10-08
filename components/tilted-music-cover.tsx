"use client";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ExternalLink } from "lucide-react";

/** TiltedCard geometry from the supplied example, driven by the existing animation engine. */
export function TiltedMusicCover({ image, title, href }: { image: string; title: string; href: string }) {
  const inner = useRef<HTMLAnchorElement>(null), caption = useRef<HTMLElement>(null);
  useEffect(() => { const target = inner.current, tip = caption.current; return () => { if (target) gsap.killTweensOf(target); if (tip) gsap.killTweensOf(tip); }; }, []);
  const reset = () => { const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; gsap.to(inner.current, { rotateX: 0, rotateY: 0, scale: 1, y: 0, duration: reduced ? 0 : .65, ease: "elastic.out(1,.75)", overwrite: true }); gsap.to(caption.current, { opacity: 0, duration: reduced ? 0 : .2, overwrite: true }); };
  return <figure className="tilted-music" onPointerMove={event => {
    if (event.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    gsap.to(inner.current, { rotateX: -(y / bounds.height - .5) * 22, rotateY: (x / bounds.width - .5) * 22, scale: 1.065, y: -12, duration: .5, ease: "power3.out", overwrite: true });
    gsap.to(caption.current, { x: Math.max(0, Math.min(x + 12, bounds.width - 140)), y: y + 14, opacity: 1, duration: .25, overwrite: true });
  }} onPointerLeave={reset}>
    <a ref={inner} className="floating-cover tilted-music-inner" href={href} target="_blank" rel="noreferrer" aria-label={`前往网易云收听 ${title}`} onBlur={reset}>
      {image ? <img src={image} alt={`${title} 封面`}/> : <span>♪</span>}<b><ExternalLink size={13}/> NETEASE MUSIC</b><i className="tilted-music-glint" aria-hidden="true"/>
    </a><figcaption ref={caption}>在网易云中收听 ↗</figcaption>
  </figure>;
}
