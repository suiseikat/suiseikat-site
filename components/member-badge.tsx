import type { UserTier } from "@/lib/community-types";
import { Crown, Sparkles } from "lucide-react";

export function MemberBadge({ tier, level, compact = false }: { tier: UserTier; level: number; compact?: boolean }) {
  const levelStyle = level >= 10 ? "cosmic" : level >= 5 ? "orbit" : level >= 3 ? "flow" : "pulse";
  return <span className={`member-badges${compact ? " is-compact" : ""}`}>
    <span className={`level-badge level-${levelStyle}`}><i className="level-particle p1" /><i className="level-particle p2" />LV.{level}</span>
    {tier !== "free" && <span className={`tier-badge ${tier}`}>{tier === "vip" ? <Crown /> : <Sparkles />}<b>{tier.toUpperCase()}</b><i className="badge-glint" /></span>}
  </span>;
}
