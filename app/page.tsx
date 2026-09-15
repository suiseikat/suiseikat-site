"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Box, Clock3, Code2, Image as ImageIcon, Moon, Palette, Settings2, Sparkles, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { siteConfig } from "@/lib/site-config";

type ThemeMode = "system" | "light" | "dark";
type Uptime = { days: number; hours: number; minutes: number; seconds: number };
const featureIcons = [BookOpen, Box, Code2, UserRound];

function splitDuration(totalSeconds: number): Uptime {
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: Math.floor(totalSeconds % 60),
  };
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export default function Home() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [background, setBackground] = useState("");
  const [draftBackground, setDraftBackground] = useState("");
  const [uptime, setUptime] = useState<Uptime>(() => splitDuration(0));
  const [launchTime, setLaunchTime] = useState(() => Date.parse(siteConfig.launchDate));

  useEffect(() => {
    const storedTheme = (localStorage.getItem("suieikat-theme") as ThemeMode | null) ?? "system";
    const storedBackground = localStorage.getItem("suieikat-background") ?? "";
    setTheme(storedTheme); setBackground(storedBackground); setDraftBackground(storedBackground); applyTheme(storedTheme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { if ((localStorage.getItem("suieikat-theme") ?? "system") === "system") applyTheme("system"); };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((data: { launchTime?: string }) => {
      const timestamp = data.launchTime ? Date.parse(data.launchTime) : NaN;
      if (!Number.isNaN(timestamp)) setLaunchTime(timestamp);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const update = () => setUptime(splitDuration(Math.max(0, (Date.now() - launchTime) / 1000)));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [launchTime]);

  const backgroundStyle = useMemo(() => background ? { backgroundImage: `linear-gradient(var(--image-wash), var(--image-wash)), url(${JSON.stringify(background).slice(1, -1)})` } : undefined, [background]);
  const changeTheme = (value: ThemeMode) => { setTheme(value); localStorage.setItem("suieikat-theme", value); applyTheme(value); };
  const saveBackground = () => { const value = draftBackground.trim(); setBackground(value); value ? localStorage.setItem("suieikat-background", value) : localStorage.removeItem("suieikat-background"); };

  return (
    <main className="site-shell" style={backgroundStyle}>
      <div className="ambient ambient-one" aria-hidden="true" /><div className="ambient ambient-two" aria-hidden="true" /><div className="noise" aria-hidden="true" />
      <nav className="topbar" aria-label="主导航">
        <a className="brand-mark" href="#top" aria-label="返回首页">S</a>
        <div className="nav-links"><a href="#spaces">入口</a><a href="#about">关于</a></div>
        <span className="status-pill"><i /> Online</span>
      </nav>

      <section id="top" className="hero">
        <div className="eyebrow"><Sparkles size={14} /> A small place on the web</div>
        <h1><span>Suieikat</span>的小站</h1>
        <p>收集想法、作品与正在发生的事。这里会慢慢长成我喜欢的样子。</p>
        <a className="explore-link" href="#spaces">向下看看 <span>↓</span></a>
      </section>

      <section id="spaces" className="spaces-section" aria-labelledby="spaces-title">
        <div className="section-heading"><div><span>EXPLORE</span><h2 id="spaces-title">一些空间</h2></div><p>现在只是入口，未来会通往更多地方。</p></div>
        <div className="feature-grid">
          {siteConfig.features.map((feature, index) => {
            const Icon = featureIcons[index] ?? Box;
            return <a className={`feature-card accent-${index + 1}`} href={feature.href} key={feature.title}>
              <div className="card-top"><span className="feature-icon"><Icon size={22} strokeWidth={1.7} /></span><ArrowUpRight className="arrow" size={20} /></div>
              <div><span className="card-index">0{index + 1}</span><h3>{feature.title}</h3><p>{feature.description}</p></div>
              <span className="coming-soon">{feature.status}</span>
            </a>;
          })}
        </div>
      </section>

      <section id="about" className="manifesto"><div className="manifesto-orbit" aria-hidden="true"><span>S</span></div><p>保持好奇，持续创造。</p></section>

      <footer>
        <div className="uptime-block"><div className="uptime-label"><Clock3 size={15} /> 网站已安静运行</div><div className="uptime-values" aria-live="polite">
          <strong>{uptime.days}<small>天</small></strong><strong>{String(uptime.hours).padStart(2, "0")}<small>时</small></strong><strong>{String(uptime.minutes).padStart(2, "0")}<small>分</small></strong><strong>{String(uptime.seconds).padStart(2, "0")}<small>秒</small></strong>
        </div></div>
        <p className="copyright">© {new Date().getFullYear()} Suieikat · Made with curiosity.</p>
      </footer>

      <Sheet>
        <SheetTrigger asChild><Button className="settings-button" size="icon" variant="outline" aria-label="打开外观设置"><Settings2 size={19} /></Button></SheetTrigger>
        <SheetContent className="settings-sheet">
          <SheetHeader className="settings-header"><div className="settings-symbol"><Palette size={20} /></div><SheetTitle className="settings-title">外观设置</SheetTitle><SheetDescription>这些选择只保存在当前浏览器中。</SheetDescription></SheetHeader>
          <div className="settings-body">
            <div className="setting-row"><div><label htmlFor="theme-select">显示模式</label><p>选择浅色、深色或跟随设备。</p></div>
              <Select value={theme} onValueChange={(value) => changeTheme(value as ThemeMode)}><SelectTrigger id="theme-select" className="theme-select" aria-label="显示模式"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system"><Palette /> 跟随系统</SelectItem><SelectItem value="light"><Sun /> 浅色</SelectItem><SelectItem value="dark"><Moon /> 深色</SelectItem></SelectContent></Select>
            </div>
            <div className="background-control">
              <div className="setting-copy"><span className="mini-icon"><ImageIcon size={16} /></span><div><label htmlFor="background-url">背景图片</label><p>填写网络图片地址，或把图片放到 public 后填写 /background.jpg。</p></div></div>
              <input id="background-url" value={draftBackground} onChange={(e) => setDraftBackground(e.target.value)} placeholder="https://… 或 /background.jpg" inputMode="url" />
              <div className="background-actions"><Button variant="outline" onClick={() => { setDraftBackground(""); setBackground(""); localStorage.removeItem("suieikat-background"); }}>恢复默认</Button><Button onClick={saveBackground}>应用背景</Button></div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
