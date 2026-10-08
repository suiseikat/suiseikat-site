import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { db, getUserById } from "@/lib/community-db";
import type { PublicUser } from "@/lib/community-types";
import { fnLogin, fnRequest } from "@/lib/fn-media-protocol";

type Binding = { user_id:string;remote_username:string;remote_guid:string|null;password_encrypted:string;permission:number };
type RemoteUser = { guid:string;username:string;is_admin:number;media_permission:number };
declare global { var __fnMediaLocks:Map<string,Promise<unknown>>|undefined;var __fnMediaTokens:Map<string,{token:string;until:number}>|undefined; }
const locks = globalThis.__fnMediaLocks ??= new Map();
const tokens = globalThis.__fnMediaTokens ??= new Map();
export const canUseMedia = (user: PublicUser | null) => Boolean(user && !user.disabled && user.tier === "svip");
export const mediaConfigured = () => Boolean(process.env.FN_MEDIA_ORIGIN && process.env.FN_MEDIA_ADMIN_USERNAME && process.env.FN_MEDIA_ADMIN_PASSWORD && process.env.FN_MEDIA_CREDENTIAL_KEY);

function key() {
  const value = process.env.FN_MEDIA_CREDENTIAL_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("影视凭证加密密钥未配置。");
  return Buffer.from(value,"hex");
}
function seal(password:string) {
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",key(),iv);
  const encrypted=Buffer.concat([cipher.update(password,"utf8"),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(part=>part.toString("base64url")).join(".");
}
function unseal(value:string) {
  const [iv,tag,data]=value.split(".").map(part=>Buffer.from(part,"base64url"));
  const cipher=createDecipheriv("aes-256-gcm",key(),iv);cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data),cipher.final()]).toString("utf8");
}
function bindings() {
  db().exec(`CREATE TABLE IF NOT EXISTS fn_media_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id),remote_username TEXT NOT NULL UNIQUE,remote_guid TEXT,password_encrypted TEXT NOT NULL,permission INTEGER NOT NULL DEFAULT 0)`);
  return db();
}
function binding(userId:string) { return bindings().prepare("SELECT * FROM fn_media_accounts WHERE user_id=?").get(userId) as Binding|undefined; }
async function adminToken() {
  const username=process.env.FN_MEDIA_ADMIN_USERNAME,password=process.env.FN_MEDIA_ADMIN_PASSWORD;
  if (!username || !password) throw new Error("影视管理员连接未配置。");
  const {token}=await fnLogin(username,password);
  const info=await fnRequest<{is_admin:number}>("/v/api/v1/user/info","GET",undefined,token);
  if (!info.is_admin) throw new Error("配置的影视账号不是管理员。");
  return token;
}
async function exclusive<T>(userId:string,work:()=>Promise<T>):Promise<T> {
  const previous=locks.get(userId) ?? Promise.resolve();
  const task=previous.catch(()=>undefined).then(work);locks.set(userId,task);
  try { return await task; } finally { if(locks.get(userId)===task) locks.delete(userId); }
}

async function synchronize(user:PublicUser) {
  const current=getUserById(user.id);
  if(!current) throw new Error("网站账户不存在。");
  user=current; // Re-read after acquiring the lock; never re-grant from a stale request.
  let record=binding(user.id);
  const enabled=canUseMedia(user),permission=enabled?2:0;
  if (!record && !enabled) return;
  if (!record) {
    const username=`web_${createHash("sha256").update(user.id).digest("hex").slice(0,20)}`;
    bindings().prepare("INSERT INTO fn_media_accounts (user_id,remote_username,password_encrypted) VALUES (?,?,?)").run(user.id,username,seal(randomBytes(24).toString("base64url")));
    record=binding(user.id)!;
  }
  if (record.remote_guid && record.permission===permission) return record;
  const token=await adminToken();
  if (!record.remote_guid) {
    const list=await fnRequest<RemoteUser[]>("/v/api/v1/manager/user/list","GET",undefined,token);
    let remote=list.find(item=>item.username===record!.remote_username);
    if (!remote) {
      await fnRequest("/v/api/v2/manager/user/create","PUT",{username:record.remote_username,password:createHash("sha256").update(unseal(record.password_encrypted)).digest("hex"),is_admin:0,media_permission:permission,mediadb_list:[]},token);
      const updated=await fnRequest<RemoteUser[]>("/v/api/v1/manager/user/list","GET",undefined,token);
      remote=updated.find(item=>item.username===record!.remote_username);
    }
    if (!remote || remote.is_admin) throw new Error("无法安全绑定独立影视账户。");
    bindings().prepare("UPDATE fn_media_accounts SET remote_guid=? WHERE user_id=?").run(remote.guid,user.id);
    record=binding(user.id)!;
  }
  await fnRequest(`/v/api/v2/manager/user/${record.remote_guid}`,"POST",{username:record.remote_username,password:"",is_admin:0,media_permission:permission,mediadb_list:[]},token);
  bindings().prepare("UPDATE fn_media_accounts SET permission=? WHERE user_id=?").run(permission,user.id);
  tokens.delete(user.id);
  return binding(user.id);
}

export async function syncMediaAccess(user:PublicUser) {
  if (!mediaConfigured()) return;
  await exclusive(user.id,()=>synchronize(user));
}
export async function mediaToken(user:PublicUser) {
  if (!canUseMedia(user)) throw new Error("影视库仅限获授权的 SVIP 使用。");
  if (!mediaConfigured()) throw new Error("影视库暂未连接。");
  return exclusive(user.id,async()=>{
    const record=await synchronize(user);
    if(!canUseMedia(getUserById(user.id))) throw new Error("影视授权已撤销。");
    if (!record?.remote_guid) throw new Error("影视账户绑定失败。");
    const cached=tokens.get(user.id);if(cached && cached.until>Date.now()) return cached.token;
    const {token}=await fnLogin(record.remote_username,unseal(record.password_encrypted));
    const info=await fnRequest<{guid:string;is_admin:number}>("/v/api/v1/user/info","GET",undefined,token);
    if(info.is_admin || info.guid!==record.remote_guid) throw new Error("影视账户身份校验失败。");
    tokens.set(user.id,{token,until:Date.now()+10*60*1000});return token;
  });
}
