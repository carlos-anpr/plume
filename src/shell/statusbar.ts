import type { AppCtx, Tab } from "./state";
import { h } from "../util";
import { icon } from "../icons";

export interface DocStatsView {
  words: number;
  chars: number;
  readingMinutes: number;
}

export interface Statusbar {
  root: HTMLElement;
  render(stats: DocStatsView | null): void;
}

const ZOOM_PRESETS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

const ENCODINGS: Array<{ label: string; encoding: string; bom: boolean }> = [
  { label: "UTF-8", encoding: "UTF-8", bom: false },
  { label: "UTF-8 con BOM", encoding: "UTF-8", bom: true },
  { label: "Windows-1252", encoding: "windows-1252", bom: false },
  { label: "ISO-8859-15", encoding: "ISO-8859-15", bom: false },
  { label: "UTF-16LE", encoding: "UTF-16LE", bom: false },
];

export function createStatusbar(ctx: AppCtx): Statusbar {
  const root = h("footer", { class: "statusbar" });

  const cursorEl = h("span", { class: "sb-seg sb-cursor" }, "Ln 1, Col 1");
  const wordsEl = h("span", { class: "sb-seg" }, "0 palabras");
  const charsEl = h("span", { class: "sb-seg" }, "0 caracteres");
  const readEl = h("span", { class: "sb-seg sb-read" }, "—");
  const zoomEl = h("button", { class: "sb-seg sb-btn", title: "Zoom (Ctrl+rueda, Ctrl+0 para 100 %)" }, "100%");
  const eolEl = h("button", { class: "sb-seg sb-btn", title: "Fin de línea: cambiar LF/CRLF" }, "LF");
  const encEl = h("button", { class: "sb-seg sb-btn", title: "Codificación del fichero" }, "UTF-8");

  const left = h("div", { class: "sb-group" }, cursorEl, sbSep(), wordsEl, sbSep(), charsEl, sbSep(), readEl);
  const right = h("div", { class: "sb-group" }, zoomEl, eolEl, encEl);
  root.append(left, h("div", { class: "sb-flex" }), right);

  function sbSep(): HTMLElement {
    return h("span", { class: "sb-sep" }, "·");
  }

  zoomEl.addEventListener("click", () => openZoomMenu());
  eolEl.addEventListener("click", () => {
    const tab = ctx.activeTab;
    if (!tab) return;
    ctx.setEol(tab.eol === "LF" ? "CRLF" : "LF");
  });
  encEl.addEventListener("click", () => openEncodingMenu(ctx));

  const popup = h("div", { class: "menu menu-status", role: "menu" });
  let popupAnchor: HTMLElement | null = null;
  let popupCleanup: (() => void) | null = null;

  function closePopup(): void {
    popup.remove();
    popupCleanup?.();
    popupCleanup = null;
    popupAnchor = null;
  }

  /** Menú emergente encima de un botón de la barra de estado. Un segundo clic en el mismo botón lo cierra. */
  function openPopup(anchor: HTMLElement, items: Array<{ label: string; current: boolean; run: () => void }>): void {
    const sameAnchor = popupAnchor === anchor;
    closePopup();
    if (sameAnchor) return;
    popup.replaceChildren();
    for (const it of items) {
      const el = h(
        "button",
        { class: "menu-item", role: "menuitemradio", tabindex: -1 },
        h("span", { class: "menu-item-check" }, it.current ? icon("check", 14) : ""),
        h("span", { class: "menu-item-label" }, it.label),
      );
      el.setAttribute("aria-checked", String(it.current));
      el.addEventListener("click", () => {
        closePopup();
        it.run();
      });
      popup.append(el);
    }
    document.body.append(popup);
    const r = anchor.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right - 4);
    popup.style.right = `${right}px`;
    popup.style.bottom = `${window.innerHeight - r.top + 6}px`;
    popup.classList.add("menu-in");
    popupAnchor = anchor;
    (popup.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (!popup.contains(t) && !anchor.contains(t)) closePopup();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") closePopup();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const btns = Array.from(popup.querySelectorAll<HTMLElement>(".menu-item"));
        const i = btns.indexOf(document.activeElement as HTMLElement);
        const next = btns[(i + (e.key === "ArrowDown" ? 1 : btns.length - 1)) % btns.length];
        next?.focus();
      }
    };
    setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    popupCleanup = () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }

  function openZoomMenu(): void {
    const z = Math.round(ctx.settings.zoom * 100);
    openPopup(
      zoomEl,
      ZOOM_PRESETS.map((p) => ({ label: `${p} %`, current: p === z, run: () => ctx.setZoom(p / 100) })),
    );
  }

  function openEncodingMenu(c: AppCtx): void {
    const tab = c.activeTab as Tab | null;
    if (!tab) return;
    openPopup(
      encEl,
      ENCODINGS.map((enc) => ({
        label: enc.label,
        current: tab.encoding === enc.encoding && tab.hasBom === enc.bom,
        run: () => c.setEncoding(enc.encoding, enc.bom),
      })),
    );
  }

  function render(stats: DocStatsView | null): void {
    const tab = ctx.activeTab;
    if (!tab) {
      cursorEl.textContent = "—";
      wordsEl.textContent = "—";
      charsEl.textContent = "—";
      readEl.textContent = "—";
      zoomEl.textContent = "—";
      eolEl.textContent = "—";
      encEl.textContent = "—";
      return;
    }
    cursorEl.textContent = `Ln ${tab.cursor.line}, Col ${tab.cursor.col}`;
    if (stats) {
      wordsEl.textContent = `${stats.words.toLocaleString("es-ES")} palabras`;
      charsEl.textContent = `${stats.chars.toLocaleString("es-ES")} caracteres`;
      readEl.textContent = stats.words === 0 ? "—" : `${stats.readingMinutes} min de lectura`;
    }
    zoomEl.textContent = `${Math.round(ctx.settings.zoom * 100)}%`;
    eolEl.textContent = tab.eol;
    const encLabel = ENCODINGS.find((e) => e.encoding === tab.encoding && e.bom === tab.hasBom)?.label ?? tab.encoding;
    encEl.textContent = encLabel;
  }
  render(null);

  return { root, render };
}