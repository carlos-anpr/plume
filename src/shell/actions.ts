import { undo, redo, selectAll } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import type { ActionDef, MenuDef } from "./menubar";
import type { PaletteItem } from "./palette";
import { FONTS, type AppCtx, type ThemeMode, type ViewMode } from "./state";
import { cycleHeading, insertBlock, insertLink, TEMPLATES, toggleLinePrefix, toggleWrap } from "../editor/format";

export const ACTIONS = "actions";

export function buildActions(ctx: AppCtx): ActionDef[] {
  const tab = () => ctx.activeTab;
  const needView = (fn: (v: EditorView) => void): (() => void) => {
    return () => {
      const v = ctx.editor();
      if (!v) return;
      ctx.focusEditor();
      fn(v);
    };
  };

  const modeOf = (m: ViewMode): ActionDef => ({
    id: `mode.${m}`,
    label: modeLabel(m),
    shortcut: m === "editor" ? "Ctrl+1" : m === "split" ? "Ctrl+2" : "Ctrl+3",
    keywords: `vista modo ${m}`,
    checked: () => tab()?.mode === m,
    enabled: () => !!tab(),
    run: () => ctx.setMode(m),
    palette: true,
  });

  const themeOf = (t: ThemeMode): ActionDef => ({
    id: `theme.${t}`,
    label: t === "system" ? "Tema del sistema" : t === "light" ? "Tema claro" : "Tema oscuro",
    keywords: `tema ${t}`,
    checked: () => ctx.settings.theme === t,
    run: () => ctx.setTheme(t),
    palette: true,
  });

  const fontOf = (id: string, label: string): ActionDef => ({
    id: `font.${id}`,
    label,
    keywords: "fuente editor tipografía",
    checked: () => ctx.settings.font === id,
    run: () => ctx.setFont(id),
    palette: true,
  });

  return [
    {
      id: "file.new",
      label: "Nueva pestaña",
      shortcut: "Ctrl+N",
      keywords: "nuevo fichero",
      run: () => ctx.newTab(),
      palette: true,
    },
    {
      id: "file.open",
      label: "Abrir…",
      shortcut: "Ctrl+O",
      keywords: "abrir fichero",
      run: () => ctx.openOpenDialog(),
      palette: true,
    },
    {
      id: "file.save",
      label: "Guardar",
      shortcut: "Ctrl+S",
      keywords: "guardar fichero",
      enabled: () => !!tab() && ctx.isDirty(tab()!.id),
      run: () => void ctx.saveTab(tab()?.id ?? ""),
      palette: true,
    },
    {
      id: "file.saveAs",
      label: "Guardar como…",
      shortcut: "Ctrl+Shift+S",
      keywords: "guardar como",
      enabled: () => !!tab(),
      run: () => void ctx.saveTabAs(tab()?.id ?? ""),
      palette: true,
    },
    {
      id: "file.saveAll",
      label: "Guardar todo",
      shortcut: "Ctrl+Alt+S",
      keywords: "guardar todo pestañas",
      run: () => void ctx.saveAll(),
      palette: true,
    },
    {
      id: "file.exportHtml",
      label: "Exportar HTML…",
      shortcut: "Ctrl+Shift+E",
      keywords: "exportar html",
      enabled: () => !!tab()?.previewable,
      run: () => ctx.exportHtml(),
      palette: true,
    },
    {
      id: "file.print",
      label: "Imprimir / PDF",
      shortcut: "Ctrl+P",
      keywords: "imprimir pdf",
      enabled: () => !!tab()?.previewable,
      run: () => ctx.printDoc(),
      palette: true,
    },
    {
      id: "tab.close",
      label: "Cerrar pestaña",
      shortcut: "Ctrl+W",
      keywords: "cerrar pestaña",
      enabled: () => !!tab(),
      run: () => ctx.requestCloseTab(tab()?.id ?? ""),
      palette: true,
    },
    {
      id: "edit.undo",
      label: "Deshacer",
      shortcut: "Ctrl+Z",
      keywords: "deshacer",
      run: needView((v) => void undo(v)),
      palette: true,
    },
    {
      id: "edit.redo",
      label: "Rehacer",
      shortcut: "Ctrl+Y",
      keywords: "rehacer",
      run: needView((v) => void redo(v)),
      palette: true,
    },
    {
      id: "edit.cut",
      label: "Cortar",
      shortcut: "Ctrl+X",
      keywords: "cortar",
      run: needView(() => void document.execCommand("cut")),
      palette: true,
    },
    {
      id: "edit.copy",
      label: "Copiar",
      shortcut: "Ctrl+C",
      keywords: "copiar",
      run: needView(() => void document.execCommand("copy")),
      palette: true,
    },
    {
      id: "edit.paste",
      label: "Pegar",
      shortcut: "Ctrl+V",
      keywords: "pegar portapapeles",
      run: async () => {
        const v = ctx.editor();
        if (!v) return;
        try {
          const text = await navigator.clipboard.readText();
          ctx.focusEditor();
          v.dispatch(v.state.replaceSelection(text));
        } catch {
          ctx.toast("No se pudo leer el portapapeles", "error");
        }
      },
      palette: true,
    },
    {
      id: "edit.selectAll",
      label: "Seleccionar todo",
      shortcut: "Ctrl+A",
      keywords: "seleccionar todo",
      run: needView((v) => selectAll(v)),
      palette: true,
    },
    {
      id: "edit.find",
      label: "Buscar",
      shortcut: "Ctrl+F",
      keywords: "buscar búsqueda",
      run: () => ctx.find(),
      palette: true,
    },
    {
      id: "edit.replace",
      label: "Reemplazar",
      shortcut: "Ctrl+H",
      keywords: "reemplazar",
      run: () => ctx.replace(),
      palette: true,
    },
    {
      id: "edit.goto",
      label: "Ir a la línea…",
      shortcut: "Ctrl+G",
      keywords: "ir línea saltar",
      run: () => ctx.gotoLine(),
      palette: true,
    },
    {
      id: "view.zoomIn",
      label: "Acercar",
      shortcut: "Ctrl++",
      keywords: "zoom ampliar texto",
      run: () => ctx.zoomBy(0.1),
      palette: true,
    },
    {
      id: "view.zoomOut",
      label: "Alejar",
      shortcut: "Ctrl+-",
      keywords: "zoom reducir texto",
      run: () => ctx.zoomBy(-0.1),
      palette: true,
    },
    {
      id: "view.zoomReset",
      label: "Restablecer zoom (100 %)",
      shortcut: "Ctrl+0",
      keywords: "zoom restablecer 100",
      run: () => ctx.setZoom(1),
      palette: true,
    },
    {
      id: "view.wrap",
      label: "Ajuste de línea",
      shortcut: "Ctrl+Shift+W",
      keywords: "ajuste línea wrap",
      checked: () => ctx.settings.wordWrap,
      run: () => ctx.setWordWrap(!ctx.settings.wordWrap),
      palette: true,
    },
    {
      id: "view.lineNumbers",
      label: "Números de línea",
      shortcut: "Ctrl+Shift+N",
      keywords: "números línea",
      checked: () => ctx.settings.lineNumbers,
      run: () => ctx.setLineNumbers(!ctx.settings.lineNumbers),
      palette: true,
    },
    {
      id: "view.outline",
      label: "Esquema",
      shortcut: "F9",
      keywords: "esquema toc encabezados",
      checked: () => ctx.settings.outlineOpen,
      run: () => ctx.toggleOutline(),
      palette: true,
    },
    {
      id: "view.reload",
      label: "Recargar del disco",
      shortcut: "F5",
      keywords: "recargar disco fichero",
      enabled: () => !!tab()?.path,
      run: () => ctx.reloadFromDisk(tab()?.id ?? ""),
      palette: true,
    },
    modeOf("editor"),
    modeOf("split"),
    modeOf("preview"),
    themeOf("system"),
    themeOf("light"),
    themeOf("dark"),
    ...FONTS.map((f) => fontOf(f.id, `Fuente: ${f.label}`)),
    {
      id: "app.palette",
      label: "Paleta de comandos",
      shortcut: "Ctrl+Shift+P",
      keywords: "comandos paleta acciones",
      run: () => ctx.openPalette(),
      palette: true,
    },
    {
      id: "view.toolbar",
      label: "Barra de herramientas",
      keywords: "barra herramientas iconos",
      checked: () => ctx.settings.toolbar,
      run: () => ctx.setToolbar(!ctx.settings.toolbar),
      palette: true,
    },
    ...formatActions(ctx, needView),
  ];
}

type NeedView = (fn: (v: EditorView) => void) => () => void;

/** Acciones de formato Markdown: solo tienen sentido con el editor visible. */
function formatActions(ctx: AppCtx, needView: NeedView): ActionDef[] {
  const editable = () => !!ctx.activeTab && ctx.activeTab.mode !== "preview";
  const fmt = (id: string, label: string, keywords: string, fn: (v: EditorView) => void, shortcut?: string): ActionDef => ({
    id,
    label,
    shortcut,
    keywords: `formato ${keywords}`,
    enabled: editable,
    run: needView(fn),
    palette: true,
  });
  return [
    fmt("fmt.bold", "Negrita", "negrita bold", (v) => toggleWrap(v, "**"), "Ctrl+B"),
    fmt("fmt.italic", "Cursiva", "cursiva italic", (v) => toggleWrap(v, "*"), "Ctrl+I"),
    fmt("fmt.strike", "Tachado", "tachado strike", (v) => toggleWrap(v, "~~")),
    fmt("fmt.code", "Código en línea", "código inline", (v) => toggleWrap(v, "`", "código"), "Ctrl+E"),
    fmt("fmt.heading", "Encabezado", "título encabezado heading h1 h2 h3", (v) => cycleHeading(v), "Ctrl+Shift+H"),
    fmt("fmt.link", "Enlace", "enlace link url", (v) => insertLink(v), "Ctrl+K"),
    fmt("fmt.image", "Imagen", "imagen foto", (v) => insertLink(v, true)),
    fmt("fmt.bullet", "Lista con viñetas", "lista viñetas", (v) => toggleLinePrefix(v, "bullet")),
    fmt("fmt.ordered", "Lista numerada", "lista numerada", (v) => toggleLinePrefix(v, "ordered")),
    fmt("fmt.task", "Lista de tareas", "tareas checklist", (v) => toggleLinePrefix(v, "task")),
    fmt("fmt.quote", "Cita", "cita blockquote", (v) => toggleLinePrefix(v, "quote")),
    fmt("fmt.table", "Tabla", "tabla", (v) => insertBlock(v, TEMPLATES.table)),
    fmt("fmt.codeBlock", "Bloque de código", "bloque código", (v) => insertBlock(v, TEMPLATES.codeBlock)),
    fmt("fmt.math", "Fórmula", "fórmula matemática latex katex", (v) => insertBlock(v, TEMPLATES.math)),
    fmt("fmt.mermaid", "Diagrama", "diagrama mermaid flujo", (v) => insertBlock(v, TEMPLATES.mermaid)),
    fmt("fmt.chart", "Gráfico", "gráfico chart estadístico", (v) => insertBlock(v, TEMPLATES.chart)),
    fmt("fmt.rule", "Línea horizontal", "separador línea horizontal", (v) => insertBlock(v, TEMPLATES.rule)),
  ];
}

function modeLabel(m: ViewMode): string {
  if (m === "editor") return "Modo Editor";
  if (m === "split") return "Modo Dividido";
  return "Modo Vista previa";
}

export function buildMenus(): MenuDef[] {
  return [
    {
      label: "Archivo",
      items: [
        { kind: "action", id: "file.new" },
        { kind: "action", id: "file.open" },
        { kind: "recents" },
        { kind: "sep" },
        { kind: "action", id: "file.save" },
        { kind: "action", id: "file.saveAs" },
        { kind: "action", id: "file.saveAll" },
        { kind: "sep" },
        { kind: "action", id: "file.exportHtml" },
        { kind: "action", id: "file.print" },
        { kind: "sep" },
        { kind: "action", id: "tab.close" },
      ],
    },
    {
      label: "Editar",
      items: [
        { kind: "action", id: "edit.undo" },
        { kind: "action", id: "edit.redo" },
        { kind: "sep" },
        { kind: "action", id: "edit.cut" },
        { kind: "action", id: "edit.copy" },
        { kind: "action", id: "edit.paste" },
        { kind: "sep" },
        { kind: "action", id: "edit.selectAll" },
        { kind: "sep" },
        { kind: "action", id: "edit.find" },
        { kind: "action", id: "edit.replace" },
        { kind: "action", id: "edit.goto" },
      ],
    },
    {
      label: "Formato",
      items: [
        { kind: "action", id: "fmt.bold" },
        { kind: "action", id: "fmt.italic" },
        { kind: "action", id: "fmt.strike" },
        { kind: "action", id: "fmt.code" },
        { kind: "sep" },
        { kind: "action", id: "fmt.heading" },
        { kind: "action", id: "fmt.bullet" },
        { kind: "action", id: "fmt.ordered" },
        { kind: "action", id: "fmt.task" },
        { kind: "action", id: "fmt.quote" },
        { kind: "sep" },
        { kind: "action", id: "fmt.link" },
        { kind: "action", id: "fmt.image" },
        { kind: "action", id: "fmt.table" },
        { kind: "action", id: "fmt.codeBlock" },
        { kind: "action", id: "fmt.rule" },
        { kind: "sep" },
        { kind: "action", id: "fmt.math" },
        { kind: "action", id: "fmt.mermaid" },
        { kind: "action", id: "fmt.chart" },
      ],
    },
    {
      label: "Ver",
      items: [
        { kind: "action", id: "view.zoomIn" },
        { kind: "action", id: "view.zoomOut" },
        { kind: "action", id: "view.zoomReset" },
        { kind: "sep" },
        { kind: "action", id: "view.toolbar" },
        { kind: "action", id: "view.wrap" },
        { kind: "action", id: "view.lineNumbers" },
        { kind: "sep" },
        {
          kind: "submenu",
          label: "Tema",
          items: [
            { kind: "action", id: "theme.system" },
            { kind: "action", id: "theme.light" },
            { kind: "action", id: "theme.dark" },
          ],
        },
        {
          kind: "submenu",
          label: "Fuente del editor",
          items: FONTS.map((f) => ({ kind: "action", id: `font.${f.id}` }) as const),
        },
        { kind: "sep" },
        { kind: "action", id: "mode.editor" },
        { kind: "action", id: "mode.split" },
        { kind: "action", id: "mode.preview" },
        { kind: "sep" },
        { kind: "action", id: "view.outline" },
        { kind: "action", id: "view.reload" },
      ],
    },
  ];
}

export function buildPaletteItems(actions: ActionDef[]): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const a of actions) {
    if (a.palette === false) continue;
    items.push({
      id: a.id,
      label: a.label,
      hint: a.shortcut,
      keywords: a.keywords,
      run: () => void a.run(),
    });
  }
  return items;
}