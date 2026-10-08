"use client";
import { usePathname } from "next/navigation";
import { StaggeredNavigation } from "@/components/staggered-navigation";
export function SiteNav() { const pathname = usePathname(); return <StaggeredNavigation key={pathname} />; }
