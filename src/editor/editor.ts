import { Compartment, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { drawSelection, dropCursor } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { plumeHighlighting, plumeTheme } from "./theme";
import { codeblockHighlight } from "./codeblock";
import { plumeSearchPanel } from "./search-panel";

const wrapCompartment = new Compartment();
const guttersCompartment = new Compartment();

const esPhrases: Record<string, string> = {
  "Find…": "Buscar…",
  Find: "Buscar",
  "Find all": "Buscar todo",
  "Replace…": "Reemplazar…",
  Replace: "Reemplazar",
  "Replace with…": "Reemplazar con…",
  "Replace with": "Reemplazar con",
  "Replace all": "Reemplazar todo",
  "replaceAll": "reemplazar todo",
  All: "Todo",
  all: "todo",
  "Match case": "Coincidir mayúsculas",
  "match case": "coincidir mayúsculas",
  "Case sensitive": "Coincidir mayúsculas",
  "By word": "Palabra completa",
  "by word": "palabra completa",
  Regexp: "Expresión regular",
  regexp: "expresión regular",
  "Next": "Siguiente",
  next: "siguiente",
  "Previous": "Anterior",
  previous: "anterior",
  "current match": "coincidencia actual",
  "Go to line": "Ir a la línea",
  go: "ir",
  close: "Cerrar",
  "on line": "en la línea",
  "to": "hasta",
  "Selection deleted": "Selección eliminada",
  "folded code": "código plegado",
  Fold: "Plegar",
  unfold: "Desplegar",
  "Control character": "Carácter de control",
  "replaced $ matches": "se reemplazaron $ coincidencias",
  "replaced match on line $": "coincidencia reemplazada en la línea $",
};

export interface EditorOptions {
  wordWrap: boolean;
  lineNumbers: boolean;
}

export function baseExtensions(opts: EditorOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorState.phrases.of(esPhrases),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    markdown({ base: markdownLanguage }),
    plumeHighlighting,
    codeblockHighlight,
    plumeTheme,
    indentUnit.of("  "),
    search({
      top: true,
      createPanel: plumeSearchPanel,
      // Centrar la coincidencia: en WebKitGTK el "nearest" por defecto la dejaba fuera de la vista.
      scrollToMatch: (range) => EditorView.scrollIntoView(range, { y: "center" }),
    }),
    highlightSelectionMatches(),
    placeholder("Escribe algo, o arrastra un fichero aquí…"),
    wrapCompartment.of(opts.wordWrap ? EditorView.lineWrapping : []),
    guttersCompartment.of(opts.lineNumbers ? lineNumbers() : []),
  ];
}

export function createDocState(doc: string, opts: EditorOptions, extra: Extension[] = []): EditorState {
  return EditorState.create({ doc, extensions: [...extra, ...baseExtensions(opts)] });
}

export function reconfigureOptions(view: EditorView, opts: EditorOptions): void {
  view.dispatch({
    effects: [
      wrapCompartment.reconfigure(opts.wordWrap ? EditorView.lineWrapping : []),
      guttersCompartment.reconfigure(opts.lineNumbers ? lineNumbers() : []),
    ],
  });
}

export function createEditorView(
  parent: HTMLElement,
  opts: EditorOptions,
  extra: Extension[] = [],
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({ doc: "", extensions: [...extra, ...baseExtensions(opts)] }),
  });
}