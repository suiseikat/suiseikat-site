/**
 * Self-contained EPUB / MOBI (.mobi, .azw, .azw3) parser.
 *
 * Extracts metadata (title, author, description, genre) and the raw cover image
 * bytes. No third-party dependencies: the ZIP container is read with a minimal
 * reader built on `node:zlib`, and the MOBI/PalmDB container is walked by hand.
 *
 * Safe for server route handlers (Node runtime) and plain scripts.
 */

import { inflateRawSync } from "node:zlib";

const MAX_ZIP_ENTRY_BYTES = 128 * 1024 * 1024;

export type ParsedNovelCover = { data: Buffer; mime: string };
export type ParsedNovel = {
  title: string;
  author: string;
  description: string;
  genre: string;
  cover: ParsedNovelCover | null;
};

const FALLBACK_GENRE = "轻小说";
const MAX_TITLE = 120;
const MAX_AUTHOR = 120;
const MAX_DESCRIPTION = 300;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];

/* -------------------------------------------------------------------------- */
/* small helpers                                                              */
/* -------------------------------------------------------------------------- */

function cap(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function stem(filename: string) {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const name = dot > 0 ? base.slice(0, dot) : base;
  return name.trim() || base.trim() || "未命名";
}

function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function unescapeXml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function codePoint(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/**
 * Strip tags/entities, collapse whitespace, trim and cap.
 * Entities are decoded before tag stripping so that records storing escaped
 * markup (`&lt;p&gt;...`) are cleaned up too; a second decode mops up `&amp;lt;`.
 */
function plainText(value: string, max = MAX_DESCRIPTION) {
  const stripped = unescapeXml(
    unescapeXml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]*>/g, " "),
  )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? stripped.slice(0, max) : stripped;
}

/** Attributes of one tag, tolerant of single/double quotes and loose XML. */
function tagAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    attributes[match[1].toLowerCase()] = unescapeXml(value);
  }
  return attributes;
}

function firstTagText(xml: string, localName: string) {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${localName}\\s*>`, "i");
  return xml.match(pattern)?.[1] ?? "";
}

function allTags(xml: string, localName: string) {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${localName}\\b[^>]*/?>`, "gi");
  return xml.match(pattern) ?? [];
}

/** Inner text of every `<name>...</name>` element (self-closing elements yield ""). */
function allTagTexts(xml: string, localName: string) {
  const prefix = `(?:[A-Za-z0-9_.-]+:)?${localName}`;
  const pattern = new RegExp(`<${prefix}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${prefix}\\s*>)`, "gi");
  const texts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const text = match[1];
    if (text) texts.push(text);
  }
  return texts;
}

/** Guess an image mime type from leading magic bytes. */
function imageMimeFromBytes(data: Buffer): string | null {
  if (data.length < 4) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (data.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (data.length >= 12 && data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (data[0] === 0x42 && data[1] === 0x4d) return "image/bmp";
  const head = data.subarray(0, Math.min(data.length, 256)).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return head.includes("<svg") ? "image/svg+xml" : null;
  return null;
}

function mimeFromExtension(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return null;
}

/* -------------------------------------------------------------------------- */
/* minimal ZIP reader                                                         */
/* -------------------------------------------------------------------------- */

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_SIGNATURE = 0x06064b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function normalizeZipPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function findEndOfCentralDirectory(buffer: Buffer) {
  if (buffer.length < 22) return -1;
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function readZip64Extra(extra: Buffer, needs: { uncompressed: boolean; compressed: boolean; offset: boolean }) {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    const body = extra.subarray(cursor + 4, cursor + 4 + size);
    let field = 0;
    const take = () => {
      if (field + 8 > body.length) return null;
      const value = Number(body.readBigUInt64LE(field));
      field += 8;
      return value;
    };
    if (id === 0x0001) {
      const result = { uncompressed: null as number | null, compressed: null as number | null, offset: null as number | null };
      if (needs.uncompressed) result.uncompressed = take();
      if (needs.compressed) result.compressed = take();
      if (needs.offset) result.offset = take();
      return result;
    }
    cursor += 4 + size;
  }
  return null;
}

/**
 * Read the ZIP central directory into a list of entries.
 * ZIP64 is handled only far enough to recover sizes/offsets (no split archives).
 */
function readZipDirectory(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error("不是有效的 ZIP 文件：未找到中央目录。");

  let entryCount = buffer.readUInt16LE(eocd + 10);
  let directoryOffset = buffer.readUInt32LE(eocd + 16);
  const directorySize = buffer.readUInt32LE(eocd + 12);

  const needsZip64 = entryCount === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff;
  if (needsZip64) {
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
function readZipEntryRaw(buffer: Buffer, entry: ZipEntry): Buffer | null {
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

/** Flat ZIP view with forgiving, case-insensitive, URL-decoded lookups. */
class ZipArchive {
  private readonly entries: ZipEntry[];
  private readonly buffer: Buffer;
  private readonly byLowerName = new Map<string, ZipEntry>();

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.entries = readZipDirectory(buffer);
    for (const entry of this.entries) {
      const lower = entry.name.toLowerCase();
      if (!this.byLowerName.has(lower)) this.byLowerName.set(lower, entry);
    }
  }

  get names() {
    return this.entries.map((entry) => entry.name);
  }

  find(path: string) {
    const cleaned = normalizeZipPath(path.split("#")[0].split("?")[0]);
    if (!cleaned) return null;
    const candidates = [cleaned, decodeSafe(cleaned)];
    for (const candidate of candidates) {
      const direct = this.entries.find((entry) => entry.name === candidate);
      if (direct) return direct;
      const insensitive = this.byLowerName.get(candidate.toLowerCase());
      if (insensitive) return insensitive;
    }
    return null;
  }

  read(path: string) {
    const entry = this.find(path);
    if (!entry) return null;
    const data = readZipEntryRaw(this.buffer, entry);
    return data && data.length > 0 ? data : null;
  }

  readEntry(entry: ZipEntry) {
    const data = readZipEntryRaw(this.buffer, entry);
    return data && data.length > 0 ? data : null;
  }

  readText(path: string) {
    const data = this.read(path);
    return data ? stripBom(data.toString("utf8")) : null;
  }

  imageEntries() {
    return this.entries.filter((entry) => IMAGE_EXTENSIONS.some((extension) => entry.name.toLowerCase().endsWith(extension)));
  }
}

function stripBom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

/* -------------------------------------------------------------------------- */
/* EPUB                                                                       */
/* -------------------------------------------------------------------------- */

const CONTAINER_PATHS = ["META-INF/container.xml", "meta-inf/container.xml"];

function resolveRelative(baseDirectory: string, href: string) {
  const cleanHref = decodeSafe(href.split("#")[0].split("?")[0]).replace(/\\/g, "/").trim();
  if (!cleanHref) return "";
  if (cleanHref.startsWith("/")) return normalizeZipPath(cleanHref);
  const segments = `${baseDirectory ? `${baseDirectory}/` : ""}${cleanHref}`.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return stack.join("/");
}

type ManifestItem = { id: string; href: string; mediaType: string; properties: string };

function parseManifest(opf: string): ManifestItem[] {
  const items: ManifestItem[] = [];
  for (const tag of allTags(opf, "item")) {
    const attributes = tagAttributes(tag);
    if (!attributes.href) continue;
    items.push({
      id: attributes.id ?? "",
      href: attributes.href,
      mediaType: (attributes["media-type"] ?? attributes.mediatype ?? "").toLowerCase(),
      properties: (attributes.properties ?? "").toLowerCase(),
    });
  }
  return items;
}

function isImageItem(item: ManifestItem) {
  return item.mediaType.startsWith("image/") || Boolean(mimeFromExtension(item.href));
}

function epubCoverItem(opf: string, items: ManifestItem[]) {
  const metaCoverIds: string[] = [];
  for (const tag of allTags(opf, "meta")) {
    const attributes = tagAttributes(tag);
    const name = (attributes.name ?? attributes.property ?? "").toLowerCase();
    if (name === "cover" && attributes.content) metaCoverIds.push(attributes.content.trim());
  }
  // (a) <meta name="cover" content="ITEM_ID" />
  for (const id of metaCoverIds) {
    const match = items.find((item) => item.id === id) ?? items.find((item) => item.id.toLowerCase() === id.toLowerCase());
    if (match) return match;
  }
  // (b) manifest item whose id/href mentions "cover" and is an image
  const byName = items.find((item) => isImageItem(item) && /cover/i.test(`${item.id} ${item.href}`));
  if (byName) return byName;
  // (b') EPUB3 guide reference / properties="cover-image"
  const properties = items.find((item) => item.properties.includes("cover-image"));
  if (properties) return properties;
  // (c) first image item in the manifest
  return items.find((item) => isImageItem(item)) ?? null;
}

function parseEpub(buffer: Buffer): Partial<ParsedNovel> {
  const zip = new ZipArchive(buffer);

  let containerPath = CONTAINER_PATHS.find((path) => zip.find(path));
  if (!containerPath) containerPath = zip.names.find((name) => name.toLowerCase() === "meta-inf/container.xml");
  let opfPath = "";
  const containerXml = containerPath ? zip.readText(containerPath) : null;
  if (containerXml) {
    const rootfile = allTags(containerXml, "rootfile")
      .map((tag) => tagAttributes(tag))
      .find((attributes) => attributes["full-path"]);
    if (rootfile?.["full-path"]) opfPath = normalizeZipPath(rootfile["full-path"]);
  }
  if (!opfPath || !zip.find(opfPath)) {
    const fallback = zip.names.find((name) => name.toLowerCase().endsWith(".opf"));
    if (!fallback) throw new Error("EPUB 中未找到 OPF 文件。");
    opfPath = fallback;
  }

  const opf = zip.readText(opfPath);
  if (!opf) throw new Error("无法读取 EPUB 的 OPF 文件。");

  const metadataMatch = opf.match(/<(?:[A-Za-z0-9_.-]+:)?metadata\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_.-]+:)?metadata\s*>/i);
  const metadata = metadataMatch?.[1] ?? opf;

  const title = plainText(firstTagText(metadata, "title"), MAX_TITLE);
  const author = allTagTexts(metadata, "creator")
    .map((value) => plainText(value, MAX_AUTHOR))
    .filter(Boolean)
    .join(" / ");
  const description = plainText(firstTagText(metadata, "description"));
  const genre = plainText(firstTagText(metadata, "subject"), 60);

  const opfDirectory = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
  const items = parseManifest(opf);
  const coverItem = epubCoverItem(opf, items);

  let cover: ParsedNovelCover | null = null;
  const pushCover = (path: string, declaredMime?: string) => {
    if (cover) return;
    const data = zip.read(path);
    if (!data) return;
    const mime = imageMimeFromBytes(data) ?? (declaredMime?.startsWith("image/") ? declaredMime : mimeFromExtension(path));
    if (!mime) return;
    cover = { data, mime };
  };

  if (coverItem) pushCover(resolveRelative(opfDirectory, coverItem.href), coverItem.mediaType);
  // (d) last resort: first image file in the archive by extension
  if (!cover) {
    for (const entry of zip.imageEntries()) {
      const data = zip.readEntry(entry);
      if (!data) continue;
      const mime = imageMimeFromBytes(data) ?? mimeFromExtension(entry.name);
      if (!mime) continue;
      cover = { data, mime };
      break;
    }
  }

  return { title, author, description, genre: genre || FALLBACK_GENRE, cover };
}

/* -------------------------------------------------------------------------- */
/* MOBI / PalmDB                                                              */
/* -------------------------------------------------------------------------- */

type PdbRecord = { start: number; end: number };

function readPdbRecords(buffer: Buffer): { name: string; records: PdbRecord[] } {
  if (buffer.length < 86) throw new Error("PDB 文件过小。");
  const rawName = buffer.subarray(0, 32);
  const nameEnd = rawName.indexOf(0);
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
  const records: PdbRecord[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    if (start < 0 || start >= buffer.length || end <= start) continue;
    records.push({ start, end: Math.min(end, buffer.length) });
  }
  if (records.length === 0) throw new Error("PDB 记录偏移无效。");
  return { name, records };
}

type ExthRecord = { type: number; data: Buffer };

function parseExth(record0: Buffer, mobiMagicOffset: number): ExthRecord[] {
  // The MOBI header length is authoritative, but some writers disagree about
  // where it is measured from, so fall back to scanning record 0 for "EXTH".
  const records: ExthRecord[] = [];
  const windowStart = Math.max(0, mobiMagicOffset + 4);
  const index = record0.indexOf("EXTH", windowStart, "latin1");
  const scanStart = index >= 0 ? index : -1;
  if (scanStart < 0) return records;

  const totalLength = record0.readUInt32BE(scanStart + 4);
  const count = record0.readUInt32BE(scanStart + 8);
  if (count > 10000 || totalLength < 12 || totalLength > record0.length) return records;

  let cursor = scanStart + 12;
  const limit = Math.min(record0.length, scanStart + totalLength);
  for (let i = 0; i < count && cursor + 8 <= limit; i += 1) {
    const type = record0.readUInt32BE(cursor);
    const length = record0.readUInt32BE(cursor + 4);
    if (length < 8 || cursor + length > record0.length) break;
    records.push({ type, data: record0.subarray(cursor + 8, cursor + length) });
    cursor += length + ((4 - (length % 4)) % 4);
  }
  return records;
}

function exthText(records: ExthRecord[], type: number, encoding: string) {
  const record = records.find((item) => item.type === type);
  if (!record) return "";
  return record.data.toString(encoding === "latin1" ? "latin1" : "utf8").replace(/\u0000/g, "").trim();
}

function exthNumber(records: ExthRecord[], type: number) {
  const record = records.find((item) => item.type === type);
  if (!record || record.data.length < 4) return null;
  return record.data.readUInt32BE(0);
}

type MobiHeader = {
  mobiMagicOffset: number;
  textEncoding: string;
  firstImageIndexes: number[];
  records: PdbRecord[];
  recordCount: number;
  compression: number;
  pdbName: string;
  exth: ExthRecord[];
};

function readMobiHeader(buffer: Buffer, pdbName: string, records: PdbRecord[]): MobiHeader {
  const record0 = buffer.subarray(records[0].start, records[0].end);
  if (record0.length < 24) throw new Error("MOBI 记录 0 过小。");

  let mobiMagicOffset = -1;
  if (record0.length >= 20 && record0.toString("latin1", 16, 20) === "MOBI") mobiMagicOffset = 16;
  else {
    const found = record0.subarray(0, Math.min(record0.length, 128)).indexOf("MOBI", 0, "latin1");
    if (found >= 0) mobiMagicOffset = found;
  }
  if (mobiMagicOffset < 0) throw new Error("未找到 MOBI 头。");

  const compression = record0.readUInt16BE(0);
  const encodingFlag = mobiMagicOffset + 0x0c + 4 <= record0.length ? record0.readUInt32BE(mobiMagicOffset + 0x0c) : 65001;
  const textEncoding = encodingFlag === 1252 ? "latin1" : "utf8";

  // Standard MOBI layout puts `first image index` at MOBI+0x5C (record-0 0x6C).
  // Some tooling documents the same field as record-0 offset 0x5C, so accept
  // both (and the "no images" sentinel) as ordered candidates.
  const candidates: number[] = [];
  const push = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return;
    if (value < 0 || value > 0xfffffffe) return;
    if (!candidates.includes(value)) candidates.push(value);
  };
  push(mobiMagicOffset + 0x5c + 4 <= record0.length ? record0.readUInt32BE(mobiMagicOffset + 0x5c) : null);
  push(0x5c + 4 <= record0.length ? record0.readUInt32BE(0x5c) : null);
  push(mobiMagicOffset + 0x6c + 4 <= record0.length ? record0.readUInt32BE(mobiMagicOffset + 0x6c) : null);

  const exth = parseExth(record0, mobiMagicOffset);
  const usable = candidates.filter((value) => value >= 0 && value < records.length);

  return {
    mobiMagicOffset,
    textEncoding,
    firstImageIndexes: usable.length > 0 ? usable : [0],
    records,
    recordCount: records.length,
    compression,
    pdbName,
    exth,
  };
}

function mobiCover(buffer: Buffer, header: MobiHeader): ParsedNovelCover | null {
  const coverOffset = exthNumber(header.exth, 201);
  const thumbnailOffset = exthNumber(header.exth, 202);

  const ordered: number[] = [];
  const push = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || value >= header.records.length) return;
    if (!ordered.includes(value)) ordered.push(value);
  };

  for (const base of header.firstImageIndexes) {
    if (coverOffset !== null) push(base + coverOffset);
    if (thumbnailOffset !== null) push(base + thumbnailOffset);
    // "first record at/after firstImageIndex that starts with a valid image magic"
    for (let index = base; index < Math.min(header.records.length, base + 64); index += 1) push(index);
  }
  // Last resort: scan the image-ish tail of the file.
  for (let index = 1; index < Math.min(header.records.length, 4096); index += 1) push(index);

  for (const index of ordered) {
    const record = header.records[index];
    const data = buffer.subarray(record.start, record.end);
    const mime = imageMimeFromBytes(data);
    if (mime) return { data: Buffer.from(data), mime };
  }
  return null;
}

function parseMobi(buffer: Buffer, filename: string): Partial<ParsedNovel> {
  const { name, records } = readPdbRecords(buffer);
  const header = readMobiHeader(buffer, name, records);

  const author = plainText(exthText(header.exth, 100, header.textEncoding).replace(/\s*&\s*/g, " / "), MAX_AUTHOR);
  const exthTitle = plainText(exthText(header.exth, 503, header.textEncoding), MAX_TITLE);
  const title = exthTitle || plainText(header.pdbName, MAX_TITLE) || stem(filename);
  const description = plainText(exthText(header.exth, 103, header.textEncoding));

  return { title, author, description, genre: FALLBACK_GENRE, cover: mobiCover(buffer, header) };
}

/* -------------------------------------------------------------------------- */
/* entry point                                                                */
/* -------------------------------------------------------------------------- */

function looksLikeZip(buffer: Buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

function looksLikeMobi(buffer: Buffer) {
  if (buffer.length < 68) return false;
  const type = buffer.toString("latin1", 60, 64);
  const creator = buffer.toString("latin1", 64, 68);
  if (creator === "MOBI" || creator === "TPZ") return true;
  if (type === "TEXt" && creator === "REAd") return true;
  return buffer.subarray(0, Math.min(buffer.length, 4096)).indexOf("MOBI", 0, "latin1") >= 16;
}

function extensionOf(filename: string) {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function parseNovel(buffer: Buffer, filename: string): ParsedNovel {
  const fallback: ParsedNovel = { title: stem(filename), author: "", description: "", genre: FALLBACK_GENRE, cover: null };
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length < 8) return fallback;
    const extension = extensionOf(filename);

    const attempts: Array<() => Partial<ParsedNovel>> = [];
    if (looksLikeZip(buffer)) attempts.push(() => parseEpub(buffer));
    else if (looksLikeMobi(buffer)) attempts.push(() => parseMobi(buffer, filename));
    else if (extension === "epub") attempts.push(() => parseEpub(buffer));
    else if (extension === "mobi" || extension === "azw" || extension === "azw3" || extension === "prc") attempts.push(() => parseMobi(buffer, filename));
    else {
      attempts.push(() => parseMobi(buffer, filename), () => parseEpub(buffer));
    }

    let partial: Partial<ParsedNovel> | null = null;
    for (const attempt of attempts) {
      try {
        partial = attempt();
        break;
      } catch {
        partial = null;
      }
    }
    if (!partial) return fallback;

    const cover = partial.cover && partial.cover.data.length > 0 && partial.cover.mime ? partial.cover : null;
    return {
      title: cap(partial.title || fallback.title, MAX_TITLE) || fallback.title,
      author: cap(partial.author ?? "", MAX_AUTHOR),
      description: plainText(partial.description ?? "", MAX_DESCRIPTION),
      genre: cap(partial.genre || FALLBACK_GENRE, 60) || FALLBACK_GENRE,
      cover,
    };
  } catch {
    return fallback;
  }
}
