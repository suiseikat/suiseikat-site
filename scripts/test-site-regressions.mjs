import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { register } from "node:module";
import { once } from "node:events";
import { spawn } from "node:child_process";

register("./test-typescript-loader.mjs", import.meta.url);
await mkdir(".tmp", { recursive: true });
const directory = await mkdtemp(path.resolve(".tmp/site-regressions-"));
Object.assign(process.env, {
  SITE_DATA_FILE: path.join(directory, "site.sqlite"),
  UPLOAD_DATA_DIR: path.join(directory, "uploads"),
  MESSAGE_DATA_FILE: path.join(directory, "no-legacy-messages.json"),
  SITE_ADMIN_USERNAME: "", SITE_ADMIN_EMAIL: "", SITE_ADMIN_PASSWORD: "",
});
let playlistRequests = 0, audioRequests = 0;
const mock = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/playlist/detail") {
    if (++playlistRequests === 1) { response.writeHead(503).end("{}"); return; }
    response.end(JSON.stringify({ playlist: { name: "Regression playlist", trackIds: [{ id: 123456 }], tracks: [{ id: 123456, name: "首次加载测试", al: { name: "Album" } }] } })); return;
  }
  if (url.pathname === "/song/detail") {
    response.end(JSON.stringify({ songs: [{ id: 123456, name: "首次加载测试", ar: [{ name: "Test Artist" }], al: { name: "Album", picUrl: "/novel-cover-placeholder.webp" }, dt: 180000 }] })); return;
  }
  if (url.pathname.startsWith("/song/url")) {
    audioRequests++;
    await new Promise(resolve => setTimeout(resolve, 300));
    response.end(JSON.stringify({ data: [{ url: "https://audio.example.test/test.mp3" }] })); return;
  }
  response.writeHead(404).end("{}");
});
mock.listen(0, "127.0.0.1"); await once(mock, "listening");
process.env.NETEASE_API_URL = `http://127.0.0.1:${mock.address().port}`;
const community = await import("../lib/community-db.ts");
const session = await import("../lib/session.ts");
const download = await import("../lib/novel-download.ts");
const music = await import("../lib/netease-music.ts");
const files = await import("../app/api/novels/file/[name]/route.ts");
const checkins = await import("../app/api/checkin/route.ts");
const passed = [];
function user(name) { return community.createUser(name, `${name}@example.test`, "test-only-not-a-password-hash"); }
function day(offset = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
try {
  const daily = user("daily_test");
  const token = session.createSession(daily.id).token;
  const request = () => new Request("http://localhost/api/checkin", { method: "POST", headers: { cookie: `suieikat_session=${token}` } });
  const first = await (await checkins.POST(request())).json();
  assert.equal(first.viewer.xp, 5); assert.equal(first.xpGained, 5); assert.equal(first.checkedIn, true);
  const repeat = await (await checkins.POST(request())).json();
  assert.equal(repeat.viewer.xp, 5); assert.equal(repeat.xpGained, 0); assert.equal(repeat.checkedIn, false);
  assert.equal(community.publicProfile(daily.username).xp, 5);
  passed.push("daily XP, repeated check-in and public profile");

  const weekly = user("weekly_test");
  for (let index = 6; index > 0; index--) {
    const date = day(-index);
    community.db().prepare("INSERT INTO checkins(user_id,day,created_at) VALUES(?,?,?)").run(weekly.id, date, `${date}T12:00:00Z`);
    community.awardXp(weekly.id, `checkin:${date}`, "daily_checkin", 5);
  }
  const seventh = community.checkIn(weekly.id);
  assert.equal(seventh.streak, 7); assert.equal(seventh.xpGained, 55); assert.equal(seventh.viewer.xp, 85);
  assert.equal(community.checkIn(weekly.id).viewer.xp, 85);
  passed.push("seven-day bonus and idempotency");

  const legacy = user("legacy_test");
  for (const offset of [-3, -2]) community.db().prepare("INSERT INTO checkins(user_id,day,created_at) VALUES(?,?,?)").run(legacy.id, day(offset), `${day(offset)}T12:00:00Z`);
  community.db().close(); globalThis.__suieikatCommunityDb = undefined;
  assert.equal(community.getUserById(legacy.id).xp, 10);
  community.db().close(); globalThis.__suieikatCommunityDb = undefined;
  assert.equal(community.getUserById(legacy.id).xp, 10);
  passed.push("legacy check-in backfill is restart-safe");

  await mkdir(path.join(directory, "uploads/books"), { recursive: true });
  const fileName = `${crypto.randomUUID()}.epub`;
  await writeFile(path.join(directory, "uploads/books", fileName), "test book bytes");
  const title = "异世界迷宫最深部为目标 01";
  const novel = community.createNovel({ title, author: "test", kana: "", genre: "test", description: "", format: "epub", fileName, coverName: null, uploadedBy: null });
  const readBook = () => files.GET(new Request(`http://localhost/api/novels/file/${fileName}`), { params: Promise.resolve({ name: fileName }) });
  let response = await readBook();
  assert.equal(response.status, 200); assert.equal(await response.text(), "test book bytes");
  assert.equal(decodeURIComponent(response.headers.get("Content-Disposition").split("filename*=UTF-8''")[1]), `${title}.epub`);
  assert.equal(download.novelDownloadName("Book.epub", "epub"), "Book.epub");
  assert.equal(download.novelDownloadName("CON", "mobi"), "_CON.mobi");
  assert.ok(!/[\r\n<>:"/\\|?*]/.test(download.novelDownloadName('书名\r\n"/:测试', "azw3")));
  assert.ok(Buffer.byteLength(download.novelDownloadName("书".repeat(300), "epub")) < 255);
  community.updateNovelMeta(novel.id, { title: "新书名" });
  response = await readBook(); assert.match(response.headers.get("Content-Disposition"), /%E6%96%B0%E4%B9%A6%E5%90%8D\.epub/);
  community.deleteNovel(novel.id); assert.equal((await readBook()).status, 404);
  passed.push("Chinese download names, metadata rename, safe paths and extensions");

  community.setSiteSetting("netease_playlist_id", "123456");
  await assert.rejects(() => music.getDailyMusic());
  const track = await music.getDailyMusic();
  assert.equal(track.name, "首次加载测试"); assert.ok(track.coverUrl); assert.equal(audioRequests, 0);
  assert.equal((await music.getDailyMusic()).coverUrl, track.coverUrl);
  assert.equal(await music.getMusicAudioUrl(track.id), "https://audio.example.test/test.mp3"); assert.equal(audioRequests, 1);
  passed.push("cold music metadata recovers and does not wait for audio requests");

  console.log(JSON.stringify({ ok: true, passed, testData: directory }));
  if (process.argv.includes("--serve")) {
    community.createUser("regression_browser", "browser@example.test", session.hashPassword("Regression-only-123"));
    // Force a cold first visit, then verify the browser's own retry behavior.
    community.setSiteSetting("netease_daily_track", ""); playlistRequests = 0;
    community.db().close(); globalThis.__suieikatCommunityDb = undefined;
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3102"], { stdio: "inherit", env: process.env });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
    await once(child, "exit");
  }
} finally {
  if (globalThis.__suieikatCommunityDb) { globalThis.__suieikatCommunityDb.close(); globalThis.__suieikatCommunityDb = undefined; }
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
}
