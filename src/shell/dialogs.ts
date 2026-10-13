import { h } from "../util";
import { icon } from "../icons";
import type { ToastKind } from "./state";

export interface ConfirmButton<T> {
  label: string;
  value: T;
  kind?: "primary" | "subtle" | "danger";
}

let toastCount = 0;

export function toast(msg: string, kind: ToastKind = "info"): void {
  let host = document.querySelector<HTMLElement>(".toast-host");
  if (!host) {
    host = h("div", { class: "toast-host" });
    document.body.append(host);
  }
  const iconName = kind === "error" ? "alert" : kind === "success" ? "check" : "command";
  const el = h(
    "div",
    { class: `toast toast-${kind}`, role: "status" },
    icon(iconName, 15),
    h("span", { class: "toast-msg" }, msg),
  );
  host.append(el);
  toastCount++;
  requestAnimationFrame(() => el.classList.add("toast-in"));
  setTimeout(() => {
    el.classList.remove("toast-in");
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 250);
  }, 2800);
}

export function confirmDialog<T>(opts: {
  title: string;
  message: string;
  buttons: ConfirmButton<T>[];
  cancelValue: T;
  dangerIcon?: boolean;
}): Promise<T> {
  return new Promise<T>((resolve) => {
    const overlay = h("div", { class: "dialog-overlay" });
    const card = h("div", { class: "dialog", role: "dialog", ariaLabel: opts.title });
    const done = (value: T): void => {
      overlay.classList.remove("overlay-in");
      overlay.remove();
      cleanup();
      resolve(value);
    };
    const header = h(
      "div",
      { class: "dialog-head" },
      opts.dangerIcon
        ? h("span", { class: "dialog-icon danger" }, icon("alert", 20))
        : h("span", { class: "dialog-icon" }, icon("command", 20)),
      h("div", { class: "dialog-title" }, opts.title),
    );
    const msg = h("div", { class: "dialog-message" }, opts.message);
    const btnRow = h("div", { class: "dialog-buttons" });
    let first: HTMLButtonElement | null = null;
    for (const b of opts.buttons) {
      const btn = h(
        "button",
        { class: `btn btn-${b.kind ?? "subtle"}` },
        b.label,
      ) as HTMLButtonElement;
      btn.addEventListener("click", () => done(b.value));
      btnRow.append(btn);
      if (b.kind === "primary" && !first) first = btn;
    }
    card.append(header, msg, btnRow);
    overlay.append(card);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) done(opts.cancelValue);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        done(opts.cancelValue);
      } else if (e.key === "Enter" && first) {
        e.preventDefault();
        done(opts.buttons.find((b) => b.kind === "primary")?.value ?? opts.cancelValue);
      }
    });
    document.body.append(overlay);
    overlay.classList.add("overlay-in");
    (first ?? btnRow.querySelector("button"))?.focus();

    function cleanup(): void {
      document.removeEventListener("keydown", escHandler, true);
    }
    function escHandler(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        done(opts.cancelValue);
      }
    }
    document.addEventListener("keydown", escHandler, true);
  });
}

export interface GotoPanelHandle {
  close(): void;
}

export function openGotoPanel(
  host: HTMLElement,
  opts: { total: number; onGo: (line: number) => void },
): GotoPanelHandle {
  const existing = host.querySelector<HTMLElement>(".goto-panel");
  if (existing) {
    const input = existing.querySelector<HTMLInputElement>("input");
    input?.focus();
    input?.select();
    return {
      close: () => existing.remove(),
    };
  }
  const panel = h("div", { class: "goto-panel", role: "dialog", ariaLabel: "Ir a la línea" });
  const input = h("input", { class: "goto-input", ariaLabel: "Número de línea" }) as HTMLInputElement;
  input.type = "text";
  input.inputMode = "numeric";
  input.placeholder = `Línea (1–${opts.total})`;
  const goBtn = h("button", { class: "btn btn-primary btn-sm" }, "Ir") as HTMLButtonElement;
  const closeBtn = h("button", { class: "icon-btn", title: "Cerrar", ariaLabel: "Cerrar" }, icon("close", 14)) as HTMLButtonElement;
  panel.append(input, goBtn, closeBtn);
  host.append(panel);

  const close = (): void => {
    panel.remove();
    host.querySelector(".cm-editor")?.dispatchEvent(new Event("plume:focus"));
  };
  const run = (): void => {
    const n = parseInt(input.value, 10);
    if (Number.isFinite(n) && n >= 1) {
      opts.onGo(Math.min(n, opts.total));
      close();
    } else {
      input.classList.add("shake");
      setTimeout(() => input.classList.remove("shake"), 300);
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  goBtn.addEventListener("click", run);
  closeBtn.addEventListener("click", close);
  panel.addEventListener("focusout", (e) => {
    if (!panel.contains(e.relatedTarget as Node)) close();
  });
  input.focus();
  return { close };
}