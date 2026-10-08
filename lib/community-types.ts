export type UserTier = "free" | "vip" | "svip";
export type UserRole = "user" | "admin";
export type ReactionType = "like" | "dislike" | "heart" | "laugh" | "party";

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  tier: UserTier;
  xp: number;
  level: number;
  disabled: boolean;
  createdAt: string;
  avatarUrl: string | null;
  bio: string;
  backgroundUrl: string | null;
};

export type Viewer = PublicUser & {
  email: string;
  streak: number;
  checkedInToday: boolean;
};

export type ReactionCounts = Record<ReactionType, number>;

export type GuestbookMessage = {
  id: string;
  userId: string | null;
  name: string;
  content: string;
  imageUrl: string | null;
  city: string | null;
  createdAt: string;
  pinned: boolean;
  canDelete: boolean;
  canModerate: boolean;
  author: Pick<PublicUser, "username" | "tier" | "level" | "avatarUrl"> | null;
  reactions: ReactionCounts;
  myReactions: ReactionType[];
};

export type Achievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  earnedAt: string;
};

export type PublicProfile = PublicUser & {
  messageCount: number;
  streak: number;
  achievements: Achievement[];
};

export const LEVEL_THRESHOLDS = [0, 25, 60, 110, 180, 270, 380, 510, 660, 850] as const;

export function levelFromXp(xp: number) {
  let level = 1;
  for (let index = 1; index < LEVEL_THRESHOLDS.length; index += 1) {
    if (xp >= LEVEL_THRESHOLDS[index]) level = index + 1;
  }
  return level;
}

export function nextLevelXp(level: number) {
  return LEVEL_THRESHOLDS[Math.min(level, LEVEL_THRESHOLDS.length - 1)] ?? LEVEL_THRESHOLDS.at(-1)!;
}

export const ACHIEVEMENTS = {
  first_message: { title: "第一颗星", description: "发表第一条留言", icon: "✦" },
  seven_day_streak: { title: "七日轨道", description: "连续签到七天", icon: "⑦" },
  lab_apprentice: { title: "实验学徒", description: "第一次完成实验室工具", icon: "⌁" },
  popular_message: { title: "回声共振", description: "一条留言获得十位访客的反应", icon: "◎" },
  reaction_king: { title: "反应大王", description: "五次平均反应时间不超过 160ms", icon: "⚡" },
  cps_master: { title: "星速连击", description: "CPS 测试达到每秒 10 次", icon: "✺" },
  comet_runner: { title: "彗星奔跑者", description: "跑酷分数达到 1000", icon: "☄" },
  merge_2048: { title: "合成星核", description: "在 2048 中合成 2048 方块", icon: "◇" },
} as const;
