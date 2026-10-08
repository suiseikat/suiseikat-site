"use client";

import { useEffect, useState } from "react";

// A neutral centre leaves the middle undistorted; only the rim bends the backdrop.
function makeRimMap() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + .5) / size * 2 - 1;
      const ny = (y + .5) / size * 2 - 1;
      const edge = Math.max(Math.abs(nx), Math.abs(ny));
      const t = Math.max(0, Math.min(1, (edge - .71) / .29));
      const bend = t * t * (3 - 2 * t);
      const index = (y * size + x) * 4;
      image.data[index] = Math.round(128 + nx * bend * 90);
      image.data[index + 1] = Math.round(128 + ny * bend * 90);
      image.data[index + 2] = 128;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export function GlassRefraction() {
  const [map, setMap] = useState("");

  useEffect(() => {
    const supported = CSS.supports("backdrop-filter", "url(#orbit-refraction)") ||
      CSS.supports("-webkit-backdrop-filter", "url(#orbit-refraction)");
    document.documentElement.dataset.refraction = "fallback";
    const frame = requestAnimationFrame(() => {
      if (!supported) return;
      const image = makeRimMap();
      if (!image) return;
      setMap(image);
      document.documentElement.dataset.refraction = "svg";
    });
    return () => {
      cancelAnimationFrame(frame);
      delete document.documentElement.dataset.refraction;
    };
  }, []);

  return <svg className="glass-refraction-definitions" aria-hidden="true" width="0" height="0">
    <defs>
      <filter id="orbit-refraction" x="-16%" y="-16%" width="132%" height="132%" colorInterpolationFilters="sRGB">
        {map && <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="rim" />}
        <feDisplacementMap in="SourceGraphic" in2="rim" scale="16" xChannelSelector="R" yChannelSelector="G" result="redShift" />
        <feColorMatrix in="redShift" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
        <feDisplacementMap in="SourceGraphic" in2="rim" scale="18" xChannelSelector="R" yChannelSelector="G" result="greenShift" />
        <feColorMatrix in="greenShift" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
        <feDisplacementMap in="SourceGraphic" in2="rim" scale="20" xChannelSelector="R" yChannelSelector="G" result="blueShift" />
        <feColorMatrix in="blueShift" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
        <feBlend in="red" in2="green" mode="screen" result="rg" />
        <feBlend in="rg" in2="blue" mode="screen" />
      </filter>
    </defs>
  </svg>;
}
