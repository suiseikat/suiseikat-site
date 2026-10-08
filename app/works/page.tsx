"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, BookOpen, Search, Sparkles, X } from "lucide-react";
import { NovelReader } from "@/components/novel-reader";
import { AccordionGallery, GlideSelect } from "@/components/orbit-micro-ui";
import { leaveBorderGlow, moveBorderGlow } from "@/components/border-glow";

const PLACEHOLDER = "/novel-cover-placeholder.webp";

export type Novel = {
  id: string; title: string; author: string; kana: string; genre: string; description: string;
  format: string; coverUrl: string | null; fileUrl: string; featured: boolean; createdAt: string;
};

// 封面解析缓存：同一 URL 只探测一次；加载失败（文件缺失/404）时回退到灰色占位封面。
const coverCache = new Map<string, Promise<string>>();
function resolveCover(url: string | null): Promise<string> {
  if (!url) return Promise.resolve(PLACEHOLDER);
  const cached = coverCache.get(url);
  if (cached) return cached;
  const pending = new Promise<string>((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(url);
    probe.onerror = () => resolve(PLACEHOLDER);
    probe.src = url;
  });
  coverCache.set(url, pending);
  return pending;
}

function useCover(url: string | null) {
  const [src, setSrc] = useState(() => url ?? PLACEHOLDER);
  useEffect(() => {
    let alive = true;
    void resolveCover(url).then((resolved) => { if (alive) setSrc(resolved); });
    return () => { alive = false; };
  }, [url]);
  return src;
}

function Cover({ novel, className = "" }: { novel: Novel | null; className?: string }) {
  const src = useCover(novel?.coverUrl ?? null);
  return <div className={`novel-cover ${className}`} style={{ backgroundImage: `url(${src})` }} aria-label={novel ? `${novel.title} 封面` : "封面"} />;
}

function BookDialog({ novel, close, onRead }: { novel: Novel; close: () => void; onRead: () => void }) {
  return <div className="book-dialog-backdrop" role="dialog" aria-modal="true" aria-label={`${novel.title} 详情`} onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <article className="book-dialog"><button className="book-dialog-close" onClick={close} aria-label="关闭"><X /></button><div className="book-dialog-cover-wrap"><Cover novel={novel} className="book-dialog-cover" /></div><div className="book-dialog-copy"><small>{novel.format.toUpperCase()} / LIBRARY</small><p className="book-dialog-kana">{novel.kana || novel.genre || "轻小说"}</p><h2>{novel.title}</h2><div className="book-dialog-meta"><span>{novel.author || "佚名"}</span><span>{novel.genre || "轻小说"}</span><span>{novel.featured ? "推荐中" : "已入库"}</span></div><div className="book-dialog-desc"><p>{novel.description || "这本书还没有简介。"}</p></div><div className="book-dialog-actions"><button className="start-reading border-glow-action" onPointerMove={moveBorderGlow} onPointerLeave={leaveBorderGlow} onClick={onRead}><BookOpen /> 在线阅读</button><a className="download-book" href={novel.fileUrl} download><ArrowRight /> 下载文件</a></div></div></article>
  </div>;
}

/** 小说墙：把封面铺成倾斜的连续网格，两份内容首尾相接无缝滚动。 */
function NovelWall({ novels, darkenRef }: { novels: Novel[]; darkenRef: React.RefObject<HTMLDivElement | null> }) {
  const [count, setCount] = useState(96);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // 每个副本都必须至少铺满可视高度，否则滚动到末尾会露出空白。
  useEffect(() => {
    const measure = () => {
      const grid = gridRef.current;
      if (!grid) return;
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 8;
      const firstCell = grid.firstElementChild as HTMLElement | null;
      const cellHeight = firstCell?.getBoundingClientRect().height ?? 240;
      const gap = Number.parseFloat(getComputedStyle(grid).rowGap) || 14;
      const visible = grid.parentElement?.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
      const rows = Math.ceil(visible / (cellHeight + gap)) + 2;
      setCount(Math.max(48, columns * rows));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [novels.length]);

  const cells = useMemo(() => {
    const base: Array<Novel | null> = novels.length ? novels : new Array(12).fill(null);
    const target = Math.ceil(count / base.length) * base.length;
    return Array.from({ length: target }, (_, index) => base[index % base.length]);
  }, [novels, count]);

  return <div className="novel-wall-fixed" aria-hidden="true">
    <div className="novel-wall-tilt">
      <div className="novel-wall-track">
        {[0, 1].map((copy) => <div className="novel-wall-grid" ref={copy === 0 ? gridRef : undefined} key={copy}>{cells.map((novel, index) => <div className="novel-wall-cell" key={`${copy}-${index}`}><WallCover novel={novel} /></div>)}</div>)}
      </div>
    </div>
    <div className="novel-wall-darken" ref={darkenRef} />
  </div>;
}

function WallCover({ novel }: { novel: Novel | null }) {
  const src = useCover(novel?.coverUrl ?? null);
  return <img src={src} alt="" />;
}

export default function WorksPage() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Novel | null>(null);
  const [reading, setReading] = useState<Novel | null>(null);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("全部");
  const [sort, setSort] = useState<"newest" | "oldest" | "title" | "author">("newest");
  const [hoveredBook, setHoveredBook] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/novels", { cache: "no-store" });
      const data = await response.json() as { novels?: Novel[] };
      setNovels(data.novels ?? []);
    } catch {
      setNovels([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener("novels-updated", refresh);
    return () => window.removeEventListener("novels-updated", refresh);
  }, [load]);

  // 第二页推荐：优先取管理员标记为推荐的书，没有标记时展示全部。
  const featured = useMemo(() => novels.filter((novel) => novel.featured), [novels]);
  const shelf = featured.length ? featured : novels;
  const genres = useMemo(() => ["全部", ...Array.from(new Set(novels.map((novel) => novel.genre).filter(Boolean)))], [novels]);
  const filtered = useMemo(() => {
    const list = novels.filter((novel) => (genre === "全部" || novel.genre === genre) && `${novel.title}${novel.author}${novel.kana}`.toLowerCase().includes(query.toLowerCase()));
    return list.sort((left, right) => {
      if (sort === "oldest") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (sort === "title") return left.title.localeCompare(right.title, "zh-CN", { numeric: true });
      if (sort === "author") return (left.author || "佚名").localeCompare(right.author || "佚名", "zh-CN", { numeric: true });
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [novels, genre, query, sort]);
  const recent = useMemo(() => novels.slice(0, 8), [novels]);

  // 书架为空时用灰色占位，保证第二页仍有书可看。
  const shelfItems: Array<Novel | null> = useMemo(() => (shelf.length ? shelf : new Array(6).fill(null)), [shelf]);

  const heroRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const charRef = useRef<HTMLImageElement | null>(null);
  const darkenRef = useRef<HTMLDivElement | null>(null);
  const shelfRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);

  // hover 判定：基于布局基准位置（offsetLeft 不受 transform/hover 影响），区间不重叠 → 无抖动。
  const handleShelfMove = (event: React.MouseEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (y < trackRect.top - 60 || y > trackRect.bottom + 30) { setHoveredBook(null); return; }
    const bookEls = Array.from(track.querySelectorAll<HTMLElement>(".shelf-book"));
    const centers = bookEls.map((b) => trackRect.left + b.offsetLeft + b.offsetWidth / 2);
    let hit: number | null = null;
    for (let i = 0; i < centers.length; i++) {
      const left = i === 0 ? Number.NEGATIVE_INFINITY : (centers[i - 1] + centers[i]) / 2;
      const right = i === centers.length - 1 ? Number.POSITIVE_INFINITY : (centers[i] + centers[i + 1]) / 2;
      if (x >= left && x < right) { hit = i; break; }
    }
    setHoveredBook(hit);
  };

  useEffect(() => {
    const hero = heroRef.current;
    const shelfEl = shelfRef.current;
    const track = trackRef.current;
    if (!hero || !shelfEl || !track) return;

    const measure = () => {
      const extra = Math.max(0, track.scrollWidth - window.innerWidth);
      shelfEl.style.height = `${window.innerHeight + extra}px`;
    };
    measure();

    let raf = 0;
    const seg = (p: number, from: number, to: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));
    const render = () => {
      raf = 0;
      const vh = window.innerHeight;

      // ---- 第一页过渡：封面墙保持固定，黑色背景从底边柔和抬升 ----
      const heroRect = hero.getBoundingClientRect();
      const heroTotal = hero.offsetHeight - vh;
      const hp = heroTotal > 0 ? Math.min(1, Math.max(0, -heroRect.top / heroTotal)) : 0;
      const t1 = seg(hp, 0.18, 0.72);
      if (titleRef.current) {
        titleRef.current.style.transform = `translateY(calc(-50% - ${t1 * 75}vh)) rotate(-1deg)`;
        titleRef.current.style.opacity = String(1 - t1);
      }
      const t2 = seg(hp, 0.16, 0.68);
      if (charRef.current) {
        charRef.current.style.transform = `translateY(${-t2 * 60}vh)`;
        charRef.current.style.opacity = String(1 - t2);
      }
      const cue = document.querySelector<HTMLElement>(".novel-scroll-cue");
      if (cue) cue.style.opacity = String(1 - t1);
      const t4 = seg(hp, 0.08, 0.92);
      if (darkenRef.current) darkenRef.current.style.setProperty("--transition-offset", `${(1 - t4) * 100}%`);

      // ---- 第二页：书墙横向滚动 + 标题从下出现 ----
      const shelfRect = shelfEl.getBoundingClientRect();
      const shelfTotal = shelfEl.offsetHeight - vh;
      const sp = shelfTotal > 0 ? Math.min(1, Math.max(0, -shelfRect.top / shelfTotal)) : 0;
      const shift = -sp * Math.max(0, track.scrollWidth - window.innerWidth);
      track.style.transform = `translate3d(${shift}px,0,0)`;
      if (brandRef.current) {
        const bp = Math.min(1, Math.max(0, (vh - shelfRect.top) / (vh * 0.55)));
        brandRef.current.style.transform = `translateX(-50%) translateY(${(1 - bp) * 52}vh)`;
        brandRef.current.style.opacity = String(bp);
      }
    };

    const onScroll = () => { if (raf) return; raf = window.requestAnimationFrame(render); };
    const onResize = () => { measure(); render(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => { measure(); render(); });
      ro.observe(track);
    }
    render();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [shelfItems.length, novels.length]);

  const total = String(novels.length).padStart(3, "0");

  return <main className="novel-library">
    <NovelWall novels={novels} darkenRef={darkenRef} />

    <section className="novel-hero" id="novel-top" ref={heroRef}>
      <div className="hero-sticky">
        <div className="novel-title-card" ref={titleRef}><small>SUISEI / A COLLECTION OF STORIES</small><h1><span>ライト</span><span>ノベル</span></h1><b>轻小说文库</b><p>LIGHT NOVEL LIBRARY<br />VOL. 001 — {total}</p></div>
        <img className="novel-hero-character" ref={charRef} src="/novel-mascot-full.png" alt="银白猫耳、黑红服装的网站看板娘" />
        <a className="novel-scroll-cue" href="#shelf"><span>SCROLL TO BROWSE</span><ArrowDown /></a>
      </div>
    </section>

    <section className="novel-shelf-hscroll" id="shelf" ref={shelfRef}>
      <div className="shelf-hscroll-sticky" onMouseMove={handleShelfMove} onMouseLeave={() => setHoveredBook(null)}>
        <div className="shelf-brand" ref={brandRef}><small>02 / SELECTED STORIES</small><h2>物語の棚</h2><p>推荐书架 · 把故事从书架上取下来。</p></div>
        <div className="shelf-perspective"><div className="shelf-stage shelf-track" ref={trackRef}>
          {shelfItems.map((novel, index) => <button
            className={`shelf-book${hoveredBook === index ? " is-hovered" : hoveredBook === null ? "" : index < hoveredBook ? " is-left" : " is-right"}`}
            onFocus={() => setHoveredBook(index)} onBlur={() => setHoveredBook(null)}
            onClick={() => novel && setSelected(novel)} key={novel?.id ?? `placeholder-${index}`}>
            <span className="book-pages book-pages-right" aria-hidden="true" /><span className="book-pages book-pages-bottom" aria-hidden="true" />
            <Cover novel={novel} /><span className="book-label">{novel?.title ?? ""}</span>
          </button>)}
        </div></div>
        <p className="shelf-instruction"><Sparkles /> HOVER TO EXTRACT · CLICK TO OPEN</p>
      </div>
    </section>

    <section className="novel-catalog" id="catalog"><div className="catalog-background" aria-hidden="true" /><div className="catalog-window">
      <aside className="catalog-sidebar">
        <div className="catalog-brand"><div className="catalog-monogram">文</div><span>LIGHT NOVEL<br />LIBRARY</span></div>
        <section className="recent-reading"><header><b>最近入库</b><small>NEW</small></header>
          {recent.length ? recent.map((novel) => <button onClick={() => setSelected(novel)} key={novel.id}><Cover novel={novel} /><span><b>{novel.title}</b><small>{novel.author || "佚名"}</small></span><small>↗</small></button>) : <p className="catalog-empty">还没有收录小说。</p>}
        </section>
      </aside>
      <div className="catalog-main">
        <div className="catalog-toolbar">
          <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索书名、作者…" /></label>
          <div className="catalog-recent-updated"><span>RECENT UPDATES</span><b>最近更新</b></div>
          <nav>{genres.slice(0, 5).map((item) => <button className={genre === item ? "is-active" : ""} onClick={() => setGenre(item)} key={item}>{item}</button>)}</nav>
          <div className="catalog-user"><span>文</span><b>文库收藏<small>{total} STORIES</small></b></div>
        </div>
        <div className="catalog-mobile-recent">{recent.map((novel) => <button onClick={() => setSelected(novel)} key={novel.id}><Cover novel={novel} /><span>{novel.title}</span></button>)}</div>
        {novels.length > 1 && <section className="orbit-recommendations"><header><span>DISCOVER / 展开书页</span><h3>偶遇一本书。</h3></header><AccordionGallery items={novels.slice(0,5).map(novel => ({id:novel.id,title:novel.title,image:novel.coverUrl || PLACEHOLDER,caption:novel.author || "佚名"}))} onPick={id => setSelected(novels.find(novel => novel.id === id) ?? null)} /></section>}
        <div className="catalog-all-heading"><div><h3>全部小说</h3><span>{String(filtered.length).padStart(2, "0")} TITLES</span></div><div className="catalog-sort">SORT BY<GlideSelect label="小说排序" value={sort} onChange={value => setSort(value as typeof sort)} options={[{value:"newest",label:"最新加入"},{value:"oldest",label:"最早加入"},{value:"title",label:"按书名"},{value:"author",label:"按作者"}]} /></div></div>
        {filtered.length
          ? <div className="catalog-grid catalog-grid-all">{filtered.map((novel) => <button className="catalog-book" onClick={() => setSelected(novel)} key={novel.id}><Cover novel={novel} /><div><small>{novel.genre || "轻小说"}</small><h3>{novel.title}</h3><p>{novel.author || "佚名"}</p></div></button>)}</div>
          : <p className="catalog-empty">{!loaded ? "正在载入文库…" : novels.length ? "没有找到匹配的故事，试试其他书名或作者。" : "故事正在整理中，稍后再来看看。"}</p>}
      </div>
    </div></section>

    {selected && <BookDialog novel={selected} close={() => setSelected(null)} onRead={() => { setReading(selected); setSelected(null); }} />}
    {reading && <NovelReader novelId={reading.id} title={reading.title} fileUrl={reading.fileUrl} onClose={() => setReading(null)} />}
  </main>;
}
