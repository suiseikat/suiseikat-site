import "server-only";

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ACHIEVEMENTS, DAILY_CHECKIN_XP, levelFromXp, type Achievement, type GuestbookMessage, type PublicProfile, type PublicUser, type ReactionCounts, type ReactionType, type UserRole, type UserTier, type Viewer } from "@/lib/community-types";

const databaseFile = process.env.SITE_DATA_FILE ?? path.join(process.cwd(), "data", "site.sqlite");
export const uploadDirectory = process.env.UPLOAD_DATA_DIR ?? path.join(path.dirname(databaseFile), "uploads");
const legacyMessageFile = process.env.MESSAGE_DATA_FILE ?? path.join(process.cwd(), "data", "messages.json");

declare global {
  var __suieikatCommunityDb: DatabaseSync | undefined;
}

type UserRow = {
  id: string; username: string; email: string; role: UserRole; tier: UserTier;
  disabled: number; created_at: string; avatar_name?: string | null; bio?: string | null;
  background_name?: string | null; display_name?: string | null; xp?: number;
};

function initializeDatabase() {
  // Some runtimes (read-only mounts, sandboxed dev workers) refuse mkdir even when
  // the directory already exists; the database can still be opened in that case.
  try { mkdirSync(path.dirname(databaseFile), { recursive: true }); } catch { /* keep going */ }
  try { mkdirSync(uploadDirectory, { recursive: true }); } catch { /* keep going */ }
  const database = new DatabaseSync(databaseFile);
  database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      email_key TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free','vip','svip')),
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      legacy_name TEXT,
      content TEXT NOT NULL,
      image_name TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_visible ON messages(pinned, created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      actor_key TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('like','dislike','heart','laugh','party')),
      created_at TEXT NOT NULL,
      PRIMARY KEY(message_id, actor_key, type)
    );
    CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
    CREATE TABLE IF NOT EXISTS checkins (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, day)
    );
    CREATE TABLE IF NOT EXISTS xp_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, event_key)
    );
    CREATE INDEX IF NOT EXISTS idx_xp_events_user_created ON xp_events(user_id, created_at);
    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      PRIMARY KEY(user_id, code)
    );
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS game_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game TEXT NOT NULL,
      score REAL NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_game_scores_game_score ON game_scores(game, score);
    CREATE TABLE IF NOT EXISTS novels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      kana TEXT NOT NULL DEFAULT '',
      genre TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'epub',
      file_name TEXT NOT NULL DEFAULT '',
      cover_name TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_novels_visible ON novels(featured, created_at) WHERE deleted_at IS NULL;
  `);
  const userColumns = database.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === "avatar_name")) database.exec("ALTER TABLE users ADD COLUMN avatar_name TEXT");
  if (!userColumns.some((column) => column.name === "bio")) database.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
  if (!userColumns.some((column) => column.name === "background_name")) database.exec("ALTER TABLE users ADD COLUMN background_name TEXT");
  if (!userColumns.some((column) => column.name === "display_name")) database.exec("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
  const messageColumns = database.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  if (!messageColumns.some((column) => column.name === "ip_city")) database.exec("ALTER TABLE messages ADD COLUMN ip_city TEXT");
  migrateReactionTypes(database);
  // Older releases recorded daily check-ins without awarding their daily XP.
  // Retain the original dates and unique event keys so restarts cannot pay twice.
  database.prepare(`INSERT OR IGNORE INTO xp_events(id,user_id,event_key,kind,amount,created_at)
    SELECT lower(hex(randomblob(16))),user_id,'checkin:' || day,'daily_checkin',?,created_at FROM checkins`)
    .run(DAILY_CHECKIN_XP);
  bootstrapAdmin(database);
  migrateLegacyMessages(database);
  return database;
}

function migrateReactionTypes(database: DatabaseSync) {
  const schema = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='reactions'").get() as { sql?: string } | undefined;
  if (schema?.sql?.includes("'dislike'")) return;
  database.exec(`
    DROP INDEX IF EXISTS idx_reactions_message_id;
    ALTER TABLE reactions RENAME TO reactions_legacy;
    CREATE TABLE reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      actor_key TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('like','dislike','heart','laugh','party')),
      created_at TEXT NOT NULL,
      PRIMARY KEY(message_id, actor_key, type)
    );
    INSERT INTO reactions(message_id,actor_key,type,created_at) SELECT message_id,actor_key,type,created_at FROM reactions_legacy;
    DROP TABLE reactions_legacy;
    CREATE INDEX idx_reactions_message_id ON reactions(message_id);
  `);
}

function bootstrapAdmin(database: DatabaseSync) {
  if (database.prepare("SELECT 1 AS ok FROM metadata WHERE key='admin_bootstrap_v1'").get()) return;
  const username = process.env.SITE_ADMIN_USERNAME?.normalize("NFKC").trim() ?? "";
  const email = process.env.SITE_ADMIN_EMAIL?.trim() ?? "";
  const password = process.env.SITE_ADMIN_PASSWORD ?? "";
  if (!username || !email || password.length < 8) return;
  const now = new Date().toISOString();
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const passwordHash = `scrypt$32768$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  const usernameKey = normalizeIdentity(username);
  const emailKey = normalizeIdentity(email);
  const existing = database.prepare("SELECT id FROM users WHERE username_key=? OR email_key=? LIMIT 1").get(usernameKey, emailKey) as { id: string } | undefined;
  if (existing) {
    database.prepare("UPDATE users SET role='admin',password_hash=?,updated_at=? WHERE id=?").run(passwordHash, now, existing.id);
  } else {
    database.prepare("INSERT INTO users(id,username,username_key,email,email_key,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,\'admin\',?,?)")
      .run(crypto.randomUUID(), username, usernameKey, email, emailKey, passwordHash, now, now);
  }
  database.prepare("INSERT INTO metadata(key,value) VALUES('admin_bootstrap_v1',?)").run(now);
}

function migrateLegacyMessages(database: DatabaseSync) {
  const migrated = database.prepare("SELECT value FROM metadata WHERE key='legacy_messages_imported'").get() as { value?: string } | undefined;
  if (migrated) return;
  if (existsSync(/* turbopackIgnore: true */ legacyMessageFile)) {
    try {
      const entries = JSON.parse(readFileSync(/* turbopackIgnore: true */ legacyMessageFile, "utf8")) as Array<{ id?: string; name?: string; content?: string; createdAt?: string }>;
      const insert = database.prepare("INSERT OR IGNORE INTO messages(id, legacy_name, content, created_at) VALUES(?,?,?,?)");
      for (const entry of entries) {
        if (!entry.content) continue;
        insert.run(entry.id || crypto.randomUUID(), entry.name?.slice(0, 24) || "历史访客", entry.content.slice(0, 280), entry.createdAt || new Date().toISOString());
      }
    } catch {
      // Keep the old file untouched; an invalid legacy file must not stop the site.
    }
  }
  database.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES('legacy_messages_imported',?)").run(new Date().toISOString());
}

export function db() {
  if (!globalThis.__suieikatCommunityDb) globalThis.__suieikatCommunityDb = initializeDatabase();
  return globalThis.__suieikatCommunityDb;
}

export function normalizeIdentity(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function xpForUser(userId: string) {
  const row = db().prepare("SELECT COALESCE(SUM(amount),0) AS xp FROM xp_events WHERE user_id=?").get(userId) as { xp: number };
  return Number(row.xp || 0);
}

function publicUser(row: UserRow): PublicUser {
  const xp = row.xp === undefined ? xpForUser(row.id) : Number(row.xp || 0);
  return { id: row.id, username: row.username, displayName: row.display_name?.trim() || row.username, role: row.role, tier: row.tier, disabled: Boolean(row.disabled), createdAt: row.created_at, avatarUrl: row.avatar_name ? `/api/uploads/${row.avatar_name}` : null, bio: row.bio ?? "", backgroundUrl: row.background_name ? `/api/uploads/${row.background_name}` : null, xp, level: levelFromXp(xp) };
}

export function createUser(username: string, email: string, passwordHash: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const adminEmail = normalizeIdentity(process.env.SITE_ADMIN_EMAIL ?? "");
  const role: UserRole = adminEmail && normalizeIdentity(email) === adminEmail ? "admin" : "user";
  db().prepare("INSERT INTO users(id,username,username_key,email,email_key,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(id, username, normalizeIdentity(username), email, normalizeIdentity(email), passwordHash, role, now, now);
  return getUserById(id)!;
}

export function getUserById(id: string) {
  const row = db().prepare("SELECT * FROM users WHERE id=?").get(id) as UserRow | undefined;
  return row ? publicUser(row) : null;
}

export function getUserCredentials(identity: string) {
  return db().prepare("SELECT * FROM users WHERE username_key=? OR email_key=? LIMIT 1").get(normalizeIdentity(identity), normalizeIdentity(identity)) as (UserRow & { password_hash: string }) | undefined;
}

export function getUserCredentialsByEmail(email: string) {
  return db().prepare("SELECT * FROM users WHERE email_key=? LIMIT 1").get(normalizeIdentity(email)) as (UserRow & { password_hash: string }) | undefined;
}

export function updatePassword(userId: string, passwordHash: string) {
  const now = new Date().toISOString();
  db().prepare("UPDATE users SET password_hash=?, updated_at=? WHERE id=?").run(passwordHash, now, userId);
  db().prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
}

export function saveSession(tokenHash: string, userId: string, expiresAt: string) {
  db().prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(tokenHash, userId, expiresAt, new Date().toISOString());
}

export function deleteSession(tokenHash: string) {
  db().prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash);
}

export function userForSession(tokenHash: string) {
  db().prepare("DELETE FROM sessions WHERE expires_at<=?").run(new Date().toISOString());
  const row = db().prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").get(tokenHash, new Date().toISOString()) as UserRow | undefined;
  if (!row) return null;
  const adminEmail = normalizeIdentity(process.env.SITE_ADMIN_EMAIL ?? "");
  if (adminEmail && normalizeIdentity(row.email) === adminEmail && row.role !== "admin") {
    db().prepare("UPDATE users SET role='admin', updated_at=? WHERE id=?").run(new Date().toISOString(), row.id);
    row.role = "admin";
  }
  return publicUser(row);
}

function hkDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function consecutiveStreak(userId: string) {
  const days = (db().prepare("SELECT day FROM checkins WHERE user_id=? ORDER BY day DESC LIMIT 366").all(userId) as Array<{ day: string }>).map((row) => row.day);
  const present = new Set(days);
  const cursor = new Date(`${hkDay()}T00:00:00Z`);
  let streak = 0;
  while (present.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function viewerDetails(userId: string): Viewer | null {
  const row = db().prepare("SELECT * FROM users WHERE id=?").get(userId) as UserRow | undefined;
  if (!row) return null;
  const day = hkDay();
  const checkedInToday = Boolean(db().prepare("SELECT 1 AS ok FROM checkins WHERE user_id=? AND day=?").get(userId, day));
  return { ...publicUser(row), email: row.email, streak: consecutiveStreak(userId), checkedInToday };
}

export function awardXp(userId: string, eventKey: string, kind: string, amount: number, achievement?: keyof typeof ACHIEVEMENTS) {
  const now = new Date().toISOString();
  const result = db().prepare("INSERT OR IGNORE INTO xp_events(id,user_id,event_key,kind,amount,created_at) VALUES(?,?,?,?,?,?)")
    .run(crypto.randomUUID(), userId, eventKey, kind, amount, now);
  if (Number(result.changes) && achievement) db().prepare("INSERT OR IGNORE INTO user_achievements(user_id,code,earned_at) VALUES(?,?,?)").run(userId, achievement, now);
  return Number(result.changes) > 0;
}

function reactionCounts(messageId: string): ReactionCounts {
  const counts: ReactionCounts = { like: 0, dislike: 0, heart: 0, laugh: 0, party: 0 };
  const rows = db().prepare("SELECT type,COUNT(*) AS total FROM reactions WHERE message_id=? GROUP BY type").all(messageId) as Array<{ type: ReactionType; total: number }>;
  for (const row of rows) counts[row.type] = Number(row.total);
  return counts;
}

export function listMessages(limit: number, viewer: PublicUser | null, actorKey: string | null): GuestbookMessage[] {
  const rows = db().prepare(`SELECT m.*,u.username,u.tier,u.role,u.disabled,u.avatar_name,
    COALESCE((SELECT SUM(amount) FROM xp_events x WHERE x.user_id=u.id),0) AS xp
    FROM messages m LEFT JOIN users u ON u.id=m.user_id
    WHERE m.deleted_at IS NULL ORDER BY m.pinned DESC,m.created_at DESC LIMIT ?`).all(limit) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const userId = row.user_id as string | null;
    const xp = Number(row.xp || 0);
    const mine = actorKey ? (db().prepare("SELECT type FROM reactions WHERE message_id=? AND actor_key=?").all(row.id as string, actorKey) as Array<{ type: ReactionType }>).map((item) => item.type) : [];
    return {
      id: row.id as string,
      userId,
      name: (row.username || row.legacy_name || "历史访客") as string,
      content: row.content as string,
      imageUrl: row.image_name ? `/api/uploads/${row.image_name}` : null,
      city: row.ip_city ? String(row.ip_city) : null,
      createdAt: row.created_at as string,
      pinned: Boolean(row.pinned),
      canDelete: Boolean(viewer && (viewer.role === "admin" || viewer.id === userId)),
      canModerate: viewer?.role === "admin",
      author: userId ? { username: row.username as string, tier: row.tier as UserTier, level: levelFromXp(xp), avatarUrl: row.avatar_name ? `/api/uploads/${row.avatar_name}` : null } : null,
      reactions: reactionCounts(row.id as string),
      myReactions: mine,
    };
  });
}

export function createMessage(user: PublicUser, content: string, imageName: string | null, city: string | null = null) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const previous = db().prepare("SELECT COUNT(*) AS total FROM messages WHERE user_id=? AND deleted_at IS NULL").get(user.id) as { total: number };
  db().prepare("INSERT INTO messages(id,user_id,content,image_name,ip_city,created_at) VALUES(?,?,?,?,?,?)").run(id, user.id, content, imageName, city, now);
  if (Number(previous.total) === 0) awardXp(user.id, "first_message", "first_message", 10, "first_message");
  return listMessages(1, user, `u:${user.id}`).find((message) => message.id === id) ?? listMessages(500, user, `u:${user.id}`).find((message) => message.id === id)!;
}

export function messageImageName(messageId: string) {
  const row = db().prepare("SELECT image_name FROM messages WHERE id=?").get(messageId) as { image_name: string | null } | undefined;
  return row?.image_name ?? null;
}

export function deleteMessage(messageId: string, viewer: PublicUser) {
  const row = db().prepare("SELECT user_id FROM messages WHERE id=? AND deleted_at IS NULL").get(messageId) as { user_id: string | null } | undefined;
  if (!row || (viewer.role !== "admin" && row.user_id !== viewer.id)) return false;
  db().prepare("UPDATE messages SET deleted_at=? WHERE id=?").run(new Date().toISOString(), messageId);
  return true;
}

export function setMessagePinned(messageId: string, pinned: boolean, viewer: PublicUser) {
  if (viewer.role !== "admin") return false;
  return Number(db().prepare("UPDATE messages SET pinned=? WHERE id=? AND deleted_at IS NULL").run(pinned ? 1 : 0, messageId).changes) > 0;
}

export function toggleReaction(messageId: string, actorKey: string, type: ReactionType) {
  const database = db();
  const existing = database.prepare("SELECT 1 AS ok FROM reactions WHERE message_id=? AND actor_key=? AND type=?").get(messageId, actorKey, type);
  if (existing) database.prepare("DELETE FROM reactions WHERE message_id=? AND actor_key=? AND type=?").run(messageId, actorKey, type);
  else database.prepare("INSERT INTO reactions(message_id,actor_key,type,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND deleted_at IS NULL)")
    .run(messageId, actorKey, type, new Date().toISOString(), messageId);
  const owner = database.prepare("SELECT user_id FROM messages WHERE id=?").get(messageId) as { user_id: string | null } | undefined;
  const uniqueActors = database.prepare("SELECT COUNT(DISTINCT actor_key) AS total FROM reactions WHERE message_id=?").get(messageId) as { total: number };
  if (owner?.user_id && Number(uniqueActors.total) >= 10) awardXp(owner.user_id, `popular_message:${messageId}`, "popular_message", 30, "popular_message");
  return { reactions: reactionCounts(messageId), active: !existing };
}

export function checkIn(userId: string) {
  const day = hkDay();
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const previousXp = xpForUser(userId);
    const inserted = database.prepare("INSERT OR IGNORE INTO checkins(user_id,day,created_at) VALUES(?,?,?)").run(userId, day, new Date().toISOString());
    awardXp(userId, `checkin:${day}`, "daily_checkin", DAILY_CHECKIN_XP);
    const streak = consecutiveStreak(userId);
    if (Number(inserted.changes) && streak > 0 && streak % 7 === 0) awardXp(userId, `checkin7:${day}`, "seven_day_streak", 50, "seven_day_streak");
    const viewer = viewerDetails(userId)!;
    database.exec("COMMIT");
    return { checkedIn: Number(inserted.changes) > 0, streak, xpGained: viewer.xp - previousXp, viewer };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function updateAvatar(userId: string, avatarName: string) {
  const previous = db().prepare("SELECT avatar_name FROM users WHERE id=?").get(userId) as { avatar_name: string | null } | undefined;
  if (!previous) return null;
  db().prepare("UPDATE users SET avatar_name=?,updated_at=? WHERE id=?").run(avatarName, new Date().toISOString(), userId);
  return { previous: previous.avatar_name, viewer: viewerDetails(userId)! };
}

export function updateProfile(userId: string, values: { bio?: string; displayName?: string; backgroundName?: string | null }) {
  const current = db().prepare("SELECT background_name FROM users WHERE id=?").get(userId) as { background_name: string | null } | undefined;
  if (!current) return null;
  if (values.bio !== undefined) db().prepare("UPDATE users SET bio=?,updated_at=? WHERE id=?").run(values.bio.slice(0, 160), new Date().toISOString(), userId);
  if (values.displayName !== undefined) db().prepare("UPDATE users SET display_name=?,updated_at=? WHERE id=?").run(values.displayName.slice(0, 32), new Date().toISOString(), userId);
  if (values.backgroundName !== undefined) db().prepare("UPDATE users SET background_name=?,updated_at=? WHERE id=?").run(values.backgroundName, new Date().toISOString(), userId);
  return { previousBackground: current.background_name, viewer: viewerDetails(userId)! };
}

export function registerVisit(visitorKey: string) {
  db().exec(`CREATE TABLE IF NOT EXISTS site_visits (visitor_key TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL)`);
  const now = new Date().toISOString();
  db().prepare("INSERT INTO site_visits(visitor_key,first_seen,last_seen) VALUES(?,?,?) ON CONFLICT(visitor_key) DO UPDATE SET last_seen=excluded.last_seen").run(visitorKey, now, now);
  const row = db().prepare("SELECT COUNT(*) AS total FROM site_visits").get() as { total: number };
  return Number(row.total);
}

export function recordLabUse(userId: string, tool: string) {
  const day = hkDay();
  const awarded = awardXp(userId, `lab:${tool}:${day}`, "lab_tool_used", 5, "lab_apprentice");
  return { awarded, viewer: viewerDetails(userId)! };
}

function achievementsForUser(userId: string): Achievement[] {
  const rows = db().prepare("SELECT code,earned_at FROM user_achievements WHERE user_id=? ORDER BY earned_at DESC").all(userId) as Array<{ code: keyof typeof ACHIEVEMENTS; earned_at: string }>;
  return rows.flatMap((row) => ACHIEVEMENTS[row.code] ? [{ code: row.code, ...ACHIEVEMENTS[row.code], earnedAt: row.earned_at }] : []);
}

export function publicProfile(username: string): PublicProfile | null {
  const row = db().prepare("SELECT * FROM users WHERE username_key=?").get(normalizeIdentity(username)) as UserRow | undefined;
  if (!row || row.disabled) return null;
  const messages = db().prepare("SELECT COUNT(*) AS total FROM messages WHERE user_id=? AND deleted_at IS NULL").get(row.id) as { total: number };
  return { ...publicUser(row), messageCount: Number(messages.total), streak: consecutiveStreak(row.id), achievements: achievementsForUser(row.id) };
}

function mondayStartIso() {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const dayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  const midnightUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - Math.max(0, dayIndex)) - 8 * 60 * 60 * 1000;
  return new Date(midnightUtc).toISOString();
}

export function weeklyLeaderboard() {
  const rows = db().prepare(`SELECT u.*,COALESCE(SUM(x.amount),0) AS weekly_xp,
    COALESCE((SELECT SUM(amount) FROM xp_events allx WHERE allx.user_id=u.id),0) AS xp
    FROM users u LEFT JOIN xp_events x ON x.user_id=u.id AND x.created_at>=?
    WHERE u.disabled=0 GROUP BY u.id HAVING weekly_xp>0 ORDER BY weekly_xp DESC,u.created_at ASC LIMIT 20`).all(mondayStartIso()) as Array<UserRow & { weekly_xp: number }>;
  return rows.map((row, index) => ({ rank: index + 1, ...publicUser(row), weeklyXp: Number(row.weekly_xp) }));
}

export function searchUsers(query: string) {
  const key = `%${normalizeIdentity(query)}%`;
  const rows = db().prepare(`SELECT u.*,COALESCE((SELECT SUM(amount) FROM xp_events x WHERE x.user_id=u.id),0) AS xp
    FROM users u WHERE u.username_key LIKE ? OR u.email_key LIKE ? ORDER BY u.created_at DESC LIMIT 50`).all(key, key) as UserRow[];
  return rows.map((row) => ({ ...publicUser(row), email: row.email }));
}

export function updateUserAdmin(userId: string, values: { tier?: UserTier; disabled?: boolean }) {
  const current = db().prepare("SELECT tier,disabled FROM users WHERE id=?").get(userId) as { tier: UserTier; disabled: number } | undefined;
  if (!current) return null;
  const tier = values.tier ?? current.tier;
  const disabled = values.disabled === undefined ? current.disabled : values.disabled ? 1 : 0;
  db().prepare("UPDATE users SET tier=?,disabled=?,updated_at=? WHERE id=?").run(tier, disabled, new Date().toISOString(), userId);
  if (disabled) db().prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
  return getUserById(userId);
}

export function getSiteSetting(key: string) {
  const row = db().prepare("SELECT value FROM metadata WHERE key=?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSiteSetting(key: string, value: string) {
  db().prepare("INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

export type GameName = "reaction" | "cps" | "runner" | "2048";

export function saveGameScore(userId: string, game: GameName, score: number, details = "") {
  const safe = Number.isFinite(score) ? Math.max(0, score) : 0;
  db().prepare("INSERT INTO game_scores(id,user_id,game,score,details,created_at) VALUES(?,?,?,?,?,?)")
    .run(crypto.randomUUID(), userId, game, safe, details.slice(0, 500), new Date().toISOString());
  if (game === "reaction" && safe <= 160) awardXp(userId, "game:reaction_king", "reaction_king", 30, "reaction_king");
  if (game === "cps" && safe >= 10) awardXp(userId, "game:cps_master", "cps_master", 25, "cps_master");
  if (game === "runner" && safe >= 1000) awardXp(userId, "game:comet_runner", "comet_runner", 30, "comet_runner");
  if (game === "2048" && safe >= 2048) awardXp(userId, "game:merge_2048", "merge_2048", 35, "merge_2048");
}

export function gameLeaderboard(game: GameName) {
  const value = game === "reaction" ? "MIN(gs.score)" : "MAX(gs.score)";
  const order = game === "reaction" ? "ASC" : "DESC";
  const rows = db().prepare(`SELECT u.username,u.avatar_name,u.tier,${value} AS score FROM game_scores gs JOIN users u ON u.id=gs.user_id WHERE gs.game=? AND u.disabled=0 GROUP BY gs.user_id ORDER BY score ${order} LIMIT 20`).all(game) as Array<{ username: string; avatar_name: string | null; tier: UserTier; score: number }>;
  return rows.map((row) => ({ username: row.username, avatarUrl: row.avatar_name ? `/api/uploads/${row.avatar_name}` : null, tier: row.tier, score: Number(row.score) }));
}

/* ===== Novels (light novel library) ===== */

export type NovelRow = {
  id: string; title: string; author: string; kana: string; genre: string; description: string;
  format: string; file_name: string; cover_name: string | null; featured: number;
  uploaded_by: string | null; created_at: string;
};

export type Novel = {
  id: string; title: string; author: string; kana: string; genre: string; description: string;
  format: string; coverUrl: string | null; fileUrl: string; featured: boolean; createdAt: string;
};

function toNovel(row: NovelRow): Novel {
  return {
    id: row.id, title: row.title, author: row.author, kana: row.kana, genre: row.genre,
    description: row.description, format: row.format,
    coverUrl: row.cover_name ? `/api/novels/cover/${row.cover_name}` : null,
    fileUrl: `/api/novels/file/${row.file_name}`,
    featured: row.featured === 1, createdAt: row.created_at,
  };
}

export function listNovels(): Novel[] {
  const rows = db().prepare("SELECT * FROM novels WHERE deleted_at IS NULL ORDER BY featured DESC, created_at DESC").all() as NovelRow[];
  return rows.map(toNovel);
}

export function listFeaturedNovels(): Novel[] {
  const rows = db().prepare("SELECT * FROM novels WHERE deleted_at IS NULL AND featured=1 ORDER BY created_at DESC").all() as NovelRow[];
  return rows.map(toNovel);
}

export function getNovelRow(id: string): NovelRow | null {
  const row = db().prepare("SELECT * FROM novels WHERE id=? AND deleted_at IS NULL").get(id) as NovelRow | undefined;
  return row ?? null;
}

export function getNovelByFileName(fileName: string): NovelRow | null {
  const row = db().prepare("SELECT * FROM novels WHERE file_name=? AND deleted_at IS NULL LIMIT 1").get(fileName) as NovelRow | undefined;
  return row ?? null;
}

export function createNovel(values: { title: string; author: string; kana: string; genre: string; description: string; format: string; fileName: string; coverName: string | null; uploadedBy: string | null }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const count = db().prepare("SELECT COUNT(*) AS n FROM novels WHERE deleted_at IS NULL").get() as { n: number };
  // First few uploads are featured automatically so the shelf is never empty.
  const featured = count.n < 12 ? 1 : 0;
  db().prepare("INSERT INTO novels(id,title,author,kana,genre,description,format,file_name,cover_name,featured,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, values.title, values.author, values.kana, values.genre, values.description, values.format, values.fileName, values.coverName, featured, values.uploadedBy, now);
  return getNovelRow(id);
}

export function deleteNovel(id: string) {
  const row = getNovelRow(id);
  if (!row) return null;
  db().prepare("UPDATE novels SET deleted_at=? WHERE id=?").run(new Date().toISOString(), id);
  return row;
}

export function setNovelFeatured(id: string, featured: boolean) {
  db().prepare("UPDATE novels SET featured=? WHERE id=? AND deleted_at IS NULL").run(featured ? 1 : 0, id);
  return getNovelRow(id);
}

export function updateNovelMeta(id: string, values: { title?: string; author?: string; genre?: string; description?: string }) {
  const row = getNovelRow(id);
  if (!row) return null;
  db().prepare("UPDATE novels SET title=?,author=?,genre=?,description=? WHERE id=?")
    .run(values.title ?? row.title, values.author ?? row.author, values.genre ?? row.genre, values.description ?? row.description, id);
  return getNovelRow(id);
}
