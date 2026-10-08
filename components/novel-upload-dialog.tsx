"use client";
import { useFeedback } from "@/lib/notifications";

import { useRef, useState } from "react";
import { BookPlus, Upload, X } from "lucide-react";

const ACCEPT = ".epub,.mobi,.azw,.azw3";
const FORMATS = ["epub", "mobi", "azw", "azw3"];

type Props = { onClose: () => void; onUploaded?: () => void };
type Result = { name: string; ok: boolean; title?: string; error?: string };

function readable(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function NovelUploadDialog({ onClose, onUploaded }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useFeedback("");
  const [failed, setFailed] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState(0);
  const [activeName, setActiveName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const add = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(incoming)) {
      const extension = (file.name.split(".").pop() ?? "").toLowerCase();
      if (!FORMATS.includes(extension)) { rejected.push(`${file.name}（格式不支持）`); continue; }
      accepted.push(file);
    }
    setResults([]);
    setFailed(rejected.length > 0);
    setFiles((previous) => {
      const merged = [...previous];
      for (const file of accepted) {
        if (!merged.some((item) => item.name === file.name && item.size === file.size)) merged.push(file);
      }
      const total = merged.reduce((sum, item) => sum + item.size, 0);
      setStatus(rejected.length
        ? `已忽略：${rejected.join("、")}`
        : `已选择 ${merged.length} 个文件，共 ${readable(total)}`);
      return merged;
    });
    // 允许重复选择同一个文件时也能触发 change
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async () => {
    if (!files.length || busy) return;
    setBusy(true); setFailed(false); setResults([]);
    setStatus(`准备上传 ${files.length} 个文件…`);
    setProgress(0);
    try {
      const list: Result[] = [];
      let uploadedBefore = 0;
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0) || 1;
      for (const file of files) {
        setActiveName(file.name);
        setStatus(`正在上传 ${file.name}…`);
        const result = await new Promise<Result>((resolve) => {
          const form = new FormData();
          form.append("file", file);
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/novels");
          xhr.upload.onprogress = (event) => {
            const current = event.lengthComputable ? event.loaded : 0;
            setProgress(Math.min(99, Math.round((uploadedBefore + current) / totalBytes * 100)));
          };
          xhr.onload = () => {
            try {
              const data = JSON.parse(xhr.responseText) as { results?: Result[]; error?: string };
              if (xhr.status < 200 || xhr.status >= 300) resolve({ name: file.name, ok: false, error: data.error ?? "上传失败。" });
              else resolve(data.results?.[0] ?? { name: file.name, ok: false, error: "服务器没有返回处理结果。" });
            } catch { resolve({ name: file.name, ok: false, error: "服务器响应无法解析。" }); }
          };
          xhr.onerror = () => resolve({ name: file.name, ok: false, error: "网络连接中断。" });
          xhr.send(form);
        });
        uploadedBefore += file.size;
        list.push(result);
        setResults([...list]);
        setProgress(Math.round(uploadedBefore / totalBytes * 100));
      }
      const ok = list.filter((item) => item.ok).length;
      const bad = list.length - ok;
      setFailed(bad > 0);
      setStatus(bad === 0 ? `全部成功：${ok} 本已加入文库。` : `成功 ${ok} 本，失败 ${bad} 本。`);
      if (ok > 0) {
        onUploaded?.();
        setFiles([]);
      }
    } catch (error) {
      setFailed(true);
      setStatus(error instanceof Error ? error.message : "上传失败，请重试。");
    } finally {
      setBusy(false);
      setActiveName("");
    }
  };

  return <div className="novel-upload-backdrop" role="dialog" aria-modal="true" aria-label="添加小说" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <div className="novel-upload">
      <button className="novel-upload-close" onClick={() => !busy && onClose()} aria-label="关闭"><X /></button>
      <h2>添加小说</h2>
      <p>仅管理员可以添加小说。支持任意大小的 epub / mobi 文件，系统会逐本上传并自动读取书名、作者、简介与封面。</p>
      <label className={`novel-drop${over ? " is-over" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => { event.preventDefault(); setOver(false); add(event.dataTransfer.files); }}>
        <BookPlus />
        <b>点击选择文件，或把多本一起拖进来</b>
        <small>EPUB / MOBI / AZW3 · 不限制单本文件大小 · 逐本安全上传</small>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple onChange={(event) => add(event.target.files)} />
      </label>

      {files.length > 0 && <ul className="novel-upload-list">
        {files.map((file) => <li key={`${file.name}-${file.size}`}>
          <i /><span>{file.name}</span><small>{readable(file.size)}</small>
          <button type="button" onClick={() => setFiles((previous) => previous.filter((item) => item !== file))} disabled={busy} aria-label={`移除 ${file.name}`}><X size={13} /></button>
        </li>)}
      </ul>}

      {status && <p className={`novel-upload-status${failed ? " is-error" : ""}`}>{status}</p>}
      {busy && <div className="novel-upload-progress" aria-label={`上传进度 ${progress}%`}>
        <div><i style={{ width: `${progress}%` }} /></div><span>{progress}%</span>
        {activeName && <small>{activeName}</small>}
      </div>}

      {results.length > 0 && <ul className="novel-upload-results">
        {results.map((item) => <li key={item.name} className={item.ok ? "is-ok" : "is-bad"}>
          <b>{item.ok ? "✓" : "✕"}</b><span>{item.ok ? item.title : item.name}</span>
          {!item.ok && <small>{item.error}</small>}
        </li>)}
      </ul>}

      <button className="novel-upload-submit" disabled={!files.length || busy} onClick={submit}>
        {busy ? "处理中…" : <><Upload size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />上传 {files.length || ""} 本到文库</>}
      </button>
    </div>
  </div>;
}
