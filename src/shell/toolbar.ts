// Barra de herramientas bajo el menú: acciones más usadas como iconos con tooltip.
import type { ActionDef } from "./menubar";
import { h } from "../util";
import { icon, type IconName } from "../icons";

type Entry = [actionId: string, icon: IconName] | "sep" | "flex";

const LAYOUT: Entry[] = [
  ["file.new", "file-plus"],
  ["file.open", "folder"],
  ["file.save", "save"],
  "sep",
  ["edit.undo", "undo"],
  ["edit.redo", "redo"],
  "sep",
  ["edit.find", "search"],
  ["edit.replace", "replace"],
  "sep",
  ["fmt.heading", "heading"],
  ["fmt.bold", "bold"],
  ["fmt.italic", "italic"],
  ["fmt.strike", "strike"],
  ["fmt.code", "code"],
  "sep",
  ["fmt.bullet", "list-ul"],
  ["fmt.ordered", "list-ol"],
  ["fmt.task", "list-task"],
  ["fmt.quote", "quote"],
  "sep",
  ["fmt.link", "link"],
  ["fmt.image", "image"],
  ["fmt.table", "table"],
  ["fmt.codeBlock", "code-block"],
  ["fmt.rule", "rule"],
  "sep",
  ["fmt.math", "sigma"],
  ["fmt.mermaid", "diagram"],
  ["fmt.chart", "chart"],
  "flex",
  ["file.exportHtml", "download"],
  ["file.print", "printer"],
];

export interface Toolbar {
  root: HTMLElement;
  /** Recalcula habilitado/deshabilitado (cambio de pestaña, modo o estado de guardado). */
  refresh(): void;
  setVisible(visible: boolean): void;
}

export function createToolbar(getAction: (id: string) => ActionDef | undefined): Toolbar {
  const root = h("div", { class: "toolbar", role: "toolbar", ariaLabel: "Barra de herramientas" });
  const buttons: Array<[HTMLButtonElement, ActionDef]> = [];

  for (const entry of LAYOUT) {
    if (entry === "sep") {
      root.append(h("span", { class: "toolbar-sep", role: "separator" }));
      continue;
    }
    if (entry === "flex") {
      root.append(h("span", { class: "toolbar-flex" }));
      continue;
    }
    const [id, ic] = entry;
    const def = getAction(id);
    if (!def) continue;
    const tip = def.shortcut ? `${def.label.replace(/…$/, "")} (${def.shortcut})` : def.label.replace(/…$/, "");
    const btn = h("button", { class: "tb-btn", title: tip, ariaLabel: tip }, icon(ic, 17)) as HTMLButtonElement;
    // mousedown sin foco: el editor conserva la selección sobre la que actúa el botón.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      void def.run();
    });
    buttons.push([btn, def]);
    root.append(btn);
  }

  function refresh(): void {
    for (const [btn, def] of buttons) btn.disabled = !(def.enabled?.() ?? true);
  }

  function setVisible(visible: boolean): void {
    root.classList.toggle("toolbar-hidden", !visible);
  }

  refresh();
  return { root, refresh, setVisible };
}
