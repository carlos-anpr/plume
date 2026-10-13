// Run after: cargo run --manifest-path src-tauri/Cargo.toml --example render_document -- docs/muestra.md > /tmp/plume-render-fixture.json
import { readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL("../../..", import.meta.url));
const fixture = JSON.parse(
  await readFile(process.argv[2] ?? "/tmp/plume-render-fixture.json", "utf8"),
);
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: project, stdio: "ignore" },
);
const session = `plume-smoke-${process.pid}`;
const outputs = [];
function cli(...args) {
  const result = spawnSync("playwright-cli", [`-s=${session}`, ...args], {
    cwd: project,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = result.stdout + result.stderr;
  outputs.push(output);
  if (result.status || output.includes("### Error")) throw new Error(output);
  return output;
}
try {
  const url = `http://127.0.0.1:${port}/src/preview/tests/smoke.html`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(url)).ok;
    } catch {
      /* Vite is starting. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Vite did not start");
  cli("open", url);
  const code = `async page => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const result = await page.evaluate(async fixture => {
      window.print = () => {
        window.printCapture = {theme:document.documentElement.dataset.theme,background:getComputedStyle(document.querySelector('.plume-preview')).backgroundColor,svg:document.querySelector('[data-kind="mermaid"] svg')?.outerHTML ?? ''};
        window.dispatchEvent(new Event('beforeprint')); window.dispatchEvent(new Event('afterprint'));
      };
      const { checkPreview } = await import('/src/preview/tests/smoke.ts');
      const run = await checkPreview(document.querySelector('#preview'), fixture);
      window.preview = run.preview;
      const { checkRound2 } = await import('/src/preview/tests/round2.ts');
      return [...run.checks, ...await checkRound2(document.querySelector('#preview'), run.preview, fixture)];
    }, ${JSON.stringify(fixture)});
    return result;
  }`;
  const output = cli("run-code", code);
  console.log(output.split("### Ran Playwright code")[0].trim());
  const interactions = cli(
    "run-code",
    `async page => {
    await page.locator('[data-kind="mermaid"] button[data-expand]').first().click();
    const stage = page.locator('.plume-viewer-stage');
    const start = await stage.getAttribute('style');
    await page.mouse.move(500, 300); await page.mouse.down(); await page.mouse.move(560, 330); await page.mouse.up();
    if (start === await stage.getAttribute('style')) throw new Error('Viewer drag did not pan');
    const oldZoom = await page.locator('.plume-viewer-controls output').textContent();
    await page.mouse.wheel(0, -80);
    if (oldZoom === await page.locator('.plume-viewer-controls output').textContent()) throw new Error('Viewer wheel did not zoom');
    await page.keyboard.down('Control'); await page.mouse.wheel(0, -80); await page.keyboard.up('Control');
    await page.locator('button[aria-label="Ajustar al visor"]').click();
    await page.mouse.click(2,2);
    if (await page.locator('.plume-diagram-viewer').count()) throw new Error('Viewer backdrop did not close');
    return 'Visor: arrastre real, rueda, Ctrl+rueda, ajustar y cierre por fondo';
  }`,
  );
  console.log(interactions.split("### Ran Playwright code")[0].trim());
  cli("screenshot", "--filename=/tmp/plume-preview-light.png");
  cli(
    "run-code",
    `async page => {
    await page.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; window.preview.setTheme('dark'); await window.preview.exportHtml('Muestra'); window.preview.scrollToLine(49); });
  }`,
  );
  cli("screenshot", "--filename=/tmp/plume-preview-dark.png");
  const offline = cli(
    "run-code",
    String.raw`async page => {
    const html = await page.evaluate(() => window.preview.exportHtml('Muestra offline'));
    let requests = 0;
    await page.route('**/*', route => { requests++; return route.abort(); });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    if (requests || await page.locator('.plume-export-screen .plume-chart .plume-diagram-content svg').count() !== 3 || !await page.locator('.katex').count()) throw new Error('Offline export failed');
    const pdf = await page.pdf({format:'A4',printBackground:true,path:'/tmp/plume-preview.pdf'});
    const pages = Number(pdf.toString('latin1').match(/\/Count (\d+)/)?.[1] ?? 0);
    if (pages < 2) throw new Error('Print output was clipped');
    return {offlineRequests:requests,printPages:pages,pdfBytes:pdf.length};
  }`,
  );
  console.log(offline.split("### Ran Playwright code")[0].trim());
  console.log(
    "Capturas: /tmp/plume-preview-light.png y /tmp/plume-preview-dark.png",
  );
} finally {
  await writeFile("/tmp/plume-preview-smoke-cli.log", outputs.join("\n"));
  cli("close");
  server.kill("SIGTERM");
}
