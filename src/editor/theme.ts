import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const plumeTheme = EditorView.theme({
  "&": {
    color: "var(--fg)",
    backgroundColor: "var(--bg-surface)",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "var(--editor-font-family)",
    fontSize: "calc(var(--text-editor) * var(--zoom))",
    lineHeight: "1.7",
    fontVariantLigatures: "none",
    fontFeatureSettings: '"calt" 0, "liga" 0',
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "10px 0 30vh",
  },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  ".cm-dropCursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--bg-selection)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--bg-selection)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-surface)",
    color: "var(--fg-subtle)",
    border: "none",
  },
  ".cm-activeLineGutter": {
    color: "var(--fg-muted)",
    backgroundColor: "transparent",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "30px",
    padding: "0 10px 0 14px",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--bg-active)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--warning) 22%, transparent)",
    borderRadius: "2px",
  },
  // La coincidencia actual tiene que destacar incluso sobre el fondo de los bloques de código.
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--warning) 55%, transparent)",
    outline: "1.5px solid var(--warning)",
  },
  ".cm-placeholder": {
    color: "var(--fg-subtle)",
    fontStyle: "italic",
  },
});

export const plumeHighlight = HighlightStyle.define([
  { tag: t.heading, class: "tok-heading" },
  { tag: [t.heading1, t.heading2], class: "tok-heading-strong" },
  { tag: t.strong, class: "tok-strong" },
  { tag: t.emphasis, class: "tok-em" },
  { tag: t.strikethrough, class: "tok-strike" },
  { tag: [t.link, t.url], class: "tok-link" },
  { tag: t.monospace, class: "tok-code" },
  { tag: t.quote, class: "tok-quote" },
  { tag: [t.meta, t.processingInstruction, t.contentSeparator], class: "tok-fence" },
  { tag: t.escape, class: "tok-escape" },
  { tag: t.list, class: "tok-list" },
  { tag: [t.tagName, t.attributeName], class: "tok-attr" },
]);

export const plumeHighlighting = syntaxHighlighting(plumeHighlight, { fallback: true });