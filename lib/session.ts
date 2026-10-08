import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { PublicUser } from "@/lib/community-types";
import { deleteSession, saveSession, userForSession } from "@/lib/community-db";

export const SESSION_COOKIE = "suieikat_session";
export const GUEST_COOKIE = "suieikat_guest";
export const SESSION_SECONDS = 60 * 60 * 24 * 30;

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string) {
  try {
    const [algorithm, n, r, p, salt, expected] = encoded.split("$");
    if (algorithm !== "scrypt") return false;
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return timingSafeEqual(actual, Buffer.from(expected, "base64url"));
  } catch {
    return false;
  }
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  saveSession(tokenHash(token), userId, expiresAt);
  return { token, expiresAt };
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionUser(request: Request): PublicUser | null {
  const token = cookieValue(request, SESSION_COOKIE);
  return token ? userForSession(tokenHash(token)) : null;
}

export function destroySession(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) deleteSession(tokenHash(token));
}

export function actorKey(request: Request, viewer: PublicUser | null) {
  if (viewer) return `u:${viewer.id}`;
  const guest = cookieValue(request, GUEST_COOKIE);
  return guest ? `g:${guest}` : null;
}

export function cookieSecurity(request: Request) {
  return new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
}
