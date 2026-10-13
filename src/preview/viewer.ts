import { uniqueSvg } from "./diagrams";

const maximizePath = "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5";
export function expandButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "plume-expand-button";
  button.dataset.expand = "true";
  button.title = "Ampliar";
  button.setAttribute("aria-label", "Ampliar diagrama o gráfico");
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${maximizePath}"/></svg>`;
  return button;
}
export class DiagramViewer {
  private dialog: HTMLDialogElement | null = null;
  private cleanup: (() => void) | null = null;
  open(card: HTMLElement, opener: HTMLButtonElement): void {
    this.close();
    const original = card.querySelector<HTMLElement>(".plume-diagram-content");
    if (!original || card.classList.contains("plume-render-error")) return;
    const dialog = document.createElement("dialog");
    dialog.className = "plume-diagram-viewer";
    dialog.setAttribute("aria-label", "Visor de diagramas");
    const toolbar = document.createElement("header");
    toolbar.className = "plume-viewer-toolbar";
    const title = document.createElement("strong");
    title.textContent = card.dataset.kind === "chart" ? "Gráfico" : "Diagrama";
    const controls = document.createElement("div");
    controls.className = "plume-viewer-controls";
    const makeButton = (text: string, label: string) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.title = label;
      button.setAttribute("aria-label", label);
      controls.append(button);
      return button;
    };
    const minus = makeButton("−", "Alejar");
    const zoomLabel = document.createElement("output");
    zoomLabel.setAttribute("aria-label", "Nivel de zoom");
    controls.append(zoomLabel);
    const plus = makeButton("+", "Acercar");
    const fit = makeButton("Ajustar", "Ajustar al visor");
    const close = makeButton("×", "Cerrar visor (Esc)");
    toolbar.append(title, controls);
    const viewport = document.createElement("div");
    viewport.className = "plume-viewer-viewport";
    const stage = document.createElement("div");
    stage.className = "plume-viewer-stage plume-preview";
    stage.innerHTML = uniqueSvg(original.innerHTML);
    stage.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
      const box = svg.viewBox.baseVal;
      const width =
        Number(svg.getAttribute("width")) || box.width || original.clientWidth;
      const height =
        Number(svg.getAttribute("height")) ||
        box.height ||
        original.clientHeight;
      svg.style.cssText = `width:${width}px;height:${height}px;max-width:none;display:block;`;
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
    });
    viewport.append(stage);
    dialog.append(toolbar, viewport);
    document.body.append(dialog);
    this.dialog = dialog;
    let scale = 1;
    let x = 0;
    let y = 0;
    const paint = () => {
      stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      zoomLabel.textContent = `${Math.round(scale * 100)} %`;
    };
    const zoom = (
      factor: number,
      pointX = viewport.clientWidth / 2,
      pointY = viewport.clientHeight / 2,
    ) => {
      const next = Math.min(8, Math.max(0.1, scale * factor));
      x = pointX - ((pointX - x) * next) / scale;
      y = pointY - ((pointY - y) * next) / scale;
      scale = next;
      paint();
    };
    const fitView = () => {
      const width = stage.scrollWidth || stage.offsetWidth;
      const height = stage.scrollHeight || stage.offsetHeight;
      scale = Math.max(
        0.1,
        Math.min(
          2,
          (viewport.clientWidth - 48) / Math.max(1, width),
          (viewport.clientHeight - 48) / Math.max(1, height),
        ),
      );
      x = (viewport.clientWidth - width * scale) / 2;
      y = (viewport.clientHeight - height * scale) / 2;
      paint();
    };
    minus.addEventListener("click", () => zoom(1 / 1.25));
    plus.addEventListener("click", () => zoom(1.25));
    fit.addEventListener("click", fitView);
    close.addEventListener("click", () => this.close());
    viewport.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        zoom(
          Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.004),
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
      },
      { passive: false },
    );
    let drag: { id: number; x: number; y: number } | null = null;
    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      viewport.classList.add("is-dragging");
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      x += event.clientX - drag.x;
      y += event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      paint();
    });
    const endDrag = () => {
      drag = null;
      viewport.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("lostpointercapture", endDrag);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      if (
        event.target === dialog &&
        (event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom)
      )
        this.close();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoom(1.25);
      }
      if (event.key === "-") {
        event.preventDefault();
        zoom(1 / 1.25);
      }
      if (event.key === "0") {
        event.preventDefault();
        fitView();
      }
    });
    const observer = new ResizeObserver(fitView);
    observer.observe(viewport);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    this.cleanup = () => {
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
      if (opener.isConnected) opener.focus({ preventScroll: true });
    };
    dialog.showModal();
    fitView();
    close.focus();
  }
  close(): void {
    if (!this.dialog) return;
    this.dialog.close();
    this.dialog.remove();
    this.dialog = null;
    this.cleanup?.();
    this.cleanup = null;
  }
}
