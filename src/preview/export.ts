import { printThemeCss, lightTokens } from "./print";
import { Charts, palette, prepareDiagrams, uniqueSvg } from "./diagrams";
import { RenderCache } from "./cache";
import tokensCss from "../styles/tokens.css?raw";
import previewCss from "./preview.css?raw";
import lightCss from "./syntax-light.css?raw";
import darkCss from "./syntax-dark.css?raw";
const fonts = import.meta.glob<string>("/node_modules/katex/dist/fonts/*", {
  eager: true,
  query: "?url",
  import: "default",
});
async function dataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("No se pudo incluir un recurso en el HTML exportado.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("No se pudo incluir un recurso en el HTML exportado."));
    reader.readAsDataURL(blob);
  });
}
async function imageDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  // Asset images are allowed by img-src, but the app CSP deliberately excludes
  // asset: from connect-src. Use the image loader instead of fetch for these.
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  try {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas no disponible");
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    throw new Error("No se pudo incluir una imagen en el HTML exportado.");
  }
}
async function lightPrintClone(
  root: HTMLElement,
  cache: RenderCache,
): Promise<HTMLElement> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-100000px;top:0;width:760px;visibility:hidden;";
  host.setAttribute("aria-hidden", "true");
  for (const [name, value] of Object.entries(lightTokens))
    host.style.setProperty(name, value);
  const printable = root.cloneNode(true) as HTMLElement;
  printable.classList.add("plume-print-preparing");
  printable
    .querySelectorAll<HTMLElement>("[data-render-source]")
    .forEach((element) => {
      const source = element.dataset.renderSource ?? "";
      if (element.matches("pre")) {
        const code = document.createElement("code");
        code.textContent = source;
        element.replaceChildren(code);
      } else element.textContent = source;
      element.classList.remove("plume-render-error");
      delete element.dataset.renderKey;
    });
  host.append(printable);
  document.body.append(host);
  const engines = new Charts();
  try {
    const colors = palette(host, "light");
    await prepareDiagrams(printable, colors, cache);
    await engines.render(printable, colors, () => true);
    const copy = printable.cloneNode(true) as HTMLElement;
    // The two export views must not share heading, footnote or SVG IDs.
    copy.innerHTML = uniqueSvg(copy.innerHTML);
    return copy;
  } finally {
    engines.destroy();
    host.remove();
  }
}
export async function exportDocument(
  root: HTMLElement,
  title: string,
  theme: "light" | "dark",
  cache: RenderCache,
): Promise<string> {
  const copy = root.cloneNode(true) as HTMLElement;
  const printed = await lightPrintClone(root, cache);
  const views = [copy, printed];
  const embeddedImages = new Map<string, Promise<string>>();
  const imageSource = (url: string) => {
    let result = embeddedImages.get(url);
    if (!result) {
      result = imageDataUrl(url);
      embeddedImages.set(url, result);
    }
    return result;
  };
  views.forEach((view) => {
    view
      .querySelectorAll(".plume-code-toolbar, .plume-expand-button")
      .forEach((el) => el.remove());
    view
      .querySelectorAll("[data-render-source], [data-render-key]")
      .forEach((el) => {
        el.removeAttribute("data-render-source");
        el.removeAttribute("data-render-key");
      });
  });
  await Promise.all(
    views
      .flatMap((view) =>
        Array.from(view.querySelectorAll<HTMLImageElement>("img[src]")),
      )
      .map(async (img) => {
        img.src = await imageSource(img.src);
        img.removeAttribute("srcset");
      }),
  );
  await Promise.all(
    views
      .flatMap((view) =>
        Array.from(view.querySelectorAll<SVGImageElement>("svg image")),
      )
      .map(async (image) => {
        const href =
          image.getAttribute("href") ?? image.getAttribute("xlink:href");
        if (!href || href.startsWith("#")) return;
        const embedded = await imageSource(href);
        image.setAttribute("href", embedded);
        image.removeAttribute("xlink:href");
      }),
  );
  let mathCss = "";
  if (copy.querySelector(".katex")) {
    mathCss = (await import("katex/dist/katex.min.css?raw")).default;
    const urls = Array.from(
      new Set(
        Array.from(mathCss.matchAll(/url\(([^)]+)\)/g), (match) =>
          match[1].replace(/["']/g, ""),
        ),
      ),
    );
    for (const url of urls) {
      const filename = url.split("/").pop();
      const font = Object.entries(fonts).find(([path]) =>
        path.endsWith(`/${filename}`),
      )?.[1];
      if (!font) throw new Error("No se pudo incluir una fuente matemática.");
      mathCss = mathCss.split(url).join(await dataUrl(font));
    }
  }
  const heading = document.createElement("span");
  heading.textContent = title;
  return `<!doctype html>\n<html lang="es" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading.innerHTML}</title><style>${tokensCss}\n${previewCss}\n${lightCss}\n${darkCss}\n${mathCss}\n${printThemeCss}\n.plume-export-print{display:none}@media print{.plume-export-screen{display:none!important}.plume-export-print{display:block!important}}</style></head><body><div class="plume-export-screen">${copy.outerHTML}</div><div class="plume-export-print">${printed.outerHTML}</div></body></html>`;
}
