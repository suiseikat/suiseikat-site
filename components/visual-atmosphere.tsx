"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function VisualAtmosphere() {
  const pathname = usePathname();
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    const selector = ".feature-card,.directory-card,.message-item,.profile-grid>article,.catalog-window,.admin-music,.achievement-grid article,.ranking-row,.admin-user,.admin-novel,.admin-section-link,.course-card,.test-metric,.test-analysis,.test-action-panel,.runner-aside,.game-2048";
    let frame = 0;
    const onPointer = (event: PointerEvent) => {
      if (!fine.matches || reduced.matches || document.documentElement.dataset.glass === "frosted") return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
      if (!target) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--shine-x", `${event.clientX - rect.left}px`);
        target.style.setProperty("--shine-y", `${event.clientY - rect.top}px`);
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        target.style.setProperty("--cursor-angle", `${Math.atan2(y, x) * 180 / Math.PI + 90}deg`);
        target.style.setProperty("--edge-proximity", String(Math.min(1, Math.max(Math.abs(x) / (rect.width / 2), Math.abs(y) / (rect.height / 2)))));
      });
    };
    document.addEventListener("pointermove", onPointer, { passive: true });
    const animations = new Set<Animation>();
    const seen = new WeakSet<Element>();
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (!entry.isIntersecting) return;
        reveal.unobserve(entry.target);
        if (!reduced.matches) {
          const animation = entry.target.animate(
          [{ opacity: .35, transform: "translateY(24px) scale(.985)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
          { duration: 650, delay: Math.min(index * 45, 180), easing: "cubic-bezier(.22,1,.36,1)" },
          );
          animations.add(animation);
          animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
        }
      });
    }, { threshold: .08 });
    const observe = () => document.querySelectorAll(".directory-card,.message-item,.achievement-grid>article,.ranking-row,.admin-section-link").forEach(element => {
      if (seen.has(element)) return;
      seen.add(element); reveal.observe(element);
    });
    observe();
    let observeFrame = 0;
    const mutations = new MutationObserver(records => {
      if (observeFrame || !records.some(record => Array.from(record.addedNodes).some(node => node instanceof Element))) return;
      observeFrame = requestAnimationFrame(() => { observeFrame = 0; observe(); });
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { document.removeEventListener("pointermove", onPointer); cancelAnimationFrame(frame); cancelAnimationFrame(observeFrame); reveal.disconnect(); mutations.disconnect(); animations.forEach(animation => animation.cancel()); };
  }, [pathname]);
  return null;
}
