import type { EChartsOption, EChartsType, SeriesOption } from "echarts";
import { RenderCache, hash } from "./cache";
export interface Palette {
  fg: string;
  muted: string;
  surface: string;
  raised: string;
  border: string;
  font: string;
  colors: string[];
  theme: "light" | "dark";
}
export function palette(
  container: HTMLElement,
  theme: "light" | "dark",
): Palette {
  const styles = getComputedStyle(container);
  const get = (name: string) => styles.getPropertyValue(name).trim();
  return {
    fg: get("--fg"),
    muted: get("--fg-muted"),
    surface: get("--bg-surface"),
    raised: get("--bg-raised"),
    border: get("--border"),
    font: get("--font-ui"),
    colors: Array.from({ length: 8 }, (_, i) => get(`--chart-${i + 1}`)),
    theme,
  };
}
let diagramId = 0;
let mermaidQueue: Promise<unknown> = Promise.resolve();
function diagramError(element: HTMLElement, error: unknown): void {
  element.classList.add("plume-render-error");
  element.setAttribute("role", "status");
  element.replaceChildren();
  const label = document.createElement("strong");
  label.textContent = "No se pudo dibujar este bloque";
  const detail = document.createElement("span");
  detail.textContent =
    error instanceof Error ? error.message : "Revisa la sintaxis del bloque.";
  element.append(label, detail);
}
export function uniqueSvg(markup: string): string {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const prefix = `plume-svg-${++diagramId}-`;
  const ids = new Map<string, string>();
  template.content.querySelectorAll("[id]").forEach((el) => {
    ids.set(el.id, prefix + el.id);
    el.id = prefix + el.id;
  });
  template.content.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      let value = attr.value;
      ids.forEach((replacement, old) => {
        value = value.split(`url(#${old})`).join(`url(#${replacement})`);
        if (value === `#${old}`) value = `#${replacement}`;
      });
      el.setAttribute(attr.name, value);
    }
    if (el.tagName.toLowerCase() === "style") {
      let css = el.textContent ?? "";
      css = css.replace(/#([a-zA-Z_][\w-]*)/g, (match, id: string) =>
        ids.has(id) ? `#${ids.get(id)}` : match,
      );
      el.textContent = css;
    }
  });
  return template.innerHTML;
}
async function mermaidSvg(
  source: string,
  tokens: Palette,
  width: number,
): Promise<string> {
  const task = mermaidQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      suppressErrorRendering: true,
      fontFamily: tokens.font,
      // Separaciones compactas: el diagrama cabe en el panel dividido sin scroll horizontal.
      flowchart: { htmlLabels: false, useMaxWidth: false, nodeSpacing: 32, rankSpacing: 38, padding: 10, diagramPadding: 6 },
      gantt: {
        useMaxWidth: false,
        // Mermaid añade márgenes propios al ancho pedido: se descuentan para que quepa en la tarjeta.
        useWidth: Math.max(360, width - 90),
        axisFormat: "%d %b",
        fontSize: 12,
        sectionFontSize: 12,
        leftPadding: 105,
      },
      sequence: { useMaxWidth: false },
      themeVariables: {
        darkMode: tokens.theme === "dark",
        fontSize: "14px",
        background: "transparent",
        primaryColor: tokens.surface,
        primaryTextColor: tokens.fg,
        primaryBorderColor: tokens.colors[0],
        actorBkg: tokens.surface,
        actorBorder: tokens.colors[0],
        actorTextColor: tokens.fg,
        signalColor: tokens.muted,
        signalTextColor: tokens.fg,
        labelBoxBkgColor: tokens.raised,
        labelBoxBorderColor: tokens.border,
        labelTextColor: tokens.fg,
        loopTextColor: tokens.fg,
        noteBkgColor: tokens.raised,
        noteTextColor: tokens.fg,
        noteBorderColor: tokens.colors[2],
        activationBkgColor: tokens.surface,
        activationBorderColor: tokens.colors[1],
        gridColor: tokens.border,
        sectionBkgColor: tokens.raised,
        altSectionBkgColor: tokens.surface,
        taskBkgColor: tokens.colors[0],
        taskBorderColor: tokens.colors[0],
        taskTextColor: tokens.fg,
        taskTextDarkColor: tokens.fg,
        taskTextLightColor: tokens.fg,
        taskTextOutsideColor: tokens.muted,
        doneTaskBkgColor: tokens.surface,
        doneTaskBorderColor: tokens.border,
        activeTaskBkgColor: tokens.raised,
        activeTaskBorderColor: tokens.colors[0],
        critBkgColor: tokens.raised,
        critBorderColor: tokens.colors[3],
        todayLineColor: tokens.colors[3],
        lineColor: tokens.muted,
        edgeLabelBackground: tokens.raised,
        secondaryColor: tokens.raised,
        tertiaryColor: tokens.surface,
        fontFamily: tokens.font,
        textColor: tokens.fg,
        clusterBkg: tokens.surface,
        clusterBorder: tokens.border,
        ...Object.fromEntries(
          tokens.colors.map((color, i) => [`pie${i + 1}`, color]),
        ),
      },
    });
    return (await mermaid.render(`plume-mermaid-${++diagramId}`, source)).svg;
  });
  mermaidQueue = task.catch(() => undefined);
  return task;
}
async function mathHtml(source: string, display: boolean): Promise<string> {
  const [{ default: katex }] = await Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css"),
  ]);
  return katex.renderToString(source, {
    displayMode: display,
    throwOnError: true,
    trust: false,
    strict: "warn",
    maxExpand: 1000,
    maxSize: 40,
  });
}
export async function prepareDiagrams(
  root: HTMLElement,
  tokens: Palette,
  cache: RenderCache,
): Promise<void> {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>("pre.plume-diagram, [data-math-style]"),
  );
  await Promise.all(
    elements.map(async (element) => {
      const source = element.matches("pre")
        ? (element.querySelector("code")?.textContent ?? "")
        : (element.textContent ?? "");
      const kind = element.dataset.kind ?? "math";
      const display =
        element.dataset.mathStyle === "display" || element.matches("pre");
      const body = document.createElement("div");
      body.className = "plume-diagram-content";
      if (element.matches("pre")) element.replaceChildren(body);
      const target = element.matches("pre") ? body : element;
      const width = Math.round(target.clientWidth || 640);
      const isGantt = kind === "mermaid" && /^\s*gantt\b/.test(source);
      const key = await hash(
        JSON.stringify([kind, display, source, tokens, isGantt ? width : null]),
      );
      element.dataset.renderKey = key;
      element.dataset.renderSource = source;
      if (kind === "chart") {
        element.classList.add("plume-chart");
        return;
      }
      try {
        let html = cache.get(key);
        if (html === undefined) {
          html =
            kind === "mermaid"
              ? await mermaidSvg(source, tokens, width)
              : await mathHtml(source, display);
          cache.set(key, html);
        }
        target.innerHTML = kind === "mermaid" ? uniqueSvg(html) : html;
        if (kind === "mermaid") {
          const svg = target.querySelector<SVGSVGElement>("svg");
          if (svg) {
            const naturalWidth =
              svg.viewBox.baseVal.width ||
              Number(svg.getAttribute("width")) ||
              width;
            // Se ajusta al ancho del panel sin bajar del 60 % (texto ~8,5 px); si aun así no cabe,
            // scroll horizontal en la tarjeta y el botón de ampliar para verlo entero.
            // CSS en vez de un ancho fijo: se adapta también al redimensionar el panel.
            const minScale = isGantt ? 11.5 / 12 : 0.6;
            svg.style.width = `${naturalWidth}px`;
            svg.style.maxWidth = "100%";
            svg.style.minWidth = `${Math.round(naturalWidth * minScale)}px`;
            svg.style.height = "auto";
            svg.querySelectorAll<SVGTextElement>("text").forEach((text) => {
              const size = parseFloat(getComputedStyle(text).fontSize);
              if (size < (isGantt ? 12 : 14))
                text.style.fontSize = `${isGantt ? 12 : 14}px`;
            });
            if (isGantt) {
              svg
                .querySelectorAll<SVGElement>(".grid .tick line, .grid path")
                .forEach((line) => {
                  line.style.stroke = tokens.border;
                });
              let previousEnd = -Infinity;
              svg
                .querySelectorAll<SVGTextElement>(".grid .tick text")
                .forEach((text) => {
                  text.style.fontSize = "12px";
                  text.style.fill = tokens.muted;
                  const position = text.parentElement
                    ?.getAttribute("transform")
                    ?.match(/translate\(([-\d.]+)/);
                  const x = position ? Number(position[1]) : 0;
                  const half = text.getBBox().width / 2;
                  if (x - half < previousEnd + 8)
                    text.style.visibility = "hidden";
                  else previousEnd = x + half;
                });
            }
          }
        }
        if (kind === "mermaid") {
          element.setAttribute("aria-label", "Diagrama Mermaid");
          element.setAttribute("role", "img");
        }
      } catch (error) {
        diagramError(element, error);
      }
    }),
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function shortcut(input: Record<string, unknown>): EChartsOption {
  const type = input.type;
  if (
    typeof type !== "string" ||
    !["bar", "line", "area", "pie", "scatter", "radar"].includes(type) ||
    !Array.isArray(input.labels) ||
    !object(input.series)
  )
    throw new Error("El gráfico requiere type, labels y series válidos.");
  const labels = input.labels.map(String);
  const series: SeriesOption[] = Object.entries(input.series).map(
    ([name, values]) => {
      if (
        !Array.isArray(values) ||
        !values.every(
          (v) =>
            (typeof v === "number" && Number.isFinite(v)) ||
            (Array.isArray(v) &&
              v.every((n) => typeof n === "number" && Number.isFinite(n))),
        )
      )
        throw new Error(`Serie «${name}»: utiliza valores numéricos.`);
      switch (type) {
        case "pie":
          return {
            name,
            type: "pie",
            radius: ["30%", "70%"],
            data: values.map((value, i) => ({
              name: labels[i] ?? String(i + 1),
              value,
            })),
          } as SeriesOption;
        case "radar":
          return {
            name,
            type: "radar",
            data: [{ name, value: values }],
          } as SeriesOption;
        case "scatter":
          return {
            name,
            type: "scatter",
            data: values.map((value, i) =>
              Array.isArray(value) ? value : [i, value],
            ),
          } as SeriesOption;
        default:
          return {
            name,
            type: type === "area" ? "line" : type,
            data: values,
            ...(type === "area"
              ? { areaStyle: { opacity: 0.18 }, smooth: true }
              : {}),
          } as SeriesOption;
      }
    },
  );
  if (type === "pie") return { legend: {}, series };
  if (type === "radar") {
    const max = Math.max(
      1,
      ...Object.values(input.series).flatMap((values) => values as number[]),
    );
    return {
      legend: {},
      radar: { indicator: labels.map((name) => ({ name, max })) },
      series,
    };
  }
  return {
    legend: {},
    grid: { top: 52, bottom: 40, left: 50, right: 24, containLabel: true },
    xAxis:
      type === "scatter"
        ? { type: "value" }
        : { type: "category", data: labels },
    yAxis: { type: "value" },
    series,
  };
}
export class Charts {
  private instances = new Map<HTMLElement, EChartsType>();
  private observer = new ResizeObserver((entries) =>
    entries.forEach((entry) =>
      this.instances.get(entry.target as HTMLElement)?.resize(),
    ),
  );
  async render(
    root: HTMLElement,
    tokens: Palette,
    current: () => boolean,
  ): Promise<void> {
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>(".plume-chart"),
    );
    if (!elements.some((el) => !this.instances.has(el))) return;
    const echarts = await import("echarts");
    if (!current()) return;
    for (const element of elements) {
      if (this.instances.has(element)) continue;
      let chart: EChartsType | undefined;
      try {
        const input: unknown = JSON.parse(element.dataset.renderSource ?? "");
        if (!object(input))
          throw new Error("La opción del gráfico debe ser un objeto JSON.");
        const option =
          typeof input.type === "string"
            ? shortcut(input)
            : (input as EChartsOption);
        const body =
          element.querySelector<HTMLElement>(".plume-diagram-content") ??
          element;
        body.replaceChildren();
        chart = echarts.init(
          body,
          {
            color: tokens.colors,
            textStyle: { color: tokens.fg, fontFamily: tokens.font },
            title: {
              textStyle: { color: tokens.fg },
              subtextStyle: { color: tokens.muted },
            },
            legend: { textStyle: { color: tokens.muted } },
            categoryAxis: {
              axisLine: { lineStyle: { color: tokens.border } },
              axisLabel: { color: tokens.muted },
            },
            valueAxis: {
              axisLabel: { color: tokens.muted },
              splitLine: { lineStyle: { color: tokens.border } },
            },
          },
          { renderer: "svg" },
        );
        chart.setOption({
          ...option,
          backgroundColor: "transparent",
          color: tokens.colors,
          animation: false,
          textStyle: {
            fontFamily: tokens.font,
            color: tokens.fg,
            textBorderWidth: 0,
          },
          series: (Array.isArray(option.series)
            ? option.series
            : option.series
              ? [option.series]
              : []
          ).map((series) => ({
            ...series,
            label: {
              ...("label" in series && object(series.label)
                ? series.label
                : {}),
              ...(series.type === "pie"
                ? { alignTo: "edge", edgeDistance: 10, distanceToLabelLine: 4 }
                : {}),
              color: tokens.muted,
              textBorderWidth: 0,
              textBorderColor: "transparent",
            },
            emphasis: {
              ...(object(series.emphasis) ? series.emphasis : {}),
              label: {
                ...(series.type === "pie"
                  ? {
                      alignTo: "edge",
                      edgeDistance: 10,
                      distanceToLabelLine: 4,
                    }
                  : {}),
                color: tokens.muted,
                textBorderWidth: 0,
                textBorderColor: "transparent",
              },
            },
          })) as SeriesOption[],
          tooltip: {
            trigger: "item",
            ...(object(option.tooltip) ? option.tooltip : {}),
            renderMode: "richText",
            backgroundColor: tokens.raised,
            borderColor: tokens.border,
            textStyle: { color: tokens.fg, fontFamily: tokens.font },
          },
        });
        this.instances.set(element, chart);
        this.observer.observe(element);
        element.setAttribute("role", "img");
        element.setAttribute("aria-label", "Gráfico de datos");
      } catch (error) {
        chart?.dispose();
        diagramError(element, error);
      }
    }
  }
  remove(element: Element): void {
    for (const [node, chart] of this.instances)
      if (element === node || element.contains(node)) {
        this.observer.unobserve(node);
        chart.dispose();
        this.instances.delete(node);
      }
  }
  destroy(): void {
    this.observer.disconnect();
    this.instances.forEach((chart) => chart.dispose());
    this.instances.clear();
  }
}
