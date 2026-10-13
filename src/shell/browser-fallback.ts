import type { Heading, RenderResult } from "../types";
import { inTauri } from "./tauri-env";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function headingId(text: string, used: Set<string>): string {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "seccion";
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

export function needsFallback(): boolean {
  return !inTauri;
}

export function renderMarkdownFallback(source: string): RenderResult {
  const used = new Set<string>();
  const toc: Heading[] = [];
  const out: string[] = [];
  const lines = source.split("\n");
  let inCode = false;
  let line = 1;
  for (const raw of lines) {
    if (raw.startsWith("```")) {
      inCode = !inCode;
      out.push(inCode ? `<pre class="plume-code" data-sourcepos="L${line}:C1-L${line}:C3"><code>` : "</code></pre>");
      line++;
      continue;
    }
    if (inCode) {
      out.push(esc(raw));
      line++;
      continue;
    }
    if (raw.startsWith("> ")) {
      out.push(`<blockquote data-sourcepos="L${line}:C1-L${line}:C${raw.length + 1}">${inline(raw.slice(2))}</blockquote>`);
      line++;
      continue;
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const id = headingId(text, used);
      toc.push({ level, text, id, line });
      out.push(`<h${level} id="${id}" data-sourcepos="L${line}:C1-L${line}:C${raw.length + 1}">${esc(text)}</h${level}>`);
      line++;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(raw)) {
      out.push(`<li data-sourcepos="L${line}:C1-L${line}:C${raw.length + 1}">${inline(raw.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      line++;
      continue;
    }
    if (raw.trim() === "") {
      out.push("");
      line++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(raw.trim())) {
      out.push("<hr/>");
      line++;
      continue;
    }
    out.push(`<p data-sourcepos="L${line}:C1-L${line}:C${raw.length + 1}">${inline(raw)}</p>`);
    line++;
  }
  const text = source;
  const words = text.match(/[\p{L}\p{N}'’-]+/gu)?.length ?? 0;
  return {
    html: out.join("\n"),
    toc,
    stats: {
      words,
      chars: text.length,
      lines: lines.length,
      reading_minutes: words === 0 ? 0 : Math.max(1, Math.round(words / 220)),
    },
    front_matter: null,
  };
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}