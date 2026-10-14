import { Idiomorph } from "idiomorph";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PreviewApi, RenderResult } from "../types";
import { RenderCache } from "./cache";
import { Charts, palette, prepareDiagrams } from "./diagrams";
import { DiagramViewer, expandButton } from "./viewer";
import { registerPrint } from "./print";
import "./preview.css";
import "./syntax-light.css";
import "./syntax-dark.css";

export function resolveDocumentPath(base: string, relative: string): string {
  const windows = /^[a-z]:[\\/]/i.test(base) || base.startsWith("\\\\");
  const path = relative.replace(/\\/g, "/");
  const prefix = windows ? base.replace(/\\/g, "/") : base;
  let joined =
    path.startsWith("/") || /^[a-z]:\//i.test(path)
      ? path
      : `${prefix}/${path}`;
  if (
    windows &&
    joined.startsWith("/") &&
    !joined.startsWith("//") &&
    /^[a-z]:/i.test(prefix)
  )
    joined = prefix.slice(0, 2) + joined;
  const rootDepth = joined.startsWith("//") ? 4 : 1;
  const parts: string[] = [];
  for (const part of joined.split("/")) {
    if (part === ".") continue;
    if (part === "..") {
      if (parts.length > rootDepth) parts.pop();
    } else parts.push(part);
  }
  return parts.join(windows ? "\\" : "/");
}
const sourceBlocks =
  ":is(h1,h2,h3,h4,h5,h6,p,pre,blockquote,li,table,tr,dl,dt,dd,div,section,hr)[data-sourcepos]";
function lineRange(el: HTMLElement): [number, number] {
  const match = el.dataset.sourcepos?.match(/^(\d+):\d+-(\d+):\d+$/);
  return match ? [Number(match[1]), Number(match[2])] : [1, 1];
}
function decorate(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("li").forEach((item) => {
    if (
      item.querySelector(
        ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
      )
    )
      item.classList.add("plume-task-item");
  });
  root.querySelectorAll<HTMLElement>("ul").forEach((list) => {
    if (
      Array.from(list.children).every((item) =>
        item.classList.contains("plume-task-item"),
      )
    )
      list.classList.add("plume-task-list");
  });
  root.querySelectorAll<HTMLElement>("pre.plume-code").forEach((pre) => {
    const toolbar = document.createElement("div");
    toolbar.className = "plume-code-toolbar";
    const label = document.createElement("span");
    label.textContent = pre.dataset.lang || "texto";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.dataset.copy = "true";
    copy.textContent = "Copiar";
    copy.setAttribute("aria-label", "Copiar código");
    toolbar.append(label, copy);
    pre.prepend(toolbar);
  });
  root
    .querySelectorAll<HTMLElement>(
      "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
    )
    .forEach((heading) => {
      const anchor = document.createElement("a");
      anchor.className = "plume-heading-anchor";
      anchor.href = `#${encodeURIComponent(heading.id)}`;
      anchor.textContent = "#";
      anchor.setAttribute("aria-label", "Enlace a este encabezado");
      heading.append(anchor);
    });
  root
    .querySelectorAll<HTMLElement>(".markdown-alert-title")
    .forEach((title) => {
      const names: Record<string, string> = {
        note: "Nota",
        tip: "Consejo",
        important: "Importante",
        warning: "Aviso",
        caution: "Precaución",
      };
      for (const [kind, label] of Object.entries(names))
        if (title.parentElement?.classList.contains(`markdown-alert-${kind}`))
          title.textContent = label;
      const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(icon.namespaceURI, "path");
      const warning =
        title.parentElement?.classList.contains("markdown-alert-warning") ||
        title.parentElement?.classList.contains("markdown-alert-caution");
      path.setAttribute(
        "d",
        warning
          ? "M12 3 2 21h20L12 3Zm0 6v5m0 3v1"
          : "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 7v7m0-10v1",
      );
      icon.append(path);
      title.querySelector("svg")?.remove();
      title.prepend(icon);
    });
}
export function createPreview(container: HTMLElement): PreviewApi {
  const root = document.createElement("article");
  root.className = "plume-preview";
  container.append(root);
  const cache = new RenderCache();
  const charts = new Charts();
  const viewer = new DiagramViewer();
  let printMode = false;
  let theme: "light" | "dark" =
    document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  let last: RenderResult | null = null;
  let baseDir: string | null = null;
  let generation = 0;
  let destroyed = false;
  let pending: Promise<void> = Promise.resolve();
  let scrollCallback: ((line: number) => void) | undefined;
  let blockCallback: ((line: number) => void) | undefined;
  let scrollFrame = 0;
  // Destino del último scroll hecho por scrollToLine: su evento no se reenvía al editor.
  let programmaticTop: number | null = null;
  const positions = () =>
    Array.from(root.querySelectorAll<HTMLElement>(sourceBlocks))
      .map((el) => {
        const [start, end] = lineRange(el);
        const rect = el.getBoundingClientRect();
        return {
          el,
          start,
          end,
          top:
            rect.top -
            container.getBoundingClientRect().top +
            container.scrollTop,
          height: rect.height,
        };
      })
      .filter((block) => block.height > 0);
  function scrollToLine(line: number, smooth = false): void {
    const blocks = positions();
    const block =
      blocks
        .filter((b) => b.start <= line)
        .sort((a, b) => b.start - a.start || a.end - b.end)[0] ?? blocks[0];
    if (!block) return;
    const fraction = Math.max(
      0,
      Math.min(
        1,
        (line - block.start) / Math.max(1, block.end - block.start + 1),
      ),
    );
    const top = Math.min(
      block.top + fraction * block.height,
      container.scrollHeight - container.clientHeight,
    );
    programmaticTop = smooth ? null : Math.max(0, top);
    container.scrollTo({
      top,
      behavior:
        smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "auto",
    });
  }
  function onScroll(): void {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const expected = programmaticTop;
      programmaticTop = null;
      if (expected !== null && Math.abs(container.scrollTop - expected) <= 1)
        return;
      const blocks = positions();
      const atTop =
        blocks
          .filter((b) => b.top <= container.scrollTop + 2)
          .sort((a, b) => b.top - a.top || a.end - b.end)[0] ?? blocks[0];
      if (atTop) {
        const fraction = Math.min(
          0.999,
          Math.max(
            0,
            (container.scrollTop - atTop.top) / Math.max(1, atTop.height),
          ),
        );
        scrollCallback?.(
          Math.min(
            atTop.end,
            atTop.start + Math.floor(fraction * (atTop.end - atTop.start + 1)),
          ),
        );
      }
    });
  }
  async function onClick(event: MouseEvent): Promise<void> {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const expand = target.closest<HTMLButtonElement>("button[data-expand]");
    if (expand) {
      const card = expand.closest<HTMLElement>(".plume-diagram");
      if (card) viewer.open(card, expand);
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-copy]");
    if (button) {
      const code =
        button.closest("pre")?.querySelector("code")?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copiado";
      } catch {
        button.textContent = "No se pudo copiar";
      }
      return;
    }
    const block = target.closest<HTMLElement>(sourceBlocks);
    if (block) blockCallback?.(lineRange(block)[0]);
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      let id: string;
      try {
        id = decodeURIComponent(href.slice(1));
      } catch {
        return;
      }
      const heading = Array.from(
        root.querySelectorAll<HTMLElement>("[id]"),
      ).find((el) => el.id === id);
      if (heading)
        container.scrollTo({
          top:
            heading.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop,
          behavior: "auto",
        });
    } else if (/^https?:\/\//i.test(href)) {
      try {
        await openUrl(href);
      } catch {
        anchor.title = "No se pudo abrir el enlace";
      }
    } else if (
      /\.(md|markdown|mdx)(?:[?#].*)?$/i.test(href) &&
      !/^[a-z][a-z\d+.-]*:/i.test(href.replace(/^[a-z]:[\\/]/i, "")) &&
      baseDir
    ) {
      try {
        const path = resolveDocumentPath(
          baseDir,
          decodeURIComponent(href.split(/[?#]/)[0]),
        );
        container.dispatchEvent(
          new CustomEvent("plume:open-path", { detail: path, bubbles: true }),
        );
      } catch {
        anchor.title = "Ruta de archivo no válida";
      }
    }
  }
  const clickListener = (event: MouseEvent) => {
    void onClick(event);
  };
  container.addEventListener("scroll", onScroll, { passive: true });
  root.addEventListener("click", clickListener);
  function update(
    result: RenderResult,
    directory: string | null,
  ): Promise<void> {
    if (destroyed) return Promise.resolve();
    last = result;
    baseDir = directory;
    const revision = ++generation;
    const task = async () => {
      if (destroyed || revision !== generation) return;
      const next = document.createElement("article");
      next.className = root.className;
      next.innerHTML = result.html;
      if (directory)
        next.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
          const src = image.getAttribute("src") ?? "";
          if (src && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(src)) {
            try {
              image.src = convertFileSrc(
                resolveDocumentPath(
                  directory,
                  decodeURIComponent(src.split(/[?#]/)[0]),
                ),
              );
            } catch {
              image.alt ||= "Ruta de imagen no válida";
            }
          }
        });
      decorate(next);
      const tokens = palette(container, printMode ? "light" : theme);
      next.style.position = "fixed";
      next.style.left = "-100000px";
      next.style.top = "0";
      next.style.visibility = "hidden";
      next.style.width = `${root.getBoundingClientRect().width || container.clientWidth}px`;
      next.setAttribute("aria-hidden", "true");
      container.append(next);
      try {
        await prepareDiagrams(next, tokens, cache);
      } finally {
        next.remove();
        next.removeAttribute("style");
        next.removeAttribute("aria-hidden");
      }
      if (destroyed || revision !== generation) return;
      const scroll = container.scrollTop;
      await Idiomorph.morph(root, next, {
        morphStyle: "innerHTML",
        callbacks: {
          beforeNodeMorphed(old, incoming) {
            if (
              old instanceof HTMLElement &&
              incoming instanceof HTMLElement &&
              old.dataset.renderKey &&
              old.dataset.renderKey === incoming.dataset.renderKey
            ) {
              if (incoming.dataset.sourcepos)
                old.dataset.sourcepos = incoming.dataset.sourcepos;
              return false;
            }
            if (old instanceof HTMLElement && old.dataset.renderKey)
              charts.remove(old);
            return true;
          },
          beforeNodeRemoved(old) {
            charts.remove(old);
            return true;
          },
        },
      });
      container.scrollTop = scroll;
      await charts.render(
        root,
        tokens,
        () => !destroyed && revision === generation,
      );
      if (!destroyed && revision === generation)
        root
          .querySelectorAll<HTMLElement>(
            "pre.plume-diagram:not(.plume-render-error)",
          )
          .forEach((card) => {
            if (!card.querySelector(":scope > .plume-expand-button"))
              card.append(expandButton());
          });
    };
    pending = pending.then(task, task);
    return pending;
  }
  let resizeTimer = 0;
  let lastWidth = Math.round(container.getBoundingClientRect().width);
  const resize = new ResizeObserver(() => {
    const width = Math.round(container.getBoundingClientRect().width);
    if (!width || width === lastWidth) return;
    lastWidth = width;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (last && !destroyed) void update(last, baseDir).catch(() => undefined);
    }, 120);
  });
  resize.observe(container);
  const unregisterPrint = registerPrint({
    active: () => !destroyed && root.isConnected,
    async prepare() {
      viewer.close();
      printMode = true;
      root.classList.add("plume-print-preparing");
      if (last) await update(last, baseDir);
    },
    async restore() {
      printMode = false;
      root.classList.remove("plume-print-preparing");
      if (last && !destroyed) await update(last, baseDir);
    },
  });
  return {
    update,
    scrollToLine,
    onScrollLine(cb) {
      scrollCallback = cb;
    },
    onBlockClick(cb) {
      blockCallback = cb;
    },
    setTheme(next) {
      if (theme === next) return;
      viewer.close();
      theme = next;
      if (last) void update(last, baseDir).catch(() => undefined);
    },
    async exportHtml(title) {
      await pending;
      const { exportDocument } = await import("./export");
      return exportDocument(root, title, theme, cache);
    },
    destroy() {
      destroyed = true;
      ++generation;
      cancelAnimationFrame(scrollFrame);
      container.removeEventListener("scroll", onScroll);
      root.removeEventListener("click", clickListener);
      clearTimeout(resizeTimer);
      resize.disconnect();
      unregisterPrint();
      viewer.close();
      charts.destroy();
      cache.clear();
      root.remove();
    },
  };
}
