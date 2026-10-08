const base = process.env.SMOKE_BASE ?? "http://127.0.0.1:3102";
let cookie = "";

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(base + path, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

const suffix = Date.now().toString(36);
const username = `smoke_${suffix}`;
const email = "admin-smoke@example.com";
const password = "smoke-pass-123";

const registered = await request("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, email, password, confirmPassword: password }) });
if (registered.user.role !== "admin") throw new Error("admin promotion failed");
const me = await request("/api/auth/me");
if (me.user.username !== username) throw new Error("session persistence failed");
const checked = await request("/api/checkin", { method: "POST" });
if (!checked.viewer.checkedInToday) throw new Error("check-in failed");
const form = new FormData();
form.set("content", "Community smoke test");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
form.set("image", new File([png], "pixel.png", { type: "image/png" }));
const posted = await request("/api/messages", { method: "POST", body: form });
if (!posted.message?.id) throw new Error("message creation failed");
if (!posted.message.imageUrl) throw new Error("image upload failed");
const imageResponse = await fetch(base + posted.message.imageUrl);
if (!imageResponse.ok || imageResponse.headers.get("content-type") !== "image/webp") throw new Error("image delivery failed");
const reacted = await request(`/api/messages/${posted.message.id}/reactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "heart" }) });
if (reacted.reactions.heart !== 1) throw new Error("reaction failed");
await request(`/api/messages/${posted.message.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ pinned: true }) });
const profile = await request(`/api/users/${encodeURIComponent(username)}`);
if (profile.profile.xp < 10) throw new Error("first message XP failed");
await request("/api/leaderboard");
await request("/api/admin/users?q=smoke");
await request("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "new-smoke-pass-123", confirmPassword: "new-smoke-pass-123" }) });
cookie = "";
await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity: username, password: "new-smoke-pass-123" }) });
console.log(JSON.stringify({ ok: true, username, xp: profile.profile.xp, role: registered.user.role }));
