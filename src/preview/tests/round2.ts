import type { PreviewApi, RenderResult } from "../../types";
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function checkRound2(
  container: HTMLElement,
  preview: PreviewApi,
  result: RenderResult,
): Promise<string[]> {
  const checks: string[] = [];
  container.style.width = "540px";
  document.documentElement.dataset.theme = "dark";
  preview.setTheme("dark");
  const translated = {
    ...result,
    html:
      result.html +
      '<div class="markdown-alert markdown-alert-important"><p class="markdown-alert-title">Important</p><p>Texto</p></div>',
  };
  await preview.update(translated, null);
  await delay(200);
  const titles = Array.from(
    container.querySelectorAll(".markdown-alert-title"),
    (el) => el.textContent,
  );
  assert(
    titles.includes("Nota") &&
      titles.includes("Consejo") &&
      titles.includes("Importante") &&
      titles.includes("Aviso") &&
      titles.includes("Precaución"),
    "Alert translations missing",
  );
  checks.push("Títulos de alertas en español");
  const cards = Array.from(
    container.querySelectorAll<HTMLElement>('[data-kind="mermaid"]'),
  );
  cards.forEach((card) => {
    const svg = card.querySelector<SVGSVGElement>(".plume-diagram-content > svg")!;
    const fontSize = /^\s*gantt\b/.test(card.dataset.renderSource ?? "") ? 12 : 14;
    assert((svg.getBoundingClientRect().width / svg.viewBox.baseVal.width) * fontSize >= 8.3, "Mermaid text scaled below 8.3px");
  });
  checks.push("Diagramas Mermaid ajustados al ancho con texto legible en 540 px");
  container
    .querySelectorAll<HTMLElement>(".plume-chart .plume-diagram-content")
    .forEach((body) =>
      assert(
        body.scrollHeight === body.clientHeight,
        "Chart has internal vertical overflow",
      ),
    );
  const pie = Array.from(
    container.querySelectorAll<HTMLElement>(".plume-chart"),
  ).find((card) => card.dataset.renderSource?.includes('"pie"'));
  pie
    ?.querySelectorAll("text")
    .forEach((text) =>
      assert(
        !text.getAttribute("stroke") || text.getAttribute("stroke") === "none",
        "Chart label outline remains",
      ),
    );
  checks.push("Gráficos sin scroll vertical ni contorno de texto");
  container
    .querySelectorAll<HTMLElement>(".plume-task-item")
    .forEach((item) =>
      assert(
        getComputedStyle(item).listStyleType === "none",
        "Task marker remains",
      ),
    );
  const invalid = container.querySelector<HTMLElement>(
    ".hl-invalid.hl-illegal",
  );
  assert(
    invalid && getComputedStyle(invalid).backgroundColor === "rgba(0, 0, 0, 0)",
    "Invalid TypeScript token still has a colored background",
  );
  checks.push("Tokens invalid/illegal neutralizados");
  checks.push("Listas de tareas sin viñeta");
  const expand = cards[0].querySelector<HTMLButtonElement>(
    "button[data-expand]",
  )!;
  expand.click();
  const dialog = document.querySelector<HTMLDialogElement>(
    ".plume-diagram-viewer",
  )!;
  assert(dialog?.open, "Viewer failed to open");
  const stage = dialog.querySelector<HTMLElement>(".plume-viewer-stage")!;
  const before = stage.style.transform;
  dialog
    .querySelector<HTMLButtonElement>('button[aria-label="Acercar"]')!
    .click();
  assert(stage.style.transform !== before, "Viewer zoom button did not zoom");
  const viewport = dialog.querySelector<HTMLElement>(".plume-viewer-viewport")!;
  const zoomed = stage.style.transform;
  viewport.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: -60,
      ctrlKey: true,
      clientX: 400,
      clientY: 300,
      bubbles: true,
      cancelable: true,
    }),
  );
  assert(stage.style.transform !== zoomed, "Viewer wheel did not zoom");
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  assert(
    !document.querySelector(".plume-diagram-viewer"),
    "Escape did not close viewer",
  );
  checks.push("Visor: ampliar, zoom por botones y Ctrl+rueda, Escape");
  await new Promise<void>((resolve) => {
    const callback = () => {
      window.removeEventListener("afterprint", callback);
      resolve();
    };
    window.addEventListener("afterprint", callback);
    window.print();
  });
  await delay(200);
  assert(
    document.documentElement.dataset.theme === "dark",
    "Print did not restore dark theme",
  );
  const capture = (
    window as unknown as {
      printCapture?: { theme: string; background: string; svg: string };
    }
  ).printCapture;
  assert(
    capture?.theme === "light" && capture.svg.includes("#1f1c18"),
    "Print diagrams were not repainted in light",
  );
  checks.push("Impresión preparada en claro y restauración del tema oscuro");
  container.style.width = "";
  document.documentElement.dataset.theme = "light";
  preview.setTheme("light");
  await preview.update(result, null);
  return checks;
}
