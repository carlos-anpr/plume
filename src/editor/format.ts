// Comandos de formato Markdown para la barra de herramientas, el menú Formato y los atajos.
import { EditorSelection, type ChangeSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Envuelve (o desenvuelve) cada selección con `mark`. Sin selección inserta `placeholder` seleccionado. */
export function toggleWrap(view: EditorView, mark: string, placeholder = "texto"): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const before = state.sliceDoc(range.from - mark.length, range.from);
    const after = state.sliceDoc(range.to, range.to + mark.length);
    if (before === mark && after === mark) {
      return {
        changes: [
          { from: range.from - mark.length, to: range.from },
          { from: range.to, to: range.to + mark.length },
        ],
        range: EditorSelection.range(range.from - mark.length, range.to - mark.length),
      };
    }
    const text = range.empty ? placeholder : state.sliceDoc(range.from, range.to);
    if (text.length > 2 * mark.length && text.startsWith(mark) && text.endsWith(mark)) {
      const inner = text.slice(mark.length, -mark.length);
      return {
        changes: { from: range.from, to: range.to, insert: inner },
        range: EditorSelection.range(range.from, range.from + inner.length),
      };
    }
    return {
      changes: { from: range.from, to: range.to, insert: mark + text + mark },
      range: EditorSelection.range(range.from + mark.length, range.from + mark.length + text.length),
    };
  });
  view.dispatch(tr, { scrollIntoView: true, userEvent: "input.format" });
  return true;
}

function selectedLines(view: EditorView): number[] {
  const { state } = view;
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let l = a; l <= b; l++) lines.add(l);
  }
  return [...lines].sort((x, y) => x - y);
}

/** Encabezado cíclico: texto → # → ## → ### → texto. */
export function cycleHeading(view: EditorView): boolean {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  for (const n of selectedLines(view)) {
    const line = state.doc.line(n);
    const m = /^(#{1,6})\s+/.exec(line.text);
    const level = m ? m[1].length : 0;
    const next = level >= 3 ? "" : "#".repeat(level + 1) + " ";
    changes.push({ from: line.from, to: line.from + (m ? m[0].length : 0), insert: next });
  }
  view.dispatch({ changes, scrollIntoView: true, userEvent: "input.format" });
  return true;
}

const LIST_RE = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/;

/** Pone o quita un prefijo de línea (lista, numerada, tareas, cita). Sustituye otro prefijo de lista si lo hay. */
export function toggleLinePrefix(view: EditorView, kind: "bullet" | "ordered" | "task" | "quote"): boolean {
  const { state } = view;
  const lines = selectedLines(view).map((n) => state.doc.line(n));
  const prefixOf = (i: number): string =>
    kind === "bullet" ? "- " : kind === "ordered" ? `${i + 1}. ` : kind === "task" ? "- [ ] " : "> ";
  const has = (text: string): boolean => {
    const m = LIST_RE.exec(text);
    if (!m) return false;
    const p = m[0].slice(m[1].length);
    if (kind === "quote") return p.startsWith(">");
    if (kind === "task") return /^[-*+]\s+\[[ xX]\]/.test(p);
    if (kind === "ordered") return /^\d/.test(p);
    return /^[-*+]\s+(?!\[[ xX]\])/.test(p);
  };
  const allHave = lines.filter((l) => l.text.trim()).every((l) => has(l.text));
  const changes: ChangeSpec[] = [];
  let i = 0;
  for (const line of lines) {
    if (!line.text.trim() && lines.length > 1) continue;
    const m = LIST_RE.exec(line.text);
    const indent = m ? m[1].length : (/^\s*/.exec(line.text)?.[0].length ?? 0);
    const end = m ? line.from + m[0].length : line.from + indent;
    changes.push({ from: line.from + indent, to: end, insert: allHave ? "" : prefixOf(i) });
    i++;
  }
  view.dispatch({ changes, scrollIntoView: true, userEvent: "input.format" });
  return true;
}

/**
 * Inserta un bloque en líneas propias (con línea en blanco alrededor). `cursor` marca en `text`
 * con `|` dónde queda el cursor; `‹…›` marca un tramo a dejar seleccionado.
 */
export function insertBlock(view: EditorView, template: string): boolean {
  const { state } = view;
  const range = state.selection.main;
  let line = state.doc.lineAt(range.to);
  // Dentro de un párrafo, el bloque va detrás del párrafo entero para no partirlo.
  while (line.text.trim() !== "" && line.number < state.doc.lines && state.doc.line(line.number + 1).text.trim() !== "") {
    line = state.doc.line(line.number + 1);
  }
  const atEmpty = line.text.trim() === "";
  const from = atEmpty ? line.from : line.to;
  const prevBlank = line.number === 1 || (atEmpty && state.doc.line(Math.max(1, line.number - 1)).text.trim() === "");
  const lead = atEmpty ? (prevBlank ? "" : "\n") : "\n\n";
  let selFrom = template.indexOf("‹");
  let body = template;
  let selTo: number;
  if (selFrom >= 0) {
    body = body.replace("‹", "");
    selTo = body.indexOf("›");
    body = body.replace("›", "");
  } else {
    selFrom = body.indexOf("|");
    body = body.replace("|", "");
    selTo = selFrom;
  }
  const insert = lead + body + "\n";
  const base = from + lead.length;
  view.dispatch({
    changes: { from, to: atEmpty ? line.to : from, insert },
    selection: selFrom >= 0 ? EditorSelection.range(base + selFrom, base + selTo) : undefined,
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
}

/** Enlace o imagen: con selección la usa como texto y deja seleccionada la URL. */
export function insertLink(view: EditorView, image = false): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const label = range.empty ? (image ? "descripción" : "texto") : state.sliceDoc(range.from, range.to);
    const url = image ? "imagen.png" : "https://";
    const head = (image ? "!" : "") + "[" + label + "](";
    const insert = head + url + ")";
    const urlFrom = range.from + head.length;
    const labelFrom = range.from + (image ? 2 : 1);
    return {
      changes: { from: range.from, to: range.to, insert },
      range: range.empty
        ? EditorSelection.range(labelFrom, labelFrom + label.length)
        : EditorSelection.range(urlFrom, urlFrom + url.length),
    };
  });
  view.dispatch(tr, { scrollIntoView: true, userEvent: "input.format" });
  return true;
}

export const TEMPLATES = {
  table: "| ‹Columna 1› | Columna 2 | Columna 3 |\n|:-----------|:---------:|----------:|\n| Dato       | Dato      | Dato      |\n| Dato       | Dato      | Dato      |",
  codeBlock: "```‹lenguaje›\n\n```",
  math: "$$\n‹E = mc^2›\n$$",
  mermaid: "```mermaid\nflowchart LR\n    A[‹Inicio›] --> B{¿Decisión?}\n    B -->|Sí| C[Acción]\n    B -->|No| D[Fin]\n```",
  chart:
    '```chart\n{\n  "type": "‹bar›",\n  "labels": ["Ene", "Feb", "Mar", "Abr"],\n  "series": { "Serie A": [12, 19, 8, 15], "Serie B": [7, 11, 14, 9] }\n}\n```',
  rule: "---\n|",
} as const;
