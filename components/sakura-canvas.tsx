"use client";

import { useEffect, useRef } from "react";

type Petal = {
  x: number;
  y: number;
  size: number;
  speed: number;
  sway: number;
  phase: number;
  rotation: number;
  spin: number;
  opacity: number;
};

function createPetal(width: number, height: number, initial = false): Petal {
  return {
    x: Math.random() * width,
    y: initial ? Math.random() * height : -24 - Math.random() * height * 0.18,
    size: 3 + Math.random() * 4,
    speed: 0.35 + Math.random() * 0.75,
    sway: 0.35 + Math.random() * 0.8,
    phase: Math.random() * Math.PI * 2,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.025,
    opacity: 0.42 + Math.random() * 0.42,
  };
}

export function SakuraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      const stored = localStorage.getItem("suieikat-theme") ?? "system";
      const dark = stored === "dark" || (stored === "system" && colorScheme.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    let width = 0;
    let height = 0;
    let petals: Petal[] = [];
    let frame = 0;
    let animationFrame = 0;
    let previousTime = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(12, Math.min(28, Math.round(width / 65)));
      petals = Array.from({ length: count }, (_, index) => createPetal(width, height, index < count));
    };

    const drawPetal = (petal: Petal, color: string) => {
      context.save();
      context.translate(petal.x, petal.y);
      context.rotate(petal.rotation);
      context.scale(petal.size / 12, petal.size / 12);
      context.globalAlpha = petal.opacity;
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, -9);
      context.bezierCurveTo(8, -8, 10, -1, 0, 9);
      context.bezierCurveTo(-10, -1, -8, -8, 0, -9);
      context.fill();
      context.restore();
    };

    const render = (time: number) => {
      animationFrame = 0;
      if (document.hidden || reducedMotion.matches) return;
      const step = previousTime ? Math.min((time - previousTime) / (1000 / 60), 2) : 1;
      previousTime = time;
      context.clearRect(0, 0, width, height);
      const dark = document.documentElement.dataset.theme === "dark";
      const color = dark ? "#dc5f91" : "#f3a8c3";
      for (const petal of petals) {
        if (!reducedMotion.matches) {
          petal.y += petal.speed * step;
          petal.x += Math.sin(frame * 0.012 + petal.phase) * petal.sway * step;
          petal.rotation += petal.spin * step;
          if (petal.y > height + 28 || petal.x < -40 || petal.x > width + 40) {
            Object.assign(petal, createPetal(width, height));
          }
        }
        drawPetal(petal, color);
      }
      frame += step;
      animationFrame = window.requestAnimationFrame(render);
    };
    const resume = () => {
      window.cancelAnimationFrame(animationFrame);
      previousTime = 0;
      animationFrame = window.requestAnimationFrame(render);
    };

    syncTheme();
    resize();
    resume();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", resume);
    reducedMotion.addEventListener("change", resume);
    colorScheme.addEventListener("change", syncTheme);
    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resume);
      reducedMotion.removeEventListener("change", resume);
      colorScheme.removeEventListener("change", syncTheme);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="sakura-canvas" aria-hidden="true" />;
}
