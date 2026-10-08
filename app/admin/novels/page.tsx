"use client";
import { useFeedback } from "@/lib/notifications";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, BookPlus, Search, ShieldCheck, Star, Trash2 } from "lucide-react";
import { NovelUploadDialog } from "@/components/novel-upload-dialog";
import type { Viewer } from "@/lib/community-types";

type AdminNovel = { id: string; title: string; author: string; genre: string; format: string; coverUrl: string | null; featured: boolean; createdAt: string };

export default function AdminNovelsPage() {
  const [viewer, setViewer] = useState<Viewer | null | undefined>(undefined);
  const [novels, setNovels] = useState<AdminNovel[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useFeedback("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/novels", { cache: "no-store" });
    if (!response.ok) return;
    setNovels((await response.json() as { novels: AdminNovel[] }).novels);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ user: Viewer | null }>)
      .then((data) => { setViewer(data.user); if (data.user?.role === "admin") void load(); });
  }, [load]);

  const visible = useMemo(() => novels.filter((novel) => `${novel.title}${novel.author}${novel.genre}`.toLowerCase().includes(query.toLowerCase())), [novels, query]);
  const toggleFeatured = async (novel: AdminNovel) => {
    const response = await fetch(`/api/admin/novels/${novel.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ featured: !novel.featured }) });
    setStatus(response.ok ? (novel.featured ? `已从推荐移除《${novel.title}》。` : `《${novel.title}》已加入推荐。`) : "操作失败。");
    if (response.ok) await load();
  };
  const removeNovel = async (novel: AdminNovel) => {
    if (!window.confirm(`确定删除《${novel.title}》吗？文件与封面会一并删除。`)) return;
    const response = await fetch(`/api/admin/novels/${novel.id}`, { method: "DELETE" });
    setStatus(response.ok ? `已删除《${novel.title}》。` : "删除失败。");
    if (response.ok) await load();
  };

  if (viewer === undefined) return <main className="community-page"><p className="community-loading">VERIFYING ADMIN ACCESS…</p></main>;
  if (viewer?.role !== "admin") return <main className="community-page"><Link className="back-link" href="/"><ArrowLeft />返回</Link><div className="community-empty"><span>403 / PRIVATE SECTOR</span><h1>这里只对管理员显现。</h1></div></main>;

  return <main className="community-page admin-page admin-novels-page">
    <Link className="back-link" href="/admin"><ArrowLeft size={16} /> 返回管理后台</Link>
    <header className="community-heading"><span><ShieldCheck /> CONTROL ROOM / LIBRARY</span><h1>小说文库</h1><p>上传作品、调整推荐陈列并维护文库目录。</p></header>
    <div className="admin-library-tools"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索书名、作者或分类" /></label><button onClick={() => setUploadOpen(true)}><BookPlus /> 添加小说</button></div>
    {status && <p className="admin-status">{status}</p>}
    <section className="admin-novels"><header><div><span><BookOpen /> NOVEL DIRECTORY</span><h2>全部藏书</h2></div><b>{visible.length} / {novels.length} 本</b></header>
      {visible.length ? <div className="admin-novel-list">{visible.map((novel) => <article className={`admin-novel${novel.featured ? " is-featured" : ""}`} key={novel.id}>
        <div className="admin-novel-cover"><img src={novel.coverUrl ?? "/novel-cover-placeholder.webp"} alt="" /></div><div className="admin-novel-copy"><b>{novel.title}</b><small>{novel.author || "佚名"} · {novel.format.toUpperCase()} · {novel.genre || "轻小说"}</small></div>
        <button type="button" onClick={() => void toggleFeatured(novel)}><Star size={14} />{novel.featured ? "取消推荐" : "加入推荐"}</button><button className="remove-novel" type="button" onClick={() => void removeNovel(novel)}><Trash2 size={14} />删除</button>
      </article>)}</div> : <p className="admin-status">没有符合条件的小说。</p>}
    </section>
    {uploadOpen && <NovelUploadDialog onClose={() => setUploadOpen(false)} onUploaded={() => void load()} />}
  </main>;
}
