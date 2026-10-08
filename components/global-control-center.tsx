"use client";
import { useEffect, useState } from "react";
import { Moon, Palette, Settings2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountPanel } from "@/components/account-panel";
import { GlideSelect } from "@/components/orbit-micro-ui";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type ThemeMode = "system" | "light" | "dark";
type GlassMode = "liquid" | "frosted";
function applyTheme(mode: ThemeMode) { const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.dataset.theme = dark ? "dark" : "light"; document.documentElement.style.colorScheme = dark ? "dark" : "light"; }

export function GlobalControlCenter() {
  const [theme, setTheme] = useState<ThemeMode>("system"); const [open, setOpen] = useState(false);
  const [glass, setGlass] = useState<GlassMode>("liquid");
  useEffect(() => {
    let saved: GlassMode = "liquid";
    try { if (localStorage.getItem("suieikat-glass") === "frosted") saved = "frosted"; } catch { /* Storage is optional. */ }
    document.documentElement.dataset.glass = saved;
    const frame = requestAnimationFrame(() => setGlass(saved));
    window.dispatchEvent(new Event("glass-style-change"));
    return () => cancelAnimationFrame(frame);
  }, []);
  const changeGlass = (value: GlassMode) => {
    setGlass(value);
    document.documentElement.dataset.glass = value;
    try { localStorage.setItem("suieikat-glass", value); } catch { /* Keep current session usable. */ }
    window.dispatchEvent(new Event("glass-style-change"));
  };
  useEffect(() => { const stored = (localStorage.getItem("suieikat-theme") as ThemeMode | null) ?? "system"; applyTheme(stored); requestAnimationFrame(() => { setTheme(stored); if (new URLSearchParams(location.search).get("account") === "1") setOpen(true); }); const media = matchMedia("(prefers-color-scheme: dark)"); const sync = () => { if ((localStorage.getItem("suieikat-theme") ?? "system") === "system") applyTheme("system"); }; media.addEventListener("change", sync); return () => media.removeEventListener("change", sync); }, []);
  const changeTheme = (value: ThemeMode) => { setTheme(value); localStorage.setItem("suieikat-theme", value); applyTheme(value); };
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button className="settings-button" size="icon" variant="outline" aria-label="打开控制中心"><Settings2 size={18} /></Button></SheetTrigger>
    <SheetContent className="settings-sheet">
      <SheetHeader className="settings-header"><div className="settings-symbol"><Palette size={19} /></div><SheetTitle className="settings-title">账户与外观</SheetTitle><SheetDescription>选择显示模式与玻璃风格，登录后可在这里签到。</SheetDescription></SheetHeader>
      <div className="settings-body">
        <div className="setting-row"><div><label htmlFor="global-theme-select">显示模式</label><p>选择浅色、深色或跟随设备。</p></div><GlideSelect id="global-theme-select" label="显示模式" value={theme} onChange={value => changeTheme(value as ThemeMode)} options={[{value:"system",label:<><Palette /> 跟随系统</>},{value:"light",label:<><Sun /> 浅色</>},{value:"dark",label:<><Moon /> 深色</>}]} /></div>
        <div className="setting-row material-setting"><div><span>玻璃风格</span><p>柔和圆角，或硬朗直角。</p></div><div className="material-options" role="group" aria-label="玻璃风格"><button type="button" aria-pressed={glass === "liquid"} onClick={() => changeGlass("liquid")}><i className="material-rounded"/>圆角液态玻璃<small>LIQUID</small></button><button type="button" aria-pressed={glass === "frosted"} onClick={() => changeGlass("frosted")}><i/>直角毛玻璃<small>FROSTED</small></button></div></div>
        <AccountPanel onNavigate={() => setOpen(false)} />
      </div>
    </SheetContent>
  </Sheet>;
}
