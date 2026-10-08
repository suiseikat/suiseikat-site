import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getSiteSetting, setSiteSetting } from "@/lib/community-db";

const apiBase = (process.env.NETEASE_API_URL ?? "http://netease-api:3000").replace(/\/$/, "");
const COOKIE_KEY = "netease_login_cookie_v1";
export type DailyMusic = { date: string; playlistId: string; playlistName: string; id: number; name: string; artists: string; album: string; coverUrl: string; durationMs: number; songUrl: string; audioUrl: string };

export function extractPlaylistId(value: string) {
  const input = value.trim();
  if (/^\d{5,20}$/.test(input)) return input;
  try { const url = new URL(input); const id = url.searchParams.get("id") ?? url.hash.match(/playlist\?id=(\d+)/)?.[1] ?? url.pathname.match(/playlist\/(\d+)/)?.[1]; return id && /^\d{5,20}$/.test(id) ? id : null; }
  catch { return input.match(/(?:playlist\?id=|playlist\/)(\d{5,20})/)?.[1] ?? null; }
}

async function api<T>(pathname: string, cookie?: string | null) {
  const url = new URL(`${apiBase}${pathname}`);
  if (cookie) url.searchParams.set("cookie", cookie);
  url.searchParams.set("timestamp", String(Date.now()));
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`网易云接口返回 ${response.status}`);
  return response.json() as Promise<T>;
}

function encryptionKey() { return createHash("sha256").update(process.env.MUSIC_COOKIE_SECRET || process.env.SITE_ADMIN_PASSWORD || "suieikat-local-music-cookie").digest(); }
export function saveNeteaseCookie(cookie: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(cookie, "utf8"), cipher.final()]);
  setSiteSetting(COOKIE_KEY, [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join("."));
}
export function clearNeteaseCookie() { setSiteSetting(COOKIE_KEY, ""); }
export function getNeteaseCookie() {
  const stored = getSiteSetting(COOKIE_KEY); if (!stored) return null;
  try { const [iv, tag, encrypted] = stored.split(".").map((part) => Buffer.from(part, "base64url")); const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"); }
  catch { return null; }
}
export async function createLoginQr() {
  const key = (await api<{ data?: { unikey?: string } }>("/login/qr/key")).data?.unikey;
  if (!key) throw new Error("无法创建登录二维码。");
  const data = (await api<{ data?: { qrimg?: string; qrurl?: string } }>(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true`)).data;
  if (!data?.qrimg) throw new Error("二维码生成失败。");
  return { key, qrimg: data.qrimg, qrurl: data.qrurl };
}
export async function checkLoginQr(key: string) {
  const result = await api<{ code?: number; message?: string; cookie?: string }>(`/login/qr/check?key=${encodeURIComponent(key)}&noCookie=true`);
  if (result.code === 803 && result.cookie) saveNeteaseCookie(result.cookie);
  return { code: result.code ?? 500, message: result.message ?? "未知状态", connected: result.code === 803 };
}
export async function neteaseLoginStatus() {
  const cookie = getNeteaseCookie(); if (!cookie) return { connected: false as const };
  try { const profile = (await api<{ data?: { profile?: { nickname?: string; avatarUrl?: string } } }>("/login/status", cookie)).data?.profile; return profile ? { connected: true as const, nickname: profile.nickname ?? "网易云用户", avatarUrl: profile.avatarUrl ?? "" } : { connected: false as const }; }
  catch { return { connected: false as const }; }
}

type ApiSong = { id: number; name: string; dt?: number; ar?: Array<{ name: string }>; artists?: Array<{ name: string }>; al?: { name?: string; picUrl?: string }; album?: { name?: string; picUrl?: string } };
type PlaylistResponse = { playlist?: { name?: string; tracks?: ApiSong[]; trackIds?: Array<{ id: number }> } };
export async function inspectPlaylist(playlistId: string) {
  const result = await api<PlaylistResponse>(`/playlist/detail?id=${encodeURIComponent(playlistId)}&s=0`, getNeteaseCookie());
  if (!result.playlist?.trackIds?.length && !result.playlist?.tracks?.length) throw new Error("歌单不存在、未公开或没有歌曲。");
  return { name: result.playlist.name || "网易云歌单", count: result.playlist.trackIds?.length ?? result.playlist.tracks?.length ?? 0 };
}
function hkDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export async function getDailyMusic(force = false): Promise<DailyMusic | null> {
  const playlistId = getSiteSetting("netease_playlist_id"); if (!playlistId) return null;
  const date = hkDate(); const cached = getSiteSetting("netease_daily_track");
  if (!force && cached) { try { const parsed = JSON.parse(cached) as DailyMusic; if (parsed.date === date && parsed.playlistId === playlistId) return parsed; } catch { /* refresh */ } }
  const cookie = getNeteaseCookie(); const result = await api<PlaylistResponse>(`/playlist/detail?id=${encodeURIComponent(playlistId)}&s=0`, cookie);
  const playlist = result.playlist; const ids = playlist?.trackIds?.map((track) => track.id) ?? playlist?.tracks?.map((track) => track.id) ?? [];
  if (!playlist || !ids.length) throw new Error("歌单没有可展示的歌曲。");
  const digest = force ? randomBytes(4) : createHash("sha256").update(`${playlistId}:${date}`).digest(); const selectedId = ids[digest.readUInt32BE(0) % ids.length];
  let song = playlist.tracks?.find((track) => track.id === selectedId); if (!song) song = (await api<{ songs?: ApiSong[] }>(`/song/detail?ids=${selectedId}`, cookie)).songs?.[0];
  if (!song) throw new Error("无法取得歌曲资料。");
  let audioUrl = `https://music.163.com/song/media/outer/url?id=${selectedId}.mp3`;
  try { let audio = await api<{ data?: Array<{ url?: string | null }> }>(`/song/url/v1?id=${selectedId}&level=lossless`, cookie); if (!audio.data?.[0]?.url) audio = await api<{ data?: Array<{ url?: string | null }> }>(`/song/url?id=${selectedId}&br=320000`, cookie); if (audio.data?.[0]?.url) audioUrl = audio.data[0].url.replace(/^http:/, "https:"); } catch { /* public fallback */ }
  const artists = song.ar ?? song.artists ?? []; const album = song.al ?? song.album ?? {};
  const daily: DailyMusic = { date, playlistId, playlistName: playlist.name || "网易云歌单", id: song.id, name: song.name, artists: artists.map((artist) => artist.name).join(" / ") || "Unknown Artist", album: album.name || "Unknown Album", coverUrl: (album.picUrl || "").replace(/^http:/, "https:"), durationMs: song.dt ?? 0, songUrl: `https://music.163.com/#/song?id=${song.id}`, audioUrl };
  setSiteSetting("netease_daily_track", JSON.stringify(daily)); return daily;
}
