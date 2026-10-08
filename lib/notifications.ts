"use client";
import { useCallback, useState } from "react";
export type Notice = { id: string; text: string; kind: "success" | "error" | "info" };
export const NOTICE_EVENT = "comet:notice";
let lastText = "", lastTime = 0;
export function notify(text: string, kind?: Notice["kind"]) {
  if (typeof window === "undefined" || !text.trim()) return;
  const now = Date.now();
  if (lastText === text && now - lastTime < 500) return;
  lastText = text; lastTime = now;
  window.dispatchEvent(new CustomEvent<Notice>(NOTICE_EVENT, { detail: {
    id: crypto.randomUUID(), text,
    kind: kind ?? (/失败|错误|无法|不正确|不一致|未能|被使用|已注册|已过期|没有找到|太频繁/.test(text) ? "error" : /成功|完成|已|欢迎/.test(text) ? "success" : "info"),
  } }));
}
/** Preserve local progress; completed actions also reach the shared notification viewport. */
export function useFeedback(initial = "") {
  const [status, update] = useState(initial);
  const setStatus = useCallback((text: string) => {
    update(text);
    if (text && !/^(正在|处理中|已扫码|准备上传|滚动鼠标|模式已切换)/.test(text)) notify(text);
  }, []);
  return [status, setStatus] as const;
}
