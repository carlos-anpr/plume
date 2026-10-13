import tokensCss from "../styles/tokens.css?raw";
import syntaxLight from "./syntax-light.css?raw";
// Derive print colors from the shared light tokens; keep the contract file untouched.
const lightDeclarations =
  tokensCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
export const lightTokens = Object.fromEntries(
  Array.from(
    lightDeclarations.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g),
    (match) => [match[1], match[2].trim()],
  ),
);
const declarations = lightDeclarations.replace(/;\s*/g, " !important;\n");
export const printThemeCss = `@media print {
  :root, :root[data-theme="dark"] { ${declarations} }
  html, body, .plume-preview { background: var(--bg-raised) !important; color: var(--fg) !important; }
  ${syntaxLight
    .split(":root[data-theme=light]")
    .join(":root:root")
    .replace(/([\w-]+\s*:[^;{}]+);/g, "$1 !important;")}
}`;
interface PrintParticipant {
  active(): boolean;
  prepare(): Promise<void>;
  restore(): Promise<void>;
}
const participants = new Set<PrintParticipant>();
let originalPrint: typeof window.print | null = null;
let printing = false;
let style: HTMLStyleElement | null = null;
export function registerPrint(participant: PrintParticipant): () => void {
  participants.add(participant);
  if (!originalPrint) {
    originalPrint = window.print;
    style = document.createElement("style");
    style.dataset.plumePrintTheme = "true";
    style.textContent = printThemeCss;
    document.head.append(style);
    window.print = () => {
      void printLight().catch((error) =>
        console.error("No se pudo preparar la impresión", error),
      );
    };
  }
  return () => {
    participants.delete(participant);
    if (!participants.size && originalPrint && !printing) {
      window.print = originalPrint;
      originalPrint = null;
      style?.remove();
      style = null;
    }
  };
}
async function printLight(): Promise<void> {
  if (printing || !originalPrint) return;
  printing = true;
  const originalTheme = document.documentElement.getAttribute("data-theme");
  const active = Array.from(participants).filter((participant) =>
    participant.active(),
  );
  let finish: (() => void) | undefined;
  const completed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const printMedia = window.matchMedia("print");
  let invoked = false;
  let blurred = false;
  let enteredPrintMedia = false;
  let afterPrintSeen = false;
  const checkFinished = () => {
    if (
      invoked &&
      !printMedia.matches &&
      document.hasFocus() &&
      (afterPrintSeen || blurred || enteredPrintMedia)
    )
      finish?.();
  };
  const afterPrint = () => {
    afterPrintSeen = true;
    checkFinished();
  };
  const onBlur = () => {
    if (invoked) blurred = true;
  };
  const onFocus = () => checkFinished();
  const onMedia = (event: MediaQueryListEvent) => {
    enteredPrintMedia ||= event.matches;
    checkFinished();
  };
  window.addEventListener("afterprint", afterPrint);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  printMedia.addEventListener("change", onMedia);
  try {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.plumePrinting = "true";
    await Promise.all(active.map((participant) => participant.prepare()));
    await document.fonts.ready;
    // WebKitGTK snapshots printing before a pending SVG paint unless we wait for it.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    invoked = true;
    originalPrint.call(window);
    checkFinished();
    await completed;
  } finally {
    window.removeEventListener("afterprint", afterPrint);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    printMedia.removeEventListener("change", onMedia);
    if (originalTheme === null)
      document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = originalTheme;
    delete document.documentElement.dataset.plumePrinting;
    await Promise.all(active.map((participant) => participant.restore()));
    printing = false;
    if (!participants.size && originalPrint) {
      window.print = originalPrint;
      originalPrint = null;
      style?.remove();
      style = null;
    }
  }
}
