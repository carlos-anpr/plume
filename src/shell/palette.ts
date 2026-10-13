import { fuzzyMatch, highlightText, h } from "../util";
import { icon } from "../icons";

export interface PaletteItem {
  id: string;
  label: string;
  category?: string;
  hint?: string;
  keywords?: string;
  run: () => void | Promise<void>;
}

interface Scored {
  item: PaletteItem;
  score: number;
  positions: number[];
}

const MAX_RESULTS = 60;

export function openPalette(items: PaletteItem[]): void {
  document.querySelector(".palette-overlay")?.remove();
  const overlay = h("div", { class: "palette-overlay" });
  const panel = h("div", { class: "palette", role: "dialog", ariaLabel: "Paleta de comandos" });
  const input = h("input", { class: "palette-input" }) as HTMLInputElement;
  input.type = "text";
  input.placeholder = "Escribe un comando…";
  const listBox = h("div", { class: "palette-list", role: "listbox" });
  const foot = h(
    "div",
    { class: "palette-foot" },
    h("span", {}, "↑↓ navegar"),
    h("span", {}, "↵ ejecutar"),
    h("span", {}, "esc cerrar"),
  );
  const searchIcon = h("span", { class: "palette-search-ic" }, icon("search", 16));
  const inputWrap = h("div", { class: "palette-input-wrap" }, searchIcon, input);
  panel.append(inputWrap, listBox, foot);
  overlay.append(panel);
  document.body.append(overlay);
  overlay.classList.add("overlay-in");

  let results: Scored[] = [];
  let selected = 0;

  function close(): void {
    overlay.classList.remove("overlay-in");
    overlay.remove();
    document.removeEventListener("keydown", globalKeys, true);
  }

  function filter(): void {
    const q = input.value;
    results = [];
    if (!q.trim()) {
      results = items.slice(0, MAX_RESULTS).map((item) => ({ item, score: 0, positions: [] }));
    } else {
      const scored: Scored[] = [];
      for (const item of items) {
        const m = fuzzyMatch(q, item.label);
        const mk = item.keywords ? fuzzyMatch(q, item.keywords) : null;
        const best = m && mk ? (m.score >= mk.score ? m : mk) : (m ?? mk);
        if (best) scored.push({ item, score: best.score, positions: m && (!mk || m.score >= mk.score) ? m.positions : (mk?.positions ?? []) });
      }
      scored.sort((a, b) => b.score - a.score);
      results = scored.slice(0, MAX_RESULTS);
    }
    selected = 0;
    listBox.replaceChildren();
    if (!results.length) {
      listBox.append(h("div", { class: "palette-empty" }, "Ningún comando coincide"));
      return;
    }
    results.forEach((r, i) => {
      const row = h(
        "button",
        { class: `palette-item${i === 0 ? " palette-selected" : ""}`, role: "option" },
        h("span", { class: "palette-item-label" }, highlightText(r.item.label, r.positions)),
        h("span", { class: "palette-item-meta" }, r.item.category ?? ""),
        r.item.hint ? h("kbd", { class: "palette-hint" }, r.item.hint) : "",
      );
      row.addEventListener("click", () => {
        close();
        void r.item.run();
      });
      row.addEventListener("mousemove", () => {
        if (selected !== i) {
          select(i);
        }
      });
      listBox.append(row);
    });
  }

  function select(i: number): void {
    selected = i;
    const rows = listBox.querySelectorAll(".palette-item");
    rows.forEach((r) => r.classList.remove("palette-selected"));
    rows[i]?.classList.add("palette-selected");
    rows[i]?.scrollIntoView({ block: "nearest" });
  }

  function run(): void {
    const r = results[selected];
    if (!r) return;
    close();
    void r.item.run();
  }

  input.addEventListener("input", filter);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) select((selected + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) select((selected - 1 + results.length) % results.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      if (results.length) select(0);
    } else if (e.key === "End") {
      e.preventDefault();
      if (results.length) select(results.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run();
    }
  });
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });

  function globalKeys(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }
  document.addEventListener("keydown", globalKeys, true);

  filter();
  input.focus();
}