import type { AppCtx } from "./state";
import { h } from "../util";
import { icon } from "../icons";
import { basename } from "../util";

export type MenuItem =
  | { kind: "action"; id: string }
  | { kind: "submenu"; label: string; items: MenuItem[] }
  | { kind: "recents" }
  | { kind: "sep" };

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

export interface ActionDef {
  id: string;
  label: string;
  shortcut?: string;
  keywords?: string;
  checked?: () => boolean;
  enabled?: () => boolean;
  run: () => void | Promise<void>;
  palette?: boolean;
}

export interface Menubar {
  root: HTMLElement;
  render(): void;
  closeAll(): void;
}

interface OpenMenu {
  btn: HTMLElement;
  panel: HTMLElement;
}

export function createMenubar(
  ctx: AppCtx,
  menus: MenuDef[],
  getAction: (id: string) => ActionDef | undefined,
): Menubar {
  const root = h("nav", { class: "menubar", ariaLabel: "Barra de menú" });
  const buttons: HTMLElement[] = [];
  let open: OpenMenu | null = null;
  let submenu: OpenMenu | null = null;
  let submenuAnchor: HTMLElement | null = null;

  function closeSubmenu(): void {
    if (submenu) {
      submenu.panel.remove();
      submenu = null;
    }
    submenuAnchor = null;
  }

  function closeAll(focusBtn = false): void {
    closeSubmenu();
    if (open) {
      const btn = open.btn;
      open.panel.remove();
      open = null;
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("menubar-btn-open");
      if (focusBtn) (btn as HTMLButtonElement).focus();
    }
  }

  function place(panel: HTMLElement, anchor: HTMLElement, side: "below" | "right"): void {
    document.body.append(panel);
    const r = anchor.getBoundingClientRect();
    panel.style.visibility = "hidden";
    panel.style.left = "0px";
    panel.style.top = "0px";
    requestAnimationFrame(() => {
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      if (side === "below") {
        panel.style.left = `${Math.min(r.left, window.innerWidth - pw - 8)}px`;
        panel.style.top = `${Math.min(r.bottom + 6, window.innerHeight - ph - 8)}px`;
      } else {
        let left = r.right + 4;
        if (left + pw > window.innerWidth - 8) left = Math.max(8, r.left - pw - 4);
        panel.style.left = `${left}px`;
        panel.style.top = `${Math.min(r.top, window.innerHeight - ph - 8)}px`;
      }
      panel.style.visibility = "visible";
      panel.classList.add("menu-in");
    });
  }

  function runAction(def: ActionDef): void {
    closeAll();
    void def.run();
  }

  function itemEl(def: ActionDef, inSubmenu: boolean): HTMLElement {
    const isToggle = def.checked !== undefined;
    const enabled = def.enabled?.() ?? true;
    const el = h(
      "button",
      {
        class: `menu-item${enabled ? "" : " menu-item-disabled"}`,
        role: "menuitem",
        tabindex: -1,
      },
      h("span", { class: "menu-item-check" }, isToggle && def.checked?.() ? icon("check", 14) : ""),
      h("span", { class: "menu-item-label" }, def.label),
      def.shortcut ? h("span", { class: "menu-item-key" }, def.shortcut) : "",
    );
    // Al pasar por una opción normal del menú principal se cierra el submenú abierto.
    if (!inSubmenu) el.addEventListener("mouseenter", () => closeSubmenu());
    if (enabled) el.addEventListener("click", () => runAction(def));
    el.dataset.actionId = def.id;
    return el;
  }

  function buildItems(items: MenuItem[], panel: HTMLElement, inSubmenu: boolean): void {
    for (const it of items) {
      if (it.kind === "sep") {
        panel.append(h("div", { class: "menu-sep", role: "separator" }));
        continue;
      }
      if (it.kind === "action") {
        const def = getAction(it.id);
        if (def) panel.append(itemEl(def, inSubmenu));
        continue;
      }
      if (it.kind === "recents") {
        const recs = ctx.recents;
        if (!recs.length) {
          const el = h(
            "button",
            { class: "menu-item menu-item-disabled", role: "menuitem", tabindex: -1 },
            h("span", { class: "menu-item-check" }),
            h("span", { class: "menu-item-label" }, "Sin recientes"),
          );
          panel.append(el);
          continue;
        }
        for (const p of recs) {
          const el = h(
            "button",
            { class: "menu-item menu-item-recent", role: "menuitem", tabindex: -1, title: p },
            h("span", { class: "menu-item-check" }),
            icon("file", 13),
            h("span", { class: "menu-item-label" }, basename(p)),
          );
          el.addEventListener("click", () => {
            closeAll();
            void ctx.openPaths([p]);
          });
          panel.append(el);
        }
        continue;
      }
      if (it.kind === "submenu") {
        const el = h(
          "button",
          { class: "menu-item", role: "menuitem", tabindex: -1 },
          h("span", { class: "menu-item-check" }),
          h("span", { class: "menu-item-label" }, it.label),
          h("span", { class: "menu-item-arrow" }, icon("chevron-right", 13)),
        );
        const openSub = (): void => {
          if (submenu && submenuAnchor === el) return;
          closeSubmenu();
          submenuAnchor = el;
          const sub = h("div", { class: "menu menu-sub", role: "menu" });
          buildItems(it.items, sub, true);
          place(sub, el, "right");
          submenu = { btn: el, panel: sub };
        };
        el.addEventListener("mouseenter", openSub);
        el.addEventListener("click", () => {
          openSub();
          submenu?.panel.querySelector<HTMLElement>(".menu-item:not(.menu-item-disabled)")?.focus();
        });
        panel.append(el);
      }
    }
  }

  function openMenu(index: number): void {
    if (open) closeAll();
    const btn = buttons[index];
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("menubar-btn-open");
    const panel = h("div", { class: "menu", role: "menu" });
    buildItems(menus[index].items, panel, false);
    place(panel, btn, "below");
    open = { btn, panel };
    const first = panel.querySelector<HTMLElement>(".menu-item:not(.menu-item-disabled)");
    first?.focus();
  }

  function navPanel(panel: HTMLElement, dir: 1 | -1): HTMLElement | null {
    const items = Array.from(panel.querySelectorAll<HTMLElement>(".menu-item:not(.menu-item-disabled)"));
    if (!items.length) return null;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let nextIdx = idx + dir;
    if (nextIdx < 0) nextIdx = items.length - 1;
    if (nextIdx >= items.length) nextIdx = 0;
    const next = items[nextIdx] ?? items[0];
    next.focus();
    return next;
  }

  document.addEventListener("mousedown", (e) => {
    const t = e.target as HTMLElement;
    const inSub = !!submenu && submenu.panel.contains(t);
    if (open && !inSub && !open.panel.contains(t) && !open.btn.contains(t)) closeAll();
    else if (submenu && !inSub && !submenu.btn.contains(t)) closeSubmenu();
  });

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    const target = e.target as HTMLElement;
    const inSub = submenu && submenu.panel.contains(target);
    const activePanel = inSub ? submenu!.panel : open.panel;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        navPanel(activePanel, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        navPanel(activePanel, -1);
        break;
      case "ArrowRight":
        if (!inSub && submenuAnchor) {
          e.preventDefault();
          (submenuAnchor as HTMLButtonElement).focus();
        } else if (target.dataset.actionId === undefined && submenuAnchor) {
          e.preventDefault();
        }
        break;
      case "ArrowLeft":
        if (inSub) {
          e.preventDefault();
          closeSubmenu();
          submenuAnchor && (submenuAnchor as HTMLButtonElement).focus();
        } else {
          e.preventDefault();
          const idx = buttons.indexOf(open.btn);
          closeAll(true);
          const nextIdx = (idx - 1 + buttons.length) % buttons.length;
          openMenu(nextIdx);
        }
        break;
      case "Home":
        e.preventDefault();
        activePanel.querySelector<HTMLElement>(".menu-item:not(.menu-item-disabled)")?.focus();
        break;
      case "End": {
        e.preventDefault();
        const items = Array.from(activePanel.querySelectorAll<HTMLElement>(".menu-item:not(.menu-item-disabled)"));
        items[items.length - 1]?.focus();
        break;
      }
      case "Escape":
        e.preventDefault();
        if (inSub) {
          closeSubmenu();
          submenuAnchor && (submenuAnchor as HTMLButtonElement).focus();
        } else closeAll(true);
        break;
      case "Enter":
      case " ":
        if (target instanceof HTMLButtonElement && target.classList.contains("menu-item")) {
          e.preventDefault();
          target.click();
          if (submenu && submenuAnchor === target) {
            closeSubmenu();
          }
        }
        break;
      default:
        break;
    }
  });

  window.addEventListener("blur", () => closeAll());
  window.addEventListener("resize", () => closeAll());

  function render(): void {
    root.replaceChildren();
    buttons.length = 0;
    menus.forEach((menu, i) => {
      const btn = h("button", { class: "menubar-btn", role: "menuitem" }, menu.label);
      btn.addEventListener("click", () => {
        if (open && open.btn === btn) closeAll(true);
        else openMenu(i);
      });
      btn.addEventListener("mouseenter", () => {
        if (open && open.btn !== btn) openMenu(i);
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "Enter") {
          e.preventDefault();
          openMenu(i);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          openMenu((i + 1) % buttons.length);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          openMenu((i - 1 + buttons.length) % buttons.length);
        }
      });
      buttons.push(btn);
      root.append(btn);
    });
  }
  render();

  return { root, render, closeAll };
}