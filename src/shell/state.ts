import type { EditorState, Text } from "@codemirror/state";
import type { LineEnding, RenderResult } from "../types";

export type ViewMode = "editor" | "split" | "preview";
export type ThemeMode = "system" | "light" | "dark";
export type ToastKind = "info" | "error" | "success";

export interface ExternalChange {
  kind: "changed" | "removed";
  content: string | null;
  modifiedMs: number | null;
}

export interface Tab {
  id: string;
  path: string | null;
  name: string;
  doc: Text;
  savedText: Text | null;
  metaDirty: boolean;
  encoding: string;
  hasBom: boolean;
  eol: LineEnding;
  modifiedMs: number;
  previewable: boolean;
  mode: ViewMode;
  state: EditorState;
  scrollTop: number;
  cursor: { line: number; col: number };
  render: RenderResult | null;
  renderedDoc: Text | null;
  previewLine: number;
  external: ExternalChange | null;
}

export interface SessionTab {
  path: string | null;
  content?: string;
  mode: ViewMode;
  cursor?: { line: number; col: number };
  eol?: LineEnding;
  encoding?: string;
  hasBom?: boolean;
}

export interface FontOption {
  id: string;
  label: string;
  css: string;
}

export const FONTS: FontOption[] = [
  { id: "jetbrains", label: "JetBrains Mono", css: '"JetBrains Mono Variable", ui-monospace, monospace' },
  { id: "cascadia", label: "Cascadia Code", css: '"Cascadia Code", ui-monospace, monospace' },
  {
    id: "system",
    label: "Monoespaciada del sistema",
    css: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
];

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;

export interface Settings {
  theme: ThemeMode;
  wordWrap: boolean;
  lineNumbers: boolean;
  zoom: number;
  font: string;
  splitRatio: number;
  outlineOpen: boolean;
  toolbar: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  wordWrap: true,
  lineNumbers: false,
  zoom: 1,
  font: "jetbrains",
  splitRatio: 0.5,
  outlineOpen: false,
  toolbar: true,
};

export interface PersistedSettings extends Settings {
  session: SessionTab[];
  activePath: string | null;
}

const MODES: ViewMode[] = ["editor", "split", "preview"];
const SESSION_CONTENT_LIMIT = 1_000_000;

function asMode(v: unknown): ViewMode | null {
  return typeof v === "string" && (MODES as string[]).includes(v) ? (v as ViewMode) : null;
}

export function mergeSettings(raw: unknown): PersistedSettings {
  const s: PersistedSettings = { ...DEFAULT_SETTINGS, session: [], activePath: null };
  if (!raw || typeof raw !== "object") return s;
  const o = raw as Record<string, unknown>;
  if (o.theme === "system" || o.theme === "light" || o.theme === "dark") s.theme = o.theme;
  if (typeof o.wordWrap === "boolean") s.wordWrap = o.wordWrap;
  if (typeof o.lineNumbers === "boolean") s.lineNumbers = o.lineNumbers;
  if (typeof o.zoom === "number" && Number.isFinite(o.zoom)) {
    s.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, o.zoom));
  }
  if (typeof o.font === "string" && FONTS.some((f) => f.id === o.font)) s.font = o.font;
  if (typeof o.splitRatio === "number" && Number.isFinite(o.splitRatio)) {
    s.splitRatio = Math.min(0.85, Math.max(0.15, o.splitRatio));
  }
  if (typeof o.outlineOpen === "boolean") s.outlineOpen = o.outlineOpen;
  if (typeof o.toolbar === "boolean") s.toolbar = o.toolbar;
  if (typeof o.activePath === "string") s.activePath = o.activePath;
  if (Array.isArray(o.session)) {
    for (const e of o.session) {
      if (!e || typeof e !== "object") continue;
      const t = e as Record<string, unknown>;
      const mode = asMode(t.mode) ?? "editor";
      let path: string | null = null;
      let content: string | undefined;
      if (typeof t.path === "string" && t.path) {
        path = t.path;
      } else if (typeof t.content === "string" && t.content) {
        content = t.content.slice(0, SESSION_CONTENT_LIMIT);
      } else continue;
      const entry: SessionTab = { path, mode };
      if (content !== undefined) entry.content = content;
      if (t.cursor && typeof t.cursor === "object") {
        const c = t.cursor as Record<string, unknown>;
        if (typeof c.line === "number" && typeof c.col === "number") entry.cursor = { line: c.line, col: c.col };
      }
      if (t.eol === "LF" || t.eol === "CRLF") entry.eol = t.eol;
      if (typeof t.encoding === "string") entry.encoding = t.encoding;
      if (typeof t.hasBom === "boolean") entry.hasBom = t.hasBom;
      s.session.push(entry);
    }
  }
  return s;
}

export function isTabDirty(tab: Tab): boolean {
  if (tab.metaDirty) return true;
  if (tab.savedText === null) return tab.doc.length > 0;
  return !tab.doc.eq(tab.savedText);
}

export interface AppCtx {
  readonly tabs: readonly Tab[];
  readonly activeTab: Tab | null;
  readonly settings: Settings;
  readonly recents: readonly string[];
  isDirty(id: string): boolean;
  newTab(): void;
  openPaths(paths: string[]): Promise<void>;
  activateTab(id: string): void;
  requestCloseTab(id: string): void;
  saveTab(id: string): Promise<boolean>;
  saveTabAs(id: string): Promise<boolean>;
  saveAll(): Promise<void>;
  setMode(mode: ViewMode): void;
  setTheme(theme: ThemeMode): void;
  zoomBy(delta: number): void;
  setZoom(z: number): void;
  setWordWrap(b: boolean): void;
  setLineNumbers(b: boolean): void;
  setToolbar(b: boolean): void;
  setFont(id: string): void;
  setSplitRatio(r: number): void;
  setEol(eol: LineEnding): void;
  setEncoding(encoding: string, bom: boolean): void;
  toggleOutline(force?: boolean): void;
  reloadFromDisk(id: string): void;
  keepLocalVersion(id: string): void;
  openOpenDialog(): void;
  exportHtml(): void;
  printDoc(): void;
  find(): void;
  replace(): void;
  gotoLine(): void;
  openPalette(): void;
  focusEditor(): void;
  editor(): import("@codemirror/view").EditorView | null;
  toast(msg: string, kind?: ToastKind): void;
}