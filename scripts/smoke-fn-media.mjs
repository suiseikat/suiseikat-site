import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fnLogin, fnRequest } from "../lib/fn-media-protocol.ts";

const site=process.env.MEDIA_TEST_SITE || "http://localhost:3101";
const db=new DatabaseSync(process.env.SITE_DATA_FILE || "data/site.sqlite");
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
const name="media_test_"+randomBytes(4).toString("hex"),password=randomBytes(20).toString("base64url");
let userId,remoteGuid,adminId,adminName;
async function request(path,method="GET",body,cookie) {
  return fetch(site+path,{method,headers:{"Content-Type":"application/json",Origin:site,...cookie?{Cookie:cookie}:{}},body:body===undefined?undefined:JSON.stringify(body),redirect:"manual"});
}
try {
  const registered=await request("/api/auth/register","POST",{username:name,email:name+"@example.test",password,confirmPassword:password});
  assert.equal(registered.status,201);
  const user=await registered.json();userId=user.user.id;
  const cookie=registered.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/api/media/session","POST",{},cookie)).status,403);
  assert.equal((await request("/v/api/v1/user/info","GET",undefined,cookie)).status,403);
  assert.equal((await request("/v/api/v1/user/info")).status,401);
  adminName="media_admin_"+randomBytes(4).toString("hex");
  const registeredAdmin=await request("/api/auth/register","POST",{username:adminName,email:adminName+"@example.test",password,confirmPassword:password});
  assert.equal(registeredAdmin.status,201);adminId=(await registeredAdmin.json()).user.id;
  db.prepare("UPDATE users SET role='admin' WHERE id=? AND username=?").run(adminId,adminName);
  const adminCookie=registeredAdmin.headers.get("set-cookie").split(";")[0];
  assert.equal((await request(`/api/admin/users/${userId}`,"PATCH",{tier:"svip"},adminCookie)).status,200);
  assert.equal((await request("/api/media/session","POST",{},cookie)).status,200);
  const binding=db.prepare("SELECT remote_guid FROM fn_media_accounts WHERE user_id=?").get(userId);remoteGuid=binding.remote_guid;
  const infoResponse=await request("/v/api/v1/user/info","GET",undefined,cookie);
  const info=await infoResponse.json();assert.equal(info.code,0);assert.equal(info.data.is_admin,0);assert.equal(info.data.guid,remoteGuid);
  const html=await request("/v","GET",undefined,cookie);assert.equal(html.status,200);assert.match(html.headers.get("set-cookie"),/Trim-MC-token=site-managed/);
  const libraries=await request("/v/api/v1/mediadb/list","GET",undefined,cookie);assert.equal(libraries.status,200);
  const data=await libraries.json();assert.equal(data.code,0);assert.ok(data.data.length>0);
  assert.equal((await request("/v/api/v1/manager/user/list","GET",undefined,cookie)).status,403);
  assert.equal((await request("/v/api/v2/user/passwd","POST",{},cookie)).status,403);
  const cross=await fetch(site+"/api/media/session",{method:"POST",headers:{Cookie:cookie,Origin:"https://untrusted.example"}});assert.equal(cross.status,403);
  const downgraded=await request(`/api/admin/users/${userId}`,"PATCH",{tier:"free"},adminCookie);
  assert.equal(downgraded.status,200);
  const downgradeResult=await downgraded.json();
  assert.equal(downgradeResult.user?.tier,"free");
  assert.ok(!downgradeResult.mediaWarning,downgradeResult.mediaWarning);
  const remoteAdmin=await fnLogin(process.env.FN_MEDIA_ADMIN_USERNAME,process.env.FN_MEDIA_ADMIN_PASSWORD);
  const remoteAccounts=await fnRequest("/v/api/v1/manager/user/list","GET",undefined,remoteAdmin.token);
  assert.equal(remoteAccounts.find(item=>item.guid===remoteGuid).media_permission,0);
  assert.equal((await request("/v/api/v1/mediadb/list","GET",undefined,cookie)).status,403);
  assert.equal((await request("/api/media/session","POST",{},cookie)).status,403);
  console.log("PASS: independent account, automatic login, library access, manager/password denial, CSRF denial, immediate SVIP revocation.");
} finally {
  // Remove only this run's explicitly named temporary account, never real users.
  if(userId) {
    const binding=db.prepare("SELECT remote_guid FROM fn_media_accounts WHERE user_id=?").get(userId);
    remoteGuid ||= binding?.remote_guid;
    if(remoteGuid) {
      const admin=await fnLogin(process.env.FN_MEDIA_ADMIN_USERNAME,process.env.FN_MEDIA_ADMIN_PASSWORD);
      const accounts=await fnRequest("/v/api/v1/manager/user/list","GET",undefined,admin.token);
      const target=accounts.find(item=>item.guid===remoteGuid);
      assert.ok(target && !target.is_admin && target.username.startsWith("web_"));
      await fnRequest(`/v/api/v1/manager/user/${remoteGuid}`,"DELETE",undefined,admin.token);
    }
    db.prepare("DELETE FROM fn_media_accounts WHERE user_id=?").run(userId);
    for(const table of ["sessions","user_achievements","xp_events","checkins","game_scores"]) db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
    db.prepare("DELETE FROM users WHERE id=? AND username=?").run(userId,name);
    console.log("Temporary test accounts removed; existing users and libraries untouched.");
  }
  if(adminId) {
    for(const table of ["sessions","user_achievements","xp_events","checkins","game_scores"]) db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(adminId);
    db.prepare("DELETE FROM users WHERE id=? AND username=?").run(adminId,adminName);
  }
  db.close();
}
