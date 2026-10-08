"use client";
import { useFeedback } from "@/lib/notifications";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, LogOut, Music2, QrCode, Search, ShieldCheck } from "lucide-react";
import { MemberBadge } from "@/components/member-badge";
import type { PublicUser, UserTier, Viewer } from "@/lib/community-types";

type LoginState = { connected: boolean; nickname?: string; avatarUrl?: string };
export default function AdminPage() {
  const [viewer, setViewer] = useState<Viewer | null | undefined>(undefined);
  const [users, setUsers] = useState<PublicUser[]>([]); const [query, setQuery] = useState(""); const [status, setStatus] = useFeedback("");
  const [playlistUrl, setPlaylistUrl] = useState(""); const [musicStatus, setMusicStatus] = useFeedback("");
  const [login, setLogin] = useState<LoginState>({ connected: false }); const [qr, setQr] = useState<{ key: string; image: string } | null>(null);
  const pollRef = useRef<number | null>(null);
  const load = useCallback(async (value = "") => { const response = await fetch(`/api/admin/users?q=${encodeURIComponent(value)}`, { cache: "no-store" }); if (!response.ok) throw new Error("无权访问管理后台。"); setUsers((await response.json() as { users: PublicUser[] }).users); }, []);
  const loadMusic = useCallback(async () => {
    const [config, auth] = await Promise.all([fetch("/api/admin/music", { cache: "no-store" }).then((r) => r.json() as Promise<{ playlistUrl?: string }>), fetch("/api/admin/music/login", { cache: "no-store" }).then((r) => r.json() as Promise<LoginState>)]);
    setPlaylistUrl(config.playlistUrl ?? ""); setLogin(auth);
  }, []);
  useEffect(() => { fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json() as Promise<{ user: Viewer | null }>).then((data) => { setViewer(data.user); if (data.user?.role === "admin") { void load(); void loadMusic(); } }); }, [load, loadMusic]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);
  const search = (event: FormEvent) => { event.preventDefault(); void load(query).catch((error) => setStatus(error.message)); };
  const update = async (user: PublicUser, changes: { tier?: UserTier; disabled?: boolean }) => { const response = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); const data = await response.json() as { error?: string;mediaWarning?:string }; if (!response.ok) setStatus(data.error ?? "更新失败。"); else { setStatus(data.mediaWarning || "用户权限已更新，影视授权已同步。"); await load(query); } };
  const savePlaylist = async (event: FormEvent) => { event.preventDefault(); setMusicStatus("正在解析歌单…"); const response = await fetch("/api/admin/music", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playlistUrl }) }); const data = await response.json() as { error?: string; playlist?: { name: string; count: number } }; setMusicStatus(response.ok && data.playlist ? `已保存「${data.playlist.name}」，共 ${data.playlist.count} 首。` : data.error ?? "歌单保存失败。"); };
  const startLogin = async () => {
    setMusicStatus("正在生成网易云二维码…"); const response = await fetch("/api/admin/music/login", { method: "POST" }); const data = await response.json() as { key?: string; qrimg?: string; error?: string };
    if (!response.ok || !data.key || !data.qrimg) return setMusicStatus(data.error ?? "二维码生成失败。");
    setQr({ key: data.key, image: data.qrimg }); setMusicStatus("请使用网易云音乐 App 扫码并确认。");
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => { const check = await fetch(`/api/admin/music/login?key=${encodeURIComponent(data.key!)}`, { cache: "no-store" }).then((r) => r.json()) as { code?: number; connected?: boolean; message?: string }; if (check.connected) { if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null; setQr(null); setMusicStatus("网易云账号已连接，VIP 可播放资源会使用此账号获取。"); await loadMusic(); } else if (check.code === 800) { if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null; setQr(null); setMusicStatus("二维码已过期，请重新生成。"); } else if (check.code === 802) setMusicStatus("已扫码，请在网易云 App 中确认登录。"); }, 2000);
  };
  const logoutMusic = async () => { await fetch("/api/admin/music/login", { method: "DELETE" }); setLogin({ connected: false }); setMusicStatus("已移除服务器保存的网易云登录凭据。"); };
  if (viewer === undefined) return <main className="community-page"><p className="community-loading">VERIFYING ADMIN ACCESS…</p></main>;
  if (viewer?.role !== "admin") return <main className="community-page"><div className="community-empty"><span>403 / PRIVATE SECTOR</span><h1>这里只对管理员显现。</h1></div></main>;
  return <main className="community-page admin-page"><header className="community-heading"><span><ShieldCheck /> CONTROL ROOM</span><h1>成员管理</h1><p>管理成员、VIP 轨道与每日音乐信号。</p></header>
    <section className="admin-music"><div><span><Music2 /> DAILY TRACK</span><h2>网易云每日歌曲</h2><p>登录凭据仅加密保存在本站服务器，不会发送给访客。</p></div>
      <div className="netease-auth">{login.connected ? <div className="netease-account">{login.avatarUrl && <img src={login.avatarUrl} alt="" />}<div><small>CONNECTED</small><strong>{login.nickname}</strong></div><button type="button" onClick={logoutMusic}><LogOut size={15} /> 退出</button></div> : <button type="button" className="netease-login" onClick={startLogin}><QrCode /> 扫码登录网易云</button>}{qr && <div className="netease-qr"><img src={qr.image} alt="网易云登录二维码" /><p>使用网易云音乐 App 扫码</p></div>}</div>
      <form onSubmit={savePlaylist}><input type="text" value={playlistUrl} onChange={(event) => setPlaylistUrl(event.target.value)} placeholder="https://music.163.com/#/playlist?id=..." required /><button>SAVE PLAYLIST</button></form>{musicStatus && <p className="admin-status">{musicStatus}</p>}</section>
    <form className="admin-search" onSubmit={search}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名或邮箱" /><button>SEARCH</button></form>{status && <p className="admin-status">{status}</p>}
    <Link className="admin-section-link" href="/admin/novels"><span><BookOpen /> NOVEL LIBRARY</span><div><h2>小说文库管理</h2><p>在独立页面中上传、搜索、推荐或删除小说。</p></div><ArrowRight /></Link>
    <section className="admin-user-list">{users.map((user) => <article className="admin-user" key={user.id}><div><b>{user.username}</b><MemberBadge tier={user.tier} level={user.level} compact /><small>{user.role.toUpperCase()} · {user.xp} XP</small></div><label>身份<select value={user.tier} onChange={(event) => void update(user, { tier: event.target.value as UserTier })}><option value="free">FREE</option><option value="vip">VIP</option><option value="svip">SVIP</option></select></label><button className={user.disabled ? "enable" : "disable"} onClick={() => void update(user, { disabled: !user.disabled })}>{user.disabled ? "恢复账号" : "停用账号"}</button></article>)}</section>
  </main>;
}
