"use client";
import { useFeedback } from "@/lib/notifications";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ImagePlus, MessageCircleHeart, MoreHorizontal, Pin, Send, Trash2, X } from "lucide-react";
import { MemberBadge } from "@/components/member-badge";
import { PulseReaction } from "@/components/orbit-micro-ui";
import type { GuestbookMessage, ReactionType, Viewer } from "@/lib/community-types";

const reactions: Array<{ type: ReactionType; symbol: string; label: string }> = [
  { type: "like", symbol: "👍", label: "赞" },
  { type: "dislike", symbol: "👎", label: "踩" },
  { type: "heart", symbol: "❤️", label: "喜欢" },
  { type: "laugh", symbol: "😂", label: "好笑" },
  { type: "party", symbol: "🎉", label: "庆祝" },
];

export default function MessagesPage() {
  const [messages, setMessages] = useState<GuestbookMessage[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [, setStatus] = useFeedback("");
  const [sending, setSending] = useState(false);
  const [pendingReaction, setPendingReaction] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/messages?limit=500", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取留言");
    const data = await response.json() as { messages: GuestbookMessage[]; viewer: Viewer | null };
    setMessages(data.messages);
    setViewer(data.viewer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(() => setStatus("留言暂时无法载入，请稍后刷新。")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, setStatus]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : "");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setStatus("");
    const form = new FormData();
    form.set("content", content);
    if (image) form.set("image", image);
    try {
      const response = await fetch("/api/messages", { method: "POST", body: form });
      const data = await response.json() as { message?: GuestbookMessage; error?: string };
      if (!response.ok || !data.message) throw new Error(data.error ?? "发送失败，请稍后再试。");
      setContent("");
      setImage(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      setStatus("留言已经进入轨道。你获得了首次留言经验时，徽章也会同步点亮。");
      await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "发送失败，请稍后再试。"); }
    finally { setSending(false); }
  };

  const react = async (message: GuestbookMessage, type: ReactionType) => {
    if (pendingReaction) return;
    setPendingReaction(`${message.id}:${type}`);
    try {
      const response = await fetch(`/api/messages/${message.id}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
      if (!response.ok) throw new Error("回应未能送出，请稍后重试。");
      await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "回应失败。"); }
    finally { setPendingReaction(null); }
  };

  const remove = async (message: GuestbookMessage) => {
    if (!window.confirm("确定删除这条留言吗？")) return;
    try {
      const response = await fetch(`/api/messages/${message.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "删除失败。");
      await load(); setStatus("留言已删除。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "删除失败，请重试。"); }
  };

  const pin = async (message: GuestbookMessage) => {
    try {
      const response = await fetch(`/api/messages/${message.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !message.pinned }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "置顶操作失败。");
      await load(); setStatus(message.pinned ? "已取消置顶。" : "留言已置顶。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "置顶操作失败，请重试。"); }
  };

  return (
    <main className="guestbook-shell">
      <header className="guestbook-header">
        
        <div className="guestbook-title"><img className="section-signature" src="/suieikat-signature.webp" alt="" /><span><MessageCircleHeart size={18} /> GUESTBOOK</span><h1>把一句话<br />留在这里。</h1><p>每句话都和一个真实账号相连。你可以回应、收藏片刻，也可以回到自己的轨迹。</p></div>
      </header>

      <section className="guestbook-layout">
        {viewer ? <form className="message-form" onSubmit={submit}>
          <div><img className="section-signature" src="/suieikat-signature.webp" alt="" /><span className="form-kicker">WRITE A NOTE</span><h2>发表留言</h2></div>
          <div className="composer-user"><Link href={`/u/${encodeURIComponent(viewer.username)}`}>{viewer.username}</Link><MemberBadge tier={viewer.tier} level={viewer.level} compact /></div>
          <label>想说的话<textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={280} rows={6} placeholder="写下此刻想说的话……" required /></label>
          <label className="message-image-picker"><ImagePlus size={17} /><span>{image ? image.name : "附上一张图片（JPG / PNG / WebP，最大 5MB）"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} /></label>
          {preview && <div className="message-image-preview"><img src={preview} alt="待上传图片预览" /><button type="button" onClick={() => { URL.revokeObjectURL(preview); setPreview(""); setImage(null); }} aria-label="移除图片"><X /></button></div>}
          <div className="form-footer"><small>{content.length} / 280</small><button type="submit" disabled={sending}>{sending ? "正在送出…" : <><Send size={16} /> 留下这句话</>}</button></div>
          
        </form> : <div className="message-login-gate">
          <span>MEMBER ACCESS</span><h2>登录之后，<br />再留下你的星迹。</h2><p>访客仍然可以阅读和使用表情回应；发表留言和图片需要一个账号。</p><Link href="/login">登录或注册 →</Link>
          
        </div>}

        <div className="message-list-section">
          <div className="message-list-heading"><div><img className="section-signature" src="/suieikat-signature.webp" alt="" /><span>ALL NOTES / ECHOES</span><h2>所有留言</h2></div><strong>{messages.length}</strong></div>
          <div className="message-list">
            {messages.length ? messages.map((message) => <article className={`message-item${message.pinned ? " is-pinned" : ""}`} key={message.id}>
              <div className="reaction-menu"><button className="reaction-trigger" type="button" aria-label="打开表情回应"><MoreHorizontal /></button><div className="reaction-list">{reactions.map((reaction) => <PulseReaction key={reaction.type} active={message.myReactions.includes(reaction.type)} disabled={pendingReaction !== null} count={message.reactions[reaction.type]} symbol={reaction.symbol} label={reaction.label} onClick={() => void react(message, reaction.type)} />)}</div></div>
              {message.pinned && <div className="pinned-label"><Pin size={13} /> PINNED / 置顶</div>}
              <div className="message-author">
                {message.author?.avatarUrl && <img className="message-author-avatar" src={message.author.avatarUrl} alt="" />}
                {message.userId ? <Link href={`/u/${encodeURIComponent(message.name)}`}>{message.name}</Link> : <strong>{message.name}</strong>}
                {message.author && <MemberBadge tier={message.author.tier} level={message.author.level} compact />}
                <time dateTime={message.createdAt}>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(message.createdAt))}</time>
              </div>
              <p>{message.content}</p>
              {message.imageUrl && <a className="message-image" href={message.imageUrl} target="_blank" rel="noreferrer"><img src={message.imageUrl} alt={`${message.name} 留言附图`} loading="lazy" /></a>}
              <footer className="message-actions">
                <div className="reaction-persisted">{reactions.filter((reaction) => message.reactions[reaction.type] > 0).map((reaction) => <PulseReaction key={reaction.type} active={message.myReactions.includes(reaction.type)} disabled={pendingReaction !== null} count={message.reactions[reaction.type]} symbol={reaction.symbol} label={reaction.label} onClick={() => void react(message, reaction.type)} />)}</div>
                <div className="moderation-actions">{message.canModerate && <button type="button" onClick={() => pin(message)}><Pin size={14} />{message.pinned ? "取消置顶" : "置顶"}</button>}{message.canDelete && <button type="button" onClick={() => remove(message)}><Trash2 size={14} />删除</button>}</div>
                {message.city && <span className="message-city">IP AREA / {message.city}</span>}
              </footer>
            </article>) : <div className="empty-messages">还没有留言。第一句话，也许就从你开始。</div>}
          </div>
        </div>
      </section>
    </main>
  );
}
