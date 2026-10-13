# Plume — arquitectura y reparto

Bloc de notas al estilo del de Windows 11 que además muestra Markdown con diagramas
(Mermaid), fórmulas (KaTeX), tablas GFM, gráficos (ECharts), código resaltado, alertas,
notas al pie y listas de tareas. Rápido, ligero, offline y bonito.

## Stack

- **Tauri 2** (Rust) + webview del sistema (WebKitGTK / WebView2 / WKWebView).
- **Backend Rust** (`src-tauri/`): parseo y render de Markdown (`comrak`), resaltado
  (`syntect`, salida por clases), saneado (`ammonia`), E/S de ficheros con detección de
  codificación (`encoding_rs` + `chardetng`), vigilancia de ficheros (`notify`),
  ajustes y recientes en el directorio de config de la app.
- **Frontend** (`src/`): TypeScript + Vite sin framework. Editor **CodeMirror 6**.
  Vista previa con **KaTeX**, **Mermaid** y **ECharts** cargados bajo demanda
  (`import()` dinámico: no se descargan ni ejecutan si el documento no los usa).
- Todo empaquetado local: **prohibido** CDN o red en tiempo de ejecución (fuentes con
  `@fontsource-variable/*`).

## Módulos

| Carpeta | Qué |
|---|---|
| `src-tauri/` | comandos Rust: render Markdown, ficheros, vigilancia, ajustes y recientes |
| `src/preview/` | vista previa: diff del DOM, KaTeX, Mermaid, ECharts, visor y exportación |
| `src/shell/`, `src/editor/` | ventana, pestañas, menús, barra de herramientas, editor CodeMirror |
| `src/types.ts`, `src/ipc.ts`, `src/styles/tokens.css` | contrato común y tokens de diseño |

## Comandos IPC (`src/ipc.ts` ↔ `src-tauri/src/`)

Tipos en `src/types.ts`. Todos devuelven `Result<T, String>`; el error es un texto
corto apto para mostrar al usuario.

| Comando | Args | Devuelve |
|---|---|---|
| `render_markdown` | `source: String` | `RenderResult` |
| `open_file` | `path` | `OpenedDoc` (detecta BOM, UTF-8/16, legacy con chardetng; normaliza a `\n`) |
| `save_file` | `req: SaveRequest` | `SaveResult` (escritura atómica: temporal + rename; reconvierte EOL, codificación y BOM) |
| `write_text` | `path, content` | `()` |
| `launch_files` | — | rutas recibidas por argv al arrancar (absolutas) |
| `recent_files` / `add_recent` | `path` | lista (máx 15, sin duplicados, más reciente primero) |
| `watch_file` / `unwatch_file` | `path` | evento `plume://file-changed` al cambiar en disco (debounce 300 ms; ignora el cambio provocado por nuestro propio `save_file`) |
| `load_settings` / `save_settings` | `settings: JSON` | JSON opaco guardado en `settings.json` |

Plugin de instancia única: si se abre otro fichero con la app ya abierta, se emite
`plume://open-files` con las rutas a la ventana existente y se enfoca.

`render_markdown` debe tardar < 5 ms para 1.000 líneas y < 40 ms para 10.000 (release).
Se ejecuta fuera del hilo principal (`async` command).

## HTML que produce `render_markdown` (contrato con la vista previa)

- Extensiones comrak: tablas, tachado, autolink, tasklist, notas al pie, front matter
  `---`, alertas GitHub (`> [!NOTE]` …), `math_dollars` y `math_code`, encabezados con id,
  descripción de listas, superíndice. `render.sourcepos = true` → cada bloque lleva
  `data-sourcepos="L1:C1-L2:C2"` (la vista previa lo usa para sincronizar scroll).
- Fórmulas: `<span data-math-style="inline">TeX</span>` y
  `<span data-math-style="display">TeX</span>` (salida nativa de comrak; TeX escapado).
- Bloques especiales (NO se resaltan; se pasan crudos y escapados):
  - ` ```mermaid ` → `<pre class="plume-diagram" data-kind="mermaid" data-sourcepos=…><code>…</code></pre>`
  - ` ```chart ` / ` ```echarts ` → igual con `data-kind="chart"`. Contenido: JSON de
    opción de ECharts. La vista previa admite además un atajo simple:
    `{"type":"bar|line|pie|area|scatter|radar","labels":[…],"series":{"Nombre":[…]}}`.
  - ` ```math ` → `data-kind="math"` (bloque display).
- Código: `<pre class="plume-code" data-lang="rust"><code>` con spans de clase `hl-*`
  (syntect `ClassStyle::SpacedPrefixed { prefix: "hl-" }`). Se generan
  `src/preview/syntax-light.css` y `syntax-dark.css` (temas de syntect, selectores
  prefijados con `:root[data-theme=…]`).
- HTML crudo en el Markdown: permitido pero **saneado con ammonia** (sin `script`,
  `style`, `iframe`, manejadores `on*`, ni `javascript:`). Se conservan `class`, `id`,
  `data-*`, `align`, `width`, `height`, `details/summary`, `kbd`, `sub/sup`, `mark`.
- Imágenes con ruta relativa: se dejan tal cual; la vista previa las resuelve contra
  `baseDir` con `convertFileSrc` (protocolo `asset`).
- Enlaces: la vista previa intercepta el clic; `#ancla` hace scroll, `http(s)` abre en
  el navegador del sistema (`plugin-opener`), `.md` relativo abre en pestaña nueva
  (evento DOM `plume:open-path` con `detail: rutaAbsoluta`, que escucha la UI).

## Vista previa (`src/preview/`)

`createPreview(container: HTMLElement): PreviewApi` (interfaz en `src/types.ts`).

- Actualización incremental: diff del DOM (`idiomorph`), nada de reemplazar todo el
  `innerHTML`; el scroll no salta al teclear.
- Caché por hash del texto: SVG de Mermaid, HTML de KaTeX, instancias de ECharts.
  Un diagrama que no cambia no se re-renderiza.
- Mermaid/ECharts/KaTeX con `import()` dinámico; los temas se derivan de los tokens
  CSS (`--chart-*`, `--fg`, `--bg-*`, fuentes). Cambiar de tema repinta diagramas.
- Errores de diagrama/fórmula: tarjeta discreta con el mensaje, sin romper el resto.
- Tipografía de lectura cuidada: medida máx. ~76ch centrada, ritmo vertical, tablas
  con cabecera fija visual y filas cebra suaves, citas y alertas con icono, código con
  botón copiar e indicador de lenguaje, anclas en encabezados al pasar el ratón.

## Shell de la app (`src/shell/`, `src/editor/`)

Referencia visual: Bloc de notas de Windows 11 (2024+) llevado a 2026.

- Ventana sin decoraciones (`decorations: false`): barra de título propia de 40 px con
  pestañas integradas (como Win11 Notepad), botón `+`, y botones min/max/cerrar
  propios. Zona arrastrable con `data-tauri-drag-region`; doble clic maximiza.
- Debajo, barra de menú compacta: Archivo, Editar, Ver (+ botón segmentado de modo:
  **Editor · Dividido · Vista previa**, y botón de esquema/TOC).
- Pestañas múltiples, cada una con su documento, estado de cambios (punto), cierre con
  confirmación si hay cambios sin guardar (diálogo propio, no `confirm()`).
- Editor CodeMirror 6: markdown GFM con resaltado sutil, ajuste de línea conmutables,
  números de línea opcionales, búsqueda/reemplazo con panel estilizado, ir a línea,
  multicursor, deshacer ilimitado por pestaña, zoom Ctrl +/−/0 y Ctrl+rueda.
- Modo por pestaña: ficheros `.md/.markdown/.mdx` arrancan en Dividido; el resto en Editor.
- Render: debounce ~120 ms tras teclear, `ipc.renderMarkdown`, `preview.update`.
- Scroll sincronizado editor ↔ vista previa en modo Dividido (con la API de la vista
  previa). Divisor arrastrable.
- Barra de estado (como Notepad): Ln, Col · caracteres/palabras · tiempo de lectura ·
  zoom % · EOL (LF/CRLF, clic para cambiar) · codificación (clic para cambiar).
- Archivo: Nuevo (Ctrl+N), Nueva ventana no, Abrir (Ctrl+O, `plugin-dialog`), Recientes,
  Guardar (Ctrl+S), Guardar como (Ctrl+Shift+S), Guardar todo, Exportar HTML,
  Imprimir/PDF (`window.print()` con CSS de impresión de la vista previa), Cerrar pestaña
  (Ctrl+W). Arrastrar y soltar ficheros sobre la ventana los abre.
- Paleta de comandos (Ctrl+Shift+P) con búsqueda difusa de todas las acciones.
- Recarga si el fichero cambia en disco (silenciosa si no hay cambios locales; aviso
  en barra si los hay).
- Ajustes persistentes vía `ipc.saveSettings`: tema (sistema/claro/oscuro), ajuste de
  línea, números de línea, zoom, fuente del editor, pestañas abiertas y sesión
  (restaurar pestañas sin guardar como hace Notepad de Win11).
- Atajos visibles en menús. Todo navegable por teclado, foco visible (`--ring`).
- Animaciones cortas (`--dur-*`) y `prefers-reduced-motion` respetado.

## Criterios de "terminado"

- `cargo test`, `cargo clippy -- -D warnings`, `npm run build` sin errores.
- `npm run tauri build` genera binario; arranque en frío < 400 ms hasta ventana pintada.
- `docs/muestra.md` se ve perfecto en claro y oscuro.
