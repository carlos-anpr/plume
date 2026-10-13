import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

const codeblockLine = Decoration.line({ class: "cm-codeblock-line" });

const codeblockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCodeblockDecos(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCodeblockDecos(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function buildCodeblockDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === "FencedCode" || node.name === "CodeBlock") {
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(node.to).number;
          for (let l = first; l <= last; l++) {
            builder.add(doc.line(l).from, doc.line(l).from, codeblockLine);
          }
          return false;
        }
        return undefined;
      },
    });
  }
  return builder.finish();
}

export const codeblockHighlight = codeblockPlugin;