/**
 * Self-contained EPUB / MOBI (.mobi, .azw, .azw3) readable-text extractor.
 *
 * Turns an uploaded e-book into plain chapters for the in-browser reader:
 *   EPUB  -> META-INF/container.xml -> OPF manifest/spine -> XHTML -> text
 *   MOBI  -> PalmDB records -> PalmDOC (LZ77) text records -> HTML -> text
 *
 * No third-party dependencies: the EPUB ZIP container is read with a minimal
 * reader built on `node:zlib`, and the PalmDB/MOBI payload is decoded by hand.
 * Node runtime only (route handlers); this module never throws.
 */

import { inflateRawSync } from "node:zlib";

export type NovelImage = { path: string; alt: string };
export type NovelChapter = { title: string; text: string; images?: NovelImage[] };

export type NovelContent = {
  title: string;
  chapters: NovelChapter[];
  truncated: boolean;
  unsupported?: string;
};

/** Hard caps so a hostile/broken upload cannot exhaust memory or the payload. */
const MAX_CHAPTERS = 3000;
const MAX_TOTAL_CHARS = 4_000_000;
const MAX_TITLE_CHARS = 120;
const MAX_ZIP_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_IMAGES_PER_CHAPTER = 24;

/** Survives tag stripping and entity decoding, so chapters can be split on it. */
const PAGEBREAK_SENTINEL = "@@__NOVEL_PAGEBREAK__@@";

const UNSUPPORTED_EMPTY = "未能从该文件中提取到可阅读的正文。";
const UNSUPPORTED_HUFF = "HUFF/CDIC 压缩的 MOBI 暂不支持网页阅读，请下载原文件。";
const UNSUPPORTED_DRM = "该 MOBI 文件带有 DRM 加密，无法在网页中阅读，请下载原文件。";
const UNSUPPORTED_OPF = "EPUB 结构损坏：未找到可用的 OPF 文件。";

/* -------------------------------------------------------------------------- */
/* small helpers                                                              */
/* -------------------------------------------------------------------------- */

function stem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const name = dot > 0 ? base.slice(0, dot) : base;
  return name.trim() || base.trim() || "未命名";
}

function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function capTitle(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > MAX_TITLE_CHARS ? trimmed.slice(0, MAX_TITLE_CHARS) : trimmed;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `String.fromCodePoint` that never throws on out-of-range entities. */
function codePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/** Trim ASCII whitespace only, so CJK ideographic indentation survives. */
function trimSpace(value: string): string {
  return value.replace(/^[ \t\f\v\r\n]+/, "").replace(/[ \t\f\v\r\n]+$/, "");
}

/** Slice without splitting a surrogate pair in half. */
function sliceSafe(value: string, max: number): string {
  let end = Math.max(0, Math.min(value.length, max));
  if (end > 0) {
    const code = value.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  }
  return value.slice(0, end);
}

function tagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? "");
  }
  return attributes;
}

function allTags(xml: string, localName: string): string[] {
  return xml.match(new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${localName}\\b[^>]*/?>`, "gi")) ?? [];
}

function firstTagText(xml: string, localName: string): string {
  const prefix = `(?:[A-Za-z0-9_.-]+:)?${localName}`;
  const match = xml.match(new RegExp(`<${prefix}\\b[^>]*>([\\s\\S]*?)</${prefix}\\s*>`, "i"));
  return match?.[1] ?? "";
}

/* -------------------------------------------------------------------------- */
/* HTML -> plain text                                                         */
/* -------------------------------------------------------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  middot: "\u00b7",
  bull: "\u2022",
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
  laquo: "\u00ab",
  raquo: "\u00bb",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  deg: "\u00b0",
  plusmn: "\u00b1",
  times: "\u00d7",
  divide: "\u00f7",
  frac12: "\u00bd",
  sect: "\u00a7",
  para: "\u00b6",
  dagger: "\u2020",
  Dagger: "\u2021",
  prime: "\u2032",
  Prime: "\u2033",
  larr: "\u2190",
  uarr: "\u2191",
  rarr: "\u2192",
  darr: "\u2193",
  harr: "\u2194",
  infin: "\u221e",
  ne: "\u2260",
  le: "\u2264",
  ge: "\u2265",
  minus: "\u2212",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
  cent: "\u00a2",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwj: "",
  zwnj: "",
};

/** Single-pass entity decoding: `&amp;lt;` stays a literal `&lt;`. */
function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]{1,31}));/g, (match, dec: string, hex: string, name: string) => {
    if (dec) return codePoint(parseInt(dec, 10));
    if (hex) return codePoint(parseInt(hex, 16));
    const named = NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/** Non-prose payloads that must never reach the reader. */
const DROPPED_HEAD = /<head\b[^>]*>[\s\S]*?<\/head\s*>/gi;
const DROPPED_HEAD_UNCLOSED = /<head\b[^>]*>[\s\S]*?(?=<body\b|$)/gi;
const DROPPED_SCRIPT = /<(script|style|iframe|noscript|template|object|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DROPPED_SCRIPT_UNCLOSED = /<(script|style)\b[^>]*>[\s\S]*$/gi;
const DROPPED_FURIGANA = /<(rt|rp|rtc)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const STRAY_FURIGANA_TAG = /<\/?(?:rt|rp|rtc)\b[^>]*\/?>/gi;
const LINE_BREAK_TAG = /<br\b[^>]*\/?>/gi;
const RULE_TAG = /<(?:hr|mbp:pagebreak|pagebreak)\b[^>]*\/?>/gi;
const BLOCK_END_TAG =
  /<\/(?:p|div|h[1-6]|li|tr|td|th|caption|figcaption|blockquote|section|article|header|footer|nav|aside|pre|table|ul|ol|dl|dd|dt|form|fieldset|address|figure)\s*>/gi;
const ANY_TAG = /<[^>]*>/g;

/**
 * Convert one XHTML/HTML document into pre-wrap friendly plain text.
 * Paragraph boundaries become newlines; runs of 3+ newlines collapse to 2.
 */
function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<!--[\s\S]*?-->/g, "\n");
  text = text.replace(DROPPED_HEAD, "\n");
  text = text.replace(DROPPED_HEAD_UNCLOSED, "\n");
  text = text.replace(DROPPED_SCRIPT, "\n");
  text = text.replace(DROPPED_SCRIPT_UNCLOSED, "\n");
  text = text.replace(DROPPED_FURIGANA, "");
  text = text.replace(STRAY_FURIGANA_TAG, "");
  text = text.replace(LINE_BREAK_TAG, "\n");
  text = text.replace(RULE_TAG, "\n");
  text = text.replace(BLOCK_END_TAG, "\n");
  text = text.replace(ANY_TAG, "");
  text = decodeEntities(text);

  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t\f\v]+/g, " ");
  text = text
    .split("\n")
    .map((line) => trimSpace(line))
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return trimSpace(joinVerticalRuns(text));
}

/**
 * 竖排标题页会把每个字放进独立的块元素，转成文本后变成"一字一行"（字之间还夹着空行）。
 * 连续 6 个以上的短行（每行不超过 2 个字符）判定为竖排文本并合并成一行；
 * 阈值取得比较高是为了不误伤诗歌、对话、名单等正常的短行内容。
 */
function joinVerticalRuns(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let run: Array<{ text: string; gap: number }> = [];
  let gap = 0;
  const flush = () => {
    if (run.length >= 6) {
      output.push(run.map((item) => item.text).join(""));
    } else {
      run.forEach((item, index) => {
        if (index > 0) for (let i = 0; i < item.gap; i++) output.push("");
        output.push(item.text);
      });
    }
    run = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { gap += 1; continue; }
    if (trimmed.length <= 2) {
      run.push({ text: trimmed, gap: run.length ? gap : 0 });
      gap = 0;
      continue;
    }
    flush();
    for (let i = 0; i < gap; i++) output.push("");
    gap = 0;
    output.push(line);
  }
  flush();
  for (let i = 0; i < gap; i++) output.push("");
  return output.join("\n");
}

/** Single-line text (chapter headings): tags removed, whitespace collapsed. */
function inlineText(html: string): string {
  const stripped = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(rt|rp|rtc)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<[^>]*>/g, ""),
  );
  return trimSpace(stripped.replace(/[ \t\r\n\f\v]+/g, " "));
}

/** First `<h1>`, then `<h2>`, then `<h3>`, then `<title>`. */
function extractHeading(html: string): string {
  for (const level of ["h1", "h2", "h3"]) {
    const prefix = `(?:[A-Za-z0-9_.-]+:)?${level}`;
    const pattern = new RegExp(`<${prefix}\\b[^>]*>([\\s\\S]*?)</${prefix}\\s*>`, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const title = capTitle(inlineText(match[1]));
      if (title) return title;
    }
  }
  return capTitle(inlineText(firstTagText(html, "title")));
}

/**
 * A nav/TOC document is only worth reading when it actually holds prose; a
 * bare list of short link labels is not.
 */
function looksLikeProse(text: string): boolean {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  let longest = 0;
  let total = 0;
  for (const line of lines) {
    longest = Math.max(longest, line.length);
    total += line.length;
  }
  return longest >= 40 || total / lines.length >= 20;
}

/** `<mbp:pagebreak>` / `<mbp:pagebreak/>` -> sentinel line, before tag stripping. */
function normalizePageBreaks(html: string): string {
  return html.replace(/<(?:[A-Za-z0-9_.-]+:)?pagebreak\b[^>]*\/?>/gi, `\n${PAGEBREAK_SENTINEL}\n`);
}

/* -------------------------------------------------------------------------- */
/* chapter accumulator (caps + fallback titles)                               */
/* -------------------------------------------------------------------------- */

type ChapterSink = {
  chapters: NovelChapter[];
  readonly truncated: boolean;
  /** Returns false once a cap is hit; callers should stop scanning. */
  add: (title: string, text: string, images?: NovelImage[]) => boolean;
};

function createSink(): ChapterSink {
  const chapters: NovelChapter[] = [];
  let total = 0;
  let truncated = false;

  const add = (title: string, text: string, images: NovelImage[] = []): boolean => {
    if (text.length < 2) return !truncated;
    if (chapters.length >= MAX_CHAPTERS) {
      truncated = true;
      return false;
    }
    const remaining = MAX_TOTAL_CHARS - total;
    if (remaining < 2) {
      truncated = true;
      return false;
    }
    const heading = capTitle(title) || `第${chapters.length + 1}章`;
    if (text.length > remaining) {
      chapters.push({ title: heading, text: sliceSafe(text, remaining), images });
      total = MAX_TOTAL_CHARS;
      truncated = true;
      return false;
    }
    chapters.push({ title: heading, text, images });
    total += text.length;
    return true;
  };

  return {
    chapters,
    get truncated() {
      return truncated;
    },
    add,
  };
}

/* -------------------------------------------------------------------------- */
/* minimal ZIP reader (EPUB container)                                        */
/* -------------------------------------------------------------------------- */

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

type ZipArchive = {
  buffer: Buffer;
  entries: ZipEntry[];
  byLowerName: Map<string, ZipEntry>;
};

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_SIGNATURE = 0x06064b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;

function normalizeZipPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < 22) return -1;
  const lowest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= lowest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

type Zip64Fields = { uncompressed: number | null; compressed: number | null; offset: number | null };

function readZip64Extra(extra: Buffer, needs: { uncompressed: boolean; compressed: boolean; offset: boolean }): Zip64Fields | null {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    const body = extra.subarray(cursor + 4, cursor + 4 + size);
    if (id === 0x0001) {
      let field = 0;
      const take = (): number | null => {
        if (field + 8 > body.length) return null;
        const value = Number(body.readBigUInt64LE(field));
        field += 8;
        return value;
      };
      return {
        uncompressed: needs.uncompressed ? take() : null,
        compressed: needs.compressed ? take() : null,
        offset: needs.offset ? take() : null,
      };
    }
    cursor += 4 + size;
  }
  return null;
}

/** Read the ZIP central directory (ZIP64 recovered only far enough to read). */
function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error("不是有效的 ZIP 文件。");

  let entryCount = buffer.readUInt16LE(eocd + 10);
  let directoryOffset = buffer.readUInt32LE(eocd + 16);
  const directorySize = buffer.readUInt32LE(eocd + 12);

  if (entryCount === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
    const locator = eocd - 20;
    if (locator >= 0 && buffer.readUInt32LE(locator) === EOCD64_LOCATOR_SIGNATURE) {
      const zip64Offset = Number(buffer.readBigUInt64LE(locator + 8));
      if (zip64Offset >= 0 && zip64Offset + 56 <= buffer.length && buffer.readUInt32LE(zip64Offset) === EOCD64_SIGNATURE) {
        entryCount = Number(buffer.readBigUInt64LE(zip64Offset + 32));
        directoryOffset = Number(buffer.readBigUInt64LE(zip64Offset + 48));
      }
    }
  }

  if (directoryOffset < 0 || directoryOffset >= buffer.length) throw new Error("ZIP 中央目录偏移无效。");
  if (entryCount > 200000) entryCount = 200000;

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) break;
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    let compressedSize = buffer.readUInt32LE(cursor + 20);
    let uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    let localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    if (nameStart + nameLength > buffer.length) break;
    const name = normalizeZipPath(buffer.toString("utf8", nameStart, nameStart + nameLength));
    const extra = buffer.subarray(nameStart + nameLength, nameStart + nameLength + extraLength);

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      const zip64 = readZip64Extra(extra, {
        uncompressed: uncompressedSize === 0xffffffff,
        compressed: compressedSize === 0xffffffff,
        offset: localHeaderOffset === 0xffffffff,
      });
      if (!zip64) throw new Error(`ZIP64 条目缺少扩展信息：${name}`);
      if (zip64.uncompressed !== null) uncompressedSize = zip64.uncompressed;
      if (zip64.compressed !== null) compressedSize = zip64.compressed;
      if (zip64.offset !== null) localHeaderOffset = zip64.offset;
    }

    // Bit 3 marks a streaming entry whose sizes only live in the data descriptor.
    if (compressedSize === 0 && uncompressedSize === 0 && (flags & 0x08) !== 0) {
      if (localHeaderOffset + 30 <= buffer.length && buffer.readUInt32LE(localHeaderOffset) === LOCAL_SIGNATURE) {
        const localCompressed = buffer.readUInt32LE(localHeaderOffset + 18);
        if (localCompressed > 0) compressedSize = localCompressed;
      }
    }

    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }

  if (entries.length === 0) throw new Error("ZIP 中央目录为空。");
  return entries;
}

/** Extract (and inflate) one entry; returns null instead of throwing. */
function readZipEntryData(buffer: Buffer, entry: ZipEntry): Buffer | null {
  try {
    const offset = entry.localHeaderOffset;
    if (offset < 0 || offset + 30 > buffer.length) return null;
    if (buffer.readUInt32LE(offset) !== LOCAL_SIGNATURE) return null;
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    if (start > buffer.length) return null;
    const size = entry.compressedSize > 0 ? entry.compressedSize : entry.uncompressedSize;
    if (size <= 0) return Buffer.alloc(0);
    const raw = buffer.subarray(start, Math.min(start + size, buffer.length));
    if (entry.method === 0) return Buffer.from(raw);
    if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) return null;
    if (entry.method === 8) return inflateRawSync(raw, { maxOutputLength: MAX_ZIP_ENTRY_BYTES });
    return null;
  } catch {
    return null;
  }
}

function openZip(buffer: Buffer): ZipArchive {
  const entries = readZipEntries(buffer);
  const byLowerName = new Map<string, ZipEntry>();
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (!byLowerName.has(lower)) byLowerName.set(lower, entry);
  }
  return { buffer, entries, byLowerName };
}

/** Forgiving lookup: exact, URL-decoded, then case-insensitive. */
function findZipEntry(zip: ZipArchive, path: string): ZipEntry | null {
  const cleaned = normalizeZipPath(path.split("#")[0].split("?")[0]);
  if (!cleaned) return null;
  for (const candidate of [cleaned, decodeSafe(cleaned)]) {
    const direct = zip.entries.find((entry) => entry.name === candidate);
    if (direct) return direct;
    const insensitive = zip.byLowerName.get(candidate.toLowerCase());
    if (insensitive) return insensitive;
  }
  return null;
}

function readZipPath(zip: ZipArchive, path: string): Buffer | null {
  const entry = findZipEntry(zip, path);
  if (!entry) return null;
  const data = readZipEntryData(zip.buffer, entry);
  return data && data.length > 0 ? data : null;
}

const CHARSET_PATTERN = /(?:encoding|charset)\s*=\s*["']?\s*([A-Za-z0-9_-]+)/i;

function decodeWithCharset(data: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(data);
  } catch {
    return "";
  }
}

/** Decode chapter bytes, honouring a declared non-UTF-8 charset when supported. */
function decodeDocument(data: Buffer): string {
  const head = data.subarray(0, Math.min(data.length, 1024)).toString("latin1");
  const declared = (head.match(CHARSET_PATTERN)?.[1] ?? "").toLowerCase();
  if (declared && declared !== "utf-8" && declared !== "utf8") {
    const decoded = decodeWithCharset(data, declared);
    if (decoded) return stripBom(decoded);
  }
  return stripBom(data.toString("utf8"));
}

/* -------------------------------------------------------------------------- */
/* EPUB                                                                       */
/* -------------------------------------------------------------------------- */

type ManifestItem = { id: string; href: string; mediaType: string; properties: string };

type SourceResult = {
  title: string;
  chapters: NovelChapter[];
  truncated: boolean;
  unsupported?: string;
};

/** Resolve an OPF/NCX href against a base directory (`../`, `%20`, `#`, `?`). */
function resolveRelative(baseDirectory: string, href: string): string {
  const clean = decodeSafe(href.split("#")[0].split("?")[0]).replace(/\\/g, "/").trim();
  if (!clean) return "";
  if (clean.startsWith("/")) return normalizeZipPath(clean);
  const segments = `${baseDirectory ? `${baseDirectory}/` : ""}${clean}`.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return stack.join("/");
}

function parentDirectory(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}

function parseManifestItems(opf: string): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>();
  for (const tag of allTags(opf, "item")) {
    const attributes = tagAttributes(tag);
    const href = attributes.href;
    if (!href) continue;
    const item: ManifestItem = {
      id: attributes.id ?? "",
      href,
      mediaType: (attributes["media-type"] ?? attributes.mediatype ?? "").toLowerCase(),
      properties: (attributes.properties ?? "").toLowerCase(),
    };
    if (item.id && !items.has(item.id)) items.set(item.id, item);
  }
  return items;
}

/** `application/x-dtbncx+xml`, `text/css`, `image/*` ... are not chapters. */
function isDocumentItem(item: ManifestItem, path: string): boolean {
  const type = item.mediaType;
  if (type) {
    if (type.includes("html")) return true;
    if (type === "application/xml" || type === "text/xml" || type.includes("xhtml")) return true;
    return false;
  }
  return /\.(?:x?html?|xml)$/i.test(path);
}

function isNavigationItem(item: ManifestItem, path: string): boolean {
  if (item.properties.split(/\s+/).includes("nav")) return true;
  if (item.mediaType.includes("dtbncx")) return true;
  return /(?:^|\/)(?:nav|toc|contents?|cover)\.[^/]*$/i.test(path);
}

function epubTitle(opf: string, filename: string): string {
  const metadata = firstTagText(opf, "metadata") || opf;
  return capTitle(inlineText(firstTagText(metadata, "title"))) || stem(filename);
}

function epubImages(html: string, documentPath: string): NovelImage[] {
  const base = parentDirectory(documentPath);
  const seen = new Set<string>();
  const images: NovelImage[] = [];
  for (const tag of allTags(html, "img")) {
    const attributes = tagAttributes(tag);
    const source = attributes.src ?? attributes["xlink:href"];
    if (!source || /^data:/i.test(source)) continue;
    const resolved = resolveRelative(base, source);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    images.push({ path: resolved, alt: inlineText(attributes.alt ?? "书中插图").slice(0, 120) || "书中插图" });
    if (images.length >= MAX_IMAGES_PER_CHAPTER) break;
  }
  return images;
}

function addEpubDocument(sink: ChapterSink, zip: ZipArchive, path: string, item: ManifestItem | null): void {
  const data = readZipPath(zip, path);
  if (!data) return;
  const html = decodeDocument(data);
  const text = htmlToText(html);
  if (text.length < 2) return;
  if (item && isNavigationItem(item, path) && !looksLikeProse(text)) return;
  sink.add(extractHeading(html), text, epubImages(html, path));
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", avif: "image/avif",
};

export function extractNovelAsset(buffer: Buffer, filename: string, assetPath: string) {
  if (!looksLikeZip(buffer) || extensionOf(filename) !== "epub") return null;
  const normalized = normalizeZipPath(assetPath);
  const extension = extensionOf(normalized);
  const contentType = IMAGE_MIME[extension];
  if (!contentType) return null;
  const zip = openZip(buffer);
  const entry = findZipEntry(zip, normalized);
  if (!entry || entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) return null;
  const data = readZipEntryData(buffer, entry);
  return data ? { data, contentType } : null;
}

function collectSpine(zip: ZipArchive, opf: string, opfPath: string, sink: ChapterSink): void {
  const items = parseManifestItems(opf);
  const base = parentDirectory(normalizeZipPath(opfPath.startsWith("/") ? opfPath.slice(1) : opfPath));
  for (const tag of allTags(opf, "itemref")) {
    if (sink.truncated) return;
    const idref = tagAttributes(tag).idref ?? "";
    if (!idref) continue;
    const item = items.get(idref) ?? [...items.values()].find((candidate) => candidate.id.toLowerCase() === idref.toLowerCase());
    if (!item) continue;
    const path = resolveRelative(base, item.href);
    if (!path) continue;
    if (!isDocumentItem(item, path)) continue;
    addEpubDocument(sink, zip, path, item);
  }
}

const HTML_FILE = /\.(?:xhtml|html|htm)$/i;

/** Spine missing/empty: read every HTML document in filename order. */
function collectAllDocuments(zip: ZipArchive, sink: ChapterSink, relaxed = false): void {
  const candidates = zip.entries
    .filter((entry) => HTML_FILE.test(entry.name))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of candidates) {
    if (sink.truncated) return;
    const data = readZipEntryData(zip.buffer, entry);
    if (!data) continue;
    const html = decodeDocument(data);
    const text = htmlToText(html);
    if (text.length < 2) continue;
    // relaxed 模式是最后一层兜底：宁可把目录页当成一章，也不要给用户一个空白阅读器。
    if (!relaxed) {
      const navLike = /(?:^|\/)(?:nav|toc|contents?)\.[^/]*$/i.test(entry.name);
      if (navLike && !looksLikeProse(text)) continue;
    }
    sink.add(extractHeading(html), text);
  }
}

function parseEpub(buffer: Buffer, filename: string): SourceResult {
  const zip = openZip(buffer);

  let opfPath = "";
  const containerEntry =
    findZipEntry(zip, "META-INF/container.xml") ?? zip.entries.find((entry) => entry.name.toLowerCase() === "meta-inf/container.xml");
  if (containerEntry) {
    const container = readZipEntryData(zip.buffer, containerEntry);
    const xml = container ? stripBom(container.toString("utf8")) : "";
    const rootfile = allTags(xml, "rootfile")
      .map((tag) => tagAttributes(tag))
      .find((attributes) => attributes["full-path"]);
    if (rootfile?.["full-path"]) opfPath = resolveRelative("", rootfile["full-path"]);
  }
  if (!opfPath || !findZipEntry(zip, opfPath)) {
    opfPath = zip.entries.find((entry) => entry.name.toLowerCase().endsWith(".opf"))?.name ?? "";
  }
  if (!opfPath) throw new Error(UNSUPPORTED_OPF);

  const opfBuffer = readZipPath(zip, opfPath);
  if (!opfBuffer) throw new Error(UNSUPPORTED_OPF);
  const opf = stripBom(opfBuffer.toString("utf8"));
  const title = epubTitle(opf, filename);

  const sink = createSink();
  collectSpine(zip, opf, opfPath, sink);
  if (sink.chapters.length === 0 && !sink.truncated) collectAllDocuments(zip, sink);
  // 最后一层兜底：连目录页也接受，避免出现"提取不到正文"的空阅读器。
  if (sink.chapters.length === 0 && !sink.truncated) collectAllDocuments(zip, sink, true);

  return { title, chapters: sink.chapters, truncated: sink.truncated };
}

/* -------------------------------------------------------------------------- */
/* MOBI / PalmDB / PalmDOC                                                    */
/* -------------------------------------------------------------------------- */

type PdbSlice = { start: number; end: number };

type PdbLayout = { name: string; slices: Array<PdbSlice | null> };

/** PalmDB record list; invalid offsets become `null` so indices stay aligned. */
function readPdbRecords(buffer: Buffer): PdbLayout {
  if (buffer.length < 86) throw new Error("PDB 文件过小。");
  const nameEnd = buffer.subarray(0, 32).indexOf(0);
  const name = buffer.toString("utf8", 0, nameEnd === -1 ? 32 : nameEnd).replace(/\u0000/g, "").trim();

  const recordCount = buffer.readUInt16BE(76);
  if (recordCount <= 0 || recordCount > 65535) throw new Error("PDB 记录数无效。");

  const starts: number[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const pointer = 78 + index * 4;
    if (pointer + 4 > buffer.length) break;
    starts.push(buffer.readUInt32BE(pointer));
  }
  if (starts.length === 0) throw new Error("PDB 记录偏移表为空。");

  const slices = starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    if (!Number.isFinite(start) || start < 0 || start >= buffer.length || end <= start) return null;
    return { start, end: Math.min(end, buffer.length) };
  });

  return { name, slices };
}

function pdbRecord(buffer: Buffer, slices: Array<PdbSlice | null>, index: number): Buffer | null {
  const slice = index >= 0 && index < slices.length ? slices[index] : null;
  return slice ? buffer.subarray(slice.start, slice.end) : null;
}

/**
 * PalmDOC LZ77 (compression 2), canonical token set:
 *   0x00        -> a literal NUL byte (self-representing, like 0x09-0x7F)
 *   0x01-0x08   -> that many literal bytes follow, verbatim
 *   0x09-0x7F   -> literal byte
 *   0x80-0xBF   -> 2-byte back-reference: distance = (pair >> 3) & 0x7FF,
 *                  length = (pair & 0x07) + 3   [pair = (byte << 8) | next]
 *   0xC0-0xFF   -> space + (byte ^ 0x80), a complete token
 *
 * Sources: libmobi/src/compression.c (mobi_decompress_lz77) and calibre's
 * cPalmdoc (both the compressor and the decompressor). Note that a widely
 * copied summary of this format states `length = (byte & 0x07) + 3` (taking
 * the low bits of the *first* byte) and that 0xC0-0xFF is followed by a
 * back-reference; both would desynchronise real files, since Palm's own
 * encoders put the length in the low bits of the second byte and treat
 * 0xC0-0xFF as a complete token.
 *
 * Back-references are copied byte-by-byte, so overlapping copies work.
 */
function decompressPalmDoc(input: Buffer): Buffer {
  let out = Buffer.alloc(Math.max(4096, input.length * 4));
  let length = 0;

  const ensure = (extra: number): void => {
    if (length + extra <= out.length) return;
    let size = out.length > 0 ? out.length : 4096;
    while (size < length + extra) size *= 2;
    const grown = Buffer.alloc(size);
    out.copy(grown, 0, 0, length);
    out = grown;
  };

  const copyReference = (distance: number, count: number): void => {
    if (distance <= 0 || distance > length) return;
    for (let index = 0; index < count; index += 1) {
      ensure(1);
      out[length] = out[length - distance];
      length += 1;
    }
  };

  let cursor = 0;
  while (cursor < input.length) {
    const byte = input[cursor];
    cursor += 1;

    if (byte >= 0xc0) {
      // space + ASCII character
      ensure(2);
      out[length] = 0x20;
      out[length + 1] = byte ^ 0x80;
      length += 2;
      continue;
    }
    if (byte >= 0x80) {
      // 2-byte back reference
      if (cursor >= input.length) break;
      const pair = (byte << 8) | input[cursor];
      cursor += 1;
      copyReference((pair >> 3) & 0x07ff, (pair & 0x07) + 3);
      continue;
    }
    if (byte >= 0x09) {
      // self-representing literal (including 0x00)
      ensure(1);
      out[length] = byte;
      length += 1;
      continue;
    }
    if (byte >= 0x01) {
      // 1-8 literal bytes
      const count = Math.min(byte, input.length - cursor);
      ensure(count);
      for (let index = 0; index < count; index += 1) {
        out[length] = input[cursor + index];
        length += 1;
      }
      cursor += count;
      continue;
    }
    // 0x00: a literal NUL byte
    ensure(1);
    out[length] = 0;
    length += 1;
  }

  return out.subarray(0, length);
}

function mobiHeaderOffsets(record0: Buffer): { mobiOffset: number; encoding: number } {
  let mobiOffset = -1;
  if (record0.length >= 20 && record0.toString("latin1", 16, 20) === "MOBI") mobiOffset = 16;
  else if (record0.length >= 20) {
    const found = record0.subarray(0, Math.min(record0.length, 128)).indexOf("MOBI", 0, "latin1");
    if (found >= 0) mobiOffset = found;
  }
  let encoding = 65001;
  if (mobiOffset >= 0 && mobiOffset + 0x10 <= record0.length) encoding = record0.readUInt32BE(mobiOffset + 0x0c);
  return { mobiOffset, encoding };
}

type ExthRecord = { type: number; data: Buffer };

function parseExth(record0: Buffer, mobiOffset: number): ExthRecord[] {
  const records: ExthRecord[] = [];
  const index = record0.indexOf("EXTH", Math.max(0, mobiOffset + 4), "latin1");
  if (index < 0 || index + 12 > record0.length) return records;

  const totalLength = record0.readUInt32BE(index + 4);
  const count = record0.readUInt32BE(index + 8);
  if (count > 10000 || totalLength < 12 || index + totalLength > record0.length) return records;

  let cursor = index + 12;
  const limit = index + totalLength;
  for (let position = 0; position < count && cursor + 8 <= limit; position += 1) {
    const type = record0.readUInt32BE(cursor);
    const size = record0.readUInt32BE(cursor + 4);
    if (size < 8 || cursor + size > record0.length) break;
    records.push({ type, data: record0.subarray(cursor + 8, cursor + size) });
    cursor += size + ((4 - (size % 4)) % 4);
  }
  return records;
}

function exthText(records: ExthRecord[], type: number, encoding: string): string {
  const record = records.find((item) => item.type === type);
  if (!record) return "";
  return record.data.toString(encoding === "latin1" ? "latin1" : "utf8").replace(/\u0000/g, "").trim();
}

/** EXTH 503, then the 32-byte PalmDB name, then the upload's filename. */
function mobiTitle(record0: Buffer, pdbName: string, filename: string): string {
  const { mobiOffset, encoding } = mobiHeaderOffsets(record0);
  const exth = mobiOffset >= 0 ? parseExth(record0, mobiOffset) : [];
  const textEncoding = encoding === 1252 ? "latin1" : "utf8";
  return capTitle(exthText(exth, 503, textEncoding)) || capTitle(pdbName) || stem(filename);
}

function decodeMobiHtml(data: Buffer, encoding: number): string {
  const charset = encoding === 1252 ? "windows-1252" : "utf-8";
  const text = decodeWithCharset(data, charset) || data.toString(encoding === 1252 ? "latin1" : "utf8");
  return stripBom(text.replace(/\u0000/g, ""));
}

/** Split MOBI HTML into per-chapter HTML chunks (pagebreaks first, then h1/h2). */
function splitMobiChapters(html: string): string[] {
  const withMarkers = normalizePageBreaks(html);
  if (withMarkers.includes(PAGEBREAK_SENTINEL)) {
    const parts = withMarkers
      .split(PAGEBREAK_SENTINEL)
      .map((part) => trimSpace(part))
      .filter(Boolean);
    if (parts.length > 0) return parts;
  }

  const starts: number[] = [];
  const heading = /<h[12]\b/gi;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(html)) !== null) {
    starts.push(match.index);
    if (starts.length > MAX_CHAPTERS * 4) break;
  }
  if (starts.length === 0) return [html];

  const chunks: string[] = [];
  if (starts[0] > 0) chunks.push(html.slice(0, starts[0]));
  for (let index = 0; index < starts.length; index += 1) {
    chunks.push(html.slice(starts[index], index + 1 < starts.length ? starts[index + 1] : html.length));
  }
  return chunks;
}

function parseMobi(buffer: Buffer, filename: string): SourceResult {
  const { name, slices } = readPdbRecords(buffer);
  const record0 = pdbRecord(buffer, slices, 0);
  if (!record0 || record0.length < 16) throw new Error("MOBI 记录 0 不完整。");

  const compression = record0.readUInt16BE(0);
  const textLength = record0.readUInt32BE(4);
  const textRecordCount = record0.readUInt16BE(8);
  const encryption = record0.readUInt16BE(12);
  const title = mobiTitle(record0, name, filename);

  if (encryption !== 0) return { title, chapters: [], truncated: false, unsupported: UNSUPPORTED_DRM };
  if (compression === 17480) return { title, chapters: [], truncated: false, unsupported: UNSUPPORTED_HUFF };
  if (compression !== 1 && compression !== 2) {
    return { title, chapters: [], truncated: false, unsupported: `不支持的 MOBI 压缩类型（${compression}）。` };
  }

  const available = Math.max(0, slices.length - 1);
  const count = textRecordCount > 0 && textRecordCount <= available ? textRecordCount : available;

  const parts: Buffer[] = [];
  for (let index = 0; index < count; index += 1) {
    const record = pdbRecord(buffer, slices, index + 1);
    if (!record || record.length === 0) continue;
    parts.push(compression === 1 ? record : decompressPalmDoc(record));
  }
  if (parts.length === 0) return { title, chapters: [], truncated: false };

  let text = Buffer.concat(parts);
  if (textLength > 0 && textLength < text.length) text = text.subarray(0, textLength);

  const { encoding } = mobiHeaderOffsets(record0);
  const html = decodeMobiHtml(text, encoding);

  const sink = createSink();
  for (const chunk of splitMobiChapters(html)) {
    if (sink.truncated) break;
    const plain = htmlToText(chunk);
    if (plain.length < 2) continue;
    sink.add(extractHeading(chunk), plain);
  }

  return { title, chapters: sink.chapters, truncated: sink.truncated };
}

/* -------------------------------------------------------------------------- */
/* entry point                                                                */
/* -------------------------------------------------------------------------- */

function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

function looksLikeMobi(buffer: Buffer): boolean {
  if (buffer.length < 68) return false;
  const type = buffer.toString("latin1", 60, 64);
  const creator = buffer.toString("latin1", 64, 68);
  if (creator === "MOBI" || creator === "TPZ") return true;
  if (type === "TEXt" && creator === "REAd") return true;
  return buffer.subarray(0, Math.min(buffer.length, 4096)).indexOf("MOBI", 0, "latin1") >= 16;
}

/** Returns null only when the buffer is not a recognizable EPUB/MOBI container. */
export function extractNovelContent(buffer: Buffer, filename: string): NovelContent | null {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;

    const zipLike = looksLikeZip(buffer);
    const mobiLike = looksLikeMobi(buffer);
    if (!zipLike && !mobiLike) return null;

    let result: SourceResult | null = null;
    if (zipLike) {
      try {
        result = parseEpub(buffer, filename);
      } catch {
        result = null;
      }
    }
    if (!result && mobiLike) {
      try {
        result = parseMobi(buffer, filename);
      } catch {
        result = null;
      }
    }

    const fallbackTitle = stem(filename);
    if (!result) {
      const extension = extensionOf(filename);
      if (!zipLike && !mobiLike && extension !== "epub" && extension !== "mobi" && extension !== "azw" && extension !== "azw3" && extension !== "prc") {
        return null;
      }
      return { title: fallbackTitle, chapters: [], truncated: false, unsupported: UNSUPPORTED_EMPTY };
    }

    const title = capTitle(result.title) || fallbackTitle;
    if (result.chapters.length === 0) {
      return { title, chapters: [], truncated: result.truncated, unsupported: result.unsupported ?? UNSUPPORTED_EMPTY };
    }
    return { title, chapters: result.chapters, truncated: result.truncated };
  } catch {
    return null;
  }
}
