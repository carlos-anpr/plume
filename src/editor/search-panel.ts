import type { ViewUpdate } from "@codemirror/view";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import type { Panel } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import type { SearchQuery as SQ } from "@codemirror/search";
import { icon } from "../icons";

let replaceWanted = false;

export function wantReplace(value: boolean): void {
  replaceWanted = value;
}

const COUNTER_TIMEOUT = 130;
const MAX_MATCHES = 20000;

export function plumeSearchPanel(view: EditorView): Panel {
  const root = document.createElement("div");
  root.className = "cm-panel plume-search";

  const findRow = document.createElement("div");
  findRow.className = "psp-row";

  const findInput = document.createElement("input");
  findInput.className = "psp-input";
  findInput.type = "text";
  findInput.placeholder = "Buscar";
  findInput.setAttribute("main-field", "true");
  findInput.spellcheck = false;

  const counter = document.createElement("span");
  counter.className = "psp-counter";

  const prevBtn = document.createElement("button");
  prevBtn.className = "psp-btn";
  prevBtn.title = "Anterior (Mayús+Intro)";
  prevBtn.setAttribute("aria-label", "Buscar anterior");
  prevBtn.append(icon("chevron-up", 13));

  const nextBtn = document.createElement("button");
  nextBtn.className = "psp-btn";
  nextBtn.title = "Siguiente (Intro)";
  nextBtn.setAttribute("aria-label", "Buscar siguiente");
  nextBtn.append(icon("chevron-down", 13));

  const caseBtn = document.createElement("button");
  caseBtn.className = "psp-toggle";
  caseBtn.textContent = "Aa";
  caseBtn.title = "Coincidir mayúsculas y minúsculas";
  caseBtn.setAttribute("aria-pressed", "false");

  const reBtn = document.createElement("button");
  reBtn.className = "psp-toggle";
  reBtn.textContent = ".*";
  reBtn.title = "Expresión regular";
  reBtn.setAttribute("aria-pressed", "false");

  const wordBtn = document.createElement("button");
  wordBtn.className = "psp-toggle";
  wordBtn.textContent = "ab";
  wordBtn.title = "Palabra completa";
  wordBtn.setAttribute("aria-pressed", "false");

  const repToggle = document.createElement("button");
  repToggle.className = "psp-btn";
  repToggle.title = "Alternar reemplazo";
  repToggle.setAttribute("aria-label", "Alternar reemplazo");
  repToggle.setAttribute("aria-expanded", "false");
  repToggle.append(icon("swap", 13));

  const closeBtn = document.createElement("button");
  closeBtn.className = "psp-btn";
  closeBtn.title = "Cerrar (Esc)";
  closeBtn.setAttribute("aria-label", "Cerrar la búsqueda");
  closeBtn.append(icon("x", 12));

  findRow.append(findInput, counter, prevBtn, nextBtn, caseBtn, reBtn, wordBtn, repToggle, closeBtn);

  const replaceRow = document.createElement("div");
  replaceRow.className = "psp-row psp-replace-row";

  const replaceInput = document.createElement("input");
  replaceInput.className = "psp-input";
  replaceInput.type = "text";
  replaceInput.placeholder = "Reemplazar con";
  replaceInput.spellcheck = false;

  const repOneBtn = document.createElement("button");
  repOneBtn.className = "psp-btn psp-btn-label";
  repOneBtn.textContent = "Reemplazar";
  repOneBtn.title = "Reemplazar la coincidencia actual";

  const repAllBtn = document.createElement("button");
  repAllBtn.className = "psp-btn psp-btn-label";
  repAllBtn.textContent = "Todo";
  repAllBtn.title = "Reemplazar todas las coincidencias";

  replaceRow.append(replaceInput, repOneBtn, repAllBtn);

  root.append(findRow, replaceRow);

  let counterTimer: ReturnType<typeof setTimeout> | null = null;
  let lastQuery: SQ | null = null;

  function pressed(btn: HTMLButtonElement): boolean {
    return btn.getAttribute("aria-pressed") === "true";
  }

  function pushQuery(focusFind = false): void {
    const q = new SearchQuery({
      search: findInput.value,
      replace: replaceInput.value,
      caseSensitive: pressed(caseBtn),
      regexp: pressed(reBtn),
      wholeWord: pressed(wordBtn),
    });
    view.dispatch({ effects: setSearchQuery.of(q) });
    scheduleCounter();
    if (focusFind) findInput.focus();
  }

  function scheduleCounter(): void {
    if (counterTimer !== null) clearTimeout(counterTimer);
    counterTimer = setTimeout(() => {
      counterTimer = null;
      updateCounter();
    }, COUNTER_TIMEOUT);
  }

  function updateCounter(): void {
    const q = getSearchQuery(view.state);
    findInput.classList.toggle("psp-invalid", q.search !== "" && !q.valid);
    if (!q.search || !q.valid) {
      counter.textContent = q.search && !q.valid ? "Expresión no válida" : "";
      counter.classList.remove("psp-none");
      return;
    }
    const sel = view.state.selection.main;
    let total = 0;
    let before = 0;
    const cursor = q.getCursor(view.state) as unknown as Iterable<{ from: number; to: number }>;
    for (const m of cursor) {
      total++;
      if (m.to <= sel.from) before = total;
      if (total >= MAX_MATCHES) break;
    }
    if (total >= MAX_MATCHES) {
      counter.textContent = `${total}+ coincidencias`;
      counter.classList.remove("psp-none");
      return;
    }
    counter.textContent = total === 0 ? "Sin resultados" : `${Math.min(before + 1, total)} de ${total}`;
    counter.classList.toggle("psp-none", total === 0);
  }

  function showReplaceRow(show: boolean, focusReplace = true): void {
    replaceRow.classList.toggle("psp-hidden", !show);
    repToggle.setAttribute("aria-expanded", String(show));
    if (show && focusReplace) replaceInput.focus();
  }

  function syncFromQuery(fresh: SQ): void {
    if (document.activeElement !== findInput) findInput.value = fresh.search;
    if (document.activeElement !== replaceInput) replaceInput.value = fresh.replace;
    caseBtn.setAttribute("aria-pressed", String(fresh.caseSensitive));
    reBtn.setAttribute("aria-pressed", String(fresh.regexp));
    wordBtn.setAttribute("aria-pressed", String(fresh.wholeWord));
  }

  function close(): void {
    closeSearchPanel(view);
    view.focus();
  }

  findInput.addEventListener("input", () => pushQuery());
  replaceInput.addEventListener("input", () => pushQuery());

  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e as KeyboardEvent).ctrlKey) {
      e.preventDefault();
      pushQuery();
      replaceAll(view);
    } else if (e.key === "Enter") {
      e.preventDefault();
      (e as KeyboardEvent).shiftKey ? findPrevious(view) : findNext(view);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      findNext(view);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      findPrevious(view);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (!replaceRow.classList.contains("psp-hidden")) {
        replaceInput.focus();
      } else {
        showReplaceRow(true);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  replaceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pushQuery();
      replaceNext(view);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      findInput.focus();
      findInput.select();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  prevBtn.addEventListener("click", () => {
    view.focus();
    findPrevious(view);
  });
  nextBtn.addEventListener("click", () => {
    view.focus();
    findNext(view);
  });
  caseBtn.addEventListener("click", () => {
    caseBtn.setAttribute("aria-pressed", String(!pressed(caseBtn)));
    pushQuery(true);
  });
  reBtn.addEventListener("click", () => {
    reBtn.setAttribute("aria-pressed", String(!pressed(reBtn)));
    pushQuery(true);
  });
  wordBtn.addEventListener("click", () => {
    wordBtn.setAttribute("aria-pressed", String(!pressed(wordBtn)));
    pushQuery(true);
  });
  repToggle.addEventListener("click", () => {
    showReplaceRow(replaceRow.classList.contains("psp-hidden"));
  });
  repOneBtn.addEventListener("click", () => {
    pushQuery();
    replaceNext(view);
  });
  repAllBtn.addEventListener("click", () => {
    pushQuery();
    replaceAll(view);
  });
  closeBtn.addEventListener("click", close);

  // Como Notepad: Ctrl+H muestra el reemplazo pero el foco va a "Buscar".
  root.addEventListener("plume:show-replace", () => {
    showReplaceRow(true, false);
    findInput.focus();
    findInput.select();
  });
  root.addEventListener("keydown", (e) => {
    if (runScopeHandlers(view, e, "search-panel")) {
      e.preventDefault();
    }
  });

  const q = getSearchQuery(view.state);
  syncFromQuery(q);
  showReplaceRow(replaceWanted, false);
  replaceWanted = false;
  updateCounter();

  return {
    dom: root,
    top: true,
    update(update: ViewUpdate) {
      const q = getSearchQuery(update.state);
      const queryChanged = !q.eq(lastQuery ?? q);
      lastQuery = q;
      if (queryChanged) {
        syncFromQuery(q);
        if (update.selectionSet) updateCounter();
        else scheduleCounter();
      } else if (update.docChanged || update.selectionSet) {
        scheduleCounter();
      }
    },
    destroy() {
      if (counterTimer !== null) clearTimeout(counterTimer);
    },
  };
}

export const searchCloseKeymap = keymap.of([
  {
    key: "Escape",
    run: (view: EditorView) => {
      closeSearchPanel(view);
      view.focus();
      return true;
    },
  },
]);