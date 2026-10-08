/** Keep the displayed book title, but remove filesystem and HTTP header controls. */
export function novelDownloadName(title: string, format: string) {
  const extension = /(?:^|\.)(epub|mobi|azw3?)(?:$|[?#])/i.exec(format)?.[1]?.toLowerCase() ?? "epub";
  let stem = title.normalize("NFC").replace(/\.(epub|mobi|azw3?)$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
  if (!stem) stem = "未命名小说";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  const encoder = new TextEncoder();
  let safeStem = "";
  for (const character of stem) {
    if (encoder.encode(safeStem + character).length > 220) break;
    safeStem += character;
  }
  return `${safeStem.replace(/[. ]+$/g, "")}.${extension}`;
}

export function novelContentDisposition(title: string, format: string) {
  const name = novelDownloadName(title, format);
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const extension = name.slice(name.lastIndexOf("."));
  return `attachment; filename="novel${extension}"; filename*=UTF-8''${encoded}`;
}
