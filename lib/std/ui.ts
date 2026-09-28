// zinc:ui — host ABI (UI-02): node handles, flexbox layout (UI-08), Tailwind-like classes and CSS (UI-07),
// retained rendering on the shared rasterizer (UI-09), engine-driven animations and transitions (UI-17),
// pointer + focus input (UI-11). Written in Zinc: the same code is compiled to C++ and to the sim.
// Idle frames cost nothing: when no node, animation or canvas changed, the previous frame is kept (gfx.keep).
import {
  onFrame, clear, rrect, gradient, border, shadow, drawText, drawImage, font, textWidth, image, imageWidth, imageHeight,
  clip, unclip, width, height, pointerX, pointerY, pointerDown, wasPressed, keep, Btn, wheel,
  wheelX, pinch, pointerButtons, modifiers, keyCount, keyKind, keyMods, keyName, buttonEventCount, buttonEventX, buttonEventY,
  buttonEventButton, buttonEventDown, startTextInput, stopTextInput, clipboardText, setClipboardText, setCursor, Cursor, KeyKind,
  escapeByApp, escapeDefault,
} from 'zinc:gfx';
import { PALETTE, SHADES } from './palette';

export const VIEW: i32 = 0, TEXT: i32 = 1, BUTTON: i32 = 2, IMAGE: i32 = 3, SCROLL: i32 = 4, CANVAS: i32 = 5, FRAGMENT: i32 = 6;
export const INPUT: i32 = 7, TEXTAREA: i32 = 8;
export const TAG_NAMES: string[] = ['view', 'text', 'button', 'image', 'scroll', 'canvas', 'fragment', 'input', 'textarea'];
const UNSET: i32 = -100000;
/** Modifier bits of pointer and key events (same as zinc:gfx Mod). */
export const SHIFT: i32 = 1, CTRL: i32 = 2, ALT: i32 = 4, META: i32 = 8;

/** Pointer event: coordinates local to the node that handles it (in its own units: inside a scaled view, world units). */
export class PointerEvent {
  x: number = 0; y: number = 0;     // local to the handling node
  gx: number = 0; gy: number = 0;   // surface coordinates
  button: i32 = 0;                  // 0 left, 1 middle, 2 right
  mods: i32 = 0;
  clicks: i32 = 1;                  // 2 on a double click
  wheel: number = 0; wheelX: number = 0; pinch: number = 1;  // onWheel: steps (+ up / right), trackpad pinch factor
  get shift(): boolean { return (this.mods & SHIFT) !== 0; }
  get ctrl(): boolean { return (this.mods & CTRL) !== 0; }
  get alt(): boolean { return (this.mods & ALT) !== 0; }
  get meta(): boolean { return (this.mods & META) !== 0; }
}
/** Key event: `key` like DOM KeyboardEvent.key, unshifted ('a', 'Enter', 'ArrowLeft', 'F5'). */
export class KeyEvent {
  key: string; mods: i32; repeat: boolean;
  handled: boolean = false;
  constructor(key: string, mods: i32, repeat: boolean) { this.key = key; this.mods = mods; this.repeat = repeat; }
  get shift(): boolean { return (this.mods & SHIFT) !== 0; }
  get ctrl(): boolean { return (this.mods & CTRL) !== 0; }
  get alt(): boolean { return (this.mods & ALT) !== 0; }
  get meta(): boolean { return (this.mods & META) !== 0; }
  /** Cmd on macOS or Ctrl elsewhere: either one is accepted for shortcuts. */
  get primary(): boolean { return (this.mods & (CTRL | META)) !== 0; }
  /** Stops the default handling (text field editing, global handlers). */
  preventDefault(): void { this.handled = true; }
}
/** Event handlers of a node, allocated only for nodes that have some. */
export class Handlers {
  down: ((e: PointerEvent) => void) | null = null;
  move: ((e: PointerEvent) => void) | null = null;
  up: ((e: PointerEvent) => void) | null = null;
  dbl: ((e: PointerEvent) => void) | null = null;
  ctx: ((e: PointerEvent) => void) | null = null;
  wheel: ((e: PointerEvent) => void) | null = null;
  enter: ((e: PointerEvent) => void) | null = null;
  leave: ((e: PointerEvent) => void) | null = null;
  key: ((e: KeyEvent) => void) | null = null;
}
/** Text field state (<input>, <textarea>); offsets are UTF-16 indices into `value`. */
export class Edit {
  value: string = '';
  multi: boolean;
  caret: i32 = 0; anchor: i32 = 0;
  placeholder: string = '';
  password: boolean = false; readOnly: boolean = false; lineNumbers: boolean = false; wrap: boolean = true;
  rows: i32 = 4;                        // visible lines of a textarea without a height
  sx: number = 0; sy: number = 0;       // scroll of the text inside the field
  goalX: number = -1;                   // x kept by up/down moves
  blinkAt: number = 0;
  reveal: boolean = true;               // scroll the caret into view at the next paint
  onInput: ((v: string) => void) | null = null;
  onChange: ((v: string) => void) | null = null;
  highlight: ((line: string) => i32[]) | null = null;
  undo: string[] = []; undoAt: i32[] = []; redo: string[] = []; redoAt: i32[] = [];
  typing: boolean = false;              // consecutive typing is one undo step
  dirty: boolean = false;               // edited by the user since the last change event
  // visual rows [rs, re) of the (wrapped) text, laid out for rowsW pixels
  rs: i32[] = []; re: i32[] = []; rowsW: number = -1; rowsFor: string = '\u0000';
  gutter: number = 0;                   // line number column width
  constructor(multi: boolean) { this.multi = multi; }
}

export class UiNode {
  tag: i32;
  parent: i32 = -1;
  children: i32[] = [];
  text: string = '';
  alive: boolean = true;
  row: boolean = false; wrap: boolean = false;
  justify: i32 = 0;   // 0 start, 1 center, 2 end, 3 between, 4 around, 5 evenly
  align: i32 = 3;     // 0 start, 1 center, 2 end, 3 stretch
  grow: i32 = 0;
  pt: i32 = 0; pr: i32 = 0; pb: i32 = 0; pl: i32 = 0;
  mt: i32 = 0; mr: i32 = 0; mb: i32 = 0; ml: i32 = 0;
  gap: i32 = 0;
  w: i32 = -1; h: i32 = -1; wFrac: number = 0; hFrac: number = 0;
  fullW: boolean = false; fullH: boolean = false;
  abs: boolean = false; top: i32 = UNSET; left: i32 = UNSET; right: i32 = UNSET; bottom: i32 = UNSET;
  hidden: boolean = false;
  overflow: boolean = false;
  // scrolling (UI-14): 1 vertical, 2 horizontal, 3 both; content size from layout, offset applied at paint/hit time
  scroll: i32 = 0;
  sx: number = 0; sy: number = 0; contentW: number = 0; contentH: number = 0;
  vx: number = 0; vy: number = 0; scrolledAt: number = -100000;
  // scroll physics (stepScroll): mouse-wheel target, time of the last user input, and 'live' while the user or an
  // animation drives the offset (overscroll is then allowed; clampScroll leaves it alone)
  tgx: number = 0; tgy: number = 0; smooth: boolean = false; inputAt: number = -100000; live: boolean = false;
  virt: Virtual | null = null;
  responsive: boolean = false;  // has sm:/md:/lg:/xl: classes
  bg: i32 = -1; bgAlpha: i32 = 255;
  grad: i32 = 0; gradFrom: i32 = -1; gradTo: i32 = -1;   // 1 to-b, 2 to-r, 3 to-t, 4 to-l
  radius: number = 0;
  borderW: number = 0; borderColor: i32 = 0xe5e7eb;
  bT: number = -1; bR: number = -1; bB: number = -1; bL: number = -1;  // border-t/r/b/l widths, -1 = borderW
  shadowLevel: i32 = 0;
  opacity: number = 1;
  tx: number = 0; ty: number = 0;
  fg: i32 = -1;  // -1: inherited from the nearest ancestor with a text color (CSS color)
  size: i32 = 16; bold: boolean = false; tracking: number = 0; talign: i32 = 0; leading: i32 = 0;
  fontId: i32 = -1;
  family: string = 'sans';
  lines: string[] = []; lineW: number[] = [];
  img: i32 = -1;
  focusBg: i32 = -1; activeBg: i32 = -1; focusFg: i32 = -1; activeFg: i32 = -1;
  transMs: number = 0; curBg: i32 = -1; fromBg: i32 = -1; transStart: number = 0;
  focusable: boolean = false;
  styleKeys: string[] = []; styleVals: number[] = [];
  cls: string = '\u0000';
  x: number = 0; y: number = 0; lw: number = 0; lh: number = 0;
  onClick: (() => void) | null = null;
  onDraw: ((x: i32, y: i32, w: i32, h: i32) => void) | null = null;
  k: number = 1;                       // style scale: zooms the node and its subtree (origin: top-left corner)
  cursor: i32 = -1;                    // cursor-* class (gfx Cursor), -1 inherited
  hoverBg: i32 = -1; hoverFg: i32 = -1; hoverBorder: i32 = -1; focusBorder: i32 = -1;
  hovered: boolean = false;
  hs: Handlers | null = null;
  ed: Edit | null = null;
  constructor(tag: i32) { this.tag = tag; }
}

/** Virtualized list state: only rows in the viewport (+ overscan) exist as nodes. */
export class Virtual {
  count: i32 = 0;
  itemH: number = 40;
  render: (i: i32) => i32;
  drop: ((row: i32) => void) | null = null;  // called before a row node is destroyed (reactive cleanup)
  rows: Map<i32, i32> = new Map<i32, i32>();  // index -> node
  first: i32 = 0; last: i32 = -1;
  constructor(render: (i: i32) => i32) { this.render = render; }
}
const nodes: UiNode[] = [];
const free: i32[] = [];
let layoutDirty = true;
let paintDirty = true;
let canvases: i32 = 0;
let root: i32 = -1;
let focus: i32 = -1;
let pressed: i32 = -1;
let clock: number = 0;   // engine time in ms
let surfW: i32 = -1, surfH: i32 = -1;

function node(h: i32): UiNode { return nodes[h]; }
function defaults(n: UiNode): void {
  if (n.tag === BUTTON) { n.bg = 0x334155; n.pt = 4; n.pb = 4; n.pl = 8; n.pr = 8; n.align = 1; n.justify = 1; n.focusable = true; }
  if (n.tag === SCROLL) { n.scroll = 1; n.overflow = true; }
  if (n.tag === INPUT || n.tag === TEXTAREA) {
    n.bg = 0x1e293b; n.fg = 0xf1f5f9; n.borderW = 1; n.borderColor = 0x475569; n.radius = 6; n.size = 14;
    n.pt = 6; n.pb = 6; n.pl = 8; n.pr = 8; n.focusable = true; n.overflow = true;
  }
}

export function createNode(tag: i32): i32 {
  layoutDirty = true;
  const n = new UiNode(tag);
  defaults(n);
  if (tag === INPUT || tag === TEXTAREA) n.ed = new Edit(tag === TEXTAREA);
  if (tag === CANVAS) canvases++;
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
  if (n.text !== s) { n.text = s; layoutDirty = true; }
}
export function insert(parent: i32, child: i32, before: i32): void {
  const p = node(parent);
  node(child).parent = parent;
  const i = before < 0 ? -1 : p.children.indexOf(before);
  if (i < 0) p.children.push(child);
  else {
    p.children.push(child);
    for (let k = p.children.length - 1; k > i; k--) p.children[k] = p.children[k - 1];
    p.children[i] = child;
  }
  layoutDirty = true;
}
export function remove(parent: i32, child: i32): void {
  const p = node(parent);
  const i = p.children.indexOf(child);
  if (i >= 0) p.children.splice(i, 1);
  release(child);
  layoutDirty = true;
}
export function clearChildren(parent: i32): void {
  const p = node(parent);
  for (const c of p.children) release(c);
  p.children = [];
  layoutDirty = true;
}
/** Moves an existing child to position `index` (keyed lists reuse nodes instead of rebuilding them). */
export function moveChild(parent: i32, child: i32, index: i32): void {
  const p = node(parent);
  const i = p.children.indexOf(child);
  if (i < 0 || i === index) return;
  p.children.splice(i, 1);
  p.children.push(child);
  for (let k = p.children.length - 1; k > index; k--) p.children[k] = p.children[k - 1];
  p.children[index] = child;
  layoutDirty = true;
}
export function detach(parent: i32, child: i32): void {
  const p = node(parent);
  const i = p.children.indexOf(child);
  if (i >= 0) { p.children.splice(i, 1); layoutDirty = true; }
}
/** Empties a node's child list without destroying the children (the React reconciler re-appends them). */
export function detachChildren(h: i32): void { const n = node(h); if (n.children.length > 0) { n.children = []; layoutDirty = true; } }
export function destroy(h: i32): void { release(h); }
function release(h: i32): void {
  const n = node(h);
  if (!n.alive) return;
  for (const c of n.children) release(c);
  if (n.tag === CANVAS) canvases--;
  n.alive = false;
  n.onClick = null;
  n.onDraw = null;
  n.hs = null;
  n.ed = null;
  if (focus === h) focus = -1;
  if (pressed === h) pressed = -1;
  if (capture === h) capture = -1;
  if (selecting === h) selecting = -1;
  for (const a of anims) if (a.node === h) a.node = -1;
  free.push(h);
}
export function listen(h: i32, f: () => void): void { const n = node(h); n.onClick = f; n.focusable = true; }
export function draw(h: i32, f: (x: i32, y: i32, w: i32, h: i32) => void): void { node(h).onDraw = f; }
/** Scroll offset of a scroll container (pixels from the top / left). */
export function scrollTop(h: i32): number { return node(h).sy; }
export function scrollLeft(h: i32): number { return node(h).sx; }
/** Scrolls a container to an offset (clamped). */
export function scrollTo(h: i32, x: number, y: number): void {
  const n = node(h);
  n.sx = x; n.sy = y; n.vx = 0; n.vy = 0; n.smooth = false; n.live = false;
  clampScroll(n);
  n.scrolledAt = clock;
  if (n.virt !== null) layoutDirty = true;
  paintDirty = true;
}
/**
 * Makes a scroll container a virtual list of `count` rows of `itemH` pixels: only the rows in view (+3) are built by
 * `render(i)`, positioned absolutely, and destroyed when they scroll out. Calling it again with a new count or render
 * function rebuilds the visible rows.
 */
export function virtualize(h: i32, count: i32, itemH: number, render: (i: i32) => i32, drop: ((row: i32) => void) | null): void {
  const n = node(h);
  if (n.scroll === 0) { n.scroll = 1; n.overflow = true; }
  let v = n.virt;
  if (v === null) { v = new Virtual(render); n.virt = v; virtList.push(h); }
  const vv = v as Virtual;
  vv.render = render; vv.count = count; vv.itemH = itemH; vv.drop = drop;
  vv.rows.forEach((row: i32, i: i32) => { if (drop !== null) drop(row); detach(h, row); release(row); });
  vv.rows = new Map<i32, i32>();
  vv.first = 0; vv.last = -1;
  layoutDirty = true;
}
function syncVirtual(h: i32, n: UiNode): void {
  const v = n.virt as Virtual;
  const over: i32 = 3;
  let first: i32 = Math.floor(n.sy / v.itemH) - over;
  let last: i32 = Math.ceil((n.sy + n.lh) / v.itemH) + over;
  if (first < 0) first = 0;
  if (last > v.count - 1) last = v.count - 1;
  if (first === v.first && last === v.last) return;
  const drop: i32[] = [];
  v.rows.forEach((row: i32, i: i32) => { if (i < first || i > last) drop.push(i); });
  for (const i of drop) { const row = v.rows.get(i) as i32; const d = v.drop; if (d !== null) d(row); detach(h, row); release(row); v.rows.delete(i); }
  for (let i = first; i <= last; i++) {
    if (v.rows.has(i)) continue;
    const row = v.render(i);
    const r = node(row);
    r.abs = true; r.top = Math.round(n.pt + i * v.itemH); r.left = n.pl; r.right = n.pr; r.h = Math.round(v.itemH);
    insert(h, row, -1);
    v.rows.set(i, row);
  }
  v.first = first; v.last = last;
  layoutDirty = true;
}
export function setFocusable(h: i32, on: boolean): void { node(h).focusable = on; }
export function setImage(h: i32, name: string): void { node(h).img = image(name); layoutDirty = true; }

// ---------------------------------------------------------------- event handlers and text fields (host ABI)
function handlers(h: i32): Handlers {
  const n = node(h);
  let s = n.hs;
  if (s === null) { s = new Handlers(); n.hs = s; }
  return s as Handlers;
}
export const PDOWN: i32 = 0, PMOVE: i32 = 1, PUP: i32 = 2, PDBL: i32 = 3, PCONTEXT: i32 = 4, PWHEEL: i32 = 5, PENTER: i32 = 6, PLEAVE: i32 = 7;
/** Pointer handler of a node: kind PDOWN, PMOVE, PUP, PDBL (double click), PCONTEXT (right click), PWHEEL, PENTER, PLEAVE. */
export function onPointer(h: i32, kind: i32, f: (e: PointerEvent) => void): void {
  const s = handlers(h);
  if (kind === PDOWN) s.down = f; else if (kind === PMOVE) s.move = f; else if (kind === PUP) s.up = f;
  else if (kind === PDBL) s.dbl = f; else if (kind === PCONTEXT) s.ctx = f; else if (kind === PWHEEL) s.wheel = f;
  else if (kind === PENTER) s.enter = f; else s.leave = f;
}
/** Key handler of a node, called while it (or a descendant) has the focus. */
export function onKeyDown(h: i32, f: (e: KeyEvent) => void): void { handlers(h).key = f; }
const keyHandlers: ((e: KeyEvent) => void)[] = [];
/** Global key handler (shortcuts): gets the keys that the focused node and text fields did not handle. */
export function onKey(f: (e: KeyEvent) => void): void { keyHandlers.push(f); }
function editOf(h: i32): Edit {
  const e = node(h).ed;
  if (e === null) throw new Error('not a text field (<input> or <textarea>)');
  return e as Edit;
}
/** Text field value (controlled: setting the current value is a no-op, the caret is kept when possible). */
export function setValue(h: i32, v: string): void {
  const e = editOf(h);
  if (e.value === v) return;
  e.value = v;
  if (e.caret > v.length) e.caret = v.length;
  if (e.anchor > v.length) e.anchor = v.length;
  paintDirty = true;
}
export function getValue(h: i32): string { return editOf(h).value; }
export function setPlaceholder(h: i32, s: string): void { editOf(h).placeholder = s; paintDirty = true; }
/** onInput: every edit; onChange: when the field loses the focus or Enter is pressed (single line) after a change. */
export function onText(h: i32, change: boolean, f: (v: string) => void): void { const e = editOf(h); if (change) e.onChange = f; else e.onInput = f; }
/** Syntax colouring hook: returns [length, color, length, color...] runs for one visual line (color -1: text color). */
export function setHighlight(h: i32, f: (line: string) => i32[]): void { editOf(h).highlight = f; paintDirty = true; }
/** Caret position and selected text of a field (tests, tools). */
export function caretOf(h: i32): i32 { return editOf(h).caret; }
export function selectedText(h: i32): string { const e = editOf(h); return e.value.slice(imin(e.caret, e.anchor), imax(e.caret, e.anchor)); }
/** Selects [a, b) of a field (caret at b). */
export function select(h: i32, a: i32, b: i32): void { const e = editOf(h); e.anchor = clampI(a, 0, e.value.length); e.caret = clampI(b, 0, e.value.length); e.reveal = true; paintDirty = true; }
function imin(a: i32, b: i32): i32 { return a < b ? a : b; }
function imax(a: i32, b: i32): i32 { return a > b ? a : b; }
function clampI(v: i32, a: i32, b: i32): i32 { return v < a ? a : v > b ? b : v; }

/** Numeric style properties (style={{ ... }}, animate, dynamic attributes). */
export function setNumber(h: i32, key: string, v: number): void {
  const n = node(h);
  const i = n.styleKeys.indexOf(key);
  if (i >= 0) { if (n.styleVals[i] === v) return; n.styleVals[i] = v; } else { n.styleKeys.push(key); n.styleVals.push(v); }
  applyNumber(n, key, v);
}
function applyNumber(n: UiNode, key: string, v: number): void {
  const iv: i32 = Math.round(v);
  if (key === 'opacity') { n.opacity = v; paintDirty = true; return; }
  if (key === 'translateX' || key === 'x') { n.tx = v; paintDirty = true; return; }
  if (key === 'translateY' || key === 'y') { n.ty = v; paintDirty = true; return; }
  if (key === 'bg' || key === 'backgroundColor') { n.bg = iv; paintDirty = true; return; }
  if (key === 'color') { n.fg = iv; paintDirty = true; return; }
  if (key === 'radius' || key === 'borderRadius') { n.radius = v; paintDirty = true; return; }
  if (key === 'scale' && n.tag !== TEXT) { n.k = v > 0 ? v : 1; paintDirty = true; return; }  // text: legacy font scale below
  const e = n.ed;
  if (e !== null) {
    if (key === 'password') { e.password = iv !== 0; e.rowsFor = '\u0000'; paintDirty = true; return; }
    if (key === 'readOnly') { e.readOnly = iv !== 0; paintDirty = true; return; }
    if (key === 'lineNumbers') { e.lineNumbers = iv !== 0; e.rowsW = -1; paintDirty = true; return; }
    if (key === 'wrap') { e.wrap = iv !== 0; e.rowsW = -1; paintDirty = true; return; }
    if (key === 'rows') { e.rows = iv; layoutDirty = true; return; }
  }
  if (key === 'width') n.w = iv; else if (key === 'height') n.h = iv;
  else if (key === 'grow') n.grow = iv; else if (key === 'gap') n.gap = iv;
  else if (key === 'padding') { n.pt = iv; n.pr = iv; n.pb = iv; n.pl = iv; }
  else if (key === 'scale') n.size = 8 * iv;
  else if (key === 'fontSize') n.size = iv;
  else if (key === 'hidden') n.hidden = iv !== 0;
  else if (key === 'top') n.top = iv; else if (key === 'left') n.left = iv;
  layoutDirty = true;
}

// ---------------------------------------------------------------- classes (Tailwind subset + CSS rules)
const COLORS = new Map<string, i32>();
const CSS = new Map<string, string>();
/** Hex digits to an i32 (-1 if invalid). Not parseInt: 24-bit colors overflow the fixed-point `number` of fx12 profiles. */
export function parseHex(s: string): i32 {
  let v: i32 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) | 32;
    const d: i32 = c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : -1;
    if (d < 0 || s.length > 8) return -1;
    v = v * 16 + d;
  }
  return s.length > 0 ? v : -1;
}
function initColors(): void {
  if (COLORS.size > 0) return;
  COLORS.set('white', 0xffffff); COLORS.set('black', 0x000000);
  for (const fam of PALETTE.split(';')) {
    const parts = fam.split(':');
    const hexes = parts[1].split(',');
    for (let i = 0; i < hexes.length; i++) COLORS.set(`${parts[0]}-${SHADES[i]}`, parseHex(hexes[i]));
  }
}
/** Registers a CSS class (compiled from a .css file) as a list of Tailwind-like tokens. */
export function defineClass(name: string, tokens: string): void { CSS.set(name, tokens); }
function num(s: string): number {
  if (s.startsWith('[')) return parseFloat(s.slice(1, s.length - 1).replace('px', ''));
  if (s.indexOf('/') > 0) { const p = s.split('/'); return parseFloat(p[0]) / parseFloat(p[1]); }
  if (s === 'px') return 1;
  return parseFloat(s) * 4;
}
/** Border widths are pixels: border-2 = 2px, border-[3px] = 3px. */
function borderPx(s: string): number { return s.startsWith('[') ? num(s) : num(s) / 4; }
/** A Tailwind colour name ('indigo-500', 'white', '[#ff8800]') as 0xRRGGBB, or -1 if unknown (canvas drawing in theme colours). */
export function tailwindColor(name: string): i32 { const c = colorOf(name); return c < 0 ? -1 : c; }
function colorOf(s: string): i32 {
  initColors();
  const slash = s.indexOf('/');
  const base = slash > 0 ? s.slice(0, slash) : s;
  if (base.startsWith('[#')) { const v = parseHex(base.slice(2, base.length - 1)); return v < 0 ? -2 : v; }
  if (base === 'transparent') return -1;
  return COLORS.get(base) ?? -2;
}
function alphaOf(s: string): i32 {
  const slash = s.indexOf('/');
  return slash > 0 ? Math.round(parseFloat(s.slice(slash + 1)) * 2.55) : 255;
}
const TEXT_PX: string[] = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];
const TEXT_SIZE: i32[] = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60];
const TEXT_LEAD: i32[] = [16, 20, 24, 28, 28, 32, 36, 40, 48, 60];
const RADII: string[] = ['none', 'sm', '', 'md', 'lg', 'xl', '2xl', '3xl', 'full'];
const RADIUS_PX: number[] = [0, 2, 4, 6, 8, 12, 16, 24, 9999];
function side(n: UiNode, which: string, v: i32, margin: boolean): void {
  const all = which === '', x = which === 'x', y = which === 'y';
  if (margin) {
    if (all || y || which === 't') n.mt = v;
    if (all || y || which === 'b') n.mb = v;
    if (all || x || which === 'l') n.ml = v;
    if (all || x || which === 'r') n.mr = v;
  } else {
    if (all || y || which === 't') n.pt = v;
    if (all || y || which === 'b') n.pb = v;
    if (all || x || which === 'l') n.pl = v;
    if (all || x || which === 'r') n.pr = v;
  }
}
/** Applies one token; returns false when unknown. `variant` is '' | 'focus' | 'active'. */
const CURSORS: string[] = ['default', 'auto', 'text', 'pointer', 'move', 'ew-resize', 'col-resize', 'ns-resize', 'row-resize', 'crosshair', 'grab', 'grabbing', 'not-allowed'];
const CURSOR_OF: i32[] = [0, 0, 1, 2, 3, 4, 4, 5, 5, 6, 7, 8, 9];
const BREAKPOINTS: string[] = ['sm:', 'md:', 'lg:', 'xl:', '2xl:'];
const BREAKPOINT_PX: i32[] = [640, 768, 1024, 1280, 1536];
function applyToken(n: UiNode, tok: string, variant: string): boolean {
  // responsive (mobile first): md:flex-row applies from 768 px wide; re-evaluated when the window is resized
  for (let i = 0; i < BREAKPOINTS.length; i++) if (tok.startsWith(BREAKPOINTS[i])) {
    n.responsive = true;
    const rest = tok.slice(BREAKPOINTS[i].length);
    return width() >= BREAKPOINT_PX[i] ? applyToken(n, rest, variant) : applyToken(new UiNode(n.tag), rest, variant);
  }
  if (tok.startsWith('focus:')) return applyToken(n, tok.slice(6), 'focus');
  if (tok.startsWith('active:')) return applyToken(n, tok.slice(7), 'active');
  // hover: colors under the mouse (desktop); other hover: tokens are accepted and ignored
  if (tok.startsWith('hover:')) { applyToken(n, tok.slice(6), 'hover'); return true; }
  if (variant !== '') {
    const isBg = tok.startsWith('bg-'), isBorder = tok.startsWith('border-');
    const c = isBg ? colorOf(tok.slice(3)) : isBorder ? colorOf(tok.slice(7)) : tok.startsWith('text-') ? colorOf(tok.slice(5)) : -2;
    if (c === -2) return false;
    if (variant === 'focus') { if (isBg) n.focusBg = c; else if (isBorder) n.focusBorder = c; else n.focusFg = c; }
    else if (variant === 'hover') { if (isBg) n.hoverBg = c; else if (isBorder) n.hoverBorder = c; else n.hoverFg = c; }
    else { if (isBg) n.activeBg = c; else if (isBorder) return false; else n.activeFg = c; }
    return true;
  }
  if (tok.startsWith('cursor-')) {
    const i = CURSORS.indexOf(tok.slice(7));
    if (i < 0) return false;
    n.cursor = CURSOR_OF[i];
    return true;
  }
  const css = CSS.get(tok);
  if (css !== undefined) { for (const t of css.split(' ')) if (t.length > 0) applyToken(n, t, ''); return true; }
  if (tok === 'flex' || tok === 'relative' || tok === 'static' || tok === 'font-normal' || tok === 'font-medium' || tok === 'transition' || tok === 'ease-out' || tok === 'ease-in' || tok === 'ease-in-out') return true;
  if (tok === 'flex-row') { n.row = true; return true; }
  if (tok === 'flex-col') { n.row = false; return true; }
  if (tok === 'flex-wrap') { n.wrap = true; return true; }
  if (tok === 'absolute') { n.abs = true; return true; }
  if (tok === 'hidden') { n.hidden = true; return true; }
  if (tok === 'overflow-hidden') { n.overflow = true; return true; }
  if (tok === 'overflow-auto' || tok === 'overflow-scroll') { n.overflow = true; n.scroll = 3; return true; }
  if (tok === 'overflow-y-auto' || tok === 'overflow-y-scroll') { n.overflow = true; n.scroll = n.scroll | 1; return true; }
  if (tok === 'overflow-x-auto' || tok === 'overflow-x-scroll') { n.overflow = true; n.scroll = n.scroll | 2; return true; }
  if (tok === 'grow' || tok === 'flex-1') { n.grow = 1; return true; }
  if (tok === 'grow-0') { n.grow = 0; return true; }
  if (tok === 'w-full') { n.fullW = true; return true; }
  if (tok === 'h-full') { n.fullH = true; return true; }
  if (tok === 'inset-0') { n.abs = true; n.top = 0; n.left = 0; n.right = 0; n.bottom = 0; return true; }
  if (tok === 'font-bold' || tok === 'font-semibold') { n.bold = true; return true; }
  if (tok === 'font-mono') { n.family = 'mono'; return true; }
  if (tok === 'font-sans') { n.family = 'sans'; return true; }
  if (tok.startsWith('font-[') && tok.endsWith(']')) { n.family = tok.slice(6, tok.length - 1); return true; }
  if (tok === 'text-left') { n.talign = 0; return true; }
  if (tok === 'text-center') { n.talign = 1; return true; }
  if (tok === 'text-right') { n.talign = 2; return true; }
  if (tok === 'tracking-tight') { n.tracking = -0.025; return true; }
  if (tok === 'tracking-wide') { n.tracking = 0.025; return true; }
  if (tok === 'tracking-wider') { n.tracking = 0.05; return true; }
  if (tok === 'tracking-widest') { n.tracking = 0.1; return true; }
  if (tok === 'transition-colors' || tok === 'transition-all') { if (n.transMs === 0) n.transMs = 150; return true; }
  if (tok.startsWith('duration-')) { n.transMs = parseFloat(tok.slice(9)); return true; }
  if (tok === 'shadow-none') { n.shadowLevel = 0; return true; }
  if (tok === 'shadow-sm') { n.shadowLevel = 1; return true; }
  if (tok === 'shadow') { n.shadowLevel = 2; return true; }
  if (tok === 'shadow-md') { n.shadowLevel = 3; return true; }
  if (tok === 'shadow-lg') { n.shadowLevel = 4; return true; }
  if (tok === 'shadow-xl') { n.shadowLevel = 5; return true; }
  if (tok === 'border') { n.borderW = 1; return true; }
  if (tok === 'rounded' || tok.startsWith('rounded-')) {
    const k = tok === 'rounded' ? '' : tok.slice(8);
    const i = RADII.indexOf(k);
    n.radius = i >= 0 ? RADIUS_PX[i] : num(k);
    return true;
  }
  if (tok.startsWith('items-')) { const k = tok.slice(6); n.align = k === 'start' ? 0 : k === 'center' ? 1 : k === 'end' ? 2 : 3; return true; }
  if (tok.startsWith('justify-')) {
    const k = tok.slice(8);
    n.justify = k === 'start' ? 0 : k === 'center' ? 1 : k === 'end' ? 2 : k === 'between' ? 3 : k === 'around' ? 4 : 5;
    return true;
  }
  if (tok.startsWith('bg-gradient-to-')) { const k = tok.slice(15); n.grad = k === 'b' ? 1 : k === 'r' ? 2 : k === 't' ? 3 : 4; return true; }
  if (tok.startsWith('from-')) { n.gradFrom = colorOf(tok.slice(5)); return n.gradFrom !== -2; }
  if (tok.startsWith('via-')) return true;
  if (tok.startsWith('to-')) { n.gradTo = colorOf(tok.slice(3)); return n.gradTo !== -2; }
  if (tok.startsWith('bg-')) { const c = colorOf(tok.slice(3)); if (c === -2) return false; n.bg = c; n.bgAlpha = alphaOf(tok.slice(3)); return true; }
  if (tok.startsWith('border-') && (tok.length === 8 || tok.slice(8, 9) === '-') && 'trblxy'.indexOf(tok.slice(7, 8)) >= 0) {
    const sd = tok.slice(7, 8), bw = tok.length === 8 ? 1 : borderPx(tok.slice(9));
    if (n.borderW < 0) n.borderW = 0;  // a color token alone no longer implies all four sides
    if (sd === 't' || sd === 'y') n.bT = bw;
    if (sd === 'b' || sd === 'y') n.bB = bw;
    if (sd === 'l' || sd === 'x') n.bL = bw;
    if (sd === 'r' || sd === 'x') n.bR = bw;
    return true;
  }
  if (tok.startsWith('border-')) {
    const k = tok.slice(7);
    const c = colorOf(k);
    if (c !== -2) { n.borderColor = c; if (n.borderW === 0 && n.bT < 0 && n.bR < 0 && n.bB < 0 && n.bL < 0) n.borderW = -1; return true; }  // -1: 1px unless a side is set
    n.borderW = borderPx(k);
    return true;
  }
  if (tok.startsWith('opacity-')) { n.opacity = parseFloat(tok.slice(8)) / 100; return true; }
  if (tok.startsWith('text-')) {
    const k = tok.slice(5);
    const i = TEXT_PX.indexOf(k);
    if (i >= 0) { n.size = TEXT_SIZE[i]; n.leading = TEXT_LEAD[i]; return true; }
    if (k.startsWith('[') && !k.startsWith('[#')) { n.size = Math.round(num(k)); n.leading = 0; return true; }
    const c = colorOf(k);
    if (c === -2) return false;
    n.fg = c;
    return true;
  }
  if (tok.startsWith('leading-')) { n.leading = Math.round(num(tok.slice(8))); return true; }
  if (tok.startsWith('gap-')) { n.gap = Math.round(num(tok.slice(tok.startsWith('gap-x-') || tok.startsWith('gap-y-') ? 6 : 4))); return true; }
  if (tok.startsWith('top-')) { n.top = Math.round(num(tok.slice(4))); return true; }
  if (tok.startsWith('left-')) { n.left = Math.round(num(tok.slice(5))); return true; }
  if (tok.startsWith('right-')) { n.right = Math.round(num(tok.slice(6))); return true; }
  if (tok.startsWith('bottom-')) { n.bottom = Math.round(num(tok.slice(7))); return true; }
  if (tok.startsWith('w-')) { const k = tok.slice(2); if (k.indexOf('/') > 0) n.wFrac = num(k); else n.w = Math.round(num(k)); return true; }
  if (tok.startsWith('h-')) { const k = tok.slice(2); if (k.indexOf('/') > 0) n.hFrac = num(k); else n.h = Math.round(num(k)); return true; }
  const dash = tok.indexOf('-');
  if (dash > 0) {
    const pre = tok.slice(0, dash);
    const v: i32 = Math.round(num(tok.slice(dash + 1)));
    if (pre === 'p' || pre === 'px' || pre === 'py' || pre === 'pt' || pre === 'pr' || pre === 'pb' || pre === 'pl') { side(n, pre.slice(1), v, false); return true; }
    if (pre === 'm' || pre === 'mx' || pre === 'my' || pre === 'mt' || pre === 'mr' || pre === 'mb' || pre === 'ml') { side(n, pre.slice(1), v, true); return true; }
  }
  return false;
}
function resetStyle(n: UiNode): void {
  const fresh = new UiNode(n.tag);
  defaults(fresh);
  n.row = false; n.wrap = false; n.justify = fresh.justify; n.align = fresh.align; n.grow = 0;
  n.pt = fresh.pt; n.pr = fresh.pr; n.pb = fresh.pb; n.pl = fresh.pl; n.mt = 0; n.mr = 0; n.mb = 0; n.ml = 0; n.gap = 0;
  n.w = -1; n.h = -1; n.wFrac = 0; n.hFrac = 0; n.fullW = false; n.fullH = false;
  n.abs = false; n.top = UNSET; n.left = UNSET; n.right = UNSET; n.bottom = UNSET; n.hidden = false; n.overflow = n.tag === SCROLL; n.scroll = n.tag === SCROLL ? 1 : 0;
  n.bg = fresh.bg; n.bgAlpha = 255; n.grad = 0; n.gradFrom = -1; n.gradTo = -1; n.radius = 0; n.borderW = 0; n.bT = -1; n.bR = -1; n.bB = -1; n.bL = -1; n.shadowLevel = 0;
  n.opacity = 1; n.fg = fresh.fg; n.size = 16; n.bold = false; n.family = 'sans'; n.tracking = 0; n.talign = 0; n.leading = 0;
  n.focusBg = -1; n.activeBg = -1; n.focusFg = -1; n.activeFg = -1; n.transMs = 0;
  n.hoverBg = -1; n.hoverFg = -1; n.hoverBorder = -1; n.focusBorder = -1; n.cursor = -1;
  if (n.ed !== null) { n.borderW = fresh.borderW; n.borderColor = fresh.borderColor; n.radius = fresh.radius; n.size = fresh.size; n.overflow = true; }
}
export function setClass(h: i32, cls: string): void {
  const n = node(h);
  if (n.cls === cls) return;
  n.cls = cls;
  resetStyle(n);
  for (const c of cls.split(' ')) if (c.length > 0) applyToken(n, c, '');
  for (let i = 0; i < n.styleKeys.length; i++) applyNumber(n, n.styleKeys[i], n.styleVals[i]);
  if (n.ed !== null) (n.ed as Edit).rowsW = -1;  // the font may have changed
  layoutDirty = true;
}
/** Class validation used by debug builds and tools. */
export function isKnownClass(tok: string): boolean { return applyToken(new UiNode(VIEW), tok, ''); }

// ---------------------------------------------------------------- layout (UI-08)
function flat(n: UiNode, out: UiNode[], wantAbs: boolean): void {
  for (const h of n.children) {
    const c = node(h);
    if (c.hidden) continue;
    if (c.tag === FRAGMENT) flat(c, out, wantAbs);
    else if (c.abs === wantAbs) out.push(c);
  }
}
/** Text color: the node's own, else the nearest ancestor's (any element), like CSS `color`. */
export function textFg(h: i32): i32 {
  let q = h;
  while (q >= 0 && nodes[q].fg < 0) q = nodes[q].parent;
  return q >= 0 ? nodes[q].fg : 0xffffff;
}
/** Text inherits size and weight from its parent text node. */
function inheritText(n: UiNode): void {
  if (n.parent < 0) return;
  let p = n.parent;
  while (p >= 0 && nodes[p].tag === FRAGMENT) p = nodes[p].parent;
  if (p >= 0 && nodes[p].tag === TEXT && n.cls === '\u0000') { const t = nodes[p]; n.size = t.size; n.bold = t.bold; n.family = t.family; n.tracking = t.tracking; n.leading = t.leading; }
}
function fontOf(n: UiNode): i32 {
  // font-mono / font-[Family] (a TTF in the assets); bold: sans-bold, or Family-Bold when that file exists
  const bold = n.family === 'sans' ? 'sans-bold' : n.family + '-Bold';
  n.fontId = n.bold ? font(bold, n.size) : -1;
  if (n.fontId < 0) n.fontId = font(n.family, n.size);
  if (n.fontId < 0) n.fontId = font(n.bold ? 'sans-bold' : 'sans', n.size);
  return n.fontId;
}
function lineHeightOf(n: UiNode): number { return n.leading > 0 ? n.leading : Math.round(n.size * 1.4); }
function trackPx(n: UiNode): number { return n.tracking * n.size; }
/** Word wrap with the baked font metrics (UI-10). */
function wrapText(n: UiNode, maxW: number): void {
  const f = fontOf(n), tr = trackPx(n);
  n.lines = [];
  n.lineW = [];
  const full = textWidth(f, n.text, tr);
  const avail = maxW - n.pl - n.pr;
  if (full <= avail || avail <= n.size) { n.lines.push(n.text); n.lineW.push(full); return; }
  let line = '';
  for (const word of n.text.split(' ')) {
    const cand = line.length === 0 ? word : line + ' ' + word;
    if (textWidth(f, cand, tr) > avail && line.length > 0) { n.lines.push(line); n.lineW.push(textWidth(f, line, tr)); line = word; }
    else line = cand;
  }
  if (line.length > 0) { n.lines.push(line); n.lineW.push(textWidth(f, line, tr)); }
}
function outerW(c: UiNode): number { return c.lw + c.ml + c.mr; }
function outerH(c: UiNode): number { return c.lh + c.mt + c.mb; }
function measure(n: UiNode, maxW: number, maxH: number): void {
  const ownW: number = n.w >= 0 ? n.w : n.wFrac > 0 ? Math.round(maxW * n.wFrac) : -1;
  const ownH: number = n.h >= 0 ? n.h : n.hFrac > 0 ? Math.round(maxH * n.hFrac) : -1;
  if (n.tag === TEXT) {
    inheritText(n);
    wrapText(n, ownW >= 0 ? ownW : maxW);
    let widest: number = 0;
    for (const w of n.lineW) if (w > widest) widest = w;
    n.lw = Math.ceil(widest) + n.pl + n.pr;
    n.lh = n.lines.length * lineHeightOf(n) + n.pt + n.pb;
    for (const c of n.children) { const t = node(c); if (t.tag === TEXT) measure(t, maxW, maxH); }
  } else if (n.ed !== null) {
    // text fields: 200 px wide by default (stretch / grow / w-* size them), one line or `rows` lines high
    const e = n.ed as Edit;
    fontOf(n);
    n.lw = (n.fullW ? 0 : 200) + n.pl + n.pr;
    n.lh = (e.multi ? e.rows : 1) * lineHeightOf(n) + n.pt + n.pb;
  } else if (n.tag === IMAGE && n.img >= 0) {
    // intrinsic size, aspect ratio kept when one side is set; w-full / h-full fill (0 basis, then grow/stretch)
    const iw = imageWidth(n.img), ih = imageHeight(n.img);
    n.lw = ownW >= 0 ? ownW : ownH >= 0 && ih > 0 ? Math.round(ownH * iw / ih) : n.fullW ? 0 : iw;
    n.lh = ownH >= 0 ? ownH : ownW >= 0 && iw > 0 ? Math.round(ownW * ih / iw) : n.fullH ? 0 : ih;
  } else {
    const kids: UiNode[] = [];
    flat(n, kids, false);
    const inner: number = (ownW >= 0 ? ownW : maxW) - n.pl - n.pr;
    const innerH: number = (n.scroll & 1) !== 0 ? 1000000 : (ownH >= 0 ? ownH : maxH) - n.pt - n.pb;
    let main: number = 0, cross: number = 0, lineMain: number = 0, lineCross: number = 0;
    let count: i32 = 0;
    for (const c of kids) {
      measure(c, n.row ? inner : inner - c.ml - c.mr, innerH);
      const cm = n.row ? outerW(c) : outerH(c), cc = n.row ? outerH(c) : outerW(c);
      if (n.row && n.wrap && count > 0 && lineMain + n.gap + cm > inner) {
        if (lineMain > main) main = lineMain;
        cross += lineCross + n.gap;
        lineMain = 0;
        lineCross = 0;
        count = 0;
      }
      lineMain += (count > 0 ? n.gap : 0) + cm;
      if (cc > lineCross) lineCross = cc;
      count++;
    }
    if (lineMain > main) main = lineMain;
    cross += lineCross;
    n.lw = (n.row ? main : cross) + n.pl + n.pr;
    n.lh = (n.row ? cross : main) + n.pt + n.pb;
    const abs: UiNode[] = [];
    flat(n, abs, true);
    for (const c of abs) measure(c, inner, innerH);
  }
  if (n.scroll !== 0) {
    // the viewport is sized by its constraints (grow / full / fixed), the content keeps its natural size
    n.contentW = n.lw; n.contentH = n.lh;
    if (n.virt !== null) { const v = n.virt as Virtual; n.contentH = v.count * v.itemH + n.pt + n.pb; }
    if ((n.scroll & 1) !== 0) n.lh = ownH >= 0 ? ownH : n.fullH || n.grow > 0 ? 0 : Math.min(n.contentH, maxH);
    if ((n.scroll & 2) !== 0) n.lw = ownW >= 0 ? ownW : n.fullW || n.grow > 0 ? 0 : Math.min(n.contentW, maxW);
  }
  if (ownW >= 0) n.lw = ownW;
  if (ownH >= 0) n.lh = ownH;
}
function place(n: UiNode, x: number, y: number, vw: number, vh: number): void {
  n.x = x; n.y = y; n.lw = vw; n.lh = vh;
  if (n.tag === TEXT) return;
  // scroll containers lay their content out at its natural size; the viewport only clips and offsets it
  const w = (n.scroll & 2) !== 0 ? Math.max(vw, n.contentW) : vw, h = (n.scroll & 1) !== 0 ? Math.max(vh, n.contentH) : vh;
  if (n.scroll !== 0) clampScroll(n);
  const kids: UiNode[] = [];
  flat(n, kids, false);
  const iw = w - n.pl - n.pr, ih = h - n.pt - n.pb;
  const innerMain = n.row ? iw : ih, innerCross = n.row ? ih : iw;
  let start: i32 = 0;
  let crossPos: number = 0;
  while (start < kids.length) {
    let end: i32 = start;
    let used: number = 0;
    while (end < kids.length) {
      const cm = n.row ? outerW(kids[end]) : outerH(kids[end]);
      if (n.row && n.wrap && end > start && used + n.gap + cm > innerMain) break;
      used += (end > start ? n.gap : 0) + cm;
      end++;
    }
    let lineCross: number = 0;
    let grows: i32 = 0;
    for (let i = start; i < end; i++) {
      const c = kids[i];
      const cc = n.row ? outerH(c) : outerW(c);
      if (cc > lineCross) lineCross = cc;
      grows += c.grow > 0 ? c.grow : (n.row ? c.fullW : c.fullH) ? 1 : 0;
    }
    if (!n.wrap || !n.row) lineCross = innerCross;
    const free = innerMain - used;
    const count = end - start;
    let pos: number = 0, between: number = n.gap;
    if (grows === 0 && free > 0) {
      if (n.justify === 1) pos = Math.floor(free / 2);
      else if (n.justify === 2) pos = free;
      else if (n.justify === 3 && count > 1) between = n.gap + free / (count - 1);
      else if (n.justify === 4) { between = n.gap + free / count; pos = between / 2 - n.gap / 2; }
      else if (n.justify === 5) { between = n.gap + free / (count + 1); pos = between - n.gap; }
    }
    for (let i = start; i < end; i++) {
      const c = kids[i];
      let cm: number = n.row ? c.lw : c.lh;
      const g = c.grow > 0 ? c.grow : (n.row ? c.fullW : c.fullH) ? 1 : 0;
      if (grows > 0 && free > 0 && g > 0) cm += Math.floor(free * g / grows);
      let cc: number = n.row ? c.lh : c.lw;
      const marginCross = n.row ? c.mt + c.mb : c.ml + c.mr;
      let off: number = 0;
      const stretch = (n.align === 3 && (n.row ? c.h < 0 : c.w < 0)) || (n.row ? c.fullH : c.fullW);
      if (stretch) cc = lineCross - marginCross;
      else if (n.align === 1) off = Math.floor((lineCross - cc - marginCross) / 2);
      else if (n.align === 2) off = lineCross - cc - marginCross;
      if (n.row) place(c, Math.round(x + n.pl + pos + c.ml), Math.round(y + n.pt + crossPos + off + c.mt), cm, cc);
      else place(c, Math.round(x + n.pl + crossPos + off + c.ml), Math.round(y + n.pt + pos + c.mt), cc, cm);
      pos += cm + (n.row ? c.ml + c.mr : c.mt + c.mb) + between;
    }
    crossPos += lineCross + n.gap;
    start = end;
  }
  const abs: UiNode[] = [];
  flat(n, abs, true);
  for (const c of abs) {
    let cw: number = c.fullW ? w : c.lw;
    let ch: number = c.fullH ? h : c.lh;
    if (c.left !== UNSET && c.right !== UNSET) cw = w - c.left - c.right;
    if (c.top !== UNSET && c.bottom !== UNSET) ch = h - c.top - c.bottom;
    const cx = c.left !== UNSET ? x + c.left : c.right !== UNSET ? x + w - c.right - cw : x + n.pl;
    const cy = c.top !== UNSET ? y + c.top : c.bottom !== UNSET ? y + h - c.bottom - ch : y + n.pt;
    place(c, cx, cy, cw, ch);
  }
}
export function layout(): void {
  if (root < 0) return;
  // the root always fills the surface (which follows the window in fill mode)
  const r = node(root);
  r.w = width(); r.h = height();
  measure(r, width(), height());
  place(r, 0, 0, width(), height());
  layoutDirty = false;
  paintDirty = true;
  hoverDirty = true;
}

// ---------------------------------------------------------------- animations (UI-17): engine-driven, no reactive work per frame
class Anim {
  node: i32; key: string; from: number; to: number; start: number; dur: number; easing: i32;
  done: (() => void) | null = null;
  constructor(node: i32, key: string, from: number, to: number, start: number, dur: number, easing: i32) {
    this.node = node; this.key = key; this.from = from; this.to = to; this.start = start; this.dur = dur; this.easing = easing;
  }
}
const anims: Anim[] = [];
function easeOf(name: string): i32 {
  return name === 'linear' ? 0 : name === 'in' ? 1 : name === 'out' ? 2 : name === 'inOut' || name === 'in-out' ? 3 : name === 'spring' ? 4 : 2;
}
function ease(e: i32, t: number): number {
  if (e === 0) return t;
  if (e === 1) return t * t * t;
  if (e === 2) { const u = 1 - t; return 1 - u * u * u; }
  if (e === 3) return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return 1 - Math.exp(-6 * t) * Math.cos(10 * t);  // underdamped spring
}
function currentValue(n: UiNode, key: string): number {
  if (key === 'width') return n.w >= 0 ? n.w : n.lw;
  if (key === 'height') return n.h >= 0 ? n.h : n.lh;
  if (key === 'opacity') return n.opacity;
  if (key === 'translateX' || key === 'x') return n.tx;
  if (key === 'translateY' || key === 'y') return n.ty;
  if (key === 'scale') return n.k;
  return 0;
}
/** Tweens a numeric property of node `h` (width, height, opacity, translateX, translateY...). */
export function animate(h: i32, key: string, to: number, dur: number, easing: string, delay: number): Promise<void> {
  for (const a of anims) if (a.node === h && a.key === key) a.node = -1;
  const a = new Anim(h, key, currentValue(node(h), key), to, clock + delay, dur, easeOf(easing));
  anims.push(a);
  return new Promise<void>(resolve => { a.done = resolve; });
}
function stepAnims(): void {
  let i: i32 = 0;
  while (i < anims.length) {
    const a = anims[i];
    if (a.node < 0) { anims.splice(i, 1); continue; }
    if (clock < a.start) { i++; continue; }
    const t = a.dur <= 0 ? 1 : Math.min(1, (clock - a.start) / a.dur);
    setNumber(a.node, a.key, a.from + (a.to - a.from) * ease(a.easing, t));
    if (t >= 1) {
      anims.splice(i, 1);
      const d = a.done;
      if (d !== null) d();
      continue;
    }
    i++;
  }
}
export function now(): number { return clock; }

// ---------------------------------------------------------------- painting
function mix(a: i32, b: i32, t: number): i32 {
  if (a < 0) return b;
  if (b < 0) return a;
  const k = Math.max(0, Math.min(1, t));
  const r: i32 = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const g: i32 = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bl: i32 = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
}
let animating = false;
function targetBg(h: i32, n: UiNode): i32 {
  if (pressed === h && n.activeBg >= 0) return n.activeBg;
  if (focus === h && n.focusBg >= 0) return n.focusBg;
  if (n.hovered && n.hoverBg >= 0) return n.hoverBg;
  return n.bg;
}
/** transition-colors: the background eases toward its state color. */
function effectiveBg(h: i32, n: UiNode): i32 {
  const target = targetBg(h, n);
  if (n.transMs <= 0 || n.curBg === -1) { n.curBg = target; n.fromBg = target; return target; }
  if (target !== n.curBg) { n.fromBg = mix(n.fromBg, n.curBg, 1); n.curBg = target; n.transStart = clock; }
  const t = (clock - n.transStart) / n.transMs;
  if (t >= 1 || n.fromBg === target) { n.fromBg = target; return target; }
  animating = true;
  return mix(n.fromBg, target, t);
}
const SHADOW_Y: number[] = [0, 1, 1, 4, 10, 20], SHADOW_BLUR: number[] = [0, 2, 3, 6, 15, 25];
const SHADOW_A: i32[] = [0, 20, 30, 40, 45, 50];
/** Font of a text node drawn at scale k (zoomed views): the nearest baked size. */
function fontAtScale(n: UiNode, k: number): i32 {
  if (k === 1) return n.fontId;
  const px: i32 = Math.max(1, Math.round(n.size * k));
  let f = n.bold ? font(n.family === 'sans' ? 'sans-bold' : n.family + '-Bold', px) : -1;
  if (f < 0) f = font(n.family, px);
  return f < 0 ? n.fontId : f;
}
// Coordinates: a layout point p of a node's children is drawn at p * k + o; a node's own box at (n.x + n.tx) * k + o,
// sized n.lw * k * n.k (style scale zooms the node and its subtree around its top-left corner).
function paint(h: i32, ox: number, oy: number, k: number, alpha: number): void {
  const n = node(h);
  if (n.hidden) return;
  const a = alpha * n.opacity;
  if (a <= 0.004) return;
  const x = (n.x + n.tx) * k + ox, y = (n.y + n.ty) * k + oy, kk = k * n.k;
  const w = n.lw * kk, hh = n.lh * kk;
  const ai: i32 = Math.round(a * 255);
  if (n.tag !== FRAGMENT) {
    const r = Math.min(n.radius * kk, Math.min(w, hh) / 2);
    if (n.shadowLevel > 0) shadow(x, y + SHADOW_Y[n.shadowLevel] * kk, w, hh, r, SHADOW_BLUR[n.shadowLevel] * kk, 0x000000, Math.round(SHADOW_A[n.shadowLevel] * a));
    if (n.grad > 0 && n.gradFrom >= 0 && n.gradTo >= 0) {
      const flip = n.grad === 3 || n.grad === 4;
      gradient(x, y, w, hh, r, flip ? n.gradTo : n.gradFrom, flip ? n.gradFrom : n.gradTo, n.grad === 1 || n.grad === 3, ai);
    } else {
      const bg = effectiveBg(h, n);
      if (bg >= 0) rrect(x, y, w, hh, r, bg, Math.round(n.bgAlpha * a));
    }
    const focused = h === focus;
    const bc = focused && n.focusBorder >= 0 ? n.focusBorder : focused && n.ed !== null ? 0x3b82f6 : n.hovered && n.hoverBorder >= 0 ? n.hoverBorder : n.borderColor;
    const bw = n.borderW < 0 ? 1 : n.borderW;
    if (n.bT >= 0 || n.bR >= 0 || n.bB >= 0 || n.bL >= 0) {
      // ponytail: per-side borders are straight bands (no rounded corners), enough for dividers and underlines
      const t = (n.bT >= 0 ? n.bT : bw) * kk, rr = (n.bR >= 0 ? n.bR : bw) * kk, b = (n.bB >= 0 ? n.bB : bw) * kk, l = (n.bL >= 0 ? n.bL : bw) * kk;
      if (t > 0) rrect(x, y, w, t, 0, bc, ai);
      if (b > 0) rrect(x, y + hh - b, w, b, 0, bc, ai);
      if (l > 0) rrect(x, y + t, l, hh - t - b, 0, bc, ai);
      if (rr > 0) rrect(x + w - rr, y + t, rr, hh - t - b, 0, bc, ai);
    } else if (bw > 0 || (focused && n.ed !== null)) border(x, y, w, hh, r, Math.max(bw, focused && n.ed !== null ? 2 : 0) * kk, bc, ai);
    if (focused && n.focusBg < 0 && n.focusBorder < 0 && n.ed === null && n.focusable) border(x - 2, y - 2, w + 4, hh + 4, r + 2, 2, 0xfacc15, ai);
    if (n.tag === IMAGE && n.img >= 0) drawImage(n.img, x, y, w, hh, ai, r);
    if (n.tag === TEXT && n.text.length > 0) {
      const lh = lineHeightOf(n);
      let fg = textFg(h);
      let p = n.parent;
      while (p >= 0 && nodes[p].activeFg < 0 && nodes[p].focusFg < 0 && nodes[p].hoverFg < 0 && nodes[p].tag !== VIEW && nodes[p].tag !== BUTTON) p = nodes[p].parent;
      if (p >= 0 && pressed === p && nodes[p].activeFg >= 0) fg = nodes[p].activeFg;
      else if (p >= 0 && focus === p && nodes[p].focusFg >= 0) fg = nodes[p].focusFg;
      else if (p >= 0 && nodes[p].hovered && nodes[p].hoverFg >= 0) fg = nodes[p].hoverFg;
      const top = Math.round((lh - n.size * 1.21) / 2);
      const f = fontAtScale(n, kk);
      for (let i = 0; i < n.lines.length; i++) {
        const free = n.lw - n.pl - n.pr - n.lineW[i];
        const off = n.talign === 1 ? Math.floor(free / 2) : n.talign === 2 ? free : 0;
        drawText(f, x + (n.pl + off) * kk, y + (n.pt + i * lh + top) * kk, n.lines[i], fg, ai, trackPx(n));
      }
    }
    if (n.ed !== null) paintEdit(h, n, n.ed as Edit, x, y, kk, ai);
    const d = n.onDraw;
    if (d !== null) d(Math.round(x), Math.round(y), Math.round(w), Math.round(hh));
    if (n.overflow) {
      // children stay inside the border and its rounded corners, like CSS overflow: hidden (the padding box)
      const bw = n.borderW < 0 ? 1 : n.borderW;
      const t = (n.bT >= 0 ? n.bT : bw) * kk, rr = (n.bR >= 0 ? n.bR : bw) * kk, b = (n.bB >= 0 ? n.bB : bw) * kk, l = (n.bL >= 0 ? n.bL : bw) * kk;
      clip(x + l, y + t, w - l - rr, hh - t - b, Math.max(0, r - Math.max(Math.max(t, b), Math.max(l, rr))));
    }
  }
  const cx = x - (n.x + n.sx) * kk, cy = y - (n.y + n.sy) * kk;
  for (const c of n.children) paint(c, cx, cy, kk, a);
  if (n.scroll !== 0) paintScrollbars(n, x, y, kk, a);
  if (n.overflow && n.tag !== FRAGMENT) unclip();
}
function paintScrollbars(n: UiNode, x: number, y: number, k: number, a: number): void {
  // thin overlay bars, shown while scrolling and fading out after ~1 s
  const age = clock - n.scrolledAt;
  if (age > 1200) return;
  const fade = age < 800 ? 1 : 1 - (age - 800) / 400;
  animating = true;
  const al: i32 = Math.round(110 * fade * a);
  const w = n.lw * k, h = n.lh * k;
  if ((n.scroll & 1) !== 0 && n.contentH > n.lh) {
    const len = Math.max(24, h * n.lh / n.contentH), pos = (h - len) * n.sy / (n.contentH - n.lh);
    rrect(x + w - 5, y + pos + 2, 3, len - 4, 1.5, 0x64748b, al);
  }
  if ((n.scroll & 2) !== 0 && n.contentW > n.lw) {
    const len = Math.max(24, w * n.lw / n.contentW), pos = (w - len) * n.sx / (n.contentW - n.lw);
    rrect(x + pos + 2, y + h - 5, len - 4, 3, 1.5, 0x64748b, al);
  }
}
function clampScroll(n: UiNode): void {
  if (n.live) return;   // rubber band in progress: stepScroll brings it back
  const maxY = Math.max(0, n.contentH - n.lh), maxX = Math.max(0, n.contentW - n.lw);
  if (n.sy > maxY) { n.sy = maxY; n.vy = 0; }
  if (n.sy < 0) { n.sy = 0; n.vy = 0; }
  if (n.sx > maxX) { n.sx = maxX; n.vx = 0; }
  if (n.sx < 0) { n.sx = 0; n.vx = 0; }
}

// ---------------------------------------------------------------- text fields (<input>, <textarea>)
// colors as i32 constants: a ternary of two literals is a `number`, which overflows in fixed-point profiles
const SEL_FOCUSED: i32 = 0x3b82f6, SEL_BLURRED: i32 = 0x64748b, HL_KEYWORD: i32 = 0xc084fc, HL_TYPE: i32 = 0x67e8f9;
function shown(e: Edit): string { return e.password ? '•'.repeat(e.value.length) : e.value; }
function isWordChar(c: i32): boolean { return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128; }
function codeMode(n: UiNode, e: Edit): boolean { return e.multi && (e.lineNumbers || n.family === 'mono'); }
/** Visual rows of the field for its current width: logical lines, word-wrapped unless `wrap` is off. */
function ensureRows(n: UiNode, e: Edit): void {
  if (e.rowsFor === e.value && e.rowsW === n.lw) return;
  e.rowsFor = e.value; e.rowsW = n.lw;
  const s = shown(e), f = n.fontId;
  let lines: i32 = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) lines++;
  e.gutter = e.lineNumbers ? textWidth(f, '0'.repeat(imax(2, `${lines}`.length)), 0) + 16 : 0;
  const w = n.lw - n.pl - n.pr - e.gutter;
  e.rs = []; e.re = [];
  let start: i32 = 0;
  while (true) {
    const nl = e.multi ? s.indexOf('\n', start) : -1;
    const end: i32 = nl < 0 ? s.length : nl;
    if (!e.multi || !e.wrap || w <= n.size || start === end) { e.rs.push(start); e.re.push(end); }
    else {
      // greedy wrap, breaking after the last space that fits (or anywhere in a long word)
      let a: i32 = start;
      while (a < end) {
        let x: number = 0, i: i32 = a, space: i32 = -1;
        while (i < end) {
          const cw = textWidth(f, s.slice(i, i + 1), 0);
          if (x + cw > w && i > a) break;
          x += cw;
          if (s.charCodeAt(i) === 32) space = i;
          i++;
        }
        if (i < end && space >= a) i = space + 1;
        e.rs.push(a); e.re.push(i);
        a = i;
      }
    }
    if (nl < 0) break;
    start = nl + 1;
  }
}
/** Row of an offset; the end of a wrapped row belongs to the next row. */
function rowOf(e: Edit, off: i32): i32 {
  for (let r = 0; r < e.rs.length; r++) if (off < e.re[r] || (off === e.re[r] && (r + 1 >= e.rs.length || e.rs[r + 1] !== off))) return r;
  return e.rs.length - 1;
}
function xIn(n: UiNode, e: Edit, row: i32, off: i32): number { return textWidth(n.fontId, shown(e).slice(e.rs[row], off), 0); }
function rowEnd(e: Edit, r: i32): i32 { return r + 1 < e.rs.length && e.rs[r + 1] === e.re[r] && e.re[r] > e.rs[r] ? e.re[r] - 1 : e.re[r]; }
function offAtX(n: UiNode, e: Edit, r: i32, x: number): i32 {
  const s = shown(e);
  let w: number = 0;
  for (let i = e.rs[r]; i < e.re[r]; i++) {
    const cw = textWidth(n.fontId, s.slice(i, i + 1), 0);
    if (x < w + cw / 2) return i;
    w += cw;
  }
  return rowEnd(e, r);
}
function editTop(n: UiNode, e: Edit): number { return e.multi ? n.pt : n.pt + Math.floor((n.lh - n.pt - n.pb - lineHeightOf(n)) / 2); }
/** Offset under a node-local point. */
function offAt(n: UiNode, e: Edit, lx: number, ly: number): i32 {
  ensureRows(n, e);
  const lh = lineHeightOf(n);
  const r: i32 = e.multi ? clampI(Math.floor((ly - editTop(n, e) + e.sy) / lh), 0, e.rs.length - 1) : 0;
  return offAtX(n, e, r, lx - n.pl - e.gutter + e.sx);
}
/** Scrolls the text so the caret is visible. */
function revealCaret(n: UiNode, e: Edit): void {
  const lh = lineHeightOf(n), cw = n.lw - n.pl - n.pr - e.gutter, ch = n.lh - n.pt - n.pb;
  const r = rowOf(e, e.caret), cx = xIn(n, e, r, e.caret);
  if (cx - e.sx > cw - 2) e.sx = cx - cw + 2;
  if (cx < e.sx) e.sx = Math.max(0, cx - cw / 3);
  if (e.multi) {
    if (r * lh < e.sy) e.sy = r * lh;
    if ((r + 1) * lh > e.sy + ch) e.sy = (r + 1) * lh - ch;
    e.sy = Math.max(0, Math.min(e.sy, e.rs.length * lh - ch));
  }
}
function paintEdit(h: i32, n: UiNode, e: Edit, x: number, y: number, k: number, ai: i32): void {
  ensureRows(n, e);
  if (e.reveal) { revealCaret(n, e); e.reveal = false; }
  const lh = lineHeightOf(n), f = fontAtScale(n, k), g = e.gutter, s = shown(e);
  const cl = n.pl + g, cw = n.lw - n.pl - n.pr - g, ch = n.lh - n.pt - n.pb, top = editTop(n, e);
  const base = Math.round((lh - n.size * 1.21) / 2);
  const focused = focus === h;
  const first: i32 = e.multi ? imax(0, Math.floor(e.sy / lh)) : 0;
  const last: i32 = e.multi ? imin(e.rs.length - 1, Math.floor((e.sy + ch) / lh)) : 0;
  if (g > 0) {
    // line numbers: the first row of each logical line
    clip(x + n.pl * k, y + n.pt * k, g * k, ch * k);
    let line: i32 = 1;
    for (let r = 1; r <= first; r++) if (e.rs[r] !== e.re[r - 1]) line++;
    for (let r = first; r <= last; r++) {
      if (r > first && e.rs[r] !== e.re[r - 1]) line++;
      if (r > 0 && e.rs[r] === e.re[r - 1]) continue;
      const num = `${line}`;
      drawText(f, x + (cl - 10 - textWidth(n.fontId, num, 0)) * k, y + (top + r * lh - e.sy + base) * k, num, 0x64748b, ai, 0);
    }
    unclip();
    rrect(x + (cl - 5) * k, y + n.pt * k, k, ch * k, 0, 0x334155, ai);
  }
  clip(x + cl * k, y + n.pt * k, cw * k, ch * k);
  const s0 = imin(e.caret, e.anchor), s1 = imax(e.caret, e.anchor);
  for (let r = first; r <= last; r++) {
    const a = e.rs[r], b = e.re[r];
    const rx = x + (cl - e.sx) * k, ry = y + (top + r * lh - e.sy) * k;
    if (s1 > s0 && s0 <= b && s1 >= a) {
      const x0 = xIn(n, e, r, imax(s0, a));
      let x1 = xIn(n, e, r, imin(s1, b));
      if (s1 > b && r + 1 < e.rs.length && e.rs[r + 1] > b) x1 += 6;  // the selected line break
      if (x1 > x0) rrect(rx + x0 * k, ry, (x1 - x0) * k, lh * k, 0, focused ? SEL_FOCUSED : SEL_BLURRED, focused ? 110 : 70);
    }
    const line = s.slice(a, b);
    if (line.length === 0) continue;
    const hl = e.highlight;
    if (hl === null || e.password) { drawText(f, rx, ry + base * k, line, n.fg, ai, 0); continue; }
    const runs = hl(line);
    let pos: i32 = 0, px: number = 0;
    for (let i = 0; i + 1 < runs.length && pos < line.length; i += 2) {
      const seg = line.slice(pos, pos + runs[i]);
      if (seg.length > 0) drawText(f, rx + px * k, ry + base * k, seg, runs[i + 1] < 0 ? n.fg : runs[i + 1], ai, 0);
      px += textWidth(n.fontId, seg, 0);
      pos += runs[i];
    }
    if (pos < line.length) drawText(f, rx + px * k, ry + base * k, line.slice(pos), n.fg, ai, 0);
  }
  if (e.value.length === 0 && e.placeholder.length > 0) drawText(f, x + cl * k, y + (top + base) * k, e.placeholder, 0x64748b, ai, 0);
  if (focused && !e.readOnly && (Math.floor((clock - e.blinkAt) / 530) % 2) === 0) {
    const r = rowOf(e, e.caret);
    rrect(x + (cl + xIn(n, e, r, e.caret) - e.sx) * k - 0.5, y + (top + r * lh - e.sy) * k, 1.5, lh * k, 0, n.fg, ai);
  }
  unclip();
}
function snapshot(e: Edit, typing: boolean): void {
  if (typing && e.typing) return;
  e.undo.push(e.value); e.undoAt.push(e.caret);
  if (e.undo.length > 100) { e.undo.shift(); e.undoAt.shift(); }
  e.redo = []; e.redoAt = [];
  e.typing = typing;
}
function edited(e: Edit): void {
  e.reveal = true; e.blinkAt = clock; e.goalX = -1; e.dirty = true; paintDirty = true;
  const f = e.onInput;
  if (f !== null) f(e.value);
}
/** Replaces [a, b) with s (one undo step, or part of the current typing step). */
function replaceRange(e: Edit, a: i32, b: i32, s: string, typing: boolean): void {
  if (e.readOnly || (a === b && s.length === 0)) return;
  snapshot(e, typing);
  e.value = e.value.slice(0, a) + s + e.value.slice(b);
  e.caret = a + s.length; e.anchor = e.caret;
  edited(e);
}
function replaceSel(e: Edit, s: string, typing: boolean): void {
  if (!e.multi) s = s.replaceAll('\r', '').replaceAll('\n', ' ');
  replaceRange(e, imin(e.caret, e.anchor), imax(e.caret, e.anchor), s, typing);
}
function undoEdit(e: Edit, redo: boolean): void {
  const from = redo ? e.redo : e.undo, fromAt = redo ? e.redoAt : e.undoAt;
  if (from.length === 0 || e.readOnly) return;
  const to = redo ? e.undo : e.redo, toAt = redo ? e.undoAt : e.redoAt;
  to.push(e.value); toAt.push(e.caret);
  e.value = from.pop(); e.caret = fromAt.pop(); e.anchor = e.caret; e.typing = false;
  edited(e);
}
function commit(e: Edit): void {
  if (!e.dirty) return;
  e.dirty = false;
  const f = e.onChange;
  if (f !== null) f(e.value);
}
function moveTo(e: Edit, off: i32, extend: boolean): void {
  e.caret = clampI(off, 0, e.value.length);
  if (!extend) e.anchor = e.caret;
  e.reveal = true; e.blinkAt = clock; e.typing = false; paintDirty = true;
}
function wordLeft(v: string, i: i32): i32 {
  while (i > 0 && !isWordChar(v.charCodeAt(i - 1))) i--;
  while (i > 0 && isWordChar(v.charCodeAt(i - 1))) i--;
  return i;
}
function wordRight(v: string, i: i32): i32 {
  while (i < v.length && !isWordChar(v.charCodeAt(i))) i++;
  while (i < v.length && isWordChar(v.charCodeAt(i))) i++;
  return i;
}
function charLeft(v: string, i: i32): i32 { const c = v.charCodeAt(i - 1); return i >= 2 && c >= 0xdc00 && c < 0xe000 ? i - 2 : imax(0, i - 1); }
function charRight(v: string, i: i32): i32 { const c = v.charCodeAt(i); return i + 1 < v.length && c >= 0xd800 && c < 0xdc00 ? i + 2 : imin(v.length, i + 1); }
function lineStart(v: string, i: i32): i32 { while (i > 0 && v.charCodeAt(i - 1) !== 10) i--; return i; }
/** Default editing keys of a focused field; false: not an editing key (goes on to the global handlers). */
function editKey(h: i32, n: UiNode, e: Edit, ev: KeyEvent): boolean {
  ensureRows(n, e);
  const key = ev.key, sh = ev.shift, v = e.value;
  const byWord = ev.alt || (ev.ctrl && !ev.meta), byLine = ev.meta;
  const s0 = imin(e.caret, e.anchor), s1 = imax(e.caret, e.anchor);
  if (ev.primary && !ev.alt && key.length === 1) {
    if (key === 'a') { e.anchor = 0; moveTo(e, v.length, true); return true; }
    if (key === 'c' || key === 'x') {
      if (s1 > s0 && !e.password) { setClipboardText(v.slice(s0, s1)); if (key === 'x') replaceSel(e, '', false); }
      return true;
    }
    if (key === 'v') { const t = clipboardText(); if (t.length > 0) replaceSel(e, t, false); return true; }
    if (key === 'z') { undoEdit(e, sh); return true; }
    if (key === 'y') { undoEdit(e, true); return true; }
    return false;
  }
  const lh = lineHeightOf(n);
  const page: i32 = imax(1, Math.floor((n.lh - n.pt - n.pb) / lh) - 1);
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const left = key === 'ArrowLeft';
    if (s1 > s0 && !sh && !byWord && !byLine) { moveTo(e, left ? s0 : s1, false); return true; }
    const r = rowOf(e, e.caret);
    const to = byLine ? (left ? e.rs[r] : rowEnd(e, r)) : byWord ? (left ? wordLeft(v, e.caret) : wordRight(v, e.caret)) : left ? charLeft(v, e.caret) : charRight(v, e.caret);
    moveTo(e, to, sh);
    return true;
  }
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'PageUp' || key === 'PageDown') {
    const up = key === 'ArrowUp' || key === 'PageUp';
    const r = rowOf(e, e.caret);
    const step: i32 = key === 'PageUp' || key === 'PageDown' ? page : 1;
    const gx = e.goalX >= 0 ? e.goalX : xIn(n, e, r, e.caret);
    if (byLine || !e.multi) { moveTo(e, up ? 0 : v.length, sh); return true; }
    const t: i32 = up ? r - step : r + step;
    moveTo(e, t < 0 ? 0 : t >= e.rs.length ? v.length : offAtX(n, e, t, gx), sh);
    e.goalX = gx;
    return true;
  }
  if (key === 'Home' || key === 'End') {
    const r = rowOf(e, e.caret);
    moveTo(e, ev.primary ? (key === 'Home' ? 0 : v.length) : key === 'Home' ? e.rs[r] : rowEnd(e, r), sh);
    return true;
  }
  if (key === 'Backspace' || key === 'Delete') {
    if (s1 > s0) { replaceSel(e, '', false); return true; }
    const back = key === 'Backspace';
    const to = byLine ? (back ? lineStart(v, e.caret) : e.caret) : byWord ? (back ? wordLeft(v, e.caret) : wordRight(v, e.caret)) : back ? charLeft(v, e.caret) : charRight(v, e.caret);
    replaceRange(e, imin(to, e.caret), imax(to, e.caret), '', false);
    return true;
  }
  if (key === 'Enter') {
    if (!e.multi) { commit(e); return true; }
    // code editors keep the indentation of the current line
    let ind: i32 = 0;
    if (codeMode(n, e)) { const ls = lineStart(v, s0); while (ls + ind < s0 && v.charCodeAt(ls + ind) === 32) ind++; }
    replaceSel(e, '\n' + ' '.repeat(ind), false);
    return true;
  }
  if (key === 'Tab') {
    if (codeMode(n, e) && !sh) { replaceSel(e, '  ', false); return true; }
    focusStep(sh);
    return true;
  }
  if (key === 'Escape') { setFocusTo(-1); return true; }
  // printable keys arrive as text input: not shortcuts while typing
  return key.length === 1 && !ev.primary;
}
function editPress(h: i32, n: UiNode, e: Edit, lx: number, ly: number, clicks: i32, extend: boolean): void {
  const off = offAt(n, e, lx, ly), v = e.value;
  if (clicks === 2) {
    // double click: the word (or the character) under the pointer
    let a: i32 = off, b: i32 = off;
    if (a < v.length && isWordChar(v.charCodeAt(a))) { while (a > 0 && isWordChar(v.charCodeAt(a - 1))) a--; while (b < v.length && isWordChar(v.charCodeAt(b))) b++; }
    else b = charRight(v, a);
    e.anchor = a; moveTo(e, b, true);
  } else if (clicks >= 3) {
    let b: i32 = off;
    while (b < v.length && v.charCodeAt(b) !== 10) b++;
    e.anchor = e.multi ? lineStart(v, off) : 0; moveTo(e, e.multi ? b : v.length, true);
  } else moveTo(e, off, extend);
  e.goalX = -1;
}
/** Wheel over a scrollable field; false when it cannot scroll (the wheel goes to the enclosing scroller). */
function editWheel(n: UiNode, e: Edit, wy: number, wx: number): boolean {
  ensureRows(n, e);
  const lh = lineHeightOf(n), maxY = Math.max(0, e.rs.length * lh - (n.lh - n.pt - n.pb));
  let maxX: number = 0;
  if (wx !== 0 || !e.multi) for (let r = 0; r < e.rs.length; r++) maxX = Math.max(maxX, xIn(n, e, r, e.re[r]) - (n.lw - n.pl - n.pr - e.gutter) + 2);
  const oy = e.sy, ox = e.sx;
  if (e.multi) e.sy = Math.max(0, Math.min(maxY, e.sy - wy * 40));
  e.sx = Math.max(0, Math.min(maxX, e.sx + (e.multi ? wx : wx - wy) * 40));
  if (e.sy !== oy || e.sx !== ox) { paintDirty = true; return true; }
  return false;
}

const TS_KEYWORDS: string[] = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'of', 'in', 'new', 'class',
  'extends', 'implements', 'import', 'export', 'from', 'type', 'interface', 'enum', 'true', 'false', 'null', 'undefined', 'this', 'super',
  'async', 'await', 'yield', 'break', 'continue', 'switch', 'case', 'default', 'throw', 'try', 'catch', 'finally', 'as', 'void',
  'static', 'readonly', 'private', 'public', 'protected', 'abstract', 'get', 'set', 'typeof', 'instanceof', 'using'];
/** Small TypeScript / Zinc highlighter for code editors (highlight={ui.tsHighlight}): keywords, types, strings,
 *  numbers, line comments. ponytail: per line, so block comments and multi-line strings are not tracked. */
export function tsHighlight(line: string): i32[] {
  const out: i32[] = [];
  const n = line.length;
  let i: i32 = 0;
  while (i < n) {
    const c = line.charCodeAt(i);
    let j: i32 = i + 1, color: i32 = -1;
    if (c === 47 && j < n && line.charCodeAt(j) === 47) { j = n; color = 0x64748b; }
    else if (c === 34 || c === 39 || c === 96) {
      while (j < n && line.charCodeAt(j) !== c) j += line.charCodeAt(j) === 92 ? 2 : 1;
      j = imin(j + 1, n); color = 0x86efac;
    } else if (c >= 48 && c <= 57) { while (j < n && (isWordChar(line.charCodeAt(j)) || line.charCodeAt(j) === 46)) j++; color = 0xfdba74; }
    else if (isWordChar(c)) {
      while (j < n && isWordChar(line.charCodeAt(j))) j++;
      color = TS_KEYWORDS.indexOf(line.slice(i, j)) >= 0 ? HL_KEYWORD : c >= 65 && c <= 90 ? HL_TYPE : -1;
    }
    if (out.length >= 2 && out[out.length - 1] === color) out[out.length - 2] += j - i;
    else { out.push(j - i); out.push(color); }
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------- scrolling input
let dragScroller: i32 = -1, dragging = false, dragX: number = 0, dragY: number = 0, lastX: number = 0, lastY: number = 0;
let focusShown: i32 = -1;
const scrollers: i32[] = [];   // containers whose offset is animating (wheel easing, inertia, rubber band)
/** Innermost scroll container under (px, py) that scrolls along `axes` (1 vertical, 2 horizontal). */
function scrollerAt(h: i32, px: number, py: number, ox: number, oy: number, k: number, axes: i32): i32 {
  const n = node(h);
  if (n.hidden) return -1;
  const x0 = (n.x + n.tx) * k + ox, y0 = (n.y + n.ty) * k + oy, kk = k * n.k;
  const inside = px >= x0 && py >= y0 && px < x0 + n.lw * kk && py < y0 + n.lh * kk;
  if (n.overflow && n.tag !== FRAGMENT && !inside) return -1;
  const cx = x0 - (n.x + n.sx) * kk, cy = y0 - (n.y + n.sy) * kk;
  for (let i = n.children.length - 1; i >= 0; i--) { const r = scrollerAt(n.children[i], px, py, cx, cy, kk, axes); if (r >= 0) return r; }
  const canY = (n.scroll & 1) !== 0 && n.contentH > n.lh, canX = (n.scroll & 2) !== 0 && n.contentW > n.lw;
  if (inside && (((axes & 1) !== 0 && canY) || ((axes & 2) !== 0 && canX))) return h;
  return -1;
}
// ---- scroll physics, macOS-like: trackpads scroll 1:1 (the OS supplies the momentum), mouse wheels ease to their
// target, drags keep their velocity (inertia), and past an edge the content stretches with resistance and springs
// back once the input stops.
function maxScrollY(n: UiNode): number { return Math.max(0, n.contentH - n.lh); }
function maxScrollX(n: UiNode): number { return Math.max(0, n.contentW - n.lw); }
/** Offset after a user delta: past an edge each pixel of input moves the content less (rubber band). */
function rubber(pos: number, d: number, max: number, dim: number): number {
  const over = pos < 0 ? -pos : pos > max ? pos - max : 0;
  if (over > 0 && ((pos < 0 && d < 0) || (pos > max && d > 0))) d *= 0.55 * Math.max(0.02, 1 - over / (dim * 0.4));
  return pos + d;
}
function wakeScroll(h: i32): void {
  const n = node(h);
  n.live = true;
  if (scrollers.indexOf(h) < 0) scrollers.push(h);
}
/** A user scroll by (dx, dy) pixels, applied at once. */
function scrollBy(h: i32, dx: number, dy: number): void {
  const n = node(h);
  if ((n.scroll & 1) !== 0 && dy !== 0) n.sy = rubber(n.sy, dy, maxScrollY(n), n.lh);
  if ((n.scroll & 2) !== 0 && dx !== 0) n.sx = rubber(n.sx, dx, maxScrollX(n), n.lw);
  n.smooth = false;
  n.inputAt = clock; n.scrolledAt = clock; paintDirty = true;
  wakeScroll(h);
}
function stepScroll(dt: number): void {
  for (let i = scrollers.length - 1; i >= 0; i--) {
    const h = scrollers[i], n = node(h);
    if (!n.alive) { scrollers.splice(i, 1); continue; }
    const my = maxScrollY(n), mx = maxScrollX(n);
    const held = dragging && dragScroller === h;
    let moving = held;
    if (n.smooth) {
      const k = 1 - Math.exp(-dt * 18);
      n.sy += (n.tgy - n.sy) * k; n.sx += (n.tgx - n.sx) * k;
      if (Math.abs(n.tgy - n.sy) < 0.5 && Math.abs(n.tgx - n.sx) < 0.5) { n.sy = n.tgy; n.sx = n.tgx; n.smooth = false; } else moving = true;
    }
    if (!held && (n.vx !== 0 || n.vy !== 0)) {
      n.sy += n.vy * dt; n.sx += n.vx * dt;
      // friction, much stronger once past an edge (the stretch absorbs the momentum)
      const outY = n.sy < 0 || n.sy > my, outX = n.sx < 0 || n.sx > mx;
      n.vy *= Math.pow(outY ? 0.00002 : 0.12, dt); n.vx *= Math.pow(outX ? 0.00002 : 0.12, dt);
      if (Math.abs(n.vy) < 12) n.vy = 0;
      if (Math.abs(n.vx) < 12) n.vx = 0;
      if (n.vx !== 0 || n.vy !== 0) moving = true;
    }
    // spring back from an overscroll once the fingers / wheel have been quiet for a moment
    const outY = n.sy < 0 || n.sy > my, outX = n.sx < 0 || n.sx > mx;
    if ((outY || outX) && !held) {
      if (clock - n.inputAt > 90 && Math.abs(n.vy) < 400 && Math.abs(n.vx) < 400) {
        const k = 1 - Math.exp(-dt * 13);
        const ty = Math.max(0, Math.min(my, n.sy)), tx = Math.max(0, Math.min(mx, n.sx));
        n.sy += (ty - n.sy) * k; n.sx += (tx - n.sx) * k;
        if (Math.abs(ty - n.sy) < 0.4) n.sy = ty;
        if (Math.abs(tx - n.sx) < 0.4) n.sx = tx;
      }
      moving = true;
    }
    n.scrolledAt = clock;
    paintDirty = true;
    if (!moving) { n.live = false; n.vx = 0; n.vy = 0; clampScroll(n); scrollers.splice(i, 1); }
  }
}
/** Keyboard focus: scroll every enclosing container so the focused node is visible. */
function revealFocus(h: i32): void {
  const f = node(h);
  let p = f.parent;
  while (p >= 0) {
    const n = node(p);
    if (n.scroll !== 0) {
      if (f.y < n.y + n.sy) n.sy = f.y - n.y;
      else if (f.y + f.lh > n.y + n.sy + n.lh) n.sy = f.y + f.lh - n.y - n.lh;
      clampScroll(n); n.scrolledAt = clock; paintDirty = true;
    }
    p = n.parent;
  }
}
const virtList: i32[] = [];  // scroll containers with a virtual list
function virtuals(): i32[] {
  for (let i = virtList.length - 1; i >= 0; i--) if (!nodes[virtList[i]].alive || nodes[virtList[i]].virt === null) virtList.splice(i, 1);
  return virtList;
}

// ---------------------------------------------------------------- hit testing, pointer, hover, keyboard
const HIT_CLICK: i32 = 0, HIT_ANY: i32 = 1, HIT_NODE: i32 = 2, HIT_WHEEL: i32 = 3;
function wants(n: UiNode, mode: i32): boolean {
  if (mode === HIT_CLICK) return n.onClick !== null;
  if (mode === HIT_NODE) return true;
  const s = n.hs;
  if (mode === HIT_WHEEL) return (s !== null && (s as Handlers).wheel !== null) || (n.ed !== null && editScrolls(n, n.ed as Edit));
  return n.onClick !== null || n.ed !== null || s !== null;
}
function editScrolls(n: UiNode, e: Edit): boolean {
  ensureRows(n, e);
  return e.multi && e.rs.length * lineHeightOf(n) > n.lh - n.pt - n.pb;
}
/** Topmost node under (px, py) that `wants` the mode, through clips, scroll offsets and style transforms. */
function hitIn(h: i32, px: number, py: number, ox: number, oy: number, k: number, mode: i32): i32 {
  const n = node(h);
  if (n.hidden) return -1;
  const x = (n.x + n.tx) * k + ox, y = (n.y + n.ty) * k + oy, kk = k * n.k;
  const inside = px >= x && py >= y && px < x + n.lw * kk && py < y + n.lh * kk;
  if (n.overflow && n.tag !== FRAGMENT && !inside) return -1;
  const cx = x - (n.x + n.sx) * kk, cy = y - (n.y + n.sy) * kk;
  for (let i = n.children.length - 1; i >= 0; i--) {
    const r = hitIn(n.children[i], px, py, cx, cy, kk, mode);
    if (r >= 0) return r;
  }
  if (n.tag !== FRAGMENT && inside && wants(n, mode)) return h;
  return -1;
}
function hit(px: number, py: number, mode: i32): i32 { return root < 0 ? -1 : hitIn(root, px, py, 0, 0, 1, mode); }
let boxX: number = 0, boxY: number = 0, boxK: number = 1;
/** Surface position (boxX, boxY) and scale (boxK) of a node's box. */
function boxOf(h: i32): void {
  const chain: i32[] = [];
  for (let p = h; p >= 0; p = nodes[p].parent) chain.push(p);
  let ox: number = 0, oy: number = 0, k: number = 1;
  for (let i = chain.length - 1; i >= 1; i--) {
    const a = nodes[chain[i]];
    const x = (a.x + a.tx) * k + ox, y = (a.y + a.ty) * k + oy, kk = k * a.k;
    ox = x - (a.x + a.sx) * kk; oy = y - (a.y + a.sy) * kk; k = kk;
  }
  const n = nodes[h];
  boxX = (n.x + n.tx) * k + ox; boxY = (n.y + n.ty) * k + oy; boxK = k * n.k;
}
/** Converts a surface point to node-local coordinates (its own units). */
export function toLocal(h: i32, gx: number, gy: number): number[] { boxOf(h); return [(gx - boxX) / boxK, (gy - boxY) / boxK]; }
/** Node box on the surface [x, y, w, h], through scroll offsets and style transforms (popups, tests). */
export function screenBox(h: i32): number[] { if (layoutDirty) layout(); boxOf(h); const n = nodes[h]; return [boxX, boxY, n.lw * boxK, n.lh * boxK]; }
let capture: i32 = -1, captureBtn: i32 = 0;  // node getting moves and the release after its onPointerDown
let selecting: i32 = -1;                      // text field being drag-selected
let ptrX: number = -1, ptrY: number = -1;
let held: i32 = 0;                            // buttons held, DOM `buttons` bits: 1 left, 2 right, 4 middle
let curMods: i32 = 0;
let clicks: i32 = 0, lastBtn: i32 = -1, lastDownAt: number = -100000, lastDownX: number = 0, lastDownY: number = 0;
let hoverPath: i32[] = [];
let hoverDirty = true;
let cursorShown: i32 = -1;
let textOn: i32 = -1;       // field that has the text input (IME) on
let blinkShown: number = -1;
let synthetic = false;      // test hooks drive the input: the HAL's pointer and keys are ignored
let frameDt: number = 0;
function bitOf(button: i32): i32 { return button === 0 ? 1 : button === 2 ? 2 : 4; }
function handlerOf(n: UiNode, kind: i32): ((e: PointerEvent) => void) | null {
  const s = n.hs;
  if (s === null) return null;
  const t = s as Handlers;
  return kind === PDOWN ? t.down : kind === PMOVE ? t.move : kind === PUP ? t.up : kind === PDBL ? t.dbl : kind === PCONTEXT ? t.ctx : kind === PWHEEL ? t.wheel : kind === PENTER ? t.enter : t.leave;
}
/** Nearest node from h up with a handler of `kind` (stopping at a button or text field when `stop`). */
function bubble(h: i32, kind: i32, stop: boolean): i32 {
  for (let p = h; p >= 0; p = nodes[p].parent) {
    const n = nodes[p];
    if (handlerOf(n, kind) !== null) return p;
    if (stop && (n.onClick !== null || n.ed !== null)) return -1;
  }
  return -1;
}
function fire(h: i32, kind: i32, gx: number, gy: number, button: i32): PointerEvent {
  boxOf(h);
  const e = new PointerEvent();
  e.gx = gx; e.gy = gy; e.x = (gx - boxX) / boxK; e.y = (gy - boxY) / boxK;
  e.button = button; e.mods = curMods; e.clicks = clicks;
  const f = handlerOf(nodes[h], kind);
  if (f !== null) f(e);
  return e;
}
function setFocusTo(h: i32): void {
  if (focus === h) return;
  if (focus >= 0 && nodes[focus].alive) { const e = nodes[focus].ed; if (e !== null) commit(e as Edit); }
  focus = h;
  if (h >= 0) { const e = nodes[h].ed; if (e !== null) { e.blinkAt = clock; e.reveal = true; } }
  paintDirty = true;
}
/** Gives the keyboard focus to a node (-1: none). A text field starts the text input. */
export function focusNode(h: i32): void { setFocusTo(h); }
export function focused(): i32 { return focus; }
function focusStep(back: boolean): void {
  const list: i32[] = [];
  focusables(root, list);
  if (list.length === 0) return;
  const i = list.indexOf(focus);
  setFocusTo(i < 0 ? list[0] : list[(i + (back ? list.length - 1 : 1)) % list.length]);
  const e = nodes[focus].ed;
  if (e !== null && !e.multi) { e.anchor = 0; moveTo(e as Edit, e.value.length, true); }  // like browsers: Tab into a field selects it
}
function pointerMove(px: number, py: number): void {
  // drag to scroll: past a few pixels the press becomes a scroll gesture
  if ((held & 1) !== 0 && dragScroller >= 0) {
    if (!dragging && Math.abs(py - dragY) + Math.abs(px - dragX) > 6) { dragging = true; pressed = -1; }
    if (dragging) {
      const n = node(dragScroller);
      // velocity smoothed over the last frames, so a release after a pause does not throw the content
      if ((n.scroll & 1) !== 0) n.vy = n.vy * 0.4 + (frameDt > 0 ? -(py - lastY) / frameDt : 0) * 0.6;
      if ((n.scroll & 2) !== 0) n.vx = n.vx * 0.4 + (frameDt > 0 ? -(px - lastX) / frameDt : 0) * 0.6;
      const vx = n.vx, vy = n.vy;
      scrollBy(dragScroller, -(px - lastX), -(py - lastY));
      n.vx = vx; n.vy = vy;
    }
  }
  if (px === ptrX && py === ptrY) return;
  ptrX = px; ptrY = py;
  hoverDirty = true;
  if (selecting >= 0) {
    const n = nodes[selecting], e = n.ed as Edit, lh = lineHeightOf(n);
    boxOf(selecting);
    // past the edges the text scrolls one line per move
    const ly = Math.max(n.pt - lh / 2, Math.min(n.lh - n.pb + lh / 2, (py - boxY) / boxK));
    moveTo(e, offAt(n, e, (px - boxX) / boxK, ly), true);
  }
  if (capture >= 0) { fire(capture, PMOVE, px, py, -1); return; }
  const t = bubble(hit(px, py, HIT_ANY), PMOVE, false);
  if (t >= 0) fire(t, PMOVE, px, py, -1);
}
function pressAt(px: number, py: number, button: i32): void {
  held = held | bitOf(button);
  if (button === lastBtn && clock - lastDownAt < 400 && Math.abs(px - lastDownX) + Math.abs(py - lastDownY) < 6) clicks++; else clicks = 1;
  lastBtn = button; lastDownAt = clock; lastDownX = px; lastDownY = py;
  const t = hit(px, py, HIT_ANY);
  const d = bubble(t, PDOWN, true);
  if (d >= 0 && capture < 0) { capture = d; captureBtn = button; }
  if (d >= 0) fire(d, PDOWN, px, py, button);
  if (button === 2) { const c = bubble(t, PCONTEXT, false); if (c >= 0) fire(c, PCONTEXT, px, py, button); }
  if (clicks === 2 && button === 0) { const c = bubble(t, PDBL, true); if (c >= 0) fire(c, PDBL, px, py, button); }
  if (button !== 0) return;
  if (t >= 0 && nodes[t].ed !== null) {
    // text field: caret, word / line selection, drag to select
    setFocusTo(t);
    boxOf(t);
    editPress(t, nodes[t], nodes[t].ed as Edit, (px - boxX) / boxK, (py - boxY) / boxK, clicks, (curMods & SHIFT) !== 0);
    selecting = t;
  } else {
    const h = hit(px, py, HIT_CLICK);
    if (h >= 0) { setFocusTo(h); pressed = h; paintDirty = true; }
    else {
      // the nearest focusable node takes the focus; a click elsewhere blurs a text field
      let fz = t;
      while (fz >= 0 && !nodes[fz].focusable) fz = nodes[fz].parent;
      if (fz >= 0) setFocusTo(fz);
      else if (focus >= 0 && nodes[focus].ed !== null) setFocusTo(-1);
    }
  }
  dragScroller = selecting >= 0 || capture >= 0 ? -1 : scrollerAt(root, px, py, 0, 0, 1, 3);
  dragX = px; dragY = py; lastX = px; lastY = py; dragging = false;
  if (dragScroller >= 0) { const n = node(dragScroller); n.vx = 0; n.vy = 0; n.smooth = false; }   // a press stops the inertia
  hoverDirty = true;
}
function releaseAt(px: number, py: number, button: i32): void {
  held = held & ~bitOf(button);
  if (capture >= 0 && button === captureBtn) { const c = capture; capture = -1; fire(c, PUP, px, py, button); }
  else if (capture < 0) { const u = bubble(hit(px, py, HIT_ANY), PUP, false); if (u >= 0) fire(u, PUP, px, py, button); }
  hoverDirty = true;
  if (button !== 0) return;
  selecting = -1;
  if (pressed >= 0) {
    const h = pressed;
    pressed = -1;
    if (!dragging && hit(px, py, HIT_CLICK) === h) activate(h);
    paintDirty = true;
  }
  if (dragging && dragScroller >= 0) wakeScroll(dragScroller);   // inertia and bounce from the release velocity
  dragScroller = -1; dragging = false;
}
/** One pointer sample: position, and whether `button` is held (HAL button events, the held state, or test hooks). */
function pointerSample(px: number, py: number, button: i32, down: boolean): void {
  const was = (held & bitOf(button)) !== 0;
  pointerMove(px, py);
  if (down && !was) pressAt(px, py, button);
  else if (!down && was) releaseAt(px, py, button);
  lastX = px; lastY = py;
}
function isAncestor(a: i32, b: i32): boolean { for (let p = b; p >= 0; p = nodes[p].parent) if (p === a) return true; return false; }
function wheelInput(px: number, py: number, wy: number, wx: number, pz: number): void {
  // the innermost of: a node with onWheel, a scrollable text field, a scroll container
  const w = hit(px, py, HIT_WHEEL);
  const sc = root < 0 ? -1 : scrollerAt(root, px, py, 0, 0, 1, (wy !== 0 ? 1 : 0) | (wx !== 0 ? 2 : 0));
  if (w >= 0 && (sc < 0 || isAncestor(sc, w))) {
    if (handlerOf(nodes[w], PWHEEL) === null) { if (editWheel(nodes[w], nodes[w].ed as Edit, wy, wx)) return; }
    else {
      boxOf(w);
      const e = new PointerEvent();
      e.gx = px; e.gy = py; e.x = (px - boxX) / boxK; e.y = (py - boxY) / boxK; e.button = -1; e.mods = curMods;
      e.wheel = wy; e.wheelX = wx; e.pinch = pz;
      const f = handlerOf(nodes[w], PWHEEL);
      if (f !== null) f(e);
      return;
    }
  }
  if (sc < 0 || (wy === 0 && wx === 0)) return;
  const n = node(sc);
  n.vx = 0; n.vy = 0;
  if (wy !== Math.round(wy) || wx !== Math.round(wx)) {
    // trackpad (fractional deltas, 1/10 px from SDL on macOS): follow the fingers and the OS momentum 1:1
    scrollBy(sc, wx * 10, -wy * 10);
    return;
  }
  // mouse wheel notches: ease toward a target 60 px per notch (it accumulates while turning)
  const baseY = n.smooth ? n.tgy : n.sy, baseX = n.smooth ? n.tgx : n.sx;
  n.tgy = (n.scroll & 1) !== 0 ? Math.max(0, Math.min(maxScrollY(n), baseY - wy * 60)) : n.sy;
  n.tgx = (n.scroll & 2) !== 0 ? Math.max(0, Math.min(maxScrollX(n), baseX + wx * 60)) : n.sx;
  n.smooth = true; n.inputAt = clock; n.scrolledAt = clock; paintDirty = true;
  wakeScroll(sc);
}
function hasHoverStyle(n: UiNode): boolean { return n.hoverBg >= 0 || n.hoverFg >= 0 || n.hoverBorder >= 0; }
/** Hover path under the pointer: hover: classes, onPointerEnter / onPointerLeave, the cursor shape. */
function updateHover(): void {
  hoverDirty = false;
  const t = ptrX >= 0 ? hit(ptrX, ptrY, HIT_NODE) : -1;
  const path: i32[] = [];
  for (let p = t; p >= 0; p = nodes[p].parent) path.push(p);
  const old = hoverPath;
  hoverPath = path;
  for (const h of old) if (path.indexOf(h) < 0 && nodes[h].alive) {
    const n = nodes[h];
    n.hovered = false;
    if (hasHoverStyle(n)) paintDirty = true;
    if (handlerOf(n, PLEAVE) !== null) fire(h, PLEAVE, ptrX, ptrY, -1);
  }
  for (let i = path.length - 1; i >= 0; i--) if (old.indexOf(path[i]) < 0) {
    const n = nodes[path[i]];
    n.hovered = true;
    if (hasHoverStyle(n)) paintDirty = true;
    if (handlerOf(n, PENTER) !== null) fire(path[i], PENTER, ptrX, ptrY, -1);
  }
  let c: i32 = Cursor.Default;
  const src = capture >= 0 ? capture : selecting >= 0 ? selecting : t;
  for (let p = src; p >= 0; p = nodes[p].parent) {
    const n = nodes[p];
    if (n.cursor >= 0) { c = n.cursor; break; }
    if (n.ed !== null) { c = Cursor.Text; break; }
  }
  if (c === Cursor.Grab && (held & 1) !== 0 && capture >= 0) c = Cursor.Grabbing;
  if (c !== cursorShown) { cursorShown = c; setCursor(c); }
}
function typeInto(h: i32, s: string): void {
  if (h < 0) return;
  const e = nodes[h].ed;
  if (e !== null && !e.readOnly) replaceSel(e as Edit, s, true);
}
/** Key down: the focused node's (or nearest ancestor's) onKeyDown, text field editing, then the global handlers. */
function dispatchKey(key: string, mods: i32, repeat: boolean): KeyEvent {
  const ev = new KeyEvent(key, mods, repeat);
  for (let p = focus; p >= 0; p = nodes[p].parent) {
    const s = nodes[p].hs;
    if (s !== null && (s as Handlers).key !== null) { const f = (s as Handlers).key; if (f !== null) f(ev); break; }
  }
  if (!ev.handled && focus >= 0 && nodes[focus].ed !== null) ev.handled = editKey(focus, nodes[focus], nodes[focus].ed as Edit, ev);
  for (const f of keyHandlers) { if (ev.handled) break; f(ev); }
  // Escape nobody used: drop the focus, else the platform's default (leave fullscreen / quit)
  if (!ev.handled && key === 'Escape') { if (focus >= 0) setFocusTo(-1); else escapeDefault(); ev.handled = true; }
  if (!ev.handled) {
    const i = NAV_KEYS.indexOf(key);
    if (i >= 0) { navKeys = navKeys | (1 << NAV_BTN[i]); if (ev.shift) navBack = true; }
  }
  paintDirty = true;
  return ev;
}
// Unhandled navigation keys also drive the gamepad-style focus navigation: a quick tap can come and go between two
// polls of the held state, the key event is not lost.
const NAV_KEYS: string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Enter'];
const NAV_BTN: i32[] = [Btn.Up, Btn.Down, Btn.Left, Btn.Right, Btn.A, Btn.Select, Btn.Start];
let navKeys: i32 = 0, navBack = false;
function navPressed(b: i32): boolean { return wasPressed(b) || (navKeys & (1 << b)) !== 0; }
function inputFrame(): void {
  curMods = modifiers();
  const px = pointerX(), py = pointerY();
  const wy = wheel(), wx = wheelX(), pz = pinch();
  if (wy !== 0 || wx !== 0 || pz !== 1) wheelInput(px, py, wy, wx, pz);
  // button events in order (fast clicks are not lost), else the held state (HALs without button events)
  const nb = buttonEventCount();
  for (let i = 0; i < nb; i++) pointerSample(buttonEventX(i), buttonEventY(i), buttonEventButton(i), buttonEventDown(i));
  pointerSample(px, py, 0, nb > 0 ? (held & 1) !== 0 : pointerDown());
  const nk = keyCount();
  for (let i = 0; i < nk; i++) {
    const kind = keyKind(i);
    if (kind === KeyKind.Text) typeInto(focus, keyName(i));
    else if (kind === KeyKind.Down || kind === KeyKind.Repeat) dispatchKey(keyName(i), keyMods(i), kind === KeyKind.Repeat);
  }
}

// ---------------------------------------------------------------- frame loop
function focusables(h: i32, out: i32[]): void {
  const n = node(h);
  if (n.hidden) return;
  if (n.focusable && n.tag !== FRAGMENT) out.push(h);
  for (const c of n.children) focusables(c, out);
}
function activate(h: i32): void {
  const f = node(h).onClick;
  if (f !== null) f();
  paintDirty = true;
}
/** One UI frame: engine clock, animations, input, layout when needed, paint (or keep the previous frame). */
export function frame(dt: number, background: i32): void {
  if (root < 0) return;
  clock += dt * 1000;
  frameDt = dt;
  stepAnims();
  if (width() !== surfW || height() !== surfH) {  // window resized: responsive classes, then a new layout
    const crossed = surfW < 0 || BREAKPOINT_PX.some((b: i32) => (surfW >= b) !== (width() >= b));
    surfW = width(); surfH = height(); layoutDirty = true; paintDirty = true;
    if (crossed) for (let i = 0; i < nodes.length; i++) if (nodes[i].alive && nodes[i].responsive) { const c = nodes[i].cls; nodes[i].cls = '\u0000'; setClass(i, c); }
  }
  if (layoutDirty) layout();
  const typing = focus >= 0 && nodes[focus].ed !== null;  // gamepad-style navigation is off while typing
  if (!synthetic) inputFrame();
  stepScroll(dt);
  if (!typing && (navPressed(Btn.Down) || navPressed(Btn.Right) || navPressed(Btn.Up) || navPressed(Btn.Left) || navPressed(Btn.Select))) focusStep(navPressed(Btn.Up) || navPressed(Btn.Left) || navBack);
  if (focus >= 0 && focus !== focusShown) { focusShown = focus; revealFocus(focus); }
  if (!typing && (navPressed(Btn.A) || navPressed(Btn.Start)) && focus >= 0) { pressed = focus; activate(focus); }
  else if (pressed >= 0 && (held & 1) === 0) { pressed = -1; paintDirty = true; }
  navKeys = 0; navBack = false;
  // text input (IME, on-screen keyboard) follows the focused field; the caret blinks
  const ed = focus >= 0 ? nodes[focus].ed : null;
  const want: i32 = ed !== null && !(ed as Edit).readOnly ? focus : -1;
  if (want !== textOn) {
    if (want >= 0) { boxOf(want); startTextInput(boxX, boxY, nodes[want].lw * boxK, nodes[want].lh * boxK); } else stopTextInput();
    textOn = want;
  }
  if (ed !== null) { const ph = Math.floor((clock - (ed as Edit).blinkAt) / 530); if (ph !== blinkShown) { blinkShown = ph; paintDirty = true; } }
  for (const h of virtuals()) syncVirtual(h, node(h));
  if (layoutDirty) layout();
  if (hoverDirty || paintDirty) updateHover();
  if (!paintDirty && !animating && anims.length === 0 && canvases === 0 && scrollers.length === 0) { keep(); return; }
  animating = false;
  paintDirty = false;
  if (background >= 0) clear(background);
  paint(root, 0, 0, 1, 1);
  if (highlight >= 0 && nodes[highlight].alive) {
    const n = nodes[highlight];
    rrect(n.x, n.y, n.lw, n.lh, 0, 0x3b82f6, 90);
    border(n.x, n.y, n.lw, n.lh, 0, 1, 0x60a5fa, 255);
  }
}
// ---------------------------------------------------------------- inspector hooks (plugins/devtools)
let highlight: i32 = -1;
/** Root handle, or -1. */
export function inspectRoot(): i32 { return root; }
/** A live node, or null (freed or out of range). */
export function inspectNode(h: i32): UiNode | null { return h >= 0 && h < nodes.length && nodes[h].alive ? nodes[h] : null; }
/** Draws a highlight box over node h (-1: none). */
export function inspectHighlight(h: i32): void { if (highlight !== h) { highlight = h; paintDirty = true; } }
/** Mounts a root node and drives it from the frame loop (UI-13). `extra` runs each frame before drawing. */
export function mount(h: i32, background: i32, extra: ((dt: number) => void) | null): void {
  setRoot(h);
  escapeByApp(true);   // Escape reaches onKeyDown / onKey handlers first (dispatchKey)
  onFrame((dt: number) => {
    if (extra !== null) extra(dt);
    frame(dt, background);
  });
}
/** Deterministic dump of the laid-out tree (golden tests, TST-07). */
export function dump(): string {
  if (layoutDirty) layout();
  const lines: string[] = [];
  dumpNode(root, 0, lines);
  return lines.join('\n');
}
function dumpNode(h: i32, depth: i32, out: string[]): void {
  if (h < 0) return;
  const n = node(h);
  if (n.hidden) return;
  out.push(`${'  '.repeat(depth)}${TAG_NAMES[n.tag]} ${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.lw)}x${Math.round(n.lh)}${n.tag === TEXT ? ' "' + n.lines.join('|') + '"' : ''}${n.ed !== null ? ' "' + (n.ed as Edit).value.replaceAll('\n', '\\n') + '"' : ''}`);
  for (const c of n.children) dumpNode(c, depth + 1, out);
}
export function setRoot(h: i32): void {
  root = h;
  layoutDirty = true;
}
export function click(h: i32): void { activate(h); }
/** Parent handle (-1 for the root / detached nodes). */
export function parentOf(h: i32): i32 { return node(h).parent; }
/** Node that a pointer press at (x, y) would hit, through scroll offsets and clips (-1: none). */
export function hitAt(x: number, y: number): i32 { if (layoutDirty) layout(); return hit(x, y, HIT_CLICK); }
export function find(text: string): i32 {
  for (let i = 0; i < nodes.length; i++) if (nodes[i].alive && nodes[i].text === text) {
    let p = nodes[i].parent;
    while (p >= 0 && nodes[p].onClick === null) p = nodes[p].parent;
    return p >= 0 ? p : i;
  }
  return -1;
}
/** Advances the engine clock without the frame loop (tests). */
export function tick(ms: number): void { clock += ms; stepAnims(); }

// ---------------------------------------------------------------- input test hooks: from the first call on, the
// HAL's pointer and keyboard are ignored, so runs are identical on the sim and on native targets.
/** Pointer at (x, y) with `button` (0 left, 1 middle, 2 right) held or not: moves, presses, releases, drags. */
export function pointerAt(x: number, y: number, down: boolean, button: i32 = 0, mods: i32 = 0): void {
  synthetic = true;
  curMods = mods;
  if (layoutDirty) layout();
  pointerSample(x, y, button, down);
  updateHover();
}
/** Mouse wheel / trackpad at (x, y): dy steps (+ up), dx steps (+ right), pinch factor. */
export function wheelAt(x: number, y: number, dy: number, dx: number = 0, pinchBy: number = 1): void {
  synthetic = true;
  if (layoutDirty) layout();
  wheelInput(x, y, dy, dx, pinchBy);
}
/** Key down (key names like gfx keyName: 'a', 'Enter', 'ArrowLeft'...) with the focus on h (-1: keep the focus).
 *  Returns whether something handled it. */
export function keyDown(h: i32, key: string, mods: i32 = 0): boolean {
  synthetic = true;
  if (h >= 0) setFocusTo(h);
  if (layoutDirty) layout();
  return dispatchKey(key, mods, false).handled;
}
/** Text typed into the focused field (focus moves to h first when h >= 0). */
export function typeText(h: i32, s: string): void {
  synthetic = true;
  if (h >= 0) setFocusTo(h);
  if (layoutDirty) layout();
  typeInto(focus, s);
}
