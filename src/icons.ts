const NS = "http://www.w3.org/2000/svg";

const SHAPES: Record<string, string[]> = {
  feather: [
    "M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.4V19h8.6z",
    "M16.1 8 2.2 21.9",
    "M17.5 15.1H9.4",
  ],
  plus: ["M12 5v14", "M5 12h14"],
  x: ["M6 6l12 12", "M18 6L6 18"],
  minus: ["M5 12h14"],
  maximize: ["M7.5 7.5h9v9h-9z"],
  restore: [
    "M16 9V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2",
    "M10 9h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z",
  ],
  "chevron-down": ["M6.5 9.5l5.5 5.5 5.5-5.5"],
  "chevron-right": ["M9.5 6.5l5.5 5.5-5.5 5.5"],
  "chevron-up": ["M6.5 14.5l5.5-5.5 5.5 5.5"],
  swap: ["M4 8h13", "M14 5l3 3-3 3", "M20 16H7", "M10 13l-3 3 3 3"],
  search: ["c 11 11 7", "M16.6 16.6L21 21"],
  "zoom-in": ["c 11 11 7", "M16.6 16.6L21 21", "M11 8v6", "M8 11h6"],
  "zoom-out": ["c 11 11 7", "M16.6 16.6L21 21", "M8 11h6"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  redo: ["M15 14l5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  cut: ["c 6.2 6 2.4", "c 6.2 18 2.4", "M8.4 7.8 20 18.5", "M8.4 16.2 20 5.5"],
  copy: ["r 9 9 10.5 10.5 2", "M5.5 14.5V6.5a2 2 0 0 1 2-2h8"],
  save: [
    "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z",
    "M17 21v-8H7v8",
    "M7 3v5h8",
  ],
  folder: ["M3 7a2 2 0 0 1 2-2h4l2.5 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  file: ["M14 3v5h5", "M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"],
  "file-text": ["M14 3v5h5", "M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M9.5 13h5", "M9.5 17h3"],
  list: ["M9 6h11", "M9 12h11", "M9 18h11", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  columns: ["r 3.5 4.5 17 15 2", "M12 4.5v15"],
  eye: [
    "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z",
    "c 12 12 3",
  ],
  pencil: ["M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"],
  alert: ["M10.3 3.9 2.4 17.5a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", "M12 9v4.5", "M12 17h.01"],
  printer: [
    "M6.5 9V4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V9",
    "M6.5 18.5H5a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 5 9.5h14a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-1.5",
    "r 7 14 10 6.5 1",
  ],
  download: ["M12 3v11", "M7.5 9.5 12 14l4.5-4.5", "M4.5 17.5v1.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1.5"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  refresh: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v6h-6"],
  sun: [
    "c 12 12 4",
    "M12 2v2.2", "M12 19.8V22", "M4.9 4.9l1.6 1.6", "M17.5 17.5l1.6 1.6",
    "M2 12h2.2", "M19.8 12H22", "M4.9 19.1l1.6-1.6", "M17.5 6.5l1.6-1.6",
  ],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  monitor: ["r 3 4.5 18 12 2", "M8 20.5h8", "M12 16.5v4"],
  wrap: ["M4 6h16", "M4 11.5h11.5a3.5 3.5 0 1 1 0 7H9.5", "M11.5 15.5 9.5 17.5l2 2", "M4 18.5h3.5"],
  "panel-right": ["r 3.5 4.5 17 15 2", "M15.5 4.5v15"],
  clock: ["c 12 12 8.5", "M12 7.5V12l3 2"],
  command: [
    "M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3z",
  ],
  globe: ["c 12 12 8.5", "M3.5 12h17", "M12 3.5c2.4 2.3 3.7 5.2 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.2-3.7-8.5s1.3-6.2 3.7-8.5z"],
  type: ["M4.5 7V4.5h15V7", "M9.5 19.5h5", "M12 4.5v15"],
  hash: ["M4.5 9h15", "M4.5 15h15", "M10.5 3 8.5 21", "M16 3l-2 18"],
  "goto-line": ["M4 5h16", "M4 19h16", "M4 12h9", "c 16.5 12 2.4", "M18 9.5 20.5 12 18 14.5"],
  close: ["M6.5 6.5l11 11", "M17.5 6.5l-11 11"],
  "line-numbers": ["M4 6h.01", "M4 12h.01", "M4 18h.01", "M9 6h11", "M9 12h11", "M9 18h11"],
  "file-plus": ["M14 3v5h5", "M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M12 11.5v6", "M9 14.5h6"],
  bold: ["M7 5h6a3.5 3.5 0 0 1 0 7H7z", "M7 12h7a3.5 3.5 0 0 1 0 7H7z"],
  italic: ["M10 5h8", "M6 19h8", "M14.5 5 9.5 19"],
  strike: ["M5 12h14", "M16.5 7.5C16 5.9 14.3 5 12 5c-2.8 0-4.5 1.4-4.5 3.3 0 1.4.9 2.4 2.6 3", "M8 16.5c.5 1.6 2.2 2.5 4.3 2.5 2.8 0 4.5-1.4 4.5-3.3 0-.9-.3-1.6-1-2.2"],
  code: ["M8.5 7 3.5 12l5 5", "M15.5 7l5 5-5 5"],
  heading: ["M6 4.5v15", "M18 4.5v15", "M6 12h12"],
  link: ["M10 13.5a4.5 4.5 0 0 0 6.4.5l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.3 1.3", "M14 10.5a4.5 4.5 0 0 0-6.4-.5l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3"],
  image: ["r 3.5 4 17 16 2", "c 9 9.5 1.6", "M20.5 15.5 15.5 10.5 5 20"],
  "list-ul": ["M9 6h11", "M9 12h11", "M9 18h11", "c 4.5 6 .9", "c 4.5 12 .9", "c 4.5 18 .9"],
  "list-ol": ["M10 6h10", "M10 12h10", "M10 18h10", "M4 4.5h1.5v4", "M4 8.5h3", "M4 14.2c.3-.6 1-1 1.7-1 .9 0 1.6.6 1.6 1.4 0 1.2-3.3 2.4-3.3 3.9h3.4"],
  "list-task": ["r 3.5 4 5 5 1", "M4.8 15.5 6.2 17 8.5 14.5", "M12 6.5h8", "M12 16h8"],
  quote: ["M9.5 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1.5v1a3 3 0 0 1-3 3", "M19.5 7H16a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1.5v1a3 3 0 0 1-3 3"],
  table: ["r 3.5 4.5 17 15 2", "M3.5 9.5h17", "M3.5 14.5h17", "M9.5 4.5v15", "M15 4.5v15"],
  "code-block": ["r 3 4 18 16 2.5", "M9.5 9.5 7 12l2.5 2.5", "M14.5 9.5 17 12l-2.5 2.5"],
  sigma: ["M17.5 6V4.5h-11l6 7.5-6 7.5h11V18"],
  diagram: ["r 3 3.5 6 5 1.2", "r 15 3.5 6 5 1.2", "r 9 15.5 6 5 1.2", "M6 8.5v2.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V8.5", "M12 12.5v3"],
  chart: ["M4 20h16", "M7 16.5v-5", "M11.5 16.5V7", "M16 16.5v-8"],
  rule: ["M4 12h16", "M8 7.5h8", "M8 16.5h8"],
  replace: ["M4 7h11", "M12 4l3 3-3 3", "M20 17H9", "M12 14l-3 3 3 3"],
  keyboard: [
    "r 2.5 6.5 19 12 2",
    "M6 10h.01", "M9.5 10h.01", "M13 10h.01", "M16.5 10h.01", "M6 13.5h.01",
    "M9.5 13.5h5", "M18 13.5h.01",
  ],
};

export type IconName = keyof typeof SHAPES;

export function icon(name: IconName, size = 16): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("ic");
  for (const s of SHAPES[name] ?? []) {
    let el: SVGElement;
    if (s.startsWith("c ")) {
      const [, cxs, cys, rs] = s.split(" ");
      el = document.createElementNS(NS, "circle");
      el.setAttribute("cx", cxs ?? "0");
      el.setAttribute("cy", cys ?? "0");
      el.setAttribute("r", rs ?? "0");
    } else if (s.startsWith("r ")) {
      const [, xs, ys, ws, hs, rxs] = s.split(" ");
      el = document.createElementNS(NS, "rect");
      el.setAttribute("x", xs ?? "0");
      el.setAttribute("y", ys ?? "0");
      el.setAttribute("width", ws ?? "0");
      el.setAttribute("height", hs ?? "0");
      el.setAttribute("rx", rxs ?? "0");
    } else {
      el = document.createElementNS(NS, "path");
      el.setAttribute("d", s);
    }
    svg.append(el);
  }
  return svg;
}