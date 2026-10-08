import { createHash, randomInt } from "node:crypto";

// Matched against the installed fnOS Media web client, build 2026-09-10 / 631.
const API_KEY = String.fromCharCode(...[152,159,234,234,236,235,154,237,132,232,235,157,155,132,153,158,158,237,132,154,159,232,152,132,239,154,156,156,154,155,157,236,157,155,154,158].map(value => value ^ 169));
const md5 = (value: string) => createHash("md5").update(value).digest("hex");
export const passwordDigest = (value: string) => createHash("sha256").update(value).digest("hex");

export function fnSignature(url: URL, method: string, body = "") {
  const query = [...url.searchParams].filter(([, value]) => value !== "undefined" && value !== "null").sort(([a], [b]) => a.localeCompare(b));
  const encoded = new URLSearchParams(query).toString().replace(/\+/g, "%20");
  const nonce = String(randomInt(100000, 1000000)), timestamp = String(Date.now());
  const digest = md5(method === "GET" ? decodeURIComponent(encoded) : body);
  const sign = md5(["NDzZTVxnRKP8Z0jXg1VAMonaG8akvh", url.pathname, nonce, timestamp, digest, API_KEY].join("_"));
  return `nonce=${nonce}&timestamp=${timestamp}&sign=${sign}`;
}

export class FnMediaError extends Error {
  code: number;
  constructor(code: number, message: string) { super(message);this.code = code; }
}

export function fnOrigin() {
  const value = process.env.FN_MEDIA_ORIGIN;
  if (!value) throw new Error("尚未配置飞牛影视连接。");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/") throw new Error("飞牛影视地址配置无效。");
  return url.origin;
}

export async function fnRequest<T>(path: string, method = "GET", data?: unknown, token?: string): Promise<T> {
  const url = new URL(path, fnOrigin());
  if (url.origin !== fnOrigin() || !url.pathname.startsWith("/v/api/")) throw new Error("无效影视接口。");
  const body = data === undefined ? "" : JSON.stringify(data);
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-Trim-Client": "web", "X-Trim-Client-Version": "631", authx: fnSignature(url, method, body), Authorization: token || "" }, body: method === "GET" ? undefined : body, cache:"no-store", signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`影视服务器响应异常 (${response.status})。`);
  const result = await response.json() as { code:number;msg?:string;data:T };
  if (result.code !== 0) throw new FnMediaError(result.code, result.msg || "影视操作失败。");
  return result.data;
}

export async function fnLogin(username: string, password: string) {
  return fnRequest<{ token:string }>("/v/api/v2/user/loginByPassword", "POST", { username,password:passwordDigest(password),app_name:"trimemedia-web" });
}
