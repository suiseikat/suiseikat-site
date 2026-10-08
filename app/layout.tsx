import type { Metadata } from "next";
import { SakuraCanvas } from "@/components/sakura-canvas";
import { SakuraIntro } from "@/components/sakura-intro";
import { RouteTransition } from "@/components/route-transition";
import { GlobalControlCenter } from "@/components/global-control-center";
import { SiteNav } from "@/components/site-nav";
import { VisualAtmosphere } from "@/components/visual-atmosphere";
import { GlassRefraction } from "@/components/glass-refraction";
import "./globals.css";
import "./nebula.css";
import "./orbit-micro-ui.css";
import "./glass-dock.css";
import "./editorial.css";
import "./member-ui.css";
import "./liquid-optics.css";
import "./profile-ui.css";
import { NotificationCenter } from "@/components/notification-center";

export const metadata: Metadata = {
  title: "Suieikat的小站",
  description: "Suieikat 的个人空间，收集想法、作品与正在发生的事。",
  icons: { icon: "/suieikat-icon.png", shortcut: "/suieikat-icon.png", apple: "/suieikat-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hans" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{var m=localStorage.getItem('suieikat-theme')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';document.documentElement.dataset.glass=localStorage.getItem('suieikat-glass')||'liquid';if(sessionStorage.getItem('suieikat-meteor-intro-v2')==='seen')document.documentElement.dataset.introSeen='true';if(sessionStorage.getItem('suieikat-route-transition')==='enter')document.documentElement.dataset.routeEnter='true'}catch(e){}" }} /></head><body className="nebula-redesign"><GlassRefraction /><SakuraIntro /><RouteTransition /><SakuraCanvas /><VisualAtmosphere /><SiteNav /><NotificationCenter />{children}<GlobalControlCenter /></body></html>;
}
