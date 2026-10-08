"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { MemberBadge } from "@/components/member-badge";
import type { PublicUser } from "@/lib/community-types";

type RankedUser = PublicUser & { rank: number; weeklyXp: number };

export default function LeaderboardPage() {
  const [users, setUsers] = useState<RankedUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { fetch("/api/leaderboard", { cache: "no-store" }).then(async (response) => await response.json() as { users: RankedUser[] }).then((data) => setUsers(data.users)).finally(() => setLoaded(true)); }, []);
  return <main className="community-page leaderboard-page">
    
    <header className="community-heading"><span>WEEKLY SIGNAL / HK TIME</span><h1>本周最活跃</h1><p>每周一零点重新计算本周经验，历史等级不会清空。</p></header>
    <section className="ranking-list">{users.map((user) => <Link href={`/u/${encodeURIComponent(user.username)}`} className={`ranking-row rank-${user.rank}`} key={user.id}><strong className="rank-number">{String(user.rank).padStart(2, "0")}</strong><div className="rank-avatar"><Trophy /></div><div className="rank-user"><b>{user.username}</b><MemberBadge tier={user.tier} level={user.level} compact /></div><span className="weekly-xp">+{user.weeklyXp}<small> WEEK XP</small></span></Link>)}{loaded && !users.length && <div className="community-empty"><span>QUIET ORBIT</span><h2>本周还没有经验记录。</h2></div>}</section>
  </main>;
}
