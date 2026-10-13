import { logError } from "./shell/error-log";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./shell/app";

const root = document.getElementById("app") ?? document.body;
try {
  const app = new App(root);
  (window as unknown as { __plume?: unknown }).__plume = app;
  app.boot().catch((e) => logError("boot", e));
} catch (e) {
  logError("init", e);
}
