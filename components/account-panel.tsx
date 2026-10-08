"use client";
import { useFeedback } from "@/lib/notifications";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Award, CalendarCheck, Camera, Film, LogOut, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { MemberBadge } from "@/components/member-badge";
import { LEVEL_THRESHOLDS, nextLevelXp, type Viewer } from "@/lib/community-types";


export function AccountPanel({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [viewer, setViewer] = useState<Viewer | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [, setStatus] = useFeedback("");
  const [xpBurst, setXpBurst] = useState<{ key: number; text: string } | null>(null);

  const refresh = useCallback(() => fetch("/api/auth/me", { cache: "no-store" })
    .then((response) => response.json() as Promise<{ user: Viewer | null }>)
    .then((data) => setViewer(data.user)).catch(() => setViewer(null)), []);

  useEffect(() => { void refresh(); window.addEventListener("comet:auth-change", refresh); return () => window.removeEventListener("comet:auth-change", refresh); }, [refresh]);

  const checkIn = async () => {
    setBusy(true);
    try {
    const response = await fetch("/api/checkin", { method: "POST" });
    const data = await response.json() as { viewer?: Viewer; error?: string; checkedIn?: boolean; xpGained?: number };
    if (response.ok && data.viewer) {
      const gained = data.xpGained ?? data.viewer.xp - (viewer?.xp ?? data.viewer.xp);
      setViewer(data.viewer);
      if (gained > 0) {
        setXpBurst({ key: Date.now(), text: `+${gained} XP` });
        window.setTimeout(() => setXpBurst(null), 1800);
      }
      setStatus(data.checkedIn ? `签到成功，获得 ${gained} XP。` : "今天已经签到过了。");
      window.dispatchEvent(new Event("comet:auth-change"));
    } else setStatus(data.error ?? "签到失败。");
    } catch { setStatus("签到失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus("正在重构头像…");
    const form = new FormData();
    form.set("avatar", file);
    try {
      const response = await fetch("/api/users/avatar", { method: "POST", body: form });
      const data = await response.json() as { viewer?: Viewer; error?: string };
      if (!response.ok || !data.viewer) throw new Error(data.error ?? "头像上传失败。");
      setViewer(data.viewer);
      setStatus("头像已经更新。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "头像上传失败。"); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("退出登录失败。");
    setViewer(null);
    setStatus("已退出登录。");
    window.dispatchEvent(new Event("comet:auth-change"));
    } catch { setStatus("退出登录失败，请重试。"); }
    finally { setBusy(false); }
  };

  if (viewer === undefined) return <div className="account-loading">LOADING MEMBER DATA…</div>;
  if (!viewer) return null;

  const previous = LEVEL_THRESHOLDS[Math.max(0, viewer.level - 1)] ?? 0;
  const next = nextLevelXp(viewer.level);
  const progress = viewer.level >= 10 ? 100 : Math.max(0, Math.min(100, ((viewer.xp - previous) / (next - previous)) * 100));
  return <section className="account-panel account-signed-in">
    <div className="account-identity"><label className="account-avatar account-avatar-upload" title="更换头像">{viewer.avatarUrl ? <img src={viewer.avatarUrl} alt={`${viewer.username} 的头像`} /> : <UserRound />}<Camera className="avatar-camera" /><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={uploadAvatar} /></label><div><small>MEMBER / {viewer.role.toUpperCase()}</small><h3>{viewer.username}</h3><MemberBadge tier={viewer.tier} level={viewer.level} /></div></div>
    <div className="xp-meter"><div><span>EXPERIENCE</span><b>{viewer.xp} / {viewer.level >= 10 ? "MAX" : next} XP</b></div><i><span style={{ width: `${progress}%` }} /></i></div>
    <div className="checkin-stage">{xpBurst && <span className="xp-burst" key={xpBurst.key}>{xpBurst.text}</span>}<button className="checkin-button" type="button" disabled={busy || viewer.checkedInToday} onClick={checkIn}><CalendarCheck size={17} />{viewer.checkedInToday ? `已签到 · 连续 ${viewer.streak} 天` : "今日签到"}</button></div>
    <nav className="account-links">
      <Link href={`/u/${encodeURIComponent(viewer.username)}`}><Award />个人主页<span>PROFILE →</span></Link>
      <Link href="/leaderboard"><Trophy />本周排行榜<span>RANKING →</span></Link>
      {viewer.tier === "svip" && !viewer.disabled && <Link href="/media" onClick={onNavigate}><Film />影视<span>SVIP CINEMA →</span></Link>}
      {viewer.role === "admin" && <Link href="/admin"><ShieldCheck />管理后台<span>ADMIN →</span></Link>}
    </nav>
    <button className="logout-button" type="button" disabled={busy} onClick={logout}><LogOut size={15} /> 退出登录</button>
    
  </section>;
}
