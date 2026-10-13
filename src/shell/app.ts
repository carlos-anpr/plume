import { logError } from "./error-log";
import { EditorSelection, Prec } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { EditorView, keymap } from "@codemirror/view";
import { SearchQuery, openSearchPanel, searchPanelOpen, setSearchQuery } from "@codemirror/search";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc } from "../ipc";
import { EVENT_FILE_CHANGED, EVENT_OPEN_FILES } from "../types";
import type { FileChangedEvent, OpenedDoc, PreviewApi, RenderResult } from "../types";
import { basename, clamp, dirname, h, isPreviewablePath, debounce } from "../util";
import { icon } from "../icons";
import { createDocState, createEditorView, reconfigureOptions } from "../editor/editor";
import { cycleHeading, insertLink, toggleWrap } from "../editor/format";
import { wantReplace } from "../editor/search-panel";
import { createTitlebar } from "./titlebar";
import { createMenubar } from "./menubar";
import { createStatusbar } from "./statusbar";
import { createToolbar } from "./toolbar";
import type { DocStatsView } from "./statusbar";
import { createOutline } from "./outline";
import { confirmDialog, openGotoPanel, toast } from "./dialogs";
import { openPalette } from "./palette";
import { buildActions, buildMenus, buildPaletteItems } from "./actions";
import { createPreview } from "./preview-bridge";
import { needsFallback, renderMarkdownFallback } from "./browser-fallback";
import { errText, inTauri, safe } from "./tauri-env";
import {
  DEFAULT_SETTINGS,
  FONTS,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  isTabDirty,
  mergeSettings,
} from "./state";
import type {
  AppCtx,
  PersistedSettings,
  SessionTab,
  Settings,
  Tab,
  ThemeMode,
  ViewMode,
} from "./state";

const OPEN_FILTERS = [
  { name: "Texto y Markdown", extensions: ["md", "markdown", "mdx", "txt", "text", "log"] },
  { name: "Todos los ficheros", extensions: ["*"] },
];

let idCounter = 0;
const nextId = (): string => `tab-${++idCounter}`;

export class App implements AppCtx {
  tabs: Tab[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };
  recents: string[] = [];

  private activeId = "";
  private view!: EditorView;
  private preview!: PreviewApi;
  private actions = buildActions(this);
  private getAction = (id: string) => this.actions.find((a) => a.id === id);
  private menubar = createMenubar(this, buildMenus(), this.getAction);
  private titlebar = createTitlebar(this);
  private statusbar = createStatusbar(this);
  private toolbar = createToolbar(this.getAction);
  private outline = createOutline((line) => this.jumpToLine(line));

  private editorPane: HTMLElement;
  private previewPane: HTMLElement;
  private workbench: HTMLElement;
  private splitter: HTMLElement;
  private bannerEl: HTMLElement;
  private segBtns: Record<ViewMode, HTMLButtonElement> = {} as Record<ViewMode, HTMLButtonElement>;
  private outlineBtn!: HTMLButtonElement;

  private watched = new Set<string>();
  private lastStats: DocStatsView | null = null;
  private statsOf = new Map<string, DocStatsView>();
  private syncLock = 0;
  private previewLine = 1;
  private systemDark = false;

  private persistSession = debounce(() => void this.doPersist(), 1000);

  private listener = EditorView.updateListener.of((update) => {
    const tab = this.activeTab;
    if (!tab) return;
    if (update.docChanged) {
      tab.doc = update.state.doc;
      this.onDocChanged(tab);
    }
    if (update.selectionSet || update.docChanged) {
      const pos = update.state.selection.main.head;
      const l = update.state.doc.lineAt(pos);
      tab.cursor = { line: l.number, col: pos - l.from + 1 };
      this.statusbar.render(this.lastStats);
    }
  });

  // Prec.high: Mod-i es selectParentSyntax en el keymap por defecto de CodeMirror.
  private formatKeymap: KeyBinding[] = [
    { key: "Mod-b", run: (v) => toggleWrap(v, "**") },
    { key: "Mod-i", run: (v) => toggleWrap(v, "*") },
    { key: "Mod-e", run: (v) => toggleWrap(v, "`", "código") },
    { key: "Mod-k", run: (v) => insertLink(v) },
    { key: "Mod-Shift-h", run: (v) => cycleHeading(v) },
  ];

  private extraKeymap: KeyBinding[] = [
    {
      key: "Mod-g",
      run: () => {
        this.gotoLine();
        return true;
      },
    },
    {
      key: "Mod-Alt-g",
      run: () => {
        this.gotoLine();
        return true;
      },
    },
    {
      key: "Mod-f",
      run: () => {
        this.find();
        return true;
      },
    },
    {
      key: "Mod-Shift-f",
      run: () => {
        this.find();
        return true;
      },
    },
  ];

  private docExtras(): Extension[] {
    return [this.listener, keymap.of(this.extraKeymap), Prec.high(keymap.of(this.formatKeymap))];
  }

  constructor(root: HTMLElement) {
    this.editorPane = h("div", { class: "editor-pane" });
    this.previewPane = h("div", { class: "preview-pane" });
    this.splitter = h("div", { class: "splitter", ariaLabel: "Divisor editor / vista previa" });
    this.splitter.addEventListener("pointerdown", (e) => this.onSplitterDown(e));
    this.workbench = h(
      "div",
      { class: "workbench", dataset: { mode: "split" } },
      this.editorPane,
      this.splitter,
      this.previewPane,
    );

    this.bannerEl = h("div", { class: "banner banner-hidden" });

    const menubarRow = h(
      "div",
      { class: "menubar-row" },
      this.menubar.root,
      h("div", { class: "menubar-flex" }),
    );
    menubarRow.append(this.buildRightCluster());

    const main = h("div", { class: "main" }, this.workbench, this.outline.root);
    root.replaceChildren(this.titlebar.root, menubarRow, this.toolbar.root, this.bannerEl, main, this.statusbar.root);

    this.view = createEditorView(this.editorPane, this.editorOptions(), this.docExtras());
    this.preview = createPreview(this.previewPane);

    this.wireScrollSync();
    this.wireShortcuts();
    this.wireGlobalEvents();
    this.applyZoom();
    this.applyFont();
    this.applySplitRatio();
    this.applyOutline();
  }

  get activeTab(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null;
  }

  editor(): EditorView | null {
    return this.view;
  }

  async boot(): Promise<void> {
    const raw = await safe(ipc.loadSettings(), null);
    const persisted = mergeSettings(raw);
    const { session, activePath, ...settings } = persisted;
    this.settings = settings;
    this.applyTheme();
    this.applyZoom();
    this.applyFont();
    this.applyLineNumbersAndView();
    this.applySplitRatio();
    this.applyOutline();
    this.toolbar.setVisible(this.settings.toolbar);

    this.recents = await safe(ipc.recentFiles(), []);
    const launch = await safe(ipc.launchFiles(), []);
    if (launch.length > 0) {
      await this.openPaths(launch);
    } else if (session.length > 0) {
      await this.restoreSession(session, activePath);
    }
    if (this.tabs.length === 0) this.newTab();
    this.renderAll();
    // Con la ventana oculta WebKitGTK no dispara requestAnimationFrame: basta con forzar el layout.
    void document.body.offsetHeight;
    if (inTauri) void getCurrentWindow().show().catch((e) => logError("show", e));
  }

  private async restoreSession(session: SessionTab[], activePath: string | null): Promise<void> {
    for (const entry of session) {
      if (entry.path) {
        await this.openPaths([entry.path]);
        const tab = this.tabs[this.tabs.length - 1];
        if (tab) this.applySessionMeta(tab, entry);
      } else if (entry.content !== undefined) {
        const tab = this.makeUntitledTab(entry.content);
        this.applySessionMeta(tab, entry);
        this.addTab(tab, false);
      }
    }
    const target = this.tabs.find((t) => t.path === activePath) ?? this.tabs[this.tabs.length - 1];
    if (target) this.activateTab(target.id);
  }

  private applySessionMeta(tab: Tab, entry: SessionTab): void {
    tab.mode = entry.mode;
    if (entry.cursor) tab.cursor = { ...entry.cursor };
    if (entry.eol) tab.eol = entry.eol;
    if (entry.encoding) tab.encoding = entry.encoding;
    if (entry.hasBom !== undefined) tab.hasBom = entry.hasBom;
  }

  isDirty(id: string): boolean {
    const tab = this.tabs.find((t) => t.id === id);
    return tab ? isTabDirty(tab) : false;
  }

  newTab(): void {
    this.addTab(this.makeUntitledTab(""));
  }

  private makeUntitledTab(content: string): Tab {
    const state = createDocState(content, this.editorOptions(), this.docExtras());
    let maxUntitled = 0;
    for (const t of this.tabs) {
      if (t.path !== null) continue;
      const m = t.name.match(/^Sin título(?: (\d+))?$/);
      if (m) maxUntitled = Math.max(maxUntitled, m[1] ? parseInt(m[1], 10) : 1);
    }
    return {
      id: nextId(),
      path: null,
      name: maxUntitled === 0 ? "Sin título" : `Sin título ${maxUntitled + 1}`,
      doc: state.doc,
      savedText: null,
      metaDirty: false,
      encoding: "UTF-8",
      hasBom: false,
      eol: "LF",
      modifiedMs: 0,
      previewable: true,
      mode: "editor",
      state,
      scrollTop: 0,
      cursor: { line: 1, col: 1 },
      render: null,
      renderedDoc: null,
      previewLine: 1,
      external: null,
    };
  }

  private editorOptions(): { wordWrap: boolean; lineNumbers: boolean } {
    return { wordWrap: this.settings.wordWrap, lineNumbers: this.settings.lineNumbers };
  }

  private addTab(tab: Tab, activate = true): void {
    this.tabs.push(tab);
    if (activate) this.activateTab(tab.id);
    else this.titlebar.render();
    this.persistSession();
  }

  async openPaths(paths: string[]): Promise<void> {
    let lastId = "";
    for (const path of paths) {
      if (!path) continue;
      const existing = this.tabs.find((t) => t.path === path);
      if (existing) {
        lastId = existing.id;
        continue;
      }
      try {
        const opened: OpenedDoc = await ipc.openFile(path);
        const tab = this.tabFromOpened(opened);
        this.tabs.push(tab);
        lastId = tab.id;
        this.watchIfNeeded(path);
        void safe(ipc.addRecent(path), []);
      } catch (e) {
        toast(errText(e), "error");
      }
    }
    this.recents = await safe(ipc.recentFiles(), this.recents);
    if (lastId) this.activateTab(lastId);
    else this.renderAll();
    if (this.tabs.length === 0) this.newTab();
  }

  private tabFromOpened(opened: OpenedDoc): Tab {
    const state = createDocState(opened.content, this.editorOptions(), this.docExtras());
    return {
      id: nextId(),
      path: opened.path,
      name: basename(opened.path),
      doc: state.doc,
      savedText: state.doc,
      metaDirty: false,
      encoding: opened.encoding,
      hasBom: opened.has_bom,
      eol: opened.line_ending,
      modifiedMs: opened.modified_ms,
      previewable: isPreviewablePath(opened.path),
      mode: isPreviewablePath(opened.path) ? "split" : "editor",
      state,
      scrollTop: 0,
      cursor: { line: 1, col: 1 },
      render: null,
      renderedDoc: null,
      previewLine: 1,
      external: null,
    };
  }

  activateTab(id: string): void {
    if (!this.tabs.some((t) => t.id === id)) return;
    const prev = this.activeTab;
    if (prev && prev.id !== id) {
      prev.state = this.view.state;
      prev.doc = this.view.state.doc;
      prev.scrollTop = this.view.scrollDOM.scrollTop;
      prev.previewLine = this.previewLine;
    }
    this.activeId = id;
    const tab = this.activeTab;
    if (!tab) return;
    this.view.setState(tab.state);
    reconfigureOptions(this.view, this.editorOptions());
    requestAnimationFrame(() => {
      const doc = this.view.state.doc;
      const line = doc.line(Math.min(Math.max(1, tab.cursor.line), doc.lines));
      const pos = Math.min(line.from + Math.max(0, tab.cursor.col - 1), doc.length);
      this.view.dispatch({ selection: EditorSelection.cursor(pos) });
      this.view.scrollDOM.scrollTop = tab.scrollTop;
    });
    this.workbench.dataset.mode = tab.mode;
    this.applySplitRatio();
    this.renderAll();
    this.scheduleStats(tab);
    this.maybeRenderPreview(true);
    if (tab.mode !== "preview") this.view.focus();
    this.persistSession();
  }

  requestCloseTab(id: string): void {
    void this.requestCloseTabAsync(id);
  }

  private async requestCloseTabAsync(id: string): Promise<void> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (!isTabDirty(tab)) {
      this.closeTabNow(id);
      return;
    }
    const res = await confirmDialog<{ kind: "save" | "discard" | "cancel" }>({
      title: "¿Guardar cambios?",
      message: `«${tab.name}» tiene cambios sin guardar.`,
      dangerIcon: true,
      buttons: [
        { label: "Guardar", value: { kind: "save" }, kind: "primary" },
        { label: "No guardar", value: { kind: "discard" }, kind: "subtle" },
        { label: "Cancelar", value: { kind: "cancel" }, kind: "subtle" },
      ],
      cancelValue: { kind: "cancel" },
    });
    if (res.kind === "save") {
      const ok = await this.saveTab(id);
      if (ok) this.closeTabNow(id);
    } else if (res.kind === "discard") {
      this.closeTabNow(id);
    }
  }

  closeTabNow(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const tab = this.tabs[idx];
    if (tab.path) this.unwatchIfNeeded(tab.path);
    this.tabs.splice(idx, 1);
    if (this.activeId === id) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      if (next) this.activateTab(next.id);
      else {
        this.activeId = "";
        this.newTab();
      }
    } else {
      this.renderAll();
    }
    this.persistSession();
  }

  async saveTab(id: string): Promise<boolean> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (!tab.path) return this.saveTabAs(id);
    try {
      const res = await ipc.saveFile({
        path: tab.path,
        content: tab.doc.toString(),
        encoding: tab.encoding,
        has_bom: tab.hasBom,
        line_ending: tab.eol,
      });
      tab.savedText = tab.doc;
      tab.metaDirty = false;
      tab.external = null;
      tab.modifiedMs = res.modified_ms;
      this.renderAll();
      this.recents = await safe(ipc.recentFiles(), this.recents);
      this.persistSession();
      return true;
    } catch (e) {
      toast(errText(e), "error");
      return false;
    }
  }

  async saveTabAs(id: string): Promise<boolean> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (!inTauri) {
      toast("Guardar solo disponible en la app de escritorio", "error");
      return false;
    }
    let path: string | null = null;
    try {
      path = await save({
        defaultPath: tab.path ?? `${tab.name}${tab.previewable ? ".md" : ".txt"}`,
        filters: OPEN_FILTERS,
      });
    } catch (e) {
      toast(errText(e), "error");
      return false;
    }
    if (!path) return false;
    if (tab.path && tab.path !== path) this.unwatchIfNeeded(tab.path);
    tab.path = path;
    tab.name = basename(path);
    tab.previewable = isPreviewablePath(path);
    this.watchIfNeeded(path);
    const ok = await this.saveTab(id);
    if (ok) {
      void safe(ipc.addRecent(path), []);
      this.recents = await safe(ipc.recentFiles(), this.recents);
      this.maybeRenderPreview(true);
    }
    return ok;
  }

  async saveAll(): Promise<void> {
    for (const tab of [...this.tabs]) {
      if (isTabDirty(tab)) await this.saveTab(tab.id);
    }
  }

  setMode(mode: ViewMode): void {
    const tab = this.activeTab;
    if (!tab) return;
    tab.mode = mode;
    this.workbench.dataset.mode = mode;
    this.updateSeg();
    this.maybeRenderPreview(true);
    if (mode !== "preview") this.view.focus();
    this.persistSession();
  }

  setTheme(theme: ThemeMode): void {
    this.settings.theme = theme;
    this.applyTheme();
    this.persistSession();
  }

  applyTheme(): void {
    const resolved =
      this.settings.theme === "system" ? (this.systemDark ? "dark" : "light") : this.settings.theme;
    document.documentElement.dataset.theme = resolved;
    this.preview.setTheme(resolved === "dark" ? "dark" : "light");
  }

  zoomBy(delta: number): void {
    this.setZoom(this.settings.zoom + delta);
  }

  setZoom(z: number): void {
    this.settings.zoom = clamp(Math.round(z * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    this.applyZoom();
    this.persistSession();
  }

  private applyZoom(): void {
    document.documentElement.style.setProperty("--zoom", String(this.settings.zoom));
    this.view?.requestMeasure();
    this.statusbar.render(this.lastStats);
  }

  setWordWrap(b: boolean): void {
    this.settings.wordWrap = b;
    this.applyLineNumbersAndView();
    this.persistSession();
  }

  setToolbar(b: boolean): void {
    this.settings.toolbar = b;
    this.toolbar.setVisible(b);
    this.persistSession();
  }

  setLineNumbers(b: boolean): void {
    this.settings.lineNumbers = b;
    this.applyLineNumbersAndView();
    this.persistSession();
  }

  private applyLineNumbersAndView(): void {
    reconfigureOptions(this.view, this.editorOptions());
  }

  setFont(id: string): void {
    if (!FONTS.some((f) => f.id === id)) return;
    this.settings.font = id;
    this.applyFont();
    this.persistSession();
  }

  private applyFont(): void {
    const font = FONTS.find((f) => f.id === this.settings.font) ?? FONTS[0];
    document.documentElement.style.setProperty("--editor-font-family", font.css);
  }

  setSplitRatio(r: number): void {
    this.settings.splitRatio = clamp(r, 0.15, 0.85);
    this.applySplitRatio();
    this.persistSession();
  }

  private applySplitRatio(): void {
    this.editorPane.style.width = `${this.settings.splitRatio * 100}%`;
  }

  setEol(eol: "LF" | "CRLF"): void {
    const tab = this.activeTab;
    if (!tab || tab.eol === eol) return;
    tab.eol = eol;
    tab.metaDirty = true;
    this.statusbar.render(this.lastStats);
    this.persistSession();
  }

  setEncoding(encoding: string, bom: boolean): void {
    const tab = this.activeTab;
    if (!tab) return;
    tab.encoding = encoding;
    tab.hasBom = bom;
    tab.metaDirty = true;
    this.statusbar.render(this.lastStats);
    this.persistSession();
  }

  toggleOutline(force?: boolean): void {
    this.settings.outlineOpen = force ?? !this.settings.outlineOpen;
    this.applyOutline();
    this.persistSession();
  }

  private applyOutline(): void {
    this.outline.root.classList.toggle("outline-closed", !this.settings.outlineOpen);
    this.updateSeg();
    const tab = this.activeTab;
    this.outline.render(tab?.render?.toc ?? [], tab ? this.currentEditorLine() : null);
  }

  async reloadFromDisk(id: string): Promise<void> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab?.path) return;
    if (isTabDirty(tab)) {
      const res = await confirmDialog<{ ok: boolean }>({
        title: "Recargar del disco",
        message: "Tienes cambios sin guardar. Recargar descartará tus ediciones.",
        dangerIcon: true,
        buttons: [
          { label: "Recargar", value: { ok: true }, kind: "danger" },
          { label: "Cancelar", value: { ok: false }, kind: "subtle" },
        ],
        cancelValue: { ok: false },
      });
      if (!res.ok) return;
    }
    try {
      const opened = await ipc.openFile(tab.path);
      this.applyDiskContent(tab, opened);
    } catch (e) {
      toast(errText(e), "error");
    }
  }

  keepLocalVersion(id: string): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.external = null;
    this.renderBanner();
  }

  openOpenDialog(): void {
    if (!inTauri) {
      toast("Abrir ficheros solo en la app de escritorio", "info");
      return;
    }
    void open({ multiple: true, filters: OPEN_FILTERS })
      .then((paths) => {
        const list = Array.isArray(paths) ? paths : paths ? [paths] : [];
        if (list.length) void this.openPaths(list);
      })
      .catch((e) => toast(errText(e), "error"));
  }

  async exportHtml(): Promise<void> {
    const tab = this.activeTab;
    if (!tab || !tab.previewable) return;
    if (!inTauri) {
      toast("Exportar solo disponible en la app", "info");
      return;
    }
    try {
      const path = await save({
        defaultPath: `${tab.name.replace(/\.[^.]+$/, "")}.html`,
        filters: [{ name: "HTML", extensions: ["html"] }],
      });
      if (!path) return;
      const result = await this.ensureRender(tab);
      if (!result) return;
      const html = await this.preview.exportHtml(tab.name);
      await ipc.writeText(path, html);
      toast("HTML exportado", "success");
    } catch (e) {
      toast(errText(e), "error");
    }
  }

  async printDoc(): Promise<void> {
    const tab = this.activeTab;
    if (!tab || !tab.previewable) {
      toast("Imprime desde un fichero Markdown con vista previa", "info");
      return;
    }
    await this.maybeRenderPreview(true);
    window.print();
  }

  find(): void {
    const prefill = this.selectionQuery();
    if (prefill !== null) {
      this.view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: prefill })) });
    }
    wantReplace(false);
    openSearchPanel(this.view);
    this.focusFindInput();
  }

  replace(): void {
    const prefill = this.selectionQuery();
    if (prefill !== null) {
      this.view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: prefill })) });
    }
    const alreadyOpen = searchPanelOpen(this.view.state);
    if (alreadyOpen) {
      const panel = this.editorPane.querySelector(".plume-search");
      panel?.dispatchEvent(new Event("plume:show-replace"));
    } else {
      wantReplace(true);
    }
    openSearchPanel(this.view);
    const repInput = this.editorPane.querySelector<HTMLInputElement>(
      ".plume-search .psp-replace-row .psp-input",
    );
    if (alreadyOpen) {
      repInput?.focus();
      repInput?.select();
    } else if (repInput) {
      repInput.focus();
      repInput.select();
    } else {
      this.focusFindInput();
    }
  }

  private focusFindInput(): void {
    const input = this.editorPane.querySelector<HTMLInputElement>(".plume-search [main-field]");
    if (input) {
      input.focus();
      input.select();
    } else {
      this.view.focus();
    }
  }

  private selectionQuery(): string | null {
    const sel = this.view.state.selection.main;
    if (sel.empty || sel.to - sel.from > 200) return null;
    const text = this.view.state.sliceDoc(sel.from, sel.to);
    return /\n/.test(text) ? null : text;
  }

  gotoLine(): void {
    const tab = this.activeTab;
    if (!tab) return;
    openGotoPanel(this.editorPane, {
      total: this.view.state.doc.lines,
      onGo: (line) => this.jumpToLine(line),
    });
  }

  private jumpToLine(line: number): void {
    const doc = this.view.state.doc;
    const target = doc.line(Math.min(Math.max(1, line), doc.lines));
    this.view.focus();
    this.view.dispatch({
      selection: EditorSelection.cursor(target.from),
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
  }

  openPalette(): void {
    const items = buildPaletteItems(this.actions);
    for (const t of this.tabs) {
      if (t.id === this.activeId) continue;
      items.push({
        id: `tab.${t.id}`,
        label: `Pestaña: ${t.name}`,
        category: "Pestañas",
        keywords: t.path ?? t.name,
        run: () => this.activateTab(t.id),
      });
    }
    openPalette(items);
  }

  focusEditor(): void {
    if (this.activeTab?.mode !== "preview") this.view.focus();
  }

  toast(msg: string, kind: "info" | "error" | "success" = "info"): void {
    toast(msg, kind);
  }

  private onDocChanged(tab: Tab): void {
    this.titlebar.render();
    this.toolbar.refresh();
    this.statusbar.render(this.lastStats);
    this.scheduleStats(tab);
    this.maybeRenderPreview(false);
    this.persistSession();
  }

  private renderTimer: number | undefined;
  private renderInFlight = false;
  private renderPending = false;

  /** Debounce adaptativo: 120 ms en documentos normales, hasta ~1,6 s en los de varios MB. */
  private maybeRenderPreview(immediate: boolean): void {
    const tab = this.activeTab;
    if (!tab || !tab.previewable || tab.mode === "editor") return;
    window.clearTimeout(this.renderTimer);
    const delay = immediate ? 0 : 120 + Math.min(1500, Math.round(tab.doc.length / 4000));
    this.renderTimer = window.setTimeout(() => {
      const current = this.activeTab;
      if (current && current.mode !== "editor") void this.renderPreviewNow(current);
    }, delay);
  }

  private async renderPreviewNow(tab: Tab): Promise<void> {
    if (tab.id !== this.activeId || tab.mode === "editor") return;
    // Sin renders solapados: si llega otro mientras tanto, se repite una vez al acabar.
    if (this.renderInFlight) {
      this.renderPending = true;
      return;
    }
    this.renderInFlight = true;
    try {
      const result = await this.ensureRender(tab);
      if (!result || tab.id !== this.activeId) return;
      await this.preview.update(result, tab.path ? dirname(tab.path) : null);
      if (this.settings.outlineOpen) this.outline.render(result.toc, this.currentEditorLine());
    } finally {
      this.renderInFlight = false;
      if (this.renderPending) {
        this.renderPending = false;
        this.maybeRenderPreview(false);
      }
    }
  }

  private async ensureRender(tab: Tab): Promise<RenderResult | null> {
    if (tab.render && tab.renderedDoc === tab.doc) return tab.render;
    const content = tab.doc.toString();
    try {
      const result = needsFallback()
        ? renderMarkdownFallback(content)
        : await ipc.renderMarkdown(content);
      tab.render = result;
      tab.renderedDoc = tab.doc;
      const stats: DocStatsView = {
        words: result.stats.words,
        chars: result.stats.chars,
        readingMinutes: Math.max(1, Math.round(result.stats.words / 220)),
      };
      this.statsOf.set(tab.id, stats);
      if (tab.id === this.activeId) {
        this.lastStats = stats;
        this.statusbar.render(stats);
      }
      return result;
    } catch (e) {
      if (tab.id === this.activeId) toast(errText(e), "error");
      return null;
    }
  }

  private statsDebounce = debounce(() => {
    const tab = this.activeTab;
    if (tab) this.computeStats(tab);
  }, 400);

  private scheduleStats(tab: Tab): void {
    if (tab.renderedDoc === tab.doc) {
      const cached = this.statsOf.get(tab.id);
      if (cached) {
        this.lastStats = cached;
        this.statusbar.render(cached);
        return;
      }
    }
    this.statsDebounce();
  }

  private computeStats(tab: Tab): void {
    const doc = tab.doc;
    const run = (): void => {
      const text = doc.toString();
      const words = text.match(/[\p{L}\p{N}'’-]+/gu)?.length ?? 0;
      const stats: DocStatsView = {
        words,
        chars: doc.length,
        readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / 220)),
      };
      this.statsOf.set(tab.id, stats);
      if (tab.id === this.activeId) {
        this.lastStats = stats;
        this.statusbar.render(stats);
      }
    };
    if ("requestIdleCallback" in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(
        run,
      );
    } else setTimeout(run, 30);
  }

  private currentEditorLine(): number | null {
    const tab = this.activeTab;
    return tab ? tab.cursor.line : null;
  }

  private watchIfNeeded(path: string): void {
    if (this.watched.has(path)) return;
    this.watched.add(path);
    void ipc.watchFile(path).catch(() => {});
  }

  private unwatchIfNeeded(path: string): void {
    if (this.tabs.some((t) => t.path === path)) return;
    this.watched.delete(path);
    void ipc.unwatchFile(path).catch(() => {});
  }

  private applyDiskContent(tab: Tab, opened: OpenedDoc): void {
    const active = tab.id === this.activeId;
    if (active) tab.scrollTop = this.view.scrollDOM.scrollTop;
    const state = createDocState(opened.content, this.editorOptions(), this.docExtras());
    const doc = state.doc;
    const line = doc.line(Math.min(Math.max(1, tab.cursor.line), doc.lines));
    const pos = Math.min(line.from + Math.max(0, tab.cursor.col - 1), doc.length);
    const newState = state.update({ selection: EditorSelection.cursor(pos) }).state;
    tab.state = newState;
    tab.doc = doc;
    tab.savedText = doc;
    tab.metaDirty = false;
    tab.encoding = opened.encoding;
    tab.hasBom = opened.has_bom;
    tab.eol = opened.line_ending;
    tab.modifiedMs = opened.modified_ms;
    tab.external = null;
    tab.render = null;
    tab.renderedDoc = null;
    this.statsOf.delete(tab.id);
    if (active) {
      this.view.setState(newState);
      reconfigureOptions(this.view, this.editorOptions());
      requestAnimationFrame(() => {
        this.view.scrollDOM.scrollTop = tab.scrollTop;
      });
      this.maybeRenderPreview(true);
      this.renderAll();
    }
    this.persistSession();
  }

  private onFileChanged(payload: FileChangedEvent): void {
    for (const tab of this.tabs) {
      if (tab.path !== payload.path) continue;
      if (payload.removed) {
        tab.external = { kind: "removed", content: null, modifiedMs: null };
        if (tab.id === this.activeId) this.renderBanner();
        continue;
      }
      if (!isTabDirty(tab)) {
        void ipc
          .openFile(payload.path)
          .then((opened) => this.applyDiskContent(tab, opened))
          .catch(() => {});
      } else {
        void ipc
          .openFile(payload.path)
          .then((opened) => {
            tab.external = {
              kind: "changed",
              content: opened.content,
              modifiedMs: opened.modified_ms,
            };
            if (tab.id === this.activeId) this.renderBanner();
          })
          .catch(() => {});
      }
    }
  }

  private renderBanner(): void {
    const tab = this.activeTab;
    const ext = tab?.external;
    if (!ext) {
      this.bannerEl.classList.add("banner-hidden");
      this.bannerEl.replaceChildren();
      return;
    }
    this.bannerEl.classList.remove("banner-hidden");
    this.bannerEl.replaceChildren();
    if (ext.kind === "changed") {
      const reload = h("button", { class: "btn btn-primary btn-sm" }, "Recargar del disco");
      reload.addEventListener("click", () => void this.reloadFromDisk(tab!.id));
      const keep = h("button", { class: "btn btn-subtle btn-sm" }, "Mantener mis cambios");
      keep.addEventListener("click", () => this.keepLocalVersion(tab!.id));
      this.bannerEl.append(
        icon("alert", 14),
        h("span", { class: "banner-text" }, "El fichero cambió en el disco."),
        reload,
        keep,
      );
    } else {
      const saveBtn = h("button", { class: "btn btn-primary btn-sm" }, "Guardar de nuevo");
      saveBtn.addEventListener("click", () => void this.saveTab(tab!.id));
      const dismiss = h("button", { class: "btn btn-subtle btn-sm" }, "Ignorar");
      dismiss.addEventListener("click", () => this.keepLocalVersion(tab!.id));
      this.bannerEl.append(
        icon("alert", 14),
        h("span", { class: "banner-text" }, "El fichero se eliminó del disco."),
        saveBtn,
        dismiss,
      );
    }
  }

  private setWindowTitle(): void {
    if (!inTauri) return;
    const tab = this.activeTab;
    const title = tab ? `${tab.name}${isTabDirty(tab) ? " *" : ""} — Plume` : "Plume";
    void getCurrentWindow().setTitle(title).catch(() => {});
  }

  private renderAll(): void {
    this.titlebar.render();
    this.updateSeg();
    this.statusbar.render(this.lastStats);
    this.renderBanner();
    const tab = this.activeTab;
    if (tab) {
      this.workbench.dataset.mode = tab.mode;
      this.outline.render(tab.render?.toc ?? [], this.currentEditorLine());
    }
    this.setWindowTitle();
  }

  private buildRightCluster(): HTMLElement {
    const modes: Array<[ViewMode, "pencil" | "columns" | "eye", string, string]> = [
      ["editor", "pencil", "Editor", "Modo Editor (Ctrl+1)"],
      ["split", "columns", "Dividido", "Modo Dividido (Ctrl+2)"],
      ["preview", "eye", "Vista previa", "Modo Vista previa (Ctrl+3)"],
    ];
    const seg = h("div", { class: "seg", role: "group", ariaLabel: "Modo de vista" });
    for (const [mode, ic, label, title] of modes) {
      const btn = h(
        "button",
        { class: "seg-btn", title },
        icon(ic, 13),
        h("span", { class: "seg-label" }, label),
      ) as HTMLButtonElement;
      btn.dataset.mode = mode;
      btn.addEventListener("click", () => this.setMode(mode));
      this.segBtns[mode] = btn;
      seg.append(btn);
    }
    this.outlineBtn = h(
      "button",
      { class: "icon-btn menubar-extra", title: "Esquema (F9)", ariaLabel: "Esquema" },
      icon("list", 15),
    ) as HTMLButtonElement;
    this.outlineBtn.addEventListener("click", () => this.toggleOutline());
    return h("div", { class: "menubar-right" }, seg, this.outlineBtn);
  }

  private updateSeg(): void {
    const tab = this.activeTab;
    for (const [mode, btn] of Object.entries(this.segBtns) as Array<[ViewMode, HTMLButtonElement]>) {
      btn.classList.toggle("seg-active", tab?.mode === mode);
    }
    this.outlineBtn?.classList.toggle("icon-btn-active", this.settings.outlineOpen);
    this.toolbar.refresh();
  }

  private onSplitterDown(e: PointerEvent): void {
    e.preventDefault();
    const rect = this.workbench.getBoundingClientRect();
    const move = (ev: PointerEvent): void => {
      const ratio = (ev.clientX - rect.left) / rect.width;
      this.editorPane.style.width = `${clamp(ratio, 0.15, 0.85) * 100}%`;
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const pct = parseFloat(this.editorPane.style.width);
      if (Number.isFinite(pct)) this.setSplitRatio(pct / 100);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private wireScrollSync(): void {
    let lastSent = 0;
    const onEditorScroll = (): void => {
      const tab = this.activeTab;
      if (!tab || tab.mode !== "split") return;
      if (Date.now() < this.syncLock) return;
      const now = Date.now();
      if (now - lastSent < 60) return;
      lastSent = now;
      this.preview.scrollToLine(this.topLine(), false);
    };
    this.view.scrollDOM.addEventListener("scroll", onEditorScroll, { passive: true });

    this.preview.onScrollLine((line) => {
      const tab = this.activeTab;
      if (!tab || tab.mode !== "split") return;
      const ln = Math.max(1, Math.ceil(line));
      this.previewLine = ln;
      if (this.settings.outlineOpen) this.outline.render(tab.render?.toc ?? [], ln);
      this.syncLock = Date.now() + 150;
      const doc = this.view.state.doc;
      const pos = doc.line(Math.min(ln, doc.lines)).from;
      this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) });
    });

    this.preview.onBlockClick((line) => {
      const tab = this.activeTab;
      if (!tab || tab.mode !== "split") return;
      this.jumpToLine(line);
    });
  }

  private topLine(): number {
    try {
      const rect = this.view.scrollDOM.getBoundingClientRect();
      const pos = this.view.posAtCoords({ x: rect.left + 16, y: rect.top + 4 });
      if (pos === null) return 1;
      return this.view.state.doc.lineAt(pos).number;
    } catch {
      return 1;
    }
  }

  private wireShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest(".palette, .dialog-overlay, .goto-panel, .menu")) return;
      const mod = e.ctrlKey || e.metaKey;
      const tab = this.activeTab;
      if (e.key === "F5") {
        e.preventDefault();
        void this.reloadFromDisk(this.activeTab?.id ?? "");
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        this.toggleOutline();
        return;
      }
      if (!mod) return;
      if (e.key === "Tab" && !e.altKey) {
        e.preventDefault();
        this.cycleTab(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.altKey && !e.shiftKey) {
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          void this.saveAll();
        }
        return;
      }
      const k = e.key.toLowerCase();
      // Zoom antes de la rama de Shift: en teclado US Ctrl++ llega como Ctrl+Shift+=.
      if (k === "+" || k === "=" || e.code === "NumpadAdd") {
        e.preventDefault();
        this.zoomBy(ZOOM_STEP);
        return;
      }
      if (k === "-" || k === "_" || e.code === "NumpadSubtract") {
        e.preventDefault();
        this.zoomBy(-ZOOM_STEP);
        return;
      }
      if (!e.shiftKey && (k === "0" || e.code === "Numpad0")) {
        e.preventDefault();
        this.setZoom(1);
        return;
      }
      if (e.shiftKey) {
        if (k === "s") {
          e.preventDefault();
          void this.saveTabAs(tab?.id ?? "");
        } else if (k === "p") {
          e.preventDefault();
          this.openPalette();
        } else if (k === "e") {
          e.preventDefault();
          void this.exportHtml();
        } else if (k === "w") {
          e.preventDefault();
          this.setWordWrap(!this.settings.wordWrap);
        } else if (k === "n") {
          e.preventDefault();
          this.setLineNumbers(!this.settings.lineNumbers);
        }
        return;
      }
      switch (k) {
        case "n":
          e.preventDefault();
          this.newTab();
          break;
        case "o":
          e.preventDefault();
          this.openOpenDialog();
          break;
        case "s":
          e.preventDefault();
          void this.saveTab(tab?.id ?? "");
          break;
        case "w":
          e.preventDefault();
          if (tab) this.requestCloseTab(tab.id);
          break;
        case "p":
          e.preventDefault();
          void this.printDoc();
          break;
        case "f":
          e.preventDefault();
          this.find();
          break;
        case "h":
          e.preventDefault();
          this.replace();
          break;
        case "g":
          e.preventDefault();
          this.gotoLine();
          break;
        case "1":
          e.preventDefault();
          this.setMode("editor");
          break;
        case "2":
          e.preventDefault();
          this.setMode("split");
          break;
        case "3":
          e.preventDefault();
          this.setMode("preview");
          break;
        default:
          break;
      }
    });

    const wheelZoom = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    };
    this.editorPane.addEventListener("wheel", wheelZoom, { passive: false });
    this.previewPane.addEventListener("wheel", wheelZoom, { passive: false });
  }

  private cycleTab(dir: 1 | -1): void {
    if (!this.tabs.length) return;
    const idx = this.tabs.findIndex((t) => t.id === this.activeId);
    const next = this.tabs[(idx + dir + this.tabs.length) % this.tabs.length];
    this.activateTab(next.id);
  }

  private wireGlobalEvents(): void {
    if (inTauri) {
      void listen<FileChangedEvent>(EVENT_FILE_CHANGED, (e) => this.onFileChanged(e.payload));
      void listen<string[]>(EVENT_OPEN_FILES, (e) => void this.openPaths(e.payload));
      void getCurrentWebview().onDragDropEvent((ev) => {
        if (ev.payload.type === "drop") {
          document.body.classList.remove("dragging-file");
          void this.openPaths(ev.payload.paths);
        } else if (ev.payload.type === "enter" || ev.payload.type === "over") {
          document.body.classList.add("dragging-file");
        } else if (ev.payload.type === "leave") {
          document.body.classList.remove("dragging-file");
        }
      });
      void getCurrentWindow().onCloseRequested((e) => void this.handleClose(e));
    } else {
      window.addEventListener("dragover", (e) => e.preventDefault());
      window.addEventListener("drop", (e) => {
        e.preventDefault();
        const dt = e.dataTransfer;
        if (!dt) return;
        void (async () => {
          for (const file of Array.from(dt.files)) {
            if (file.size > 10 * 1024 * 1024) continue;
            const text = await file.text();
            const tab = this.makeUntitledTab(text);
            tab.name = file.name;
            this.addTab(tab);
          }
        })();
      });
    }

    document.addEventListener("plume:open-path", (e) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) void this.openPaths([detail]);
    });

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    this.systemDark = mq.matches;
    mq.addEventListener("change", (e) => {
      this.systemDark = e.matches;
      if (this.settings.theme === "system") this.applyTheme();
    });

    window.addEventListener("beforeunload", () => {
      this.persistSession.flush();
    });
  }

  private async handleClose(e: { preventDefault: () => void }): Promise<void> {
    const dirty = this.tabs.filter((t) => isTabDirty(t));
    if (dirty.length === 0) {
      this.persistSession.flush();
      return;
    }
    e.preventDefault();
    for (const tab of dirty) {
      this.activateTab(tab.id);
      await this.requestCloseTabAsync(tab.id);
      if (this.tabs.some((t) => t.id === tab.id && isTabDirty(t))) return;
    }
    if (this.tabs.every((t) => !isTabDirty(t))) {
      this.persistSession.flush();
      void getCurrentWindow().destroy().catch(() => {});
    }
  }

  private async doPersist(): Promise<void> {
    const session: SessionTab[] = this.tabs.map((t) => ({
      path: t.path,
      content: t.path ? undefined : t.doc.toString().slice(0, 1_000_000),
      mode: t.mode,
      cursor: t.cursor,
      eol: t.eol,
      encoding: t.encoding,
      hasBom: t.hasBom,
    }));
    const persisted: PersistedSettings & { v: number } = {
      v: 1,
      ...this.settings,
      session,
      activePath: this.activeTab?.path ?? null,
    };
    await safe(ipc.saveSettings(persisted), undefined);
  }
}