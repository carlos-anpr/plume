import { createPreview, resolveDocumentPath } from "../index";
import type { RenderResult, PreviewApi } from "../../types";
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export async function checkPreview(
  container: HTMLElement,
  result: RenderResult,
): Promise<{ checks: string[]; preview: PreviewApi }> {
  const preview = createPreview(container);
  const checks: string[] = [];
  await preview.update({ ...result, html: "<p>Documento sencillo</p>" }, null);
  const resources = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name);
  assert(
    !resources.some((name) =>
      /node_modules.*(?:mermaid|echarts|katex)/i.test(name),
    ),
    "Diagram engines loaded for plain text",
  );
  checks.push("Motores cargados solo cuando el documento los utiliza");
  await preview.update(result, "/tmp/plume-docs");
  assert(
    container.querySelector(".plume-diagram .plume-diagram-content svg"),
    "Mermaid SVG missing",
  );
  assert(
    container.querySelector(".plume-chart .plume-diagram-content svg"),
    "Chart SVG missing",
  );
  assert(container.querySelector(".katex"), "KaTeX missing");
  assert(
    !container.querySelector(".plume-render-error"),
    "Valid sample produced render errors",
  );
  checks.push("Mermaid, ECharts, KaTeX y código de la muestra");
  const chart = container.querySelector(".plume-chart");
  const svg = chart?.querySelector("svg");
  const math = container.querySelector(".katex");
  const mermaid = container.querySelector("pre[data-kind=mermaid]");
  container.scrollTop = 100;
  await preview.update(result, "/tmp/plume-docs");
  assert(
    chart === container.querySelector(".plume-chart") &&
      svg === chart?.querySelector("svg"),
    "Chart was recreated",
  );
  assert(
    math === container.querySelector(".katex") &&
      mermaid === container.querySelector("pre[data-kind=mermaid]"),
    "Cached render was recreated",
  );
  assert(container.scrollTop === 100, "Scroll changed on identical update");
  checks.push("DOM, instancias y scroll preservados al actualizar");
  let clicked = 0;
  preview.onBlockClick((line) => {
    clicked = line;
  });
  container.querySelector<HTMLElement>("h1")?.click();
  assert(clicked > 0, "Source line callback missing");
  preview.scrollToLine(result.toc[result.toc.length - 1]?.line ?? 20);
  checks.push("Sincronización por posiciones de origen");
  const copyButton =
    container.querySelector<HTMLButtonElement>("button[data-copy]");
  assert(copyButton, "Copy button missing");
  copyButton.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(
    (await navigator.clipboard.readText()) ===
      copyButton.closest("pre")?.querySelector("code")?.textContent,
    "Code copy failed",
  );
  checks.push("Copia del código al portapapeles");
  const oldWidth = chart?.querySelector("svg")?.getAttribute("width");
  const root = container.querySelector<HTMLElement>(".plume-preview")!;
  root.style.maxWidth = "500px";
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert(
    chart?.querySelector("svg")?.getAttribute("width") !== oldWidth,
    "Chart did not resize",
  );
  root.style.maxWidth = "";
  checks.push("Gráficos redimensionados por ResizeObserver");
  const linked = {
    ...result,
    html:
      result.html +
      '<p data-sourcepos="180:1-180:10"><a href="../doc.md">Documento</a></p>',
  };
  await preview.update(linked, "/tmp/plume-docs");
  let opened = "";
  const openListener = (event: Event) => {
    opened = (event as CustomEvent<string>).detail;
  };
  container.addEventListener("plume:open-path", openListener);
  container.querySelector<HTMLAnchorElement>('a[href="../doc.md"]')?.click();
  assert(opened === "/tmp/doc.md", "Markdown link event missing");
  container.removeEventListener("plume:open-path", openListener);
  await preview.update(result, "/tmp/plume-docs");
  checks.push("Enlaces Markdown convertidos en eventos de apertura");
  document.documentElement.dataset.theme = "dark";
  preview.setTheme("dark");
  await preview.update(result, "/tmp/plume-docs");
  assert(
    container.querySelector(".plume-chart .plume-diagram-content svg") &&
      !container.querySelector(".plume-render-error"),
    "Dark theme failed",
  );
  checks.push("Tema oscuro y repintado de diagramas");
  const html = await preview.exportHtml("Prueba <segura>");
  assert(html.includes("Prueba &lt;segura&gt;"), "Export title not escaped");
  assert(
    html.includes("data:font") || html.includes("data:application"),
    "KaTeX fonts not embedded",
  );
  assert(
    !html.includes("url(fonts/") && !html.includes("<script"),
    "Export is not self-contained",
  );
  const exported = new DOMParser().parseFromString(html, "text/html");
  assert(
    exported.querySelector(".plume-chart .plume-diagram-content svg"),
    "Chart SVG missing from export",
  );
  checks.push("HTML con SVG, estilos y fuentes KaTeX incrustados");
  await preview.update(
    {
      ...result,
      html:
        result.html +
        '<img src="/src-tauri/icons/32x32.png" alt="Icono de prueba">',
    },
    null,
  );
  const imageHtml = await preview.exportHtml("Imagen incluida");
  const imageExport = new DOMParser().parseFromString(imageHtml, "text/html");
  assert(
    imageExport
      .querySelector("img")
      ?.getAttribute("src")
      ?.startsWith("data:image/png"),
    "Exported image was not embedded",
  );
  checks.push(
    "Imágenes incrustadas mediante el cargador de imágenes compatible con CSP",
  );
  const errors = {
    ...result,
    html: '<pre class="plume-diagram" data-kind="chart"><code>broken json</code></pre><pre class="plume-diagram" data-kind="mermaid"><code>this is invalid</code></pre><span data-math-style="inline">\\badCommand</span><p data-sourcepos="4:1-4:10">Sigue funcionando</p>',
  };
  await preview.update(errors, null);
  assert(
    container.querySelectorAll(".plume-render-error").length === 3,
    "Errors not isolated",
  );
  assert(
    container.textContent?.includes("Sigue funcionando"),
    "Error broke remaining content",
  );
  checks.push("Errores de gráfico, diagrama y fórmula aislados");
  assert(
    resolveDocumentPath("/home/docs", "../other/doc.md") ===
      "/home/other/doc.md",
    "Unix paths failed",
  );
  assert(
    resolveDocumentPath("C:\\docs", "../other/doc.md") === "C:\\other\\doc.md",
    "Windows paths failed",
  );
  assert(
    resolveDocumentPath("C:\\docs", "/root.md") === "C:\\root.md",
    "Windows rooted path failed",
  );
  assert(
    resolveDocumentPath("\\\\server\\share\\docs", "../../../../root.md") ===
      "\\\\server\\share\\root.md",
    "UNC share root escaped",
  );
  checks.push("Resolución de rutas Unix y Windows");
  const shortcuts = ["bar", "line", "area", "scatter", "radar", "pie"]
    .map(
      (type) =>
        '<pre class="plume-diagram" data-kind="chart"><code>' +
        JSON.stringify({
          type,
          labels: ["A", "B", "C"],
          series: { Values: [1, 2, 3] },
        }) +
        "</code></pre>",
    )
    .join("");
  await preview.update({ ...result, html: shortcuts }, null);
  assert(
    container.querySelectorAll(".plume-chart .plume-diagram-content svg")
      .length === 6 && !container.querySelector(".plume-render-error"),
    "Chart shortcuts failed",
  );
  checks.push("Atajos bar, line, area, scatter, radar y pie");
  const nested = {
    ...result,
    html:
      "<blockquote>" +
      shortcuts.slice(0, shortcuts.indexOf("</pre>") + 6) +
      "</blockquote>",
  };
  await preview.update(nested, null);
  const nestedChart = container.querySelector<HTMLElement>(".plume-chart")!;
  const { getInstanceByDom } = await import("echarts");
  assert(
    getInstanceByDom(
      nestedChart.querySelector<HTMLElement>(".plume-diagram-content")!,
    ),
    "Nested chart not initialized",
  );
  await preview.update({ ...result, html: "<p>Sin gráfico</p>" }, null);
  assert(
    !getInstanceByDom(
      nestedChart.querySelector<HTMLElement>(".plume-diagram-content")!,
    ),
    "Removed nested chart was not disposed",
  );
  checks.push("Instancias de gráficos liberadas al eliminar su bloque padre");
  const duplicate = {
    ...result,
    html: '<pre class="plume-diagram" data-kind="mermaid"><code>graph TD; A-->B</code></pre>'.repeat(
      2,
    ),
  };
  await preview.update(duplicate, null);
  const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
  assert(new Set(ids).size === ids.length, "Duplicate SVG IDs");
  checks.push("SVG duplicados con IDs únicos");
  const oldUpdate = preview.update(duplicate, null);
  const latestUpdate = preview.update(
    { ...result, html: "<p>Última revisión</p>" },
    null,
  );
  await Promise.all([oldUpdate, latestUpdate]);
  assert(
    container.textContent === "Última revisión",
    "Stale update won the race",
  );
  checks.push("La última actualización prevalece sobre las anteriores");
  preview.destroy();
  assert(!container.querySelector(".plume-preview"), "Destroy retained DOM");
  await preview.update(result, null);
  assert(
    !container.querySelector(".plume-preview"),
    "Update after destroy retained DOM",
  );
  const finalPreview = createPreview(container);
  document.documentElement.dataset.theme = "light";
  finalPreview.setTheme("light");
  await finalPreview.update(result, null);
  checks.push("Liberación de recursos y actualización tras destroy");
  return { checks, preview: finalPreview };
}
