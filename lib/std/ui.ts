// zinc:ui — host ABI (UI-02): node handles, flexbox layout (UI-08), Tailwind-like classes and CSS (UI-07),
// retained rendering on the shared rasterizer (UI-09), engine-driven animations and transitions (UI-17),
// pointer + focus input (UI-11). Written in Zinc: the same code is compiled to C++ and to the sim.
// Idle frames cost nothing: when no node, animation or canvas changed, the previous frame is kept (gfx.keep).
import {
  onFrame, clear, rrect, gradient, border, shadow, drawText, drawImage, font, textWidth, image, imageWidth, imageHeight,
  clip, unclip, width, height, pointerX, pointerY, pointerDown, wasPressed, keep, Btn,
} from 'zinc:gfx';
import { PALETTE, SHADES } from './palette';

export const VIEW: i32 = 0, TEXT: i32 = 1, BUTTON: i32 = 2, IMAGE: i32 = 3, SCROLL: i32 = 4, CANVAS: i32 = 5, FRAGMENT: i32 = 6;
const TAG_NAMES: string[] = ['view', 'text', 'button', 'image', 'scroll', 'canvas', 'fragment'];
const UNSET: i32 = -100000;

class UiNode {
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
  bg: i32 = -1; bgAlpha: i32 = 255;
  grad: i32 = 0; gradFrom: i32 = -1; gradTo: i32 = -1;   // 1 to-b, 2 to-r, 3 to-t, 4 to-l
  radius: number = 0;
  borderW: number = 0; borderColor: i32 = 0xe5e7eb;
  shadowLevel: i32 = 0;
  opacity: number = 1;
  tx: number = 0; ty: number = 0;
  fg: i32 = 0xffffff;
  size: i32 = 16; bold: boolean = false; tracking: number = 0; talign: i32 = 0; leading: i32 = 0;
  fontId: i32 = -1;
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
  constructor(tag: i32) { this.tag = tag; }
}

const nodes: UiNode[] = [];
const free: i32[] = [];
let layoutDirty = true;
let paintDirty = true;
let canvases: i32 = 0;
let root: i32 = -1;
let focus: i32 = -1;
let pressed: i32 = -1;
let wasDown = false;
let clock: number = 0;   // engine time in ms

function node(h: i32): UiNode { return nodes[h]; }
function defaults(n: UiNode): void {
  if (n.tag === BUTTON) { n.bg = 0x334155; n.pt = 4; n.pb = 4; n.pl = 8; n.pr = 8; n.align = 1; n.justify = 1; n.focusable = true; }
  if (n.tag === TEXT) n.fg = -1;
}

export function createNode(tag: i32): i32 {
  layoutDirty = true;
  const n = new UiNode(tag);
  defaults(n);
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
  if (focus === h) focus = -1;
  if (pressed === h) pressed = -1;
  for (const a of anims) if (a.node === h) a.node = -1;
  free.push(h);
}
export function listen(h: i32, f: () => void): void { const n = node(h); n.onClick = f; n.focusable = true; }
export function draw(h: i32, f: (x: i32, y: i32, w: i32, h: i32) => void): void { node(h).onDraw = f; }
export function setFocusable(h: i32, on: boolean): void { node(h).focusable = on; }
export function setImage(h: i32, name: string): void { node(h).img = image(name); layoutDirty = true; }

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
function initColors(): void {
  if (COLORS.size > 0) return;
  COLORS.set('white', 0xffffff); COLORS.set('black', 0x000000);
  for (const fam of PALETTE.split(';')) {
    const parts = fam.split(':');
    const hexes = parts[1].split(',');
    for (let i = 0; i < hexes.length; i++) COLORS.set(`${parts[0]}-${SHADES[i]}`, parseInt(hexes[i], 16));
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
function colorOf(s: string): i32 {
  initColors();
  const slash = s.indexOf('/');
  const base = slash > 0 ? s.slice(0, slash) : s;
  if (base.startsWith('[#')) return parseInt(base.slice(2, base.length - 1), 16);
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
function applyToken(n: UiNode, tok: string, variant: string): boolean {
  if (tok.startsWith('focus:')) return applyToken(n, tok.slice(6), 'focus');
  if (tok.startsWith('active:')) return applyToken(n, tok.slice(7), 'active');
  if (tok.startsWith('hover:')) return true;  // no hover on consoles and panels
  if (variant !== '') {
    const isBg = tok.startsWith('bg-');
    const c = isBg ? colorOf(tok.slice(3)) : tok.startsWith('text-') ? colorOf(tok.slice(5)) : -2;
    if (c === -2) return false;
    if (variant === 'focus') { if (isBg) n.focusBg = c; else n.focusFg = c; }
    else { if (isBg) n.activeBg = c; else n.activeFg = c; }
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
  if (tok === 'grow' || tok === 'flex-1') { n.grow = 1; return true; }
  if (tok === 'grow-0') { n.grow = 0; return true; }
  if (tok === 'w-full') { n.fullW = true; return true; }
  if (tok === 'h-full') { n.fullH = true; return true; }
  if (tok === 'inset-0') { n.abs = true; n.top = 0; n.left = 0; n.right = 0; n.bottom = 0; return true; }
  if (tok === 'font-bold' || tok === 'font-semibold') { n.bold = true; return true; }
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
  if (tok.startsWith('border-')) {
    const k = tok.slice(7);
    const c = colorOf(k);
    if (c !== -2) { n.borderColor = c; if (n.borderW === 0) n.borderW = 1; return true; }
    n.borderW = num(k) / 4;
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
  n.abs = false; n.top = UNSET; n.left = UNSET; n.right = UNSET; n.bottom = UNSET; n.hidden = false; n.overflow = false;
  n.bg = fresh.bg; n.bgAlpha = 255; n.grad = 0; n.gradFrom = -1; n.gradTo = -1; n.radius = 0; n.borderW = 0; n.shadowLevel = 0;
  n.opacity = 1; n.fg = fresh.fg; n.size = 16; n.bold = false; n.tracking = 0; n.talign = 0; n.leading = 0;
  n.focusBg = -1; n.activeBg = -1; n.focusFg = -1; n.activeFg = -1; n.transMs = 0;
}
export function setClass(h: i32, cls: string): void {
  const n = node(h);
  if (n.cls === cls) return;
  n.cls = cls;
  resetStyle(n);
  for (const c of cls.split(' ')) if (c.length > 0) applyToken(n, c, '');
  for (let i = 0; i < n.styleKeys.length; i++) applyNumber(n, n.styleKeys[i], n.styleVals[i]);
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
/** Text inherits color, size and weight from its parent view, like CSS. */
function inheritText(n: UiNode): void {
  if (n.parent < 0) { if (n.fg < 0) n.fg = 0xffffff; return; }
  let p = n.parent;
  while (p >= 0 && nodes[p].tag === FRAGMENT) p = nodes[p].parent;
  if (n.fg < 0) {
    let q = p;
    while (q >= 0 && (nodes[q].tag !== TEXT || nodes[q].fg < 0)) q = nodes[q].parent;
    n.fg = q >= 0 ? nodes[q].fg : 0xffffff;
  }
  if (p >= 0 && nodes[p].tag === TEXT && n.cls === '\u0000') { const t = nodes[p]; n.size = t.size; n.bold = t.bold; n.tracking = t.tracking; n.leading = t.leading; }
}
function fontOf(n: UiNode): i32 {
  n.fontId = font(n.bold ? 'sans-bold' : 'sans', n.size);
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
  } else if (n.tag === IMAGE && n.img >= 0 && ownW < 0 && ownH < 0) {
    n.lw = imageWidth(n.img);
    n.lh = imageHeight(n.img);
  } else {
    const kids: UiNode[] = [];
    flat(n, kids, false);
    const inner: number = (ownW >= 0 ? ownW : maxW) - n.pl - n.pr;
    const innerH: number = (ownH >= 0 ? ownH : maxH) - n.pt - n.pb;
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
  if (ownW >= 0) n.lw = ownW;
  if (ownH >= 0) n.lh = ownH;
}
function place(n: UiNode, x: number, y: number, w: number, h: number): void {
  n.x = x; n.y = y; n.lw = w; n.lh = h;
  if (n.tag === TEXT) return;
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
  const r = node(root);
  measure(r, width(), height());
  place(r, 0, 0, width(), height());
  layoutDirty = false;
  paintDirty = true;
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
function paint(h: i32, ox: number, oy: number, alpha: number): void {
  const n = node(h);
  if (n.hidden) return;
  const a = alpha * n.opacity;
  if (a <= 0.004) return;
  const x = n.x + ox + n.tx, y = n.y + oy + n.ty;
  const ai: i32 = Math.round(a * 255);
  if (n.tag !== FRAGMENT) {
    const r = Math.min(n.radius, Math.min(n.lw, n.lh) / 2);
    if (n.shadowLevel > 0) shadow(x, y + SHADOW_Y[n.shadowLevel], n.lw, n.lh, r, SHADOW_BLUR[n.shadowLevel], 0x000000, Math.round(SHADOW_A[n.shadowLevel] * a));
    if (n.grad > 0 && n.gradFrom >= 0 && n.gradTo >= 0) {
      const flip = n.grad === 3 || n.grad === 4;
      gradient(x, y, n.lw, n.lh, r, flip ? n.gradTo : n.gradFrom, flip ? n.gradFrom : n.gradTo, n.grad === 1 || n.grad === 3, ai);
    } else {
      const bg = effectiveBg(h, n);
      if (bg >= 0) rrect(x, y, n.lw, n.lh, r, bg, Math.round(n.bgAlpha * a));
    }
    if (n.borderW > 0) border(x, y, n.lw, n.lh, r, n.borderW, n.borderColor, ai);
    if (h === focus && n.focusBg < 0 && n.focusable) border(x - 2, y - 2, n.lw + 4, n.lh + 4, r + 2, 2, 0xfacc15, ai);
    if (n.tag === IMAGE && n.img >= 0) drawImage(n.img, x, y, n.lw, n.lh, ai, r);
    if (n.tag === TEXT && n.text.length > 0) {
      const lh = lineHeightOf(n);
      let fg = n.fg;
      let p = n.parent;
      while (p >= 0 && nodes[p].activeFg < 0 && nodes[p].focusFg < 0 && nodes[p].tag !== VIEW && nodes[p].tag !== BUTTON) p = nodes[p].parent;
      if (p >= 0 && pressed === p && nodes[p].activeFg >= 0) fg = nodes[p].activeFg;
      else if (p >= 0 && focus === p && nodes[p].focusFg >= 0) fg = nodes[p].focusFg;
      const top = Math.round((lh - n.size * 1.21) / 2);
      for (let i = 0; i < n.lines.length; i++) {
        const free = n.lw - n.pl - n.pr - n.lineW[i];
        const off = n.talign === 1 ? Math.floor(free / 2) : n.talign === 2 ? free : 0;
        drawText(n.fontId, x + n.pl + off, y + n.pt + i * lh + top, n.lines[i], fg, ai, trackPx(n));
      }
    }
    const d = n.onDraw;
    if (d !== null) d(Math.round(x), Math.round(y), Math.round(n.lw), Math.round(n.lh));
    if (n.overflow) clip(x, y, n.lw, n.lh);
  }
  const dx = ox + n.tx, dy = oy + n.ty;
  for (const c of n.children) paint(c, dx, dy, a);
  if (n.overflow && n.tag !== FRAGMENT) unclip();
}

// ---------------------------------------------------------------- input and frame loop
function hit(h: i32, px: number, py: number, ox: number, oy: number): i32 {
  const n = node(h);
  if (n.hidden) return -1;
  const dx = ox + n.tx, dy = oy + n.ty;
  for (let i = n.children.length - 1; i >= 0; i--) {
    const r = hit(n.children[i], px, py, dx, dy);
    if (r >= 0) return r;
  }
  const x = n.x + dx, y = n.y + dy;
  if (n.onClick !== null && n.tag !== FRAGMENT && px >= x && py >= y && px < x + n.lw && py < y + n.lh) return h;
  return -1;
}
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
  stepAnims();
  if (layoutDirty) layout();
  const down = pointerDown();
  if (down && !wasDown) {
    const h = hit(root, pointerX(), pointerY(), 0, 0);
    if (h >= 0) { focus = h; pressed = h; paintDirty = true; }
  } else if (!down && wasDown && pressed >= 0) {
    const h = pressed;
    pressed = -1;
    if (hit(root, pointerX(), pointerY(), 0, 0) === h) activate(h);
    paintDirty = true;
  }
  wasDown = down;
  if (wasPressed(Btn.Down) || wasPressed(Btn.Right) || wasPressed(Btn.Up) || wasPressed(Btn.Left) || wasPressed(Btn.Select)) {
    const list: i32[] = [];
    focusables(root, list);
    if (list.length > 0) {
      const back = wasPressed(Btn.Up) || wasPressed(Btn.Left);
      const i = list.indexOf(focus);
      focus = i < 0 ? list[0] : list[(i + (back ? list.length - 1 : 1)) % list.length];
      paintDirty = true;
    }
  }
  if ((wasPressed(Btn.A) || wasPressed(Btn.Start)) && focus >= 0) { pressed = focus; activate(focus); }
  else if (pressed >= 0 && !down) { pressed = -1; paintDirty = true; }
  if (layoutDirty) layout();
  if (!paintDirty && !animating && anims.length === 0 && canvases === 0) { keep(); return; }
  animating = false;
  paintDirty = false;
  if (background >= 0) clear(background);
  paint(root, 0, 0, 1);
}
/** Mounts a root node and drives it from the frame loop (UI-13). `extra` runs each frame before drawing. */
export function mount(h: i32, background: i32, extra: ((dt: number) => void) | null): void {
  setRoot(h);
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
  out.push(`${'  '.repeat(depth)}${TAG_NAMES[n.tag]} ${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.lw)}x${Math.round(n.lh)}${n.tag === TEXT ? ' "' + n.lines.join('|') + '"' : ''}`);
  for (const c of n.children) dumpNode(c, depth + 1, out);
}
export function setRoot(h: i32): void {
  root = h;
  const r = node(h);
  r.w = width();
  r.h = height();
  layoutDirty = true;
}
export function click(h: i32): void { activate(h); }
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
