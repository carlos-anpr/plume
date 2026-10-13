import type { AppCtx, Tab } from "./state";
import { h } from "../util";
import { icon } from "../icons";
import { inTauri } from "./tauri-env";

export interface Titlebar {
  root: HTMLElement;
  render(): void;
}

export function createTitlebar(ctx: AppCtx): Titlebar {
  const root = h("header", { class: "titlebar" });
  const strip = h("div", { class: "tabs-strip", role: "tablist" });
  const plusBtn = h(
    "button",
    { class: "tab-plus", title: "Nueva pestaña (Ctrl+N)", ariaLabel: "Nueva pestaña" },
    icon("plus", 14),
  );
  const dragSpace = h("div", { class: "drag-space" });
  dragSpace.dataset.tauriDragRegion = "";
  const glyph = h("span", { class: "app-glyph" }, icon("feather", 16));
  root.dataset.tauriDragRegion = "";

  const controls = h("div", { class: "win-controls" });
  let maxIconWrap: HTMLElement | null = null;
  if (inTauri) {
    const minBtn = h("button", { class: "win-btn", ariaLabel: "Minimizar" }, icon("minus", 11));
    const maxBtn = h("button", { class: "win-btn", ariaLabel: "Maximizar" });
    maxIconWrap = h("span", {}, icon("maximize", 10));
    maxBtn.append(maxIconWrap);
    const closeBtn = h("button", { class: "win-btn win-close", ariaLabel: "Cerrar" }, icon("x", 11));
    minBtn.addEventListener("click", () => {
      void import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().minimize()).catch(() => {});
    });
    maxBtn.addEventListener("click", () => {
      void import("@tauri-apps/api/window")
        .then((m) => m.getCurrentWindow().toggleMaximize())
        .then(() => syncMaxIcon())
        .catch(() => {});
    });
    closeBtn.addEventListener("click", () => {
      void import("@tauri-apps/api/window")
        .then((m) => m.getCurrentWindow().close())
        .catch(() => {});
    });
    controls.append(minBtn, maxBtn, closeBtn);
  }

  let isMax = false;
  async function syncMaxIcon(): Promise<void> {
    if (!inTauri || !maxIconWrap) return;
    try {
      const m = await import("@tauri-apps/api/window");
      isMax = await m.getCurrentWindow().isMaximized();
      maxIconWrap.replaceChildren(icon(isMax ? "restore" : "maximize", 10));
    } catch {
      /* webview sin permisos */
    }
  }
  window.addEventListener("resize", () => void syncMaxIcon());

  root.addEventListener("dblclick", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-tauri-drag-region]") === root && inTauri) {
      void import("@tauri-apps/api/window")
        .then((m) => m.getCurrentWindow().toggleMaximize())
        .then(() => syncMaxIcon())
        .catch(() => {});
    }
  });

  plusBtn.addEventListener("click", () => ctx.newTab());

  function renderTab(tab: Tab): HTMLElement {
    const active = ctx.activeTab?.id === tab.id;
    const el = h(
      "div",
      {
        class: `tab${active ? " tab-active" : ""}${ctx.isDirty(tab.id) ? " tab-dirty" : ""}`,
        role: "tab",
        dataset: { id: tab.id },
        title: tab.path ?? tab.name,
      },
      h("span", { class: "tab-icon" }, icon(tab.previewable ? "file-text" : "file", 13)),
      h("span", { class: "tab-name" }, tab.name),
      h("span", { class: "tab-dot" }),
    );
    el.dataset.tauriDragRegion = "no";
    const closeBtn = h(
      "button",
      { class: "tab-close", title: "Cerrar pestaña (Ctrl+W)", ariaLabel: `Cerrar ${tab.name}` },
      icon("x", 11),
    );
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.requestCloseTab(tab.id);
    });
    el.append(closeBtn);
    el.addEventListener("click", () => ctx.activateTab(tab.id));
    el.addEventListener("auxclick", (e) => {
      if ((e as MouseEvent).button === 1) {
        e.preventDefault();
        ctx.requestCloseTab(tab.id);
      }
    });
    return el;
  }

  function render(): void {
    strip.replaceChildren();
    for (const tab of ctx.tabs) strip.append(renderTab(tab));
    root.replaceChildren(glyph, strip, plusBtn, dragSpace, controls);
  }
  render();

  return { root, render };
}