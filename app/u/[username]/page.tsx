"use client";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarDays, Camera, MessageCircle, Orbit } from "lucide-react";
import { MemberBadge } from "@/components/member-badge";
import { ProfileEditor } from "@/components/profile-editor";
import { useFeedback } from "@/lib/notifications";
import { LEVEL_THRESHOLDS, nextLevelXp, type PublicProfile, type Viewer } from "@/lib/community-types";

export default function ProfilePage() {
  const params = useParams<{ username: string }>(); const [profile, setProfile] = useState<PublicProfile | null | undefined>(); const [viewer, setViewer] = useState<Viewer | null>(null); const [avatarStatus, setAvatarStatus] = useFeedback("");
  const loadProfile = useCallback(async () => { const response = await fetch(`/api/users/${encodeURIComponent(params.username)}`, { cache: "no-store" }); setProfile(response.ok ? (await response.json() as { profile: PublicProfile }).profile : null); }, [params.username]);
  // Initial network hydration is intentionally performed once per profile route.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProfile(); fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json() as Promise<{ user: Viewer | null }>).then((data) => setViewer(data.user)); }, [loadProfile]);
  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const form = new FormData(); form.set("avatar", file); setAvatarStatus("处理中…");
    try {
      const response = await fetch("/api/users/avatar", { method: "POST", body: form });
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error ?? "头像上传失败。"); }
      await loadProfile(); setAvatarStatus("头像已更新");
    } catch (error) { setAvatarStatus(error instanceof Error ? error.message : "头像上传失败，请重试。"); }
  };
  if (profile === undefined) return <main className="community-page"><p className="community-loading">LOCATING MEMBER ORBIT…</p></main>;
  if (!profile) return <main className="community-page"><div className="community-empty"><span>404 / LOST SIGNAL</span><h1>没有找到这个成员。</h1></div></main>;
  const previous = LEVEL_THRESHOLDS[Math.max(0, profile.level - 1)] ?? 0; const next = nextLevelXp(profile.level); const progress = profile.level >= 10 ? 100 : ((profile.xp - previous) / (next - previous)) * 100;
  const background = profile.backgroundUrl || "/site-background-v2.webp";
  return <main className="community-page profile-page">
    <div className="profile-background-clear" aria-hidden="true"><img src={background} alt="" /></div><div className="profile-background-blur" aria-hidden="true"><img src={background} alt="" /></div><div className="profile-background-shade" aria-hidden="true" />
    {viewer?.id === profile.id && <ProfileEditor initialBio={profile.bio} initialDisplayName={profile.displayName} username={profile.username} onSaved={loadProfile} />}
    <header className="profile-hero"><div className={`profile-orbit${profile.avatarUrl ? " has-avatar" : ""}`}>{profile.avatarUrl ? <img src={profile.avatarUrl} alt={`${profile.displayName} 的头像`} /> : <Orbit />}{viewer?.id === profile.id && <label className="profile-avatar-edit" title="更换头像"><Camera /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} /></label>}</div><div><span>MEMBER PROFILE / ORBIT</span><h1>{profile.displayName}</h1><small className="profile-username">@{profile.username}</small><MemberBadge tier={profile.tier} level={profile.level} /><p className="profile-bio">{profile.bio || "这个人还没有留下个性签名。"}</p>{avatarStatus && <p className="profile-avatar-status">{avatarStatus}</p>}</div></header>
    <section className="profile-grid"><article className="profile-xp-card"><span>EXPERIENCE</span><strong>{profile.xp}<small> XP</small></strong><div className="xp-meter"><div><span>LV.{profile.level}</span><b>{profile.level >= 10 ? "MAX LEVEL" : `${next - profile.xp} XP TO NEXT`}</b></div><i><span style={{ width: `${progress}%` }} /></i></div></article><article className="profile-stat"><MessageCircle /><span>留言</span><strong>{profile.messageCount}</strong></article><article className="profile-stat"><CalendarDays /><span>连续签到</span><strong>{profile.streak}<small> DAYS</small></strong></article></section>
    <section className="achievement-section"><header><span>ACHIEVEMENT ARCHIVE</span><h2>成就轨迹</h2></header><div className="achievement-grid">{profile.achievements.length ? profile.achievements.map((a) => <article key={a.code}><b>{a.icon}</b><div><strong>{a.title}</strong><p>{a.description}</p><time>{new Date(a.earnedAt).toLocaleDateString("zh-CN")}</time></div></article>) : <div className="empty-achievement">第一枚徽章正在等待被点亮。</div>}</div></section>
  </main>;
}
