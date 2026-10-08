"use client";

import { useLayoutEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function SiteMotion() {
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      gsap.fromTo("[data-hero-reveal]", { opacity: 0, y: 18 }, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        delay: sessionStorage.getItem("suieikat-meteor-intro-v2") === "seen" ? 0.05 : 2.55,
        stagger: 0.08,
        ease: "power3.out",
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.fromTo(element, { opacity: 0, y: 24 }, {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 84%", once: true },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal-card]").forEach((element, index) => {
        gsap.fromTo(element, { opacity: 0, y: 28 }, {
          opacity: 1,
          y: 0,
          duration: 0.75,
          delay: (index % 2) * 0.08,
          ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 88%", once: true },
        });
      });
      gsap.fromTo(".hero-title-mask>span,.hero-title-mask>em", { yPercent: 110 }, { yPercent: 0, duration: 1.15, stagger: .12, delay: sessionStorage.getItem("suieikat-meteor-intro-v2") === "seen" ? .1 : 2.65, ease: "power4.out" });
    });

    return () => context.revert();
  }, []);

  return null;
}
