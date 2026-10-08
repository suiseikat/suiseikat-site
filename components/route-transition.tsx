"use client";
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Navigation never waits for decoration; no blocking layer is left on history navigation. */
export function RouteTransition() {
  const pathname=usePathname();
  const previous=useRef(pathname);
  useLayoutEffect(()=>{
    try{sessionStorage.removeItem("suieikat-route-transition");}catch{/* optional storage */}
    delete document.documentElement.dataset.routeEnter;
    if(previous.current===pathname) return;
    previous.current=pathname;
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main=document.querySelector("main");
    const animation=main?.animate([{opacity:.45,translate:"0 10px"},{opacity:1,translate:"0 0"}],{duration:380,easing:"cubic-bezier(.22,1,.36,1)"});
    return ()=>animation?.cancel();
  },[pathname]);
  return null;
}
