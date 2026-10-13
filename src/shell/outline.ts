import type { Heading } from "../types";
import { h } from "../util";
import { icon } from "../icons";

export interface Outline {
  root: HTMLElement;
  render(toc: Heading[], activeLine: number | null): void;
}

export function createOutline(onJump: (line: number) => void): Outline {
  const root = h("aside", { class: "outline-panel", ariaLabel: "Esquema del documento" });
  const head = h(
    "div",
    { class: "outline-head" },
    h("span", { class: "outline-title" }, icon("hash", 14), "Esquema"),
  );
  const list = h("div", { class: "outline-list" });
  root.append(head, list);

  function render(toc: Heading[], activeLine: number | null): void {
    list.replaceChildren();
    if (!toc.length) {
      list.append(h("div", { class: "outline-empty" }, "Sin encabezados en este documento"));
      return;
    }
    let activeIdx = -1;
    for (let i = 0; i < toc.length; i++) {
      if (activeLine !== null && toc[i].line <= activeLine) activeIdx = i;
    }
    toc.forEach((hd, i) => {
      const el = h(
        "button",
        {
          class: `outline-item outline-l${hd.level}${i === activeIdx ? " outline-active" : ""}`,
          tabindex: -1,
          title: hd.text,
          dataset: { line: String(hd.line) },
        },
        hd.text,
      );
      el.addEventListener("click", () => onJump(hd.line));
      list.append(el);
    });
    const activeEl = list.children[activeIdx] as HTMLElement | undefined;
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }
  render([], null);

  return { root, render };
}