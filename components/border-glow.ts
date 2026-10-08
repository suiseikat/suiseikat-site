import type { PointerEvent } from "react";

/** React Bits BorderGlow's edge proximity and angle, shared by semantic controls. */
export function moveBorderGlow(event: PointerEvent<HTMLElement>) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  const edge = Math.min(1, Math.max(Math.abs(x) / (rect.width / 2), Math.abs(y) / (rect.height / 2)));
  const angle = Math.atan2(y, x) * 180 / Math.PI + 90;
  element.style.setProperty("--glow-strength", String(Math.max(0, (edge - .22) / .78)));
  element.style.setProperty("--glow-angle", `${angle}deg`);
}

export function leaveBorderGlow(event: PointerEvent<HTMLElement>) {
  event.currentTarget.style.setProperty("--glow-strength", "0");
}
