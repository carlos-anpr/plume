// Contrato compartido frontend <-> backend (Rust) <-> preview.
// Los nombres de campo van en snake_case porque así los serializa serde.
// Cualquier cambio aquí se coordina en docs/ARQUITECTURA.md.

export type LineEnding = "LF" | "CRLF";

export interface Heading {
  level: number; // 1..6
  text: string; // texto plano
  id: string; // ancla única, igual al id del <hN> del html
  line: number; // línea de origen, 1-based
}

export interface DocStats {
  words: number;
  chars: number;
  lines: number;
  reading_minutes: number;
}

export interface RenderResult {
  html: string; // ya saneado, ver docs/ARQUITECTURA.md §HTML
  toc: Heading[];
  stats: DocStats;
  front_matter: string | null; // YAML crudo sin los delimitadores ---
}

export interface OpenedDoc {
  path: string; // ruta absoluta
  content: string; // siempre con \n (normalizado)
  encoding: string; // etiqueta WHATWG: "UTF-8", "windows-1252", "UTF-16LE"...
  has_bom: boolean;
  line_ending: LineEnding; // el que tenía el fichero en disco
  modified_ms: number;
}

export interface SaveRequest {
  path: string;
  content: string; // con \n; el backend convierte a line_ending
  encoding: string;
  has_bom: boolean;
  line_ending: LineEnding;
}

export interface SaveResult {
  modified_ms: number;
}

export interface FileChangedEvent {
  path: string;
  modified_ms: number;
  removed: boolean;
}

// Nombre de los eventos emitidos por el backend.
export const EVENT_FILE_CHANGED = "plume://file-changed";
export const EVENT_OPEN_FILES = "plume://open-files"; // payload: string[] (2ª instancia / abrir con…)

// API del módulo de vista previa (src/preview/), consumida por la UI.
export interface PreviewApi {
  /** Pinta el resultado. Reutiliza el DOM existente (diff) y cachea diagramas/fórmulas por hash. */
  update(result: RenderResult, baseDir: string | null): Promise<void>;
  /** Desplaza la vista previa para que la línea de origen `line` quede arriba. */
  scrollToLine(line: number, smooth?: boolean): void;
  /** Se llama cuando el usuario desplaza la vista previa; recibe la línea de origen visible arriba. */
  onScrollLine(cb: (line: number) => void): void;
  /** El usuario hace clic en un elemento de la vista previa: línea de origen del bloque. */
  onBlockClick(cb: (line: number) => void): void;
  setTheme(theme: "light" | "dark"): void;
  /** HTML autocontenido (estilos incluidos, diagramas ya como SVG) para exportar. */
  exportHtml(title: string): Promise<string>;
  destroy(): void;
}
