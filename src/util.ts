export type Child = Node | string | null | undefined | false;

export interface HOpts {
  class?: string;
  id?: string;
  title?: string;
  tabindex?: number;
  role?: string;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  dataset?: Record<string, string>;
  onclick?: (e: MouseEvent) => void;
  on?: Record<string, (e: Event) => void>;
}

export function h(tag: string, opts: HOpts = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (opts.class) el.className = opts.class;
  if (opts.id) el.id = opts.id;
  if (opts.title) el.title = opts.title;
  if (opts.tabindex !== undefined) el.tabIndex = opts.tabindex;
  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.ariaExpanded !== undefined) el.setAttribute("aria-expanded", String(opts.ariaExpanded));
  if (opts.dataset) for (const [k, v] of Object.entries(opts.dataset)) el.dataset[k] = v;
  if (opts.onclick) el.addEventListener("click", opts.onclick);
  if (opts.on) for (const [ev, fn] of Object.entries(opts.on)) el.addEventListener(ev, fn);
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

export function debounce<A extends unknown[]>(
  fn: (...a: A) => void,
  ms: number,
): ((...a: A) => void) & { flush: () => void; cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  const wrapped = (...a: A): void => {
    lastArgs = a;
    if (t !== null) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      const args = lastArgs;
      lastArgs = null;
      if (args) fn(...args);
    }, ms);
  };
  wrapped.flush = (): void => {
    if (t !== null) clearTimeout(t);
    t = null;
    const args = lastArgs;
    lastArgs = null;
    if (args) fn(...args);
  };
  wrapped.cancel = (): void => {
    if (t !== null) clearTimeout(t);
    t = null;
    lastArgs = null;
  };
  return wrapped;
}

export function throttle(fn: (e: Event) => void, ms: number): (e: Event) => void {
  let last = 0;
  let t: ReturnType<typeof setTimeout> | null = null;
  let pending: Event | null = null;
  return (e: Event): void => {
    pending = e;
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(e);
      pending = null;
    } else if (t === null) {
      t = setTimeout(() => {
        t = null;
        last = Date.now();
        if (pending) {
          const ev = pending;
          pending = null;
          fn(ev);
        }
      }, ms - (now - last));
    }
  };
}

export function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string | null {
  const i = path.lastIndexOf("/");
  const j = path.lastIndexOf("\\");
  const k = Math.max(i, j);
  if (k === -1) return null;
  if (k === 0) return path[0];
  return path.slice(0, k);
}

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export const fmtNum = (n: number): string => n.toLocaleString("es-ES");

export function isPreviewablePath(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path);
}

export interface FuzzyResult {
  score: number;
  positions: number[];
}

export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const t = text.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let ti = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    const gap = found - ti;
    score += gap === 0 ? 5 : 2;
    if (gap > 0) score -= Math.min(1.6, gap * 0.08);
    if (found === 0 || !/[a-z0-9ñáéíóúü]/.test(t[found - 1] ?? " ")) score += 3;
    positions.push(found);
    ti = found + 1;
  }
  score -= t.length * 0.02;
  return { score, positions };
}

export function highlightText(text: string, positions: number[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  const sorted = [...positions].sort((a, b) => a - b);
  let idx = 0;
  for (const p of sorted) {
    if (p > idx) frag.append(text.slice(idx, p));
    const b = document.createElement("b");
    b.className = "fz-hl";
    b.textContent = text[p] ?? "";
    frag.append(b);
    idx = p + 1;
  }
  if (idx < text.length) frag.append(text.slice(idx));
  return frag;
}