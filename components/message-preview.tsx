"use client";

import { useEffect, useState } from "react";
import type { GuestbookMessage } from "@/lib/messages";

export function MessagePreview() {
  const [messages, setMessages] = useState<GuestbookMessage[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch("/api/messages?limit=8", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ messages: GuestbookMessage[] }> : { messages: [] })
      .then((data) => setMessages(data.messages))
      .catch(() => setMessages([]));
  }, []);

  useEffect(() => {
    if (messages.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % messages.length), 4200);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  const message = messages[index];
  return (
    <div className="message-preview" aria-live="polite">
      <span className="message-preview-label">LATEST NOTES</span>
      {message ? <div key={message.id} className="message-preview-copy"><q>{message.content}</q><small>— {message.name}</small></div> : <div className="message-preview-copy"><q>这里还很安静，来留下第一句话吧。</q><small>— 留言板等待开启</small></div>}
      {messages.length > 1 && <div className="message-preview-dots" aria-hidden="true">{messages.slice(0, 5).map((item, dotIndex) => <i className={dotIndex === index % Math.min(5, messages.length) ? "active" : ""} key={item.id} />)}</div>}
    </div>
  );
}
