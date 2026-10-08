"use client";
import { useFeedback } from "@/lib/notifications";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, ImagePlus, RotateCw, Trash2 } from "lucide-react";

type Rotation = 0 | 90 | 180 | 270;
type PageDirection = "auto" | "portrait" | "landscape";
type FitMode = "contain" | "cover";
type PageFormat = "a4" | "original";
type ImageItem = { id: string; file: File; url: string; width: number; height: number; rotation: Rotation };
type EmbeddedImage = { width: number; height: number };
type PdfPage = { drawImage(image: EmbeddedImage, options: { x: number; y: number; width: number; height: number }): void };
type PdfDocument = {
  addPage(size: [number, number]): PdfPage;
  embedJpg(bytes: ArrayBuffer): Promise<EmbeddedImage>;
  save(): Promise<Uint8Array>;
  setTitle(value: string): void;
  setCreator(value: string): void;
};
type PdfLibApi = { PDFDocument: { create(): Promise<PdfDocument> } };

declare global { interface Window { PDFLib?: PdfLibApi; __pdfLibLoading?: Promise<PdfLibApi> } }

function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (window.__pdfLibLoading) return window.__pdfLibLoading;
  window.__pdfLibLoading = new Promise<PdfLibApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/pdf-lib.min.js";
    script.async = true;
    script.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error("PDF library unavailable"));
    script.onerror = () => reject(new Error("PDF library failed to load"));
    document.head.appendChild(script);
  });
  return window.__pdfLibLoading;
}

function readImageSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取图片"));
    image.src = url;
  });
}

function rasterize(item: ImageItem) {
  return new Promise<{ bytes: ArrayBuffer; width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const rotated = item.rotation === 90 || item.rotation === 270;
      const maxSide = 2400;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const sourceWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const sourceHeight = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = rotated ? sourceHeight : sourceWidth;
      canvas.height = rotated ? sourceWidth : sourceHeight;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("浏览器不支持图片处理"));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(item.rotation * Math.PI / 180);
      context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error("图片转换失败"));
        resolve({ bytes: await blob.arrayBuffer(), width: canvas.width, height: canvas.height });
      }, "image/jpeg", .92);
    };
    image.onerror = () => reject(new Error(`无法处理 ${item.file.name}`));
    image.src = item.url;
  });
}

export function ImagePdfStudio() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [direction, setDirection] = useState<PageDirection>("auto");
  const [format, setFormat] = useState<PageFormat>("a4");
  const [fit, setFit] = useState<FitMode>("contain");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useFeedback("图片只在当前浏览器中处理，不会上传。 ");
  const draggedId = useRef<string | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    const next = await Promise.all(files.map(async (file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      const size = await readImageSize(url);
      return { id: crypto.randomUUID(), file, url, width: size.width, height: size.height, rotation: 0 as Rotation };
    }));
    setItems((current) => [...current, ...next]);
    setStatus(`已加入 ${files.length} 张图片。拖动卡片或使用箭头调整顺序。`);
    event.target.value = "";
  };

  const move = (index: number, offset: number) => setItems((current) => {
    const target = index + offset;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const rotate = (id: string) => setItems((current) => current.map((item) => item.id === id ? { ...item, rotation: ((item.rotation + 90) % 360) as Rotation } : item));
  const remove = (id: string) => setItems((current) => {
    const removed = current.find((item) => item.id === id);
    if (removed) URL.revokeObjectURL(removed.url);
    return current.filter((item) => item.id !== id);
  });

  const drop = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = draggedId.current;
    if (!sourceId || sourceId === targetId) return;
    setItems((current) => {
      const from = current.findIndex((item) => item.id === sourceId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [source] = next.splice(from, 1);
      next.splice(to, 0, source);
      return next;
    });
    draggedId.current = null;
  };

  const createPdf = async () => {
    if (!items.length || working) return;
    setWorking(true);
    setStatus("正在生成 PDF…");
    try {
      const { PDFDocument } = await loadPdfLib();
      const pdf = await PDFDocument.create();
      pdf.setTitle("Suieikat Image Collection");
      pdf.setCreator("Suieikat Laboratory");
      for (let index = 0; index < items.length; index += 1) {
        setStatus(`正在处理 ${index + 1} / ${items.length}：${items[index].file.name}`);
        const raster = await rasterize(items[index]);
        const image = await pdf.embedJpg(raster.bytes);
        let pageWidth: number;
        let pageHeight: number;
        if (format === "original") {
          pageWidth = raster.width;
          pageHeight = raster.height;
          if (direction !== "auto" && ((direction === "portrait") !== (pageHeight >= pageWidth))) [pageWidth, pageHeight] = [pageHeight, pageWidth];
        } else {
          const landscape = direction === "landscape" || (direction === "auto" && raster.width > raster.height);
          [pageWidth, pageHeight] = landscape ? [842, 595] : [595, 842];
        }
        const page = pdf.addPage([pageWidth, pageHeight]);
        const margin = format === "a4" ? 24 : 0;
        const boxWidth = Math.max(1, pageWidth - margin * 2);
        const boxHeight = Math.max(1, pageHeight - margin * 2);
        const ratio = fit === "cover" ? Math.max(boxWidth / image.width, boxHeight / image.height) : Math.min(boxWidth / image.width, boxHeight / image.height);
        const drawWidth = image.width * ratio;
        const drawHeight = image.height * ratio;
        page.drawImage(image, { x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2, width: drawWidth, height: drawHeight });
      }
      const bytes = await pdf.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `suieikat-images-${new Date().toISOString().slice(0, 10)}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      void fetch("/api/activity/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "image-pdf" }) }).catch(() => undefined);
      setStatus(`完成：${items.length} 张图片已经合并并开始下载。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "生成失败，请重试。 ");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="pdf-studio">
      <div className="pdf-toolbar">
        <label className="pdf-upload"><ImagePlus size={19} /><span>选择图片</span><input type="file" accept="image/*" multiple onChange={addFiles} /></label>
        <label><span>页面尺寸</span><select value={format} onChange={(event) => setFormat(event.target.value as PageFormat)}><option value="a4">A4</option><option value="original">跟随图片</option></select></label>
        <label><span>页面方向</span><select value={direction} onChange={(event) => setDirection(event.target.value as PageDirection)}><option value="auto">自动</option><option value="portrait">纵向</option><option value="landscape">横向</option></select></label>
        <label><span>图片适配</span><select value={fit} onChange={(event) => setFit(event.target.value as FitMode)}><option value="contain">完整显示</option><option value="cover">铺满裁切</option></select></label>
      </div>

      {items.length ? <div className="pdf-image-list">
        {items.map((item, index) => <article className="pdf-image-card" key={item.id} draggable onDragStart={() => { draggedId.current = item.id; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, item.id)}>
          <div className="pdf-image-preview"><img src={item.url} alt="" style={{ transform: `rotate(${item.rotation}deg)` }} /><b>{String(index + 1).padStart(2, "0")}</b></div>
          <div className="pdf-image-meta"><strong title={item.file.name}>{item.file.name}</strong><small>{item.width} × {item.height} · {item.rotation}°</small></div>
          <div className="pdf-card-actions">
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="向前移动"><ArrowUp size={15} /></button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="向后移动"><ArrowDown size={15} /></button>
            <button type="button" onClick={() => rotate(item.id)} aria-label="旋转图片"><RotateCw size={15} /></button>
            <button type="button" onClick={() => remove(item.id)} aria-label="移除图片"><Trash2 size={15} /></button>
          </div>
        </article>)}
      </div> : <label className="pdf-empty"><ImagePlus size={28} /><strong>把图片放进来</strong><span>支持多选；加入后可拖动排序、逐张旋转。</span><input type="file" accept="image/*" multiple onChange={addFiles} /></label>}

      <div className="pdf-download-row"><p aria-live="polite">{status}</p><button type="button" onClick={createPdf} disabled={!items.length || working}><Download size={17} />{working ? "处理中…" : "DOWNLOAD PDF"}</button></div>
    </div>
  );
}
