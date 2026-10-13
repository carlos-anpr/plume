// Reenvía errores no capturados al stderr del proceso Rust (comando frontend_log).
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./tauri-env";

function send(level: string, message: string): void {
  if (inTauri) void invoke("frontend_log", { level, message }).catch(() => {});
}

window.addEventListener("error", (e) => send("error", `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`));
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason as { stack?: string } | undefined;
  send("error", `unhandledrejection: ${r?.stack ?? String(e.reason)}`);
});

export function logError(context: string, err: unknown): void {
  const e = err as { stack?: string } | undefined;
  send("error", `${context}: ${e?.stack ?? String(err)}`);
}
