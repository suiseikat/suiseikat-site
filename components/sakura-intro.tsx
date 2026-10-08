"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";

const INTRO_KEY = "suieikat-meteor-intro-v2";

export function SakuraIntro() {
  const rootRef = useRef<HTMLDivElement>(null);
  const upMaskRef = useRef<HTMLDivElement>(null);
  const downMaskRef = useRef<HTMLDivElement>(null);
  const meteorRef = useRef<HTMLDivElement>(null);
  const [finished, setFinished] = useState(false);

  useLayoutEffect(() => {
    if (sessionStorage.getItem(INTRO_KEY) === "seen") {
      document.documentElement.dataset.introSeen = "true";
      const frame = window.requestAnimationFrame(() => setFinished(true));
      return () => window.cancelAnimationFrame(frame);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sessionStorage.setItem(INTRO_KEY, "seen");
      document.documentElement.dataset.introSeen = "true";
      const frame = window.requestAnimationFrame(() => setFinished(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const meteor = meteorRef.current;
    const upMask = upMaskRef.current;
    const downMask = downMaskRef.current;
    if (!meteor || !upMask || !downMask) return;

    const updateCut = () => {
      const rect = meteor.getBoundingClientRect();
      const cutpointX = ((rect.left + rect.width) / window.innerWidth) * 100;
      const cutpointY = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
      const upMaskY = cutpointY * 1.2;
      const downMaskX = (rect.left / window.innerWidth) * 100;
      upMask.style.clipPath = `polygon(0% 0%, 100% 0%, ${cutpointX}% ${cutpointY}%, 0% ${upMaskY}%)`;
      downMask.style.clipPath = `polygon(100% 100%, 100% 0%, ${cutpointX}% ${cutpointY}%, ${downMaskX}% 100%)`;
    };

    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        onUpdate: updateCut,
        onComplete: () => {
          sessionStorage.setItem(INTRO_KEY, "seen");
          document.documentElement.dataset.introSeen = "true";
          setFinished(true);
        },
      });

      timeline
        .to(meteor, { y: () => -meteor.getBoundingClientRect().height / 2, duration: 0.4, ease: "power4.out", delay: 0.8 })
        .to(meteor, { y: () => -meteor.getBoundingClientRect().height / 2 - window.innerHeight, x: () => window.innerWidth, duration: 0.4, ease: "power4.inOut" }, "<0.3");
      timeline.timeScale(0.75);
    }, rootRef);

    const refresh = () => context.add(updateCut);
    window.addEventListener("resize", refresh);
    return () => { window.removeEventListener("resize", refresh); context.revert(); };
  }, []);

  if (finished) return null;

  return (
    <div className="meteor-intro" ref={rootRef} aria-hidden="true">
      <div className="meteor-mask meteor-mask-up" ref={upMaskRef} />
      <div className="slash-meteor" ref={meteorRef}><span className="meteor-tail" /><i className="meteor-head">✦</i></div>
      <div className="meteor-mask meteor-mask-down" ref={downMaskRef} />
    </div>
  );
}
