"use client";
import { useFeedback } from "@/lib/notifications";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, Grid3X3, ImageDown, ImageUp, Sparkles, WandSparkles } from "lucide-react";

type Tool = "compress" | "convert" | "grid" | "pixel";
type OutputFormat = "image/jpeg" | "image/png" | "image/webp";
type LoadedImage = { file: File; url: string; width: number; height: number };

const tools: Array<{ id: Tool; name: string; english: string; icon: typeof ImageDown }> = [
  { id: "compress", name: "图片压缩", english: "COMPRESS", icon: ImageDown },
  { id: "convert", name: "格式转换", english: "CONVERT", icon: ImageUp },
  { id: "grid", name: "九宫格切图", english: "NINE GRID", icon: Grid3X3 },
  { id: "pixel", name: "像素画生成", english: "PIXELIZE", icon: WandSparkles },
];

function loadImage(file: File) {
  return new Promise<LoadedImage>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ file, url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法读取这张图片。")); };
    image.src = url;
  });
}

function decode(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败。"));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: OutputFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("浏览器无法生成图片。")), type, quality));
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; data: Uint8Array }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length + file.data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(8, 0, true);
    view.setUint32(14, crc, true); view.setUint32(18, file.data.length, true); view.setUint32(22, file.data.length, true); view.setUint16(26, name.length, true);
    local.set(name, 30); local.set(file.data, 30 + name.length); chunks.push(local);
    const central = new Uint8Array(46 + name.length); const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.data.length, true); centralView.setUint32(24, file.data.length, true); centralView.setUint16(28, name.length, true); centralView.setUint32(42, offset, true); central.set(name, 46); directory.push(central);
    offset += local.length;
  }
  const directorySize = directory.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, directorySize, true); endView.setUint32(16, offset, true);
  const parts = [...chunks, ...directory, end];
  const totalSize = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const archive = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of parts) {
    archive.set(part, cursor);
    cursor += part.byteLength;
  }
  return new Blob([archive.buffer], { type: "application/zip" });
}

export function ImageToolbox() {
  const [tool, setTool] = useState<Tool>("compress");
  const [source, setSource] = useState<LoadedImage | null>(null);
  const [format, setFormat] = useState<OutputFormat>("image/webp");
  const [quality, setQuality] = useState(76);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [pixelSize, setPixelSize] = useState(48);
  const [palette, setPalette] = useState(12);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useFeedback("选择一张图片开始。处理过程完全留在浏览器中。");
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  const extension = useMemo(() => format === "image/png" ? "png" : format === "image/jpeg" ? "jpg" : "webp", [format]);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const loaded = await loadImage(file);
      setSource((current) => { if (current) URL.revokeObjectURL(current.url); return loaded; });
      setStatus(`${file.name} · ${loaded.width} × ${loaded.height} · ${(file.size / 1024).toFixed(0)} KB`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "读取失败。"); }
    event.target.value = "";
  };

  const drawResized = async (limit = maxWidth) => {
    if (!source) throw new Error("请先选择图片。");
    const image = await decode(source.url);
    const scale = Math.min(1, limit / source.width, 4096 / source.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("浏览器不支持 Canvas。");
    if (format === "image/jpeg") { context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const runStandard = async () => {
    const canvas = await drawResized(tool === "convert" ? 4096 : maxWidth);
    const blob = await canvasBlob(canvas, format, quality / 100);
    const base = source!.file.name.replace(/\.[^.]+$/, "");
    download(blob, `${base}-${tool}.${extension}`);
    setStatus(`完成 · ${(blob.size / 1024).toFixed(0)} KB · ${canvas.width} × ${canvas.height}`);
  };

  const runGrid = async () => {
    if (!source) throw new Error("请先选择图片。");
    const image = await decode(source.url);
    const side = Math.min(source.width, source.height); const sx = (source.width - side) / 2; const sy = (source.height - side) / 2;
    const tile = Math.min(1400, Math.floor(side / 3));
    const files: Array<{ name: string; data: Uint8Array }> = [];
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
      const canvas = document.createElement("canvas"); canvas.width = tile; canvas.height = tile;
      canvas.getContext("2d")!.drawImage(image, sx + column * side / 3, sy + row * side / 3, side / 3, side / 3, 0, 0, tile, tile);
      const blob = await canvasBlob(canvas, "image/png", 1);
      files.push({ name: `${row * 3 + column + 1}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    download(zipStore(files), `${source.file.name.replace(/\.[^.]+$/, "")}-nine-grid.zip`);
    setStatus("九张正方形切图已打包为 ZIP，并按 1—9 排序。");
  };

  const runPixel = async () => {
    if (!source) throw new Error("请先选择图片。");
    const image = await decode(source.url);
    const ratio = source.height / source.width; const smallWidth = pixelSize; const smallHeight = Math.max(1, Math.round(pixelSize * ratio));
    const tiny = document.createElement("canvas"); tiny.width = smallWidth; tiny.height = smallHeight;
    const tinyContext = tiny.getContext("2d", { willReadFrequently: true })!; tinyContext.drawImage(image, 0, 0, smallWidth, smallHeight);
    const pixels = tinyContext.getImageData(0, 0, smallWidth, smallHeight); const levels = Math.max(2, Math.round(Math.cbrt(palette))); const step = 255 / (levels - 1);
    for (let index = 0; index < pixels.data.length; index += 4) for (let channel = 0; channel < 3; channel += 1) pixels.data[index + channel] = Math.round(pixels.data[index + channel] / step) * step;
    tinyContext.putImageData(pixels, 0, 0);
    const output = document.createElement("canvas"); output.width = Math.min(2048, smallWidth * 16); output.height = Math.round(output.width * ratio);
    const context = output.getContext("2d")!; context.imageSmoothingEnabled = false; context.drawImage(tiny, 0, 0, output.width, output.height);
    if (previewRef.current) { previewRef.current.width = output.width; previewRef.current.height = output.height; previewRef.current.getContext("2d")!.drawImage(output, 0, 0); }
    const blob = await canvasBlob(output, "image/png", 1); download(blob, `${source.file.name.replace(/\.[^.]+$/, "")}-pixel.png`);
    setStatus(`像素画完成 · ${smallWidth} × ${smallHeight} 像素网格 · ${palette} 色目标`);
  };

  const run = async () => {
    if (!source || working) return;
    setWorking(true); setStatus("正在重构图像…");
    try {
      if (tool === "grid") await runGrid(); else if (tool === "pixel") await runPixel(); else await runStandard();
      void fetch("/api/activity/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: `image-${tool}` }) }).catch(() => undefined);
    } catch (error) { setStatus(error instanceof Error ? error.message : "处理失败，请换一张图片。 "); }
    finally { setWorking(false); }
  };

  return <div className="image-toolbox">
    <div className="image-tool-tabs">{tools.map((item) => { const Icon = item.icon; return <button type="button" className={tool === item.id ? "is-active" : ""} onClick={() => { setTool(item.id); setStatus("模式已切换，原图仍保留在浏览器中。"); }} key={item.id}><Icon /><span>{item.name}<small>{item.english}</small></span></button>; })}</div>
    <div className="image-tool-workspace">
      <label className="image-tool-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} />{source ? <img src={source.url} alt="原图预览" /> : <><Sparkles /><strong>DROP / SELECT IMAGE</strong><span>JPG · PNG · WEBP</span></>}</label>
      <div className="image-tool-controls">
        <div className="tool-mode-title"><small>{tools.find((item) => item.id === tool)?.english}</small><h3>{tools.find((item) => item.id === tool)?.name}</h3></div>
        {(tool === "compress" || tool === "convert") && <>
          <label>输出格式<select value={format} onChange={(event) => setFormat(event.target.value as OutputFormat)}><option value="image/webp">WEBP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
          {format !== "image/png" && <label>图像质量 <b>{quality}%</b><input type="range" min="20" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>}
          {tool === "compress" && <label>最大宽度 <b>{maxWidth}px</b><input type="range" min="480" max="3840" step="80" value={maxWidth} onChange={(event) => setMaxWidth(Number(event.target.value))} /></label>}
        </>}
        {tool === "grid" && <div className="tool-description"><Grid3X3 /><p>自动取图片中央正方形，切成 3 × 3，并打包下载为 ZIP。</p></div>}
        {tool === "pixel" && <><label>像素密度 <b>{pixelSize}px</b><input type="range" min="16" max="128" step="4" value={pixelSize} onChange={(event) => setPixelSize(Number(event.target.value))} /></label><label>目标色彩 <b>{palette}</b><input type="range" min="4" max="32" step="2" value={palette} onChange={(event) => setPalette(Number(event.target.value))} /></label></>}
        <button className="image-tool-run" type="button" disabled={!source || working} onClick={run}><Download />{working ? "PROCESSING…" : "PROCESS / DOWNLOAD"}</button>
        <p className="image-tool-status" aria-live="polite">{status}</p>
      </div>
    </div>
    <canvas className="pixel-preview" ref={previewRef} hidden={tool !== "pixel" || !source} />
  </div>;
}
