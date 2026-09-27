// zinc:ui — host ABI (UI-02): node handles, flexbox layout (UI-08), Tailwind-like classes (UI-07),
// retained rendering through zinc:gfx (UI-09), pointer + gamepad focus input (UI-11).
// Written in Zinc itself: the same code is compiled to C++ and to the sim, so layouts are identical everywhere.
import { onFrame, clear, rect, text as drawText, width, height, pointerX, pointerY, pointerDown, wasPressed, Btn } from 'zinc:gfx';

export const VIEW: i32 = 0, TEXT: i32 = 1, BUTTON: i32 = 2, IMAGE: i32 = 3, SCROLL: i32 = 4, CANVAS: i32 = 5, FRAGMENT: i32 = 6;
const TAG_NAMES: string[] = ['view', 'text', 'button', 'image', 'scroll', 'canvas', 'fragment'];

class UiNode {
  tag: i32;
  parent: i32 = -1;
  children: i32[] = [];
  text: string = '';
  row: boolean = false;
  justify: i32 = 0;   // 0 start, 1 center, 2 end, 3 between
  align: i32 = 3;     // 0 start, 1 center, 2 end, 3 stretch
  grow: i32 = 0;
  pt: i32 = 0; pr: i32 = 0; pb: i32 = 0; pl: i32 = 0;
  gap: i32 = 0;
  w: i32 = -1; h: i32 = -1;
  fullW: boolean = false; fullH: boolean = false;
  bg: i32 = -1;
  fg: i32 = 0xffffff;
  scale: i32 = 1;
  hidden: boolean = false;
  x: i32 = 0; y: i32 = 0; lw: i32 = 0; lh: i32 = 0;
  onClick: (() => void) | null = null;
  onDraw: ((x: i32, y: i32, w: i32, h: i32) => void) | null = null;
  alive: boolean = true;
  constructor(tag: i32) { this.tag = tag; }
}

const nodes: UiNode[] = [];
const free: i32[] = [];
let dirty = true;
let root: i32 = -1;
let focus: i32 = -1;
let wasDown = false;

function node(h: i32): UiNode { return nodes[h]; }

export function createNode(tag: i32): i32 {
  dirty = true;
  const n = new UiNode(tag);
  if (tag === BUTTON) { n.bg = 0x334155; n.pt = 4; n.pb = 4; n.pl = 8; n.pr = 8; n.align = 1; n.justify = 1; }
  if (free.length > 0) { const h = free.pop(); nodes[h] = n; return h; }
  nodes.push(n);
  return nodes.length - 1;
}
export function createText(s: string): i32 {
  const h = createNode(TEXT);
  nodes[h].text = s;
  return h;
}
export function setText(h: i32, s: string): void {
  const n = node(h);
  if (n.text !== s) { n.text = s; dirty = true; }
}
export function insert(parent: i32, child: i32, before: i32): void {
  const p = node(parent);
  node(child).parent = parent;
  const i = before < 0 ? -1 : p.children.indexOf(before);
  if (i < 0) p.children.push(child); else insertAt(p, i, child);
  dirty = true;
}
function insertAt(p: UiNode, i: i32, child: i32): void {
  p.children.push(child);
  for (let k = p.children.length - 1; k > i; k--) p.children[k] = p.children[k - 1];
  p.children[i] = child;
}
export function remove(parent: i32, child: i32): void {
  const p = node(parent);
  const i = p.children.indexOf(child);
  if (i >= 0) p.children.splice(i, 1);
  release(child);
  dirty = true;
}
export function clearChildren(parent: i32): void {
  const p = node(parent);
  for (const c of p.children) release(c);
  p.children = [];
  dirty = true;
}
function release(h: i32): void {
  const n = node(h);
  for (const c of n.children) release(c);
  n.alive = false;
  n.onClick = null;
  n.onDraw = null;
  if (focus === h) focus = -1;
  free.push(h);
}
export function listen(h: i32, f: () => void): void { node(h).onClick = f; }
export function draw(h: i32, f: (x: i32, y: i32, w: i32, h: i32) => void): void { node(h).onDraw = f; }
export function setNumber(h: i32, key: string, v: number): void {
  const n = node(h);
  const iv: i32 = Math.round(v);
  if (key === 'width') n.w = iv; else if (key === 'height') n.h = iv;
  else if (key === 'grow') n.grow = iv; else if (key === 'gap') n.gap = iv;
  else if (key === 'bg') n.bg = iv; else if (key === 'color') n.fg = iv; else if (key === 'scale') n.scale = iv;
  else if (key === 'hidden') n.hidden = iv !== 0;
  dirty = true;
}

// ---- Tailwind-like classes (UI-07). The compiler rejects unknown classes at build time. ----
const COLORS = new Map<string, i32>();
function initColors(): void {
  if (COLORS.size > 0) return;
  const names: string[] = ['white', 'black', 'slate-900', 'slate-800', 'slate-700', 'slate-600', 'slate-400', 'slate-200', 'gray-900', 'gray-700', 'gray-500', 'gray-300',
    'red-500', 'orange-400', 'amber-400', 'yellow-400', 'green-500', 'emerald-400', 'cyan-400', 'blue-500', 'indigo-500', 'purple-500', 'pink-500', 'transparent'];
  const values: i32[] = [0xffffff, 0x000000, 0x0f172a, 0x1e293b, 0x334155, 0x475569, 0x94a3b8, 0xe2e8f0, 0x111827, 0x374151, 0x6b7280, 0xd1d5db,
    0xef4444, 0xfb923c, 0xfbbf24, 0xfacc15, 0x22c55e, 0x34d399, 0x22d3ee, 0x3b82f6, 0x6366f1, 0xa855f7, 0xec4899, -1];
  for (let i = 0; i < names.length; i++) COLORS.set(names[i], values[i]);
}
function unit(s: string): i32 { return parseInt(s) * 4; }
/** Applies one class; returns false when unknown (used by the compiler's validation and by debug builds). */
export function applyClass(n: UiNode, c: string): boolean {
  initColors();
  if (c === 'flex-row') n.row = true;
  else if (c === 'flex-col') n.row = false;
  else if (c === 'items-start') n.align = 0; else if (c === 'items-center') n.align = 1;
  else if (c === 'items-end') n.align = 2; else if (c === 'items-stretch') n.align = 3;
  else if (c === 'justify-start') n.justify = 0; else if (c === 'justify-center') n.justify = 1;
  else if (c === 'justify-end') n.justify = 2; else if (c === 'justify-between') n.justify = 3;
  else if (c === 'grow') n.grow = 1;
  else if (c === 'hidden') n.hidden = true;
  else if (c === 'w-full') n.fullW = true; else if (c === 'h-full') n.fullH = true;
  else if (c === 'text-sm') n.scale = 1; else if (c === 'text-base') n.scale = 1;
  else if (c === 'text-lg') n.scale = 2; else if (c === 'text-xl') n.scale = 3; else if (c === 'text-2xl') n.scale = 4;
  else if (c.startsWith('p-')) { const v = unit(c.slice(2)); n.pt = v; n.pb = v; n.pl = v; n.pr = v; }
  else if (c.startsWith('px-')) { const v = unit(c.slice(3)); n.pl = v; n.pr = v; }
  else if (c.startsWith('py-')) { const v = unit(c.slice(3)); n.pt = v; n.pb = v; }
  else if (c.startsWith('gap-')) n.gap = unit(c.slice(4));
  else if (c.startsWith('w-')) n.w = unit(c.slice(2));
  else if (c.startsWith('h-')) n.h = unit(c.slice(2));
  else if (c.startsWith('bg-') && COLORS.has(c.slice(3))) n.bg = COLORS.get(c.slice(3)) ?? -1;
  else if (c.startsWith('text-') && COLORS.has(c.slice(5))) n.fg = COLORS.get(c.slice(5)) ?? 0;
  else if (c === 'rounded' || c === 'rounded-lg' || c === 'font-bold') { /* accepted, not rendered by the 2D backends yet */ }
  else return false;
  return true;
}
export function setClass(h: i32, cls: string): void {
  const n = node(h);
  for (const c of cls.split(' ')) if (c.length > 0) applyClass(n, c);
  dirty = true;
}

// ---- layout (UI-08): integer flexbox subset, fragments are transparent ----
function flat(n: UiNode, out: UiNode[]): void {
  for (const h of n.children) {
    const c = node(h);
    if (c.hidden) continue;
    if (c.tag === FRAGMENT) flat(c, out); else out.push(c);
  }
}
function measure(n: UiNode): void {
  if (n.tag === TEXT) {
    n.lw = n.text.length * 8 * n.scale + n.pl + n.pr;
    n.lh = 8 * n.scale + n.pt + n.pb;
  } else {
    const kids: UiNode[] = [];
    flat(n, kids);
    let main: i32 = 0, cross: i32 = 0;
    for (const c of kids) {
      measure(c);
      const cm = n.row ? c.lw : c.lh, cc = n.row ? c.lh : c.lw;
      main += cm;
      if (cc > cross) cross = cc;
    }
    if (kids.length > 1) main += n.gap * (kids.length - 1);
    n.lw = (n.row ? main : cross) + n.pl + n.pr;
    n.lh = (n.row ? cross : main) + n.pt + n.pb;
  }
  if (n.w >= 0) n.lw = n.w;
  if (n.h >= 0) n.lh = n.h;
}
function place(n: UiNode, x: i32, y: i32, w: i32, h: i32): void {
  n.x = x; n.y = y; n.lw = w; n.lh = h;
  if (n.tag === TEXT) return;
  const kids: UiNode[] = [];
  flat(n, kids);
  const iw = w - n.pl - n.pr, ih = h - n.pt - n.pb;
  const innerMain = n.row ? iw : ih, innerCross = n.row ? ih : iw;
  let used: i32 = 0, grows: i32 = 0;
  for (const c of kids) { used += n.row ? c.lw : c.lh; grows += c.grow; }
  if (kids.length > 1) used += n.gap * (kids.length - 1);
  let free: i32 = innerMain - used;
  let pos: i32 = 0, between: i32 = n.gap;
  if (grows === 0 && free > 0) {
    if (n.justify === 1) pos = Math.floor(free / 2);
    else if (n.justify === 2) pos = free;
    else if (n.justify === 3 && kids.length > 1) between = n.gap + Math.floor(free / (kids.length - 1));
  }
  for (const c of kids) {
    let cm: i32 = n.row ? c.lw : c.lh;
    if (grows > 0 && free > 0 && c.grow > 0) cm += Math.floor(free * c.grow / grows);
    let cc: i32 = n.row ? c.lh : c.lw;
    let off: i32 = 0;
    const stretch = n.align === 3 || (n.row ? c.fullH : c.fullW);
    if (stretch) cc = innerCross;
    else if (n.align === 1) off = Math.floor((innerCross - cc) / 2);
    else if (n.align === 2) off = innerCross - cc;
    if (n.row) place(c, x + n.pl + pos, y + n.pt + off, cm, cc);
    else place(c, x + n.pl + off, y + n.pt + pos, cc, cm);
    pos += cm + between;
  }
}
export function layout(): void {
  if (root < 0) return;
  const r = node(root);
  measure(r);
  place(r, 0, 0, width(), height());
  dirty = false;
}

// ---- rendering and input ----
function paint(h: i32): void {
  const n = node(h);
  if (n.hidden) return;
  if (n.bg >= 0) rect(n.x, n.y, n.lw, n.lh, n.bg);
  if (h === focus) {
    rect(n.x, n.y, n.lw, 1, 0xfacc15); rect(n.x, n.y + n.lh - 1, n.lw, 1, 0xfacc15);
    rect(n.x, n.y, 1, n.lh, 0xfacc15); rect(n.x + n.lw - 1, n.y, 1, n.lh, 0xfacc15);
  }
  if (n.tag === TEXT) drawText(n.x + n.pl, n.y + n.pt, n.text, n.fg, n.scale);
  const d = n.onDraw;
  if (d !== null) d(n.x, n.y, n.lw, n.lh);
  for (const c of n.children) paint(c);
}
function hit(h: i32, px: number, py: number): i32 {
  const n = node(h);
  if (n.hidden) return -1;
  for (let i = n.children.length - 1; i >= 0; i--) {
    const r = hit(n.children[i], px, py);
    if (r >= 0) return r;
  }
  if (n.onClick !== null && n.tag !== FRAGMENT && px >= n.x && py >= n.y && px < n.x + n.lw && py < n.y + n.lh) return h;
  return -1;
}
function focusables(h: i32, out: i32[]): void {
  const n = node(h);
  if (n.hidden) return;
  if (n.onClick !== null) out.push(h);
  for (const c of n.children) focusables(c, out);
}
function activate(h: i32): void {
  const f = node(h).onClick;
  if (f !== null) f();
}
/** One UI frame: input, layout if needed, draw. Called by the frame loop set up in mount(). */
export function frame(background: i32): void {
  if (root < 0) return;
  if (dirty) layout();
  const down = pointerDown();
  if (down && !wasDown) {
    const h = hit(root, pointerX(), pointerY());
    if (h >= 0) { focus = h; activate(h); }
  }
  wasDown = down;
  if (wasPressed(Btn.Down) || wasPressed(Btn.Right) || wasPressed(Btn.Up) || wasPressed(Btn.Left)) {
    const list: i32[] = [];
    focusables(root, list);
    if (list.length > 0) {
      const back = wasPressed(Btn.Up) || wasPressed(Btn.Left);
      const i = list.indexOf(focus);
      focus = i < 0 ? list[0] : list[(i + (back ? list.length - 1 : 1)) % list.length];
    }
  }
  if ((wasPressed(Btn.A) || wasPressed(Btn.Start)) && focus >= 0) activate(focus);
  if (dirty) layout();
  if (background >= 0) clear(background);
  paint(root);
}
/** Mounts a root node and drives it from the frame loop (UI-13). `extra` runs each frame before drawing. */
export function mount(h: i32, background: i32, extra: ((dt: number) => void) | null): void {
  root = h;
  const r = node(h);
  r.fullW = true; r.fullH = true;
  onFrame((dt: number) => {
    if (extra !== null) extra(dt);
    frame(background);
  });
}
/** Deterministic dump of the laid-out tree (golden tests, TST-07). */
export function dump(): string {
  if (dirty) layout();
  const lines: string[] = [];
  dumpNode(root, 0, lines);
  return lines.join('\n');
}
function dumpNode(h: i32, depth: i32, out: string[]): void {
  if (h < 0) return;
  const n = node(h);
  if (n.hidden) return;
  out.push(`${'  '.repeat(depth)}${TAG_NAMES[n.tag]} ${n.x},${n.y} ${n.lw}x${n.lh}${n.tag === TEXT ? ' "' + n.text + '"' : ''}`);
  for (const c of n.children) dumpNode(c, depth + 1, out);
}
export function setRoot(h: i32): void { root = h; node(h).fullW = true; node(h).fullH = true; dirty = true; }
export function click(h: i32): void { activate(h); }
export function find(text: string): i32 {
  for (let i = 0; i < nodes.length; i++) if (nodes[i].alive && nodes[i].text === text) {
    let p = nodes[i].parent;
    while (p >= 0 && nodes[p].onClick === null) p = nodes[p].parent;
    return p >= 0 ? p : i;
  }
  return -1;
}
