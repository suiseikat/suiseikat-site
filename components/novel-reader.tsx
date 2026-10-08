"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bookmark, BookmarkPlus, ChevronLeft, ChevronRight, Download, List,
  Loader2, RotateCcw, Settings2, Trash2, X,
} from "lucide-react";

export type ReaderChapter = { title: string; text: string; images?: Array<{ path: string; alt: string }> };
type Content = { title: string; chapters: ReaderChapter[]; truncated: boolean; unsupported?: string };

export type ReaderTheme = "white" | "eye-care" | "night" | "dark" | "light-green" | "light-blue" | "light-gray" | "light-yellow" | "light-brown";
type PageMode = "scroll" | "waterfall";

type Settings = {
  fontFamily: string; fontSize: number; letterSpacing: number; lineHeight: number;
  pageWidth: number; theme: ReaderTheme; pageMode: PageMode; preserveBookFonts: boolean;
};

type Bookmark = { id: string; chapter: number; chapterTitle: string; scrollTop: number; page?: number; note: string; createdAt: string };

// 主题配色与 easy-Reader 保持一致
const READER_THEMES: Record<ReaderTheme, { label: string; backgroundColor: string; fontColor: string }> = {
  "white": { label: "白昼", backgroundColor: "#FFFFFF", fontColor: "#333333" },
  "eye-care": { label: "护眼", backgroundColor: "#FFFDF0", fontColor: "#4a4a4a" },
  "night": { label: "夜间", backgroundColor: "#0b1020", fontColor: "#c9d3ea" },
  "dark": { label: "深黑", backgroundColor: "#1a1a1a", fontColor: "#d0d0d0" },
  "light-green": { label: "浅绿", backgroundColor: "#f0f8f0", fontColor: "#2d4a2d" },
  "light-blue": { label: "浅蓝", backgroundColor: "#eef4ff", fontColor: "#1a3366" },
  "light-gray": { label: "浅灰", backgroundColor: "#f5f5f5", fontColor: "#333333" },
  "light-yellow": { label: "浅黄", backgroundColor: "#fdf8e0", fontColor: "#4a3a1a" },
  "light-brown": { label: "浅棕", backgroundColor: "#f5ebe0", fontColor: "#4a2e1a" },
};

const FONT_OPTIONS = [
  { label: "Noto Serif SC（衬线）", value: '"Noto Serif SC",Georgia,serif' },
  { label: "Noto Sans SC（无衬线）", value: '"Noto Sans SC",system-ui,sans-serif' },
  { label: "宋体", value: "SimSun,宋体,serif" },
  { label: "黑体", value: "SimHei,黑体,sans-serif" },
  { label: "微软雅黑", value: '"Microsoft YaHei",微软雅黑,sans-serif' },
  { label: "楷体", value: "KaiTi,楷体,STKaiti,serif" },
  { label: "仿宋", value: "FangSong,仿宋,STFangSong,serif" },
  { label: "华文中宋", value: "STZhongsong,华文中宋,serif" },
  { label: "系统默认", value: "system-ui,sans-serif" },
];

const DEFAULT_SETTINGS: Settings = {
  fontFamily: '"Noto Serif SC",Georgia,serif',
  fontSize: 18, letterSpacing: 1, lineHeight: 1.9, pageWidth: 72,
  theme: "night", pageMode: "scroll", preserveBookFonts: true,
};

const SETTINGS_KEY = "readerSettings";
const WATERFALL_BATCH = 6;

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<Settings> } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type Props = { novelId: string; title: string; fileUrl: string; onClose: () => void };

type EpubTocItem = { id?: string; href: string; label: string; subitems?: EpubTocItem[] };
type EpubLocation = {
  start: { cfi: string; index: number; href: string; displayed: { page: number; total: number } };
  end: { cfi: string };
  atStart: boolean;
  atEnd: boolean;
};
type EpubBook = import("epubjs").Book;
type EpubRendition = import("epubjs").Rendition;
type EpubContents = import("epubjs").Contents;

export function NovelReader(props: Props) {
  return /\.epub(?:$|[?#])/i.test(props.fileUrl)
    ? <EpubNovelReader {...props} />
    : <LegacyNovelReader {...props} />;
}

function EpubNovelReader({ novelId, title, fileUrl, onClose }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [toolbar, setToolbar] = useState(true);
  const [panel, setPanel] = useState<null | "settings" | "chapters">(null);
  const [toc, setToc] = useState<EpubTocItem[]>([]);
  const [location, setLocation] = useState<EpubLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const progressKey = `novel:epub-progress:${novelId}`;

  const saveSettings = useCallback((next: Settings) => {
    setSettings(next);
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const turn = useCallback((direction: -1 | 1) => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    void (direction > 0 ? rendition.next() : rendition.prev());
    setPanel(null);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let book: EpubBook | null = null;
    let rendition: EpubRendition | null = null;

    const open = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(fileUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("无法读取 EPUB 文件。");
        const buffer = await response.arrayBuffer();
        if (disposed) return;
        const module = await import("epubjs");
        const createBook = module.default;
        book = createBook(buffer, { replacements: "blobUrl" });
        bookRef.current = book;
        await book.opened;
        if (disposed || !host.current) return;

        const navigation = await book.loaded.navigation;
        setToc((navigation.toc ?? []) as EpubTocItem[]);
        rendition = book.renderTo(host.current, {
          width: "100%", height: "100%", flow: "paginated", manager: "default",
          spread: "none", minSpreadWidth: 99999, allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        const classifyPage = (doc: Document) => {
          const body = doc.body;
          if (!body) return;
          const singleImage = body.querySelector(".duokan-image-single img, .cover img");
          const visibleText = (body.textContent ?? "").replace(/\s+/g, "").trim();
          body.classList.toggle("reader-full-image-page", Boolean(singleImage && visibleText.length < 8));
          body.classList.toggle("reader-prose-page", Boolean(!singleImage && visibleText.length > 80));
        };

        rendition.hooks.content.register((contents: EpubContents) => {
          const doc = contents.document;
          classifyPage(doc);

          const onTouchStart = (event: TouchEvent) => {
            const point = event.touches[0];
            if (point) touchRef.current = { x: point.clientX, y: point.clientY };
          };
          const onTouchEnd = (event: TouchEvent) => {
            const start = touchRef.current;
            touchRef.current = null;
            const point = event.changedTouches[0];
            if (!start || !point) return;
            const dx = point.clientX - start.x;
            const dy = point.clientY - start.y;
            if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) turn(dx < 0 ? 1 : -1);
          };
          const onClick = (event: MouseEvent) => {
            if ((event.target as HTMLElement | null)?.closest("a")) return;
            const selection = doc.getSelection()?.toString();
            if (!selection) setToolbar((value) => !value);
          };
          doc.addEventListener("touchstart", onTouchStart, { passive: true });
          doc.addEventListener("touchend", onTouchEnd, { passive: true });
          doc.addEventListener("click", onClick);
        });

        rendition.on("rendered", (_section: unknown, view: { contents?: EpubContents }) => {
          const doc = view.contents?.document;
          if (doc) classifyPage(doc);
        });

        rendition.on("relocated", (next: EpubLocation) => {
          if (disposed) return;
          setLocation(next);
          try { window.localStorage.setItem(progressKey, next.start.cfi); } catch { /* ignore */ }
        });

        let saved = "";
        try { saved = window.localStorage.getItem(progressKey) ?? ""; } catch { /* ignore */ }
        await rendition.display(saved || undefined);
        if (!disposed) setLoading(false);

        resizeObserver = new ResizeObserver(() => {
          if (!host.current || !rendition) return;
          rendition.resize(host.current.clientWidth, host.current.clientHeight);
        });
        resizeObserver.observe(host.current);
      } catch (issue) {
        if (!disposed) {
          setLoading(false);
          setError(issue instanceof Error ? issue.message : "无法打开 EPUB。");
        }
      }
    };
    void open();
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      rendition?.destroy();
      book?.destroy();
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [fileUrl, progressKey, turn]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const theme = READER_THEMES[settings.theme] ?? READER_THEMES.night;
    rendition.themes.default({
      "html, body": { background: `${theme.backgroundColor} !important`, color: `${theme.fontColor} !important` },
      body: {
        "box-sizing": "border-box !important",
        padding: "clamp(24px, 5vh, 64px) clamp(28px, 8vw, 120px) !important",
        margin: "0 !important",
        "font-size": `${settings.fontSize}px !important`,
        "line-height": `${settings.lineHeight} !important`,
        "letter-spacing": `${settings.letterSpacing}px !important`,
      },
      "body.reader-full-image-page": { padding: "0 !important", display: "flex !important", "align-items": "center !important", "justify-content": "center !important" },
      ".reader-full-image-page > div, .reader-full-image-page .duokan-image-single, .reader-full-image-page .cover": { width: "100% !important", height: "100% !important", margin: "0 !important", padding: "0 !important", display: "flex !important", "align-items": "center !important", "justify-content": "center !important" },
      ".reader-full-image-page img": { display: "block !important", width: "auto !important", height: "auto !important", "max-width": "92% !important", "max-height": "92% !important", "object-fit": "contain !important" },
      ".reader-prose-page h1, .reader-prose-page h2, .reader-prose-page h3": { color: `${theme.fontColor} !important` },
      ".duokan-image-single": { "text-indent": "0 !important", "text-align": "center !important", "break-inside": "avoid !important" },
      ".duokan-image-single img": { display: "block !important", width: "auto !important", height: "auto !important", "max-width": "100% !important", "max-height": "calc(100vh - 110px) !important", margin: "auto !important", "object-fit": "contain !important" },
      "p, h1, h2, h3, figure, table, .duokan-image-single": { "break-inside": "avoid !important" },
      img: { "max-width": "100%" },
    });
    if (settings.preserveBookFonts) rendition.themes.override("font-family", "revert", false);
    else rendition.themes.font(settings.fontFamily);
    rendition.themes.fontSize(`${settings.fontSize}px`);
  }, [settings, loading]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (event.key === "Escape") panel ? setPanel(null) : onClose();
      else if (event.key === "ArrowRight" || event.key === "PageDown") turn(1);
      else if (event.key === "ArrowLeft" || event.key === "PageUp") turn(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, panel, turn]);

  const theme = READER_THEMES[settings.theme] ?? READER_THEMES.night;
  const displayedPage = location?.start.displayed.page ?? 1;
  const displayedTotal = location?.start.displayed.total ?? 1;
  const spineIndex = location?.start.index ?? 0;

  return <div className="novel-reader epub-reader" style={{
    background: theme.backgroundColor, color: theme.fontColor,
    "--reader-bg": theme.backgroundColor, "--reader-fg": theme.fontColor,
  } as React.CSSProperties} aria-label={`阅读 ${title}`}>
    <div className={`reader-toolbar top${toolbar ? " visible" : ""}`}>
      <button className="reader-icon" onClick={onClose} aria-label="返回"><ArrowLeft /></button>
      <span className="chapter-title">{title}</span>
      <div className="toolbar-actions">
        <button className="reader-icon" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="阅读设置"><Settings2 /></button>
        <button className="reader-icon" onClick={() => setPanel(panel === "chapters" ? null : "chapters")} aria-label="章节目录"><List /></button>
        <a className="reader-icon" href={fileUrl} download aria-label="下载原文件"><Download /></a>
      </div>
    </div>

    <div className="epub-stage" ref={host} />
    {loading && <div className="epub-loading"><Loader2 className="reader-spin" /><span>正在按原书版式打开…</span></div>}
    {error && <div className="epub-loading is-error"><span>{error}</span></div>}
    <button className="reader-page-zone previous" onClick={() => turn(-1)} aria-label="上一页" />
    <button className="reader-page-zone next" onClick={() => turn(1)} aria-label="下一页" />

    <div className={`reader-toolbar bottom${toolbar ? " visible" : ""}`}>
      <button className="reader-nav-btn" onClick={() => turn(-1)} disabled={Boolean(location?.atStart)}><ChevronLeft /> 上一页</button>
      <div className="progress-info">{displayedPage} / {displayedTotal}<small>第 {spineIndex + 1} 节 · 左右滑动翻页</small></div>
      <button className="reader-nav-btn" onClick={() => turn(1)} disabled={Boolean(location?.atEnd)}>下一页 <ChevronRight /></button>
    </div>

    {panel === "chapters" && <aside className="reader-panel" role="dialog" aria-label="章节目录">
      <div className="panel-head"><b>章节目录</b><small>{toc.length} 节</small><button className="reader-icon" onClick={() => setPanel(null)} aria-label="关闭"><X /></button></div>
      <div className="panel-scroll epub-toc">
        {toc.map((item, position) => <button key={`${item.href}-${position}`} onClick={() => { void renditionRef.current?.display(item.href); setPanel(null); }}>
          <small>{String(position + 1).padStart(3, "0")}</small><span>{item.label.trim()}</span>
        </button>)}
      </div>
    </aside>}

    {panel === "settings" && <aside className="reader-panel" role="dialog" aria-label="阅读设置">
      <div className="panel-head"><b>阅读设置</b><button className="reader-icon" onClick={() => setPanel(null)} aria-label="关闭"><X /></button></div>
      <div className="panel-scroll">
        <div className="setting-group"><div className="setting-label">主题</div><div className="theme-options">
          {(Object.keys(READER_THEMES) as ReaderTheme[]).map((key) => <button key={key} className={`theme-btn${settings.theme === key ? " active" : ""}`} style={{ background: READER_THEMES[key].backgroundColor, color: READER_THEMES[key].fontColor }} onClick={() => saveSettings({ ...settings, theme: key })}>{READER_THEMES[key].label}</button>)}
        </div></div>
        <div className="setting-group"><div className="setting-label">字体</div><label className="reader-book-font"><input type="checkbox" checked={settings.preserveBookFonts} onChange={(event) => saveSettings({ ...settings, preserveBookFonts: event.target.checked })} /> 优先使用 EPUB 内嵌字体</label>
          {!settings.preserveBookFonts && <select className="setting-select" value={settings.fontFamily} onChange={(event) => saveSettings({ ...settings, fontFamily: event.target.value })}>{FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
        </div>
        <div className="setting-group"><div className="setting-label">字号 {settings.fontSize}px</div><input type="range" min={12} max={32} value={settings.fontSize} onChange={(event) => saveSettings({ ...settings, fontSize: Number(event.target.value) })} /></div>
        <div className="setting-group"><div className="setting-label">行高 {settings.lineHeight.toFixed(1)}</div><input type="range" min={1.3} max={2.5} step={0.1} value={settings.lineHeight} onChange={(event) => saveSettings({ ...settings, lineHeight: Number(event.target.value) })} /></div>
        <div className="setting-group"><div className="setting-label">字距 {settings.letterSpacing}px</div><input type="range" min={0} max={4} step={0.5} value={settings.letterSpacing} onChange={(event) => saveSettings({ ...settings, letterSpacing: Number(event.target.value) })} /></div>
        <button className="setting-reset" onClick={() => saveSettings(DEFAULT_SETTINGS)}><RotateCcw /> 恢复默认设置</button>
      </div>
    </aside>}
  </div>;
}

function LegacyNovelReader({ novelId, title, fileUrl, onClose }: Props) {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [toolbar, setToolbar] = useState(true);
  const [panel, setPanel] = useState<null | "settings" | "chapters" | "bookmarks">(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [restored, setRestored] = useState(false);
  const [waterfallCount, setWaterfallCount] = useState(WATERFALL_BATCH);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [readerPageWidth, setReaderPageWidth] = useState(0);

  const scroller = useRef<HTMLDivElement | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const pageViewport = useRef<HTMLDivElement | null>(null);
  const pageContent = useRef<HTMLElement | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const openAtLastPage = useRef(false);
  const progressKey = `novel:progress:${novelId}`;
  const bookmarkKey = `novel:bookmarks:${novelId}`;

  /* ---------- 载入正文 ---------- */
  useEffect(() => {
    let alive = true;
    fetch(`/api/novels/${novelId}/content`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as Content & { error?: string };
        if (!alive) return;
        if (!response.ok) throw new Error(data.error ?? "无法载入正文。");
        setContent(data);
        setError("");
      })
      .catch((issue: unknown) => { if (alive) setError(issue instanceof Error ? issue.message : "无法载入正文。"); });
    return () => { alive = false; };
  }, [novelId]);

  /* ---------- 恢复进度 / 书签 ---------- */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(progressKey);
        if (raw) {
          const saved = JSON.parse(raw) as { chapter?: number; scrollTop?: number; page?: number };
          if (typeof saved.chapter === "number") setIndex(Math.max(0, saved.chapter));
          if (typeof saved.page === "number") setPage(Math.max(0, saved.page));
          if (typeof saved.scrollTop === "number") {
            window.requestAnimationFrame(() => scroller.current?.scrollTo({ top: saved.scrollTop ?? 0 }));
          }
        }
        const marks = window.localStorage.getItem(bookmarkKey);
        if (marks) setBookmarks(JSON.parse(marks) as Bookmark[]);
      } catch { /* 忽略损坏的本地数据 */ }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [progressKey, bookmarkKey]);

  /* ---------- 持久化设置 / 进度 ---------- */
  const saveSettings = useCallback((next: Settings) => {
    setSettings(next);
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* 忽略 */ }
  }, []);

  const saveBookmarks = useCallback((next: Bookmark[]) => {
    setBookmarks(next);
    try { window.localStorage.setItem(bookmarkKey, JSON.stringify(next)); } catch { /* 忽略 */ }
  }, [bookmarkKey]);

  const persistProgress = useCallback((chapter: number, scrollTop: number, currentPage = 0) => {
    try { window.localStorage.setItem(progressKey, JSON.stringify({ chapter, scrollTop, page: currentPage, at: Date.now() })); } catch { /* 忽略 */ }
  }, [progressKey]);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => persistProgress(index, scroller.current?.scrollTop ?? 0, page), 300);
    return () => window.clearTimeout(timer);
  }, [index, page, persistProgress, restored]);

  const onScroll = useCallback(() => {
    if (!restored) return;
    if (settings.pageMode === "waterfall") persistProgress(index, scroller.current?.scrollTop ?? 0, 0);
  }, [index, persistProgress, restored, settings.pageMode]);

  /* ---------- 锁定页面滚动 + 快捷键 ---------- */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const chapters = useMemo(() => content?.chapters ?? [], [content]);
  const total = chapters.length;

  const go = useCallback((next: number, keepScroll = false) => {
    const bounded = Math.min(Math.max(0, next), Math.max(0, total - 1));
    if (!keepScroll) scroller.current?.scrollTo({ top: 0 });
    setIndex(bounded);
    setPage(0);
    setPanel(null);
  }, [total]);

  const turn = useCallback((direction: -1 | 1) => {
    if (settings.pageMode !== "scroll") return go(index + direction);
    if (direction > 0 && page < pageCount - 1) setPage((value) => value + 1);
    else if (direction < 0 && page > 0) setPage((value) => value - 1);
    else if (direction > 0 && index < total - 1) go(index + 1);
    else if (direction < 0 && index > 0) { openAtLastPage.current = true; go(index - 1); }
  }, [go, index, page, pageCount, settings.pageMode, total]);

  const addBookmark = useCallback((chapter: number, text: string) => {
    const mark: Bookmark = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      chapter, chapterTitle: chapters[chapter]?.title || `第 ${chapter + 1} 章`,
      scrollTop: Math.floor(scroller.current?.scrollTop ?? 0), page, note: text, createdAt: new Date().toISOString(),
    };
    saveBookmarks([mark, ...bookmarks]);
  }, [bookmarks, chapters, page, saveBookmarks]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (event.key === "Escape") {
        if (panel) setPanel(null);
        else if (noteFor !== null) { setNoteFor(null); setNote(""); }
        else onClose();
        return;
      }
      if (settings.pageMode !== "scroll") return;
       if (event.key === "ArrowRight" || event.key === "PageDown") turn(1);
       else if (event.key === "ArrowLeft" || event.key === "PageUp") turn(-1);
      else if (event.key === "b" || event.key === "B") { setNoteFor(index); setNote(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, noteFor, onClose, panel, settings.pageMode, turn]);

  /* ---------- 瀑布流：滚动到底自动加载后续章节 ---------- */
  useEffect(() => {
    if (settings.pageMode !== "waterfall") return;
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setWaterfallCount((count) => Math.min(total, count + WATERFALL_BATCH));
      }
    }, { root: scroller.current, rootMargin: "600px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [settings.pageMode, total]);

  useEffect(() => {
    if (settings.pageMode !== "waterfall") return;
    const node = scroller.current;
    if (!node) return;
    const onWaterfallScroll = () => {
      const blocks = node.querySelectorAll<HTMLElement>("[data-chapter]");
      let current = 0;
      for (const block of blocks) {
        if (block.offsetTop - node.scrollTop <= 80) current = Number(block.dataset.chapter ?? 0);
        else break;
      }
      setIndex(current);
      if (restored) persistProgress(current, node.scrollTop);
    };
    node.addEventListener("scroll", onWaterfallScroll, { passive: true });
    return () => node.removeEventListener("scroll", onWaterfallScroll);
  }, [settings.pageMode, persistProgress, restored]);

  const theme = READER_THEMES[settings.theme] ?? READER_THEMES.night;
  const current = chapters[index];
  const paragraphs = useMemo(() => (current?.text ?? "").split(/\n+/).filter((line) => line.trim()), [current]);

  useEffect(() => {
    if (settings.pageMode !== "scroll") return;
    const measure = () => {
      const viewport = pageViewport.current;
      const contentNode = pageContent.current;
      if (!viewport || !contentNode) return;
      setReaderPageWidth(viewport.clientWidth);
      const pages = Math.max(1, Math.round(contentNode.scrollWidth / Math.max(1, viewport.clientWidth)));
      setPageCount(pages);
      setPage((value) => {
        if (openAtLastPage.current) {
          openAtLastPage.current = false;
          return pages - 1;
        }
        return Math.min(value, pages - 1);
      });
    };
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (pageViewport.current) observer?.observe(pageViewport.current);
    if (pageContent.current) observer?.observe(pageContent.current);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [current, settings.fontFamily, settings.fontSize, settings.letterSpacing, settings.lineHeight, settings.pageMode, settings.pageWidth]);

  const contentStyle = {
    fontFamily: settings.fontFamily,
    fontSize: `${settings.fontSize}px`,
    letterSpacing: `${settings.letterSpacing}px`,
    lineHeight: settings.lineHeight,
    maxWidth: `${settings.pageWidth}rem`,
  };

  const waterfallChapters = settings.pageMode === "waterfall" ? chapters.slice(0, Math.min(waterfallCount, total)) : [];

  return <div className="novel-reader" style={{
    background: theme.backgroundColor,
    color: theme.fontColor,
    // 面板/工具栏的配色都从这两个变量推导，必须随主题一起更新
    "--reader-bg": theme.backgroundColor,
    "--reader-fg": theme.fontColor,
  } as React.CSSProperties} aria-label={`阅读 ${title}`}>
    <div className={`reader-toolbar top${toolbar ? " visible" : ""}`}>
      <button className="reader-icon" onClick={onClose} aria-label="返回"><ArrowLeft /></button>
      <span className="chapter-title">{current ? (current.title || `第 ${index + 1} 章`) : "加载中…"}</span>
      <div className="toolbar-actions">
        <button className="reader-icon" onClick={() => setPanel(panel === "bookmarks" ? null : "bookmarks")} aria-label="书签"><Bookmark /></button>
        <button className="reader-icon" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="阅读设置"><Settings2 /></button>
        <button className="reader-icon" onClick={() => setPanel(panel === "chapters" ? null : "chapters")} aria-label="章节目录" disabled={!total}><List /></button>
        <a className="reader-icon" href={fileUrl} download aria-label="下载原文件"><Download /></a>
      </div>
    </div>

    <div className="reader-content" ref={scroller} onClick={(event) => {
      if ((event.target as HTMLElement).closest("a,button")) return;
      if (window.getSelection()?.toString()) return;
      setToolbar((visible) => !visible);
    }} onScroll={onScroll}>
      {!content && !error && <p className="reader-note"><Loader2 className="reader-spin" /> 正在解析正文…</p>}
      {error && <p className="reader-note is-error">{error}</p>}

      {content && total === 0 && <div className="reader-note is-error">
        <p>{content.unsupported ?? "这个文件里没有可阅读的正文。"}</p>
        <a className="reader-download" href={fileUrl} download><Download size={15} /> 下载原文件阅读</a>
      </div>}

      {total > 0 && settings.pageMode === "scroll" && <div className="apple-page-viewport" ref={pageViewport}
        onPointerDown={(event) => { swipeStart.current = { x: event.clientX, y: event.clientY }; }}
        onPointerUp={(event) => {
          const start = swipeStart.current; swipeStart.current = null;
          if (!start) return;
          const dx = event.clientX - start.x; const dy = event.clientY - start.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) turn(dx < 0 ? 1 : -1);
        }}>
        <article ref={pageContent} className="chapter-content apple-paged-content" style={{
          ...contentStyle,
          maxWidth: "none",
          width: readerPageWidth ? `${readerPageWidth}px` : "100%",
          columnWidth: readerPageWidth ? `${readerPageWidth}px` : "auto",
          transform: `translate3d(-${page * readerPageWidth}px,0,0)`,
        }}>
          <h1>{current?.title}</h1>
          {paragraphs.map((line, position) => <p key={position}>{line}</p>)}
          {current?.images?.map((image, position) => <figure className="reader-illustration" key={`${image.path}-${position}`}><img src={`/api/novels/${novelId}/asset?path=${encodeURIComponent(image.path)}`} alt={image.alt} /><figcaption>{image.alt === "书中插图" ? "" : image.alt}</figcaption></figure>)}
        </article>
        <button className="reader-page-zone previous" onClick={() => turn(-1)} aria-label="上一页" />
        <button className="reader-page-zone next" onClick={() => turn(1)} aria-label="下一页" />
      </div>}

      {total > 0 && settings.pageMode === "waterfall" && <div className="content-wrapper">
        {waterfallChapters.map((chapter, position) => <section className="waterfall-chapter" data-chapter={position} key={`${chapter.title}-${position}`}>
          <div className="waterfall-divider"><span>{chapter.title || `第 ${position + 1} 章`}</span></div>
          <article className="chapter-content" style={contentStyle}>
            {chapter.text.split(/\n+/).filter((line) => line.trim()).map((line, i) => <p key={i}>{line}</p>)}
            {chapter.images?.map((image, imageIndex) => <figure className="reader-illustration" key={`${image.path}-${imageIndex}`}><img src={`/api/novels/${novelId}/asset?path=${encodeURIComponent(image.path)}`} alt={image.alt} /><figcaption>{image.alt === "书中插图" ? "" : image.alt}</figcaption></figure>)}
          </article>
        </section>)}
        <div ref={sentinel} className="waterfall-sentinel" />
        {waterfallCount < total && <p className="reader-note"><Loader2 className="reader-spin" /> 正在载入后续章节…</p>}
        {waterfallCount >= total && <p className="reader-note">— 本书完 —</p>}
      </div>}

      {content?.truncated && <p className="reader-note">正文较长，仅显示前 {total} 章。</p>}
    </div>

    <div className={`reader-toolbar bottom${toolbar ? " visible" : ""}`}>
      {settings.pageMode === "scroll"
        ? <>
          <button className="reader-nav-btn" onClick={() => turn(-1)} disabled={index <= 0 && page <= 0}><ChevronLeft /> 上一页</button>
          <div className="progress-info">{page + 1} / {pageCount}<small>第 {index + 1} 章 · 共 {total} 章</small></div>
          <button className="reader-nav-btn" onClick={() => turn(1)} disabled={index >= total - 1 && page >= pageCount - 1}>下一页 <ChevronRight /></button>
        </>
        : <div className="progress-info">{index + 1} / {total} 章 · 瀑布流</div>}
    </div>

    {total > 0 && <button className="bookmark-fab" title="添加书签 (B)" onClick={() => { setNoteFor(index); setNote(""); }}>
      <BookmarkPlus /><span className="fab-hotkey">B</span>
    </button>}

    {panel === "chapters" && <aside className="reader-panel" role="dialog" aria-label="章节目录">
      <div className="panel-head"><b>章节目录</b><small>{total} 章</small><button className="reader-icon" onClick={() => setPanel(null)} aria-label="关闭"><X /></button></div>
      <div className="panel-scroll">
        {chapters.map((chapter, position) => <button key={`${chapter.title}-${position}`} className={position === index ? "is-current" : ""} onClick={() => go(position)}>
          <small>{String(position + 1).padStart(3, "0")}</small><span>{chapter.title || `第 ${position + 1} 章`}</span>
        </button>)}
      </div>
    </aside>}

    {panel === "bookmarks" && <aside className="reader-panel" role="dialog" aria-label="书签">
      <div className="panel-head"><b>我的书签</b><small>{bookmarks.length} 条</small><button className="reader-icon" onClick={() => setPanel(null)} aria-label="关闭"><X /></button></div>
      <div className="panel-scroll">
        {bookmarks.length === 0 && <p className="panel-empty">还没有书签。读到想记住的地方，点右下角书签按钮或按 B 键。</p>}
        {bookmarks.map((mark) => <article className="bookmark-item" key={mark.id}>
          <button className="bookmark-jump" onClick={() => {
            go(mark.chapter, true);
            window.requestAnimationFrame(() => { scroller.current?.scrollTo({ top: mark.scrollTop }); setPage(mark.page ?? 0); });
            setPanel(null);
          }}>
            <b>{mark.chapterTitle}</b>
            {mark.note && <span>{mark.note}</span>}
            <small>{new Date(mark.createdAt).toLocaleString("zh-CN", { hour12: false })}</small>
          </button>
          <button className="bookmark-remove" onClick={() => saveBookmarks(bookmarks.filter((item) => item.id !== mark.id))} aria-label="删除书签"><Trash2 /></button>
        </article>)}
      </div>
    </aside>}

    {panel === "settings" && <aside className="reader-panel" role="dialog" aria-label="阅读设置">
      <div className="panel-head"><b>阅读设置</b><button className="reader-icon" onClick={() => setPanel(null)} aria-label="关闭"><X /></button></div>
      <div className="panel-scroll">
        <div className="setting-group">
          <div className="setting-label">阅读模式</div>
          <div className="mode-options">
            <button className={settings.pageMode === "scroll" ? "active" : ""} onClick={() => saveSettings({ ...settings, pageMode: "scroll" })}>章节翻页</button>
            <button className={settings.pageMode === "waterfall" ? "active" : ""} onClick={() => saveSettings({ ...settings, pageMode: "waterfall" })}>瀑布流</button>
          </div>
        </div>

        <div className="setting-group">
          <div className="setting-label">主题</div>
          <div className="theme-options">
            {(Object.keys(READER_THEMES) as ReaderTheme[]).map((key) => {
              const value = READER_THEMES[key];
              return <button key={key} className={`theme-btn${settings.theme === key ? " active" : ""}`}
                style={{ background: value.backgroundColor, color: value.fontColor }}
                onClick={() => saveSettings({ ...settings, theme: key })}>{value.label}</button>;
            })}
          </div>
        </div>

        <div className="setting-group">
          <div className="setting-label">字体</div>
          <select className="setting-select" value={settings.fontFamily} onChange={(event) => saveSettings({ ...settings, fontFamily: event.target.value })}>
            {FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div className="setting-group">
          <div className="setting-label">字号 {settings.fontSize}px</div>
          <input type="range" min={12} max={32} value={settings.fontSize} onChange={(event) => saveSettings({ ...settings, fontSize: Number(event.target.value) })} />
        </div>

        <div className="setting-group">
          <div className="setting-label">行高 {settings.lineHeight.toFixed(1)}</div>
          <input type="range" min={1.4} max={2.5} step={0.1} value={settings.lineHeight} onChange={(event) => saveSettings({ ...settings, lineHeight: Number(event.target.value) })} />
        </div>

        <div className="setting-group">
          <div className="setting-label">字距 {settings.letterSpacing}px</div>
          <input type="range" min={0} max={4} step={0.5} value={settings.letterSpacing} onChange={(event) => saveSettings({ ...settings, letterSpacing: Number(event.target.value) })} />
        </div>

        <div className="setting-group">
          <div className="setting-label">页宽 {settings.pageWidth}rem</div>
          <input type="range" min={40} max={110} step={2} value={settings.pageWidth} onChange={(event) => saveSettings({ ...settings, pageWidth: Number(event.target.value) })} />
        </div>

        <button className="setting-reset" onClick={() => saveSettings(DEFAULT_SETTINGS)}><RotateCcw /> 恢复默认设置</button>
      </div>
    </aside>}

    {noteFor !== null && <div className="reader-note-dialog" role="dialog" aria-modal="true" aria-label="添加书签">
      <div className="note-card">
        <b>添加书签</b>
        <small>{chapters[noteFor]?.title || `第 ${noteFor + 1} 章`}</small>
        <input autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（可选）"
          onKeyDown={(event) => {
            if (event.key === "Enter") { addBookmark(noteFor, note.trim()); setNoteFor(null); setNote(""); }
            if (event.key === "Escape") { setNoteFor(null); setNote(""); }
          }} />
        <div className="note-actions">
          <button onClick={() => { setNoteFor(null); setNote(""); }}>取消</button>
          <button className="primary" onClick={() => { addBookmark(noteFor, note.trim()); setNoteFor(null); setNote(""); }}>保存书签</button>
        </div>
      </div>
    </div>}
  </div>;
}
