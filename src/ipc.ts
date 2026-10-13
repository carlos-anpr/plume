// Única puerta de la UI hacia los comandos Rust. No llamar a invoke() fuera de aquí.
import { invoke } from "@tauri-apps/api/core";
import type { OpenedDoc, RenderResult, SaveRequest, SaveResult } from "./types";

export const ipc = {
  renderMarkdown: (source: string) => invoke<RenderResult>("render_markdown", { source }),
  openFile: (path: string) => invoke<OpenedDoc>("open_file", { path }),
  saveFile: (req: SaveRequest) => invoke<SaveResult>("save_file", { req }),
  /** Escribe texto UTF-8 tal cual (exportar HTML). */
  writeText: (path: string, content: string) => invoke<void>("write_text", { path, content }),
  launchFiles: () => invoke<string[]>("launch_files"),
  recentFiles: () => invoke<string[]>("recent_files"),
  addRecent: (path: string) => invoke<string[]>("add_recent", { path }),
  watchFile: (path: string) => invoke<void>("watch_file", { path }),
  unwatchFile: (path: string) => invoke<void>("unwatch_file", { path }),
  /** Ajustes de la UI: JSON opaco para el backend. */
  loadSettings: () => invoke<unknown>("load_settings"),
  saveSettings: (settings: unknown) => invoke<void>("save_settings", { settings }),
};
