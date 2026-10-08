// zinc:ui — host ABI (UI-02): node handles, flexbox layout (UI-08), Tailwind-like classes and CSS (UI-07),
// retained rendering on the shared rasterizer (UI-09), engine-driven animations and transitions (UI-17),
// pointer + focus input (UI-11). Written in Zinc: the same code is compiled to C++ and to the sim.
// Idle frames cost nothing: when no node, animation or canvas changed, the previous frame is kept (gfx.keep).
import {
  onFrame, clear, rrect, gradient, border, shadow, drawText, drawImage, font, fontAscent, textWidth, image, imageWidth, imageHeight, createImage, destroyImage, commandCount, commandsFree,
  clip, unclip, width, height, pointerX, pointerY, pointerDown, wasPressed, keep, Btn, wheel,
  wheelX, pinch, pointerButtons, modifiers, keyCount, keyKind, keyMods, keyName, buttonEventCount, buttonEventX, buttonEventY,
  buttonEventButton, buttonEventDown, startTextInput, stopTextInput, clipboardText, setClipboardText, setCursor, Cursor, KeyKind,
  escapeByApp, escapeDefault, stroke, polygon,
  scrollDX, scrollDY, scrollPhase, touchCount, touchX, touchY, touchId,
} from 'zinc:gfx';
import { profiling, profMark } from 'zinc:gfx';   // frame phases (docs/dev-mode.md, profiling)
import { platform, env } from 'zinc:sys';
import { PALETTE, SHADES } from './palette';
import { UI_LAYOUT, UI_PRESET } from 'zinc:platform';
import * as LY from 'zinc:__layout';

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
  // gestures (onDrag, onPinch): phase 0 start, 1 move, 2 end, 3 cancelled; dx / dy: translation since the press
  // (surface px); scale / rotation (radians) since the pinch started, x / y at the centroid
  phase: i32 = 0; dx: number = 0; dy: number = 0; scale: number = 1; rotation: number = 0;
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
  // gesture handlers and their arbitration (see "interaction" below)
  tap: ((e: PointerEvent) => void) | null = null;
  long: ((e: PointerEvent) => void) | null = null;
  drag: ((e: PointerEvent) => void) | null = null;
  pinch: ((e: PointerEvent) => void) | null = null;
  cancel: ((e: PointerEvent) => void) | null = null;
  dragAxis: i32 = 3;            // 1 x, 2 y, 3 both
  dragThreshold: number = 8;    // px before a drag takes the pointer (the scroll slop is 8 px too)
  keep: boolean = false;        // grab="keep": an ancestor's drag or scroll never steals the pointer
  keepX: boolean = false;       // grab="keep-x": only horizontal-ish gestures stay (a mostly vertical drag still scrolls)
  tabIndex: i32 = 0;            // > 0 first in the Tab order, < 0 out of it (still focusable by click)
  disabled: boolean = false;    // no events, no focus, for the node and its subtree
  keyCtx: string = '';          // keyContext
  acts: string[] = [];          // onAction(h, action, f)
  actFns: (() => void)[] = [];
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
  widest: number = -1;                  // widest row in pixels (horizontal scroll limit), -1 until measured
  // code editor extensions (setMarks, setEditColors, setHighlightAt): decorations drawn by paintEdit
  marks: i32[] = [];                    // [start, end, color, kind] per mark
  colors: i32[] = [];                   // [lineNumber, activeLineNumber, gutterLine, selection, caret, indentGuide]
  highlightAt: ((line: string, start: i32) => i32[]) | null = null;
  // vertical scroll physics (same as scroll containers: ScrollAxis), created on the first wheel / trackpad scroll
  ay: ScrollAxis | null = null;
  constructor(multi: boolean) { this.multi = multi; }
}

/** A percentage for a style size decided at run time: `style={{ width: pct(done() * 100) }}` (the compiler lowers it to the percent of the container). */
export function pct(n: number): number { return n / 100; }
/** Compiler-normalized immutable style. Keep shared styles outside render functions. */
export class Style {
  keys: string[]; values: number[]; ids: i32[];   // ids: propId of each key, found once here
  constructor(keys: string[], values: number[]) {
    this.keys = keys; this.values = values;
    const ids: i32[] = [];
    for (let i = 0; i < keys.length; i++) ids.push(propId(keys[i]));
    this.ids = ids;
  }
}
/** create() is lowered by Zinc: CSS literals become numeric style operations at build time. */
export class StyleSheet {
  /** React Native's thinnest line: one logical pixel here (React Native: 1 / PixelRatio). */
  static hairlineWidth: number = 1;
  static create<T>(styles: T): T { return styles; }
  static flatten(styles: Style[]): Style {
    const keys: string[] = [], values: number[] = [];
    for (const s of styles) for (let i = 0; i < s.keys.length; i++) { keys.push(s.keys[i]); values.push(s.values[i]); }
    return new Style(keys, values);
  }
  static compose(base: Style, override: Style): Style { return StyleSheet.flatten([base, override]); }
}

const NO_LINES: string[] = [];
const NO_LINEW: number[] = [];
const NO_IDS: i32[] = [];
const NO_SHEETS: Style[] = [];
export class RingX {
  ringW: i32 = 0;
  ringC: i32 = -1;
  ringO: i32 = 0;
  outW: i32 = 0;
  outC: i32 = -1;
  outO: i32 = 0;
  outNone: boolean = false;
  fRingW: i32 = -1;
  fRingC: i32 = -1;
  fRingO: i32 = 0;
  fOutW: i32 = -1;
  fOutC: i32 = -1;
  fOutO: i32 = 0;
  fVisible: boolean = false;
}
const DEF_RINGX = new RingX();
export class BorderX {
  borderStyle: i32 = 0;
  bcT: i32 = -1;
  bcR: i32 = -1;
  bcB: i32 = -1;
  bcL: i32 = -1;
  crTL: number = -1;
  crTR: number = -1;
  crBR: number = -1;
  crBL: number = -1;
  bT: number = -1;
  bR: number = -1;
  bB: number = -1;
  bL: number = -1;
}
const DEF_BORDERX = new BorderX();
export class SnapX {
  snap: i32 = 0;
  snapProx: boolean = false;
  snapAlign: i32 = 0;
  spt: number = 0;
  spb: number = 0;
  spl: number = 0;
  spr: number = 0;
}
const DEF_SNAPX = new SnapX();
export class InterX {
  focusBg: i32 = -1;
  activeBg: i32 = -1;
  focusFg: i32 = -1;
  activeFg: i32 = -1;
  hoverBg: i32 = -1;
  hoverFg: i32 = -1;
  hoverBorder: i32 = -1;
  focusBorder: i32 = -1;
  withinBg: i32 = -1;
  withinFg: i32 = -1;
  withinBorder: i32 = -1;
  transMs: number = 0;
  curBg: i32 = -1;
  fromBg: i32 = -1;
  transStart: number = 0;
}
const DEF_INTERX = new InterX();
/** React Native's transform array, composed in one fixed order around the node's centre: rotate, then scale, then skew (degrees). */
class TransformX { rot: number = 0; skX: number = 0; skY: number = 0; sx: number = 1; sy: number = 1; }
/** The part of a transform painted today: an even scale around the centre. Rotate, skew and uneven scales only hit-test until the
 *  renderer takes a matrix (ZN-361.01). */
function tfK(n: UiNode): number { const t = n.tf; if (t === null) return 1; return t.sx === t.sy ? t.sx : 1; }
let tpx: number = 0, tpy: number = 0;
/** (px, py) brought back through the rest of n's transform (rotate, uneven scale, skew) around the centre (cx, cy) into tpx, tpy. */
function untransform(n: UiNode, px: number, py: number, cx: number, cy: number): void {
  tpx = px; tpy = py;
  const t = n.tf;
  if (t === null || (t.rot === 0 && t.skX === 0 && t.skY === 0 && t.sx === t.sy)) return;
  const s = t.sx === t.sy ? t.sx : 1, r = t.rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
  const dx = t.sx / s, dy = t.sy / s, kx = Math.tan(t.skX * Math.PI / 180), ky = Math.tan(t.skY * Math.PI / 180);
  const a = cs * dx - sn * dy * ky, b = sn * dx + cs * dy * ky, c = cs * dx * kx - sn * dy, d = sn * dx * kx + cs * dy;   // R(rot) · diag(dx, dy) · skew
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) { tpx = -1e9; tpy = -1e9; return; }   // flattened: nothing is inside
  const qx = px - cx, qy = py - cy;
  tpx = cx + (d * qx - c * qy) / det; tpy = cy + (a * qy - b * qx) / det;
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
  grow: number = 0;   // flex-grow, fractional
  shrink: number = -1; basis: number = -1; basisFrac: number = 0; order: i32 = 0; selfAlign: i32 = -1; alignContent: i32 = -1; reverse: boolean = false;   // flex-shrink (-1: legacy, never shrinks), flex-basis, order, align-self (-1: auto), align-content (-1: start), row-reverse / col-reverse
  pt: i32 = 0; pr: i32 = 0; pb: i32 = 0; pl: i32 = 0;
  mt: i32 = 0; mr: i32 = 0; mb: i32 = 0; ml: i32 = 0;
  gap: i32 = 0; gapX: i32 = -1; gapY: i32 = -1;   // gap-x (between columns) and gap-y (between rows) override `gap` when set
  mAuto: i32 = 0;   // margin-left/right/top/bottom: auto, bits 1 2 4 8: they take the free space of their line (before justify)
  w: i32 = -1; h: i32 = -1; wFrac: number = 0; hFrac: number = 0;
  fullW: boolean = false; fullH: boolean = false;
  minW: i32 = -1; maxW: i32 = -1; minH: i32 = -1; maxH: i32 = -1; aspect: number = 0;   // min/max sizes (px, -1: none) and aspect-ratio (width / height, 0: none)
  abs: boolean = false; top: i32 = UNSET; left: i32 = UNSET; right: i32 = UNSET; bottom: i32 = UNSET;
  hidden: boolean = false;
  overflow: boolean = false;
  // scrolling (UI-14): 1 vertical, 2 horizontal, 3 both; content size from layout, offset applied at paint/hit time
  scroll: i32 = 0;
  sx: number = 0; sy: number = 0; contentW: number = 0; contentH: number = 0;
  vx: number = 0; vy: number = 0; scrolledAt: number = -100000;
  // scroll physics (ScrollAxis, stepScroll), created on the first user scroll; `live` while a gesture or an
  // animation drives the offset (overscroll allowed; clampScroll leaves it alone)
  ax: ScrollAxis | null = null; ay: ScrollAxis | null = null; live: boolean = false;
  keepFocus: boolean = false;   // pressing inside this subtree leaves the focus alone (virtual keyboards, toolbars)
  inputMode: i32 = 0;           // text fields: 0 text, 1 numeric, 2 decimal, 3 tel, 4 email, 5 url, 6 search
  virt: Virtual | null = null;
  group: boolean = false;              // `group`: group-hover: group-focus: group-active: classes of its descendants follow it
  peer: boolean = false;               // `peer`: peer-hover: peer-focus: peer-active: classes of the siblings after it follow it
  attrK: string[] = NO_LINES; attrV: string[] = NO_LINES;   // aria-* and data-* attributes (setAttr): aria-checked: and data-[state=open]: variants read them
  selectable: boolean = false;         // select-text: the pointer selects its text (ZN-270)
  surface: boolean = false;            // img is a runtime image this node owns (createSurface)
  role: string = ''; label: string = ''; ariaHidden: boolean = false;   // accessibility metadata (ZN-276)
  ov: StateOverlay | null = null;   // paint-only styles of hover: focus: active: disabled: (ZN-273)
  id: i32 = -1; media: i32 = 0; container: boolean = false; cqW: number = -1;   // media bits: 2 pointer, 4 container query, 8 env(); container: `@container`; cqW: the container width the styles were computed for
  responsive: boolean = false;  // has sm:/md:/lg:/xl: classes
  bg: i32 = -1; bgAlpha: i32 = 255;
  grad: i32 = 0; gradFrom: i32 = -1; gradTo: i32 = -1;   // 1 to-b, 2 to-r, 3 to-t, 4 to-l
  radius: number = 0;
  borderW: number = 0; borderColor: i32 = 0xe5e7eb; borderAlpha: i32 = 255; fgAlpha: i32 = 255;   // borderColor -3: currentColor
   // border-t/r/b/l widths, -1 = borderW
  shadowLevel: i32 = 0;
  shX: number = 0; shY: number = 0; shBlur: number = 0; shColor: i32 = 0; shOpacity: number = 0;   // React Native's shadow (ZN-360): drawn when shOpacity > 0
  opacity: number = 1;
  tx: number = 0; ty: number = 0;
    // border-dashed (1) / dotted (2), a colour per side, a radius per corner (-1: the node's own)
    // scroll snap: axes (1 y, 2 x), proximity, a child's alignment (1 start, 2 center, 3 end), scroll-padding
  z: i32 = 0; invisible: boolean = false; noPointer: boolean = false; rel: boolean = false; sticky: boolean = false;   // z-index, visibility: hidden, pointer-events: none, position: relative / sticky
  fg: i32 = -1;  // -1: inherited from the nearest ancestor with a text color (CSS color)
  letterSpace: number = UNSET; // absolute CSS letter spacing; Tailwind tracking remains relative
  size: i32 = 16; bold: boolean = false; weight: i32 = 0; italic: boolean = false; transform: i32 = 0; tsX: i32 = 0; tsY: i32 = 0; tsColor: i32 = -1; tsAlpha: i32 = 0; selBg: i32 = -1; ws: i32 = 0; brk: i32 = 0; clamp: i32 = 0; ellipsis: boolean = false; balance: boolean = false; deco: i32 = 0; wordSp: number = 0; vshift: number = 0;   // text-transform (1 upper, 2 lower, 3 capitalize), decoration bits (1 underline, 2 line-through, 4 overline), word spacing px, sub/super shift (em)
   tracking: number = 0; talign: i32 = 0; leading: i32 = 0;
  fontId: i32 = -1;
  family: string = 'sans';
  lines: string[] = NO_LINES; lineW: number[] = NO_LINEW;   // shared empties until the text is laid out
  img: i32 = -1;
  
  
  focusable: boolean = false;
  styleKeys: string[] = NO_LINES; styleVals: number[] = NO_LINEW; styleIds: i32[] = NO_IDS;   // shared empties until the first style number
  sheets: Style[] = NO_SHEETS; sheetKeys: string[] = NO_LINES; sheetVals: number[] = NO_LINEW; sheetIds: i32[] = NO_IDS;   // shared empties until the first style sheet (they are replaced, never changed in place when empty)
  cls: string = '\u0000';
  x: number = 0; y: number = 0; lw: number = 0; lh: number = 0;
  onClick: (() => void) | null = null;
  onDraw: ((x: i32, y: i32, w: i32, h: i32) => void) | null = null;
  k: number = 1;                       // style scale: zooms the node and its subtree (origin: top-left corner)
  tf: TransformX | null = null;        // React Native's transform array: rotate, skew, scaleX/Y around the centre (ZN-361)
  cursor: i32 = -1;                    // cursor-* class (gfx Cursor), -1 inherited
  
    // ring-* / outline-* (ZN-258)
    // the focus: / focus-visible: set
  hovered: boolean = false;
  lazy: boolean = false;               // canvas redrawn only with the rest of the tree (style lazy: 1)
  rn: RnRec | null = null;
  fade: number = 1;                    // LayoutAnimation's create/delete opacity, times the style opacity (ZN-365)
  leaving: boolean = false;            // removed while a LayoutAnimation runs: painted where it was, fading out, then released            // what the rn layout engine was last told about this node (ZN-286)
  wk: WrapKey | null = null;          // what the text lines were computed from (wrapText)
  hs: Handlers | null = null;
  ed: Edit | null = null;
  layer: boolean = false;              // ui.openLayer: laid out, painted and hit-tested apart from its parent
    // focus-within: colors
  rg: RingX = DEF_RINGX;   // cold fields in a record shared by every node that has none of them (copy on write: ownRg())
  bd: BorderX = DEF_BORDERX;   // cold fields in a record shared by every node that has none of them (copy on write: ownBd())
  sn: SnapX = DEF_SNAPX;   // cold fields in a record shared by every node that has none of them (copy on write: ownSn())
  it: InterX = DEF_INTERX;   // cold fields in a record shared by every node that has none of them (copy on write: ownIt())
  constructor(tag: i32) { this.tag = tag; }
  // read access under the old names (ui.inspectNode users and tests); the program writes through ownRg() and the like
  get ringW(): i32 { return this.rg.ringW; }
  get ringC(): i32 { return this.rg.ringC; }
  get ringO(): i32 { return this.rg.ringO; }
  get outW(): i32 { return this.rg.outW; }
  get outC(): i32 { return this.rg.outC; }
  get outO(): i32 { return this.rg.outO; }
  get outNone(): boolean { return this.rg.outNone; }
  get fRingW(): i32 { return this.rg.fRingW; }
  get fRingC(): i32 { return this.rg.fRingC; }
  get fRingO(): i32 { return this.rg.fRingO; }
  get fOutW(): i32 { return this.rg.fOutW; }
  get fOutC(): i32 { return this.rg.fOutC; }
  get fOutO(): i32 { return this.rg.fOutO; }
  get fVisible(): boolean { return this.rg.fVisible; }
  get borderStyle(): i32 { return this.bd.borderStyle; }
  get bcT(): i32 { return this.bd.bcT; }
  get bcR(): i32 { return this.bd.bcR; }
  get bcB(): i32 { return this.bd.bcB; }
  get bcL(): i32 { return this.bd.bcL; }
  get crTL(): number { return this.bd.crTL; }
  get crTR(): number { return this.bd.crTR; }
  get crBR(): number { return this.bd.crBR; }
  get crBL(): number { return this.bd.crBL; }
  get bT(): number { return this.bd.bT; }
  get bR(): number { return this.bd.bR; }
  get bB(): number { return this.bd.bB; }
  get bL(): number { return this.bd.bL; }
  get snap(): i32 { return this.sn.snap; }
  get snapProx(): boolean { return this.sn.snapProx; }
  get snapAlign(): i32 { return this.sn.snapAlign; }
  get spt(): number { return this.sn.spt; }
  get spb(): number { return this.sn.spb; }
  get spl(): number { return this.sn.spl; }
  get spr(): number { return this.sn.spr; }
  get focusBg(): i32 { return this.it.focusBg; }
  get activeBg(): i32 { return this.it.activeBg; }
  get focusFg(): i32 { return this.it.focusFg; }
  get activeFg(): i32 { return this.it.activeFg; }
  get hoverBg(): i32 { return this.it.hoverBg; }
  get hoverFg(): i32 { return this.it.hoverFg; }
  get hoverBorder(): i32 { return this.it.hoverBorder; }
  get focusBorder(): i32 { return this.it.focusBorder; }
  get withinBg(): i32 { return this.it.withinBg; }
  get withinFg(): i32 { return this.it.withinFg; }
  get withinBorder(): i32 { return this.it.withinBorder; }
  get transMs(): number { return this.it.transMs; }
  get curBg(): i32 { return this.it.curBg; }
  get fromBg(): i32 { return this.it.fromBg; }
  get transStart(): number { return this.it.transStart; }
  ownRg(): RingX { if (this.rg === DEF_RINGX) this.rg = new RingX(); return this.rg; }
  ownBd(): BorderX { if (this.bd === DEF_BORDERX) this.bd = new BorderX(); return this.bd; }
  ownSn(): SnapX { if (this.sn === DEF_SNAPX) this.sn = new SnapX(); return this.sn; }
  ownIt(): InterX { if (this.it === DEF_INTERX) this.it = new InterX(); return this.it; }
}

/** The paint-only properties a state can change (hover:, focus:, active:, disabled:): one record per state plus the values to go back to. mask bits: 1 opacity, 2 tx, 4 ty, 16 shadow, 32 bg, 64 fg, 128 border colour, 256 radius. */
export class StateStyle {
  mask: i32 = 0;
  opacity: number = 1; tx: number = 0; ty: number = 0; shadow: i32 = 0;
  bg: i32 = -1; bgAlpha: i32 = 255; fg: i32 = -1; fgAlpha: i32 = 255; bc: i32 = -1; bcAlpha: i32 = 255; radius: number = 0;
}
export class StateOverlay {
  s: (StateStyle | null)[] = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];   // hover, focus, active, disabled, group-hover, group-focus, group-active, peer-hover, peer-focus, peer-active, then one slot per attribute variant in use (attrSlots)
  base: StateStyle = new StateStyle();
  all: i32 = 0;           // the union of the masks
  act: i32 = 0;           // the states applied now (bit per state)
}
/** Virtualized list state: only rows in the viewport (+ overscan) exist as nodes. */
export class Virtual {
  count: i32 = 0;
  itemH: number = 40;
  render: (i: i32) => i32;
  drop: ((row: i32) => void) | null = null;  // called before a row node is destroyed (reactive cleanup)
  rows: Map<i32, i32> = new Map<i32, i32>();  // index -> node
  first: i32 = 0; last: i32 = -1;
  variable = false;                          // rows of different heights (estimate = itemH until a row has been laid out)
  hs: number[] = []; known: boolean[] = []; tree: number[] = [];   // heights, measured flags and their Fenwick tree (prefix sums in O(log n))
  constructor(render: (i: i32) => i32) { this.render = render; }
}
const nodes: UiNode[] = [];
const free: i32[] = [];
/** Stands in for every destroyed node: the slot keeps its number for reuse but drops the node's memory (a page of
 *  171 nodes held ~100 KiB after it was left, which a 160 KiB ESP32 heap cannot afford). */
const DEAD: UiNode = new UiNode(0);
DEAD.alive = false;
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
  if (free.length > 0) { const h = free.pop(); n.id = h; nodes[h] = n; return h; }
  n.id = nodes.length;
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
  if (n.text !== s) { n.text = s; layoutDirty = true; if (tsNode === h) tsNode = -1; }
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
  if (laDeleting(child)) { layoutDirty = true; return; }   // it fades out where it is, then leaves (LayoutAnimation)
  const i = p.children.indexOf(child);
  if (i >= 0) p.children.splice(i, 1);
  release(child);
  layoutDirty = true;
}
export function clearChildren(parent: i32): void {
  const p = node(parent);
  const stay: i32[] = [];
  for (const c of p.children) { if (laDeleting(c)) stay.push(c); else release(c); }   // (a LayoutAnimation fades them out first)
  p.children = stay;
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
  if (n.rn !== null) {
    LY.destroy(h); n.rn = null;
    // the parent's cached child list names this handle, and handles are recycled: a new node with the same handle would look already inserted (ZN-289)
    const p = n.parent;
    if (p >= 0 && p < nodes.length && nodes[p].rn !== null) (nodes[p].rn as RnRec).kids = [];
  }
  if (n.tag === CANVAS && !n.lazy) canvases--;
  if (n.surface && n.img >= 0) { destroyImage(n.img); n.img = -1; }
  if (overlays.length > 0 || layers.length > 0 || anchors.length > 0) forget(h);
  if (componentNames.size > 0) componentNames.delete(h);
  n.alive = false;
  n.onClick = null;
  n.onDraw = null;
  n.hs = null;
  n.ed = null;
  if (focus === h) focus = -1;
  if (pressed === h) pressed = -1;
  if (capture === h) capture = -1;
  if (selecting === h) selecting = -1;
  if (tsNode === h) tsNode = -1;
  for (const a of anims) if (a.node === h) a.node = -1;
  nodes[h] = DEAD;
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
  n.sx = x; n.sy = y; n.vx = 0; n.vy = 0; n.ax = null; n.ay = null; n.live = false;
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
  // a negative itemH is an estimate: rows have their own heights (ZN-193)
  vv.render = render; vv.count = count; vv.itemH = itemH < 0 ? -itemH : itemH; vv.drop = drop;
  vv.variable = itemH < 0;
  if (vv.variable) fwBuild(vv, vv.itemH);
  vv.rows.forEach((row: i32, i: i32) => { if (drop !== null) drop(row); detach(h, row); release(row); });
  vv.rows = new Map<i32, i32>();
  vv.first = 0; vv.last = -1;
  layoutDirty = true;
}
// Fenwick tree over the row heights of a variable list: offset of a row and the row at an offset, both O(log n); 100k rows cost two arrays.
function fwBuild(v: Virtual, est: number): void {
  v.hs = []; v.known = []; v.tree = [0];
  for (let i = 0; i < v.count; i++) { v.hs.push(est); v.known.push(false); v.tree.push(est); }
  for (let i = 1; i <= v.count; i++) { const j = i + (i & -i); if (j <= v.count) v.tree[j] = v.tree[j] + v.tree[i]; }
}
function fwPrefix(v: Virtual, i: i32): number { let s = 0; for (let k = i; k > 0; k -= k & -k) s += v.tree[k]; return s; }
function fwAdd(v: Virtual, i: i32, d: number): void { for (let k = i + 1; k <= v.count; k += k & -k) v.tree[k] = v.tree[k] + d; }
/** The row that contains offset y (0 above the list, the last row below it). */
function fwFind(v: Virtual, y: number): i32 {
  let pos: i32 = 0, step: i32 = 1;
  while (step * 2 <= v.count) step *= 2;
  for (; step > 0; step = Math.floor(step / 2)) {
    const nx = pos + step;
    if (nx <= v.count && v.tree[nx] <= y) { pos = nx; y -= v.tree[nx]; }
  }
  return pos > v.count - 1 ? v.count - 1 : pos;
}
let inVirt = false;
/** After a layout: the rows' own heights replace the estimates; rows are moved, and the scroll offset follows the rows above the view so nothing jumps. */
function settleVirtuals(): void {
  for (const h of virtuals()) {
    const n = node(h), v = n.virt as Virtual;
    if (!v.variable) continue;
    let changed = false;
    v.rows.forEach((row: i32, i: i32) => {
      const nh = node(row).lh;
      if (v.known[i] && Math.abs(nh - v.hs[i]) < 0.01) return;
      const d = nh - v.hs[i];
      v.known[i] = true; v.hs[i] = nh; fwAdd(v, i, d);
      if (n.pt + fwPrefix(v, i) + nh <= n.sy) n.sy += d;   // a row above the view: keep what is shown where it is
      changed = true;
    });
    if (!changed) continue;
    v.rows.forEach((row: i32, i: i32) => { node(row).top = Math.round(n.pt + fwPrefix(v, i)); });
    layoutDirty = true;
  }
}
function syncVirtual(h: i32, n: UiNode): void {
  const v = n.virt as Virtual;
  const over: i32 = 3;
  let first: i32 = v.variable ? fwFind(v, n.sy - n.pt) - over : Math.floor(n.sy / v.itemH) - over;
  let last: i32 = v.variable ? fwFind(v, n.sy + n.lh - n.pt) + over : Math.ceil((n.sy + n.lh) / v.itemH) + over;
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
    r.abs = true; r.top = Math.round(n.pt + (v.variable ? fwPrefix(v, i) : i * v.itemH)); r.left = n.pl; r.right = n.pr;
    if (!v.variable) r.h = Math.round(v.itemH);
    insert(h, row, -1);
    v.rows.set(i, row);
  }
  v.first = first; v.last = last;
  layoutDirty = true;
}
/** A node that shows a runtime image the program fills (a WebGL canvas through `gl.zincPresent(surfaceImage(h))`, video frames...): w x h pixels, laid out and painted like an image, so it scrolls and clips with its page. */
export function createSurface(w: i32, h: i32): i32 {
  const n = createNode(IMAGE);
  nodes[n].img = createImage(w, h);
  nodes[n].surface = true;
  layoutDirty = true;
  return n;
}
/** The runtime image behind a surface node (-1 when it could not be created). */
export function surfaceImage(h: i32): i32 { return node(h).img; }
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
export const PTAP: i32 = 8, PLONG: i32 = 9, PDRAG: i32 = 10, PPINCH: i32 = 11, PCANCEL: i32 = 12;
/** Pointer handler of a node: kind PDOWN, PMOVE, PUP, PDBL (double click), PCONTEXT (right click), PWHEEL, PENTER, PLEAVE. */
export function onPointer(h: i32, kind: i32, f: (e: PointerEvent) => void): void {
  const s = handlers(h);
  if (kind === PDOWN) s.down = f; else if (kind === PMOVE) s.move = f; else if (kind === PUP) s.up = f;
  else if (kind === PDBL) s.dbl = f; else if (kind === PCONTEXT) s.ctx = f; else if (kind === PWHEEL) s.wheel = f;
  else if (kind === PENTER) s.enter = f; else if (kind === PLEAVE) s.leave = f;
  else if (kind === PTAP) s.tap = f; else if (kind === PLONG) s.long = f; else if (kind === PDRAG) s.drag = f;
  else if (kind === PPINCH) s.pinch = f; else s.cancel = f;
}
// ---- React Native's responder shapes (ZN-366): PanResponder over onDrag, onScroll, and the events Animated.event maps.
export class ContentOffset { x: number = 0; y: number = 0; }
export class NativeEvent { contentOffset: ContentOffset = new ContentOffset(); locationX: number = 0; locationY: number = 0; pageX: number = 0; pageY: number = 0; timestamp: number = 0; }
export class ResponderEvent { nativeEvent: NativeEvent = new NativeEvent(); }
/** React Native's gestureState: dx / dy since the press, vx / vy in px per ms, moveX / moveY the latest position, x0 / y0 where the gesture began. */
export class GestureState { stateID: i32 = 0; moveX: number = 0; moveY: number = 0; x0: number = 0; y0: number = 0; dx: number = 0; dy: number = 0; vx: number = 0; vy: number = 0; numberActiveTouches: i32 = 0; }
export type ResponderHandler = (e: ResponderEvent, g: GestureState) => void;
export type ResponderTest = (e: ResponderEvent, g: GestureState) => boolean;
export type PanResponderConfig = {
  onStartShouldSetPanResponder?: ResponderTest; onMoveShouldSetPanResponder?: ResponderTest;
  onPanResponderGrant?: ResponderHandler; onPanResponderMove?: ResponderHandler; onPanResponderRelease?: ResponderHandler; onPanResponderTerminate?: ResponderHandler;
};
let panIds: i32 = 0;
/** What `{...pan.panHandlers}` puts on a node: one onDrag handler that speaks PanResponder. */
export class PanHandlers {
  c: PanResponderConfig;
  g: GestureState = new GestureState();
  e: ResponderEvent = new ResponderEvent();
  on: boolean = false; lastT: number = 0; lastX: number = 0; lastY: number = 0;
  constructor(c: PanResponderConfig) { this.c = c; }
  /** The pan takes the press on the first move when onStartShouldSetPanResponder is given, else past the drag threshold (8 px).
   *  ponytail: the should-set callbacks are asked once, when the drag takes the pointer, not on every move. */
  attach(h: i32): void {
    if (this.c.onStartShouldSetPanResponder !== undefined) handlers(h).dragThreshold = 0;
    onPointer(h, PDRAG, (p: PointerEvent): void => this.drag(p));
  }
  drag(p: PointerEvent): void {
    const g = this.g, ne = this.e.nativeEvent, t = clock;
    ne.locationX = p.x; ne.locationY = p.y; ne.pageX = p.gx; ne.pageY = p.gy; ne.timestamp = t;
    if (p.phase === 0) {
      g.stateID = ++panIds; g.x0 = p.gx - p.dx; g.y0 = p.gy - p.dy; g.vx = 0; g.vy = 0; g.numberActiveTouches = 1;
      g.dx = p.dx; g.dy = p.dy; g.moveX = p.gx; g.moveY = p.gy;
      const a = this.c.onStartShouldSetPanResponder, b = this.c.onMoveShouldSetPanResponder;
      this.on = (a !== undefined && a(this.e, g)) || (b !== undefined && b(this.e, g));
      this.lastT = t; this.lastX = p.gx; this.lastY = p.gy;
      if (this.on) { const f = this.c.onPanResponderGrant; if (f !== undefined) f(this.e, g); }
      return;
    }
    if (!this.on) return;
    if (p.phase === 1 && t > this.lastT) { g.vx = (p.gx - this.lastX) / (t - this.lastT); g.vy = (p.gy - this.lastY) / (t - this.lastT); this.lastT = t; this.lastX = p.gx; this.lastY = p.gy; }
    g.dx = p.dx; g.dy = p.dy; g.moveX = p.gx; g.moveY = p.gy;
    const f = p.phase === 1 ? this.c.onPanResponderMove : p.phase === 2 ? this.c.onPanResponderRelease : this.c.onPanResponderTerminate;
    if (p.phase >= 2) { this.on = false; g.numberActiveTouches = 0; }
    if (f !== undefined) f(this.e, g);
  }
}
export class PanResponderInstance { panHandlers: PanHandlers; constructor(c: PanResponderConfig) { this.panHandlers = new PanHandlers(c); } }
export class PanResponder { static create(c: PanResponderConfig): PanResponderInstance { return new PanResponderInstance(c); } }

const scrollWatch: i32[] = [], scrollFns: ResponderHandler[] = [], scrollSeen: number[] = [];
const noGesture = new GestureState();
/** onScroll: f gets nativeEvent.contentOffset once per frame in which the offset of scroll node h moved. */
export function onScroll(h: i32, f: ResponderHandler): void { scrollWatch.push(h); scrollFns.push(f); scrollSeen.push(node(h).sx); scrollSeen.push(node(h).sy); }
function fireScrolls(): void {
  for (let i = 0; i < scrollWatch.length; i++) {
    const n = nodes[scrollWatch[i]];
    if (!n.alive || (n.sx === scrollSeen[2 * i] && n.sy === scrollSeen[2 * i + 1])) continue;
    scrollSeen[2 * i] = n.sx; scrollSeen[2 * i + 1] = n.sy;
    const e = new ResponderEvent();
    e.nativeEvent.contentOffset.x = n.sx; e.nativeEvent.contentOffset.y = n.sy; e.nativeEvent.timestamp = clock;
    scrollFns[i](e, noGesture);
  }
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
  if (n.styleKeys === NO_LINES) { n.styleKeys = []; n.styleVals = []; n.styleIds = []; }
  const i = n.styleKeys.indexOf(key);
  const id = i >= 0 ? n.styleIds[i] : propId(key);
  if (i >= 0) { if (n.styleVals[i] === v) return; n.styleVals[i] = v; } else { n.styleKeys.push(key); n.styleVals.push(v); n.styleIds.push(id); }
  applyProp(n, id, key, v);
}
/** Numeric style properties by id (ZN-250): a key is looked up once, when a Style or a setNumber meets it; applying a style compares integers. Aliases share an id; 0 is a key the table does not know (interaction keys). */
const P_OPACITY: i32 = 1;
const P_TRANSLATE_X: i32 = 2;
const P_TRANSLATE_Y: i32 = 3;
const P_BACKGROUND_COLOR: i32 = 5;
const P_BACKGROUND_ALPHA: i32 = 6;
const P_BORDER_COLOR: i32 = 7;
const P_COLOR: i32 = 8;
const P_RADIUS: i32 = 9;
const P_SCALE: i32 = 10;
const P_LAZY: i32 = 11;
const P_PASSWORD: i32 = 12;
const P_READ_ONLY: i32 = 13;
const P_LINE_NUMBERS: i32 = 14;
const P_WRAP: i32 = 15;
const P_ROWS: i32 = 16;
const P_WIDTH: i32 = 17;
const P_HEIGHT: i32 = 18;
const P_WIDTH_PERCENT: i32 = 19;
const P_HEIGHT_PERCENT: i32 = 20;
const P_FLEX_DIRECTION: i32 = 21;
const P_FLEX_WRAP: i32 = 22;
const P_JUSTIFY_CONTENT: i32 = 23;
const P_ALIGN_ITEMS: i32 = 24;
const P_POSITION: i32 = 25;
const P_OVERFLOW: i32 = 26;
const P_FONT_WEIGHT: i32 = 27;
const P_TEXT_ALIGN: i32 = 28;
const P_LINE_HEIGHT: i32 = 29;
const P_LETTER_SPACING: i32 = 30;
const P_BORDER_WIDTH: i32 = 31;
const P_BORDER_TOP_WIDTH: i32 = 32;
const P_BORDER_RIGHT_WIDTH: i32 = 33;
const P_BORDER_BOTTOM_WIDTH: i32 = 34;
const P_BORDER_LEFT_WIDTH: i32 = 35;
const P_PADDING_TOP: i32 = 36;
const P_PADDING_RIGHT: i32 = 37;
const P_PADDING_BOTTOM: i32 = 38;
const P_PADDING_LEFT: i32 = 39;
const P_MARGIN_TOP: i32 = 40;
const P_MARGIN_RIGHT: i32 = 41;
const P_MARGIN_BOTTOM: i32 = 42;
const P_MARGIN_LEFT: i32 = 43;
const P_GROW: i32 = 44;
const P_GAP: i32 = 45;
const P_PADDING: i32 = 46;
const P_FONT_SIZE: i32 = 47;
const P_HIDDEN: i32 = 48;
const P_KEEP_FOCUS: i32 = 49;
const P_INPUT_MODE: i32 = 50;
const P_TOP: i32 = 51;
const P_LEFT: i32 = 52;
const P_RIGHT: i32 = 53;
const P_BOTTOM: i32 = 54;
const P_SHRINK: i32 = 55;
const P_BASIS: i32 = 56;
const P_BASIS_PERCENT: i32 = 57;
const P_ALIGN_SELF: i32 = 58;
const P_ALIGN_CONTENT: i32 = 59;
const P_MIN_WIDTH: i32 = 60;
const P_MAX_WIDTH: i32 = 61;
const P_MIN_HEIGHT: i32 = 62;
const P_MAX_HEIGHT: i32 = 63;
const P_ASPECT: i32 = 64;
const P_SHADOW_COLOR: i32 = 65;
const P_SHADOW_X: i32 = 66;
const P_SHADOW_Y: i32 = 67;
const P_SHADOW_OPACITY: i32 = 68;
const P_SHADOW_RADIUS: i32 = 69;
const P_ELEVATION: i32 = 70;
const P_ROTATE: i32 = 71;
const P_SKEW_X: i32 = 72;
const P_SKEW_Y: i32 = 73;
const P_SCALE_X: i32 = 74;
const P_SCALE_Y: i32 = 75;
const P_BORDER_STYLE: i32 = 76;
const P_RADIUS_TL: i32 = 77, P_RADIUS_TR: i32 = 78, P_RADIUS_BR: i32 = 79, P_RADIUS_BL: i32 = 80;
const P_BORDER_TOP_COLOR: i32 = 81, P_BORDER_RIGHT_COLOR: i32 = 82, P_BORDER_BOTTOM_COLOR: i32 = 83, P_BORDER_LEFT_COLOR: i32 = 84;
const P_NUMBER_OF_LINES: i32 = 85;
const PROP = new Map<string, i32>();
function propInit(): void {
  PROP.set('opacity', P_OPACITY);
  PROP.set('translateX', P_TRANSLATE_X);
  PROP.set('x', P_TRANSLATE_X);
  PROP.set('translateY', P_TRANSLATE_Y);
  PROP.set('y', P_TRANSLATE_Y);
  PROP.set('bg', P_BACKGROUND_COLOR);
  PROP.set('backgroundColor', P_BACKGROUND_COLOR);
  PROP.set('backgroundAlpha', P_BACKGROUND_ALPHA);
  PROP.set('borderColor', P_BORDER_COLOR);
  PROP.set('color', P_COLOR);
  PROP.set('radius', P_RADIUS);
  PROP.set('borderRadius', P_RADIUS);
  PROP.set('scale', P_SCALE);
  PROP.set('lazy', P_LAZY);
  PROP.set('password', P_PASSWORD);
  PROP.set('readOnly', P_READ_ONLY);
  PROP.set('lineNumbers', P_LINE_NUMBERS);
  PROP.set('wrap', P_WRAP);
  PROP.set('rows', P_ROWS);
  PROP.set('width', P_WIDTH);
  PROP.set('height', P_HEIGHT);
  PROP.set('widthPercent', P_WIDTH_PERCENT);
  PROP.set('heightPercent', P_HEIGHT_PERCENT);
  PROP.set('flexDirection', P_FLEX_DIRECTION);
  PROP.set('flexWrap', P_FLEX_WRAP);
  PROP.set('justifyContent', P_JUSTIFY_CONTENT);
  PROP.set('alignItems', P_ALIGN_ITEMS);
  PROP.set('position', P_POSITION);
  PROP.set('overflow', P_OVERFLOW);
  PROP.set('fontWeight', P_FONT_WEIGHT);
  PROP.set('textAlign', P_TEXT_ALIGN);
  PROP.set('lineHeight', P_LINE_HEIGHT);
  PROP.set('letterSpacing', P_LETTER_SPACING);
  PROP.set('borderWidth', P_BORDER_WIDTH);
  PROP.set('borderTopWidth', P_BORDER_TOP_WIDTH);
  PROP.set('borderRightWidth', P_BORDER_RIGHT_WIDTH);
  PROP.set('borderBottomWidth', P_BORDER_BOTTOM_WIDTH);
  PROP.set('borderLeftWidth', P_BORDER_LEFT_WIDTH);
  PROP.set('paddingTop', P_PADDING_TOP);
  PROP.set('paddingRight', P_PADDING_RIGHT);
  PROP.set('paddingBottom', P_PADDING_BOTTOM);
  PROP.set('paddingLeft', P_PADDING_LEFT);
  PROP.set('marginTop', P_MARGIN_TOP);
  PROP.set('marginRight', P_MARGIN_RIGHT);
  PROP.set('marginBottom', P_MARGIN_BOTTOM);
  PROP.set('marginLeft', P_MARGIN_LEFT);
  PROP.set('grow', P_GROW);
  PROP.set('gap', P_GAP);
  PROP.set('padding', P_PADDING);
  PROP.set('fontSize', P_FONT_SIZE);
  PROP.set('hidden', P_HIDDEN);
  PROP.set('keepFocus', P_KEEP_FOCUS);
  PROP.set('inputMode', P_INPUT_MODE);
  PROP.set('top', P_TOP);
  PROP.set('left', P_LEFT);
  PROP.set('right', P_RIGHT);
  PROP.set('bottom', P_BOTTOM);
  PROP.set('shrink', P_SHRINK); PROP.set('flexShrink', P_SHRINK);
  PROP.set('basis', P_BASIS); PROP.set('flexBasis', P_BASIS); PROP.set('basisPercent', P_BASIS_PERCENT);
  PROP.set('alignSelf', P_ALIGN_SELF); PROP.set('alignContent', P_ALIGN_CONTENT);
  PROP.set('minWidth', P_MIN_WIDTH); PROP.set('maxWidth', P_MAX_WIDTH); PROP.set('minHeight', P_MIN_HEIGHT); PROP.set('maxHeight', P_MAX_HEIGHT); PROP.set('aspectRatio', P_ASPECT);
  PROP.set('shadowColor', P_SHADOW_COLOR); PROP.set('shadowOffsetX', P_SHADOW_X); PROP.set('shadowOffsetY', P_SHADOW_Y); PROP.set('shadowOpacity', P_SHADOW_OPACITY); PROP.set('shadowRadius', P_SHADOW_RADIUS); PROP.set('elevation', P_ELEVATION);
  PROP.set('rotate', P_ROTATE); PROP.set('skewX', P_SKEW_X); PROP.set('skewY', P_SKEW_Y); PROP.set('scaleX', P_SCALE_X); PROP.set('scaleY', P_SCALE_Y);
  PROP.set('borderStyle', P_BORDER_STYLE);
  PROP.set('numberOfLines', P_NUMBER_OF_LINES);
  PROP.set('borderTopLeftRadius', P_RADIUS_TL); PROP.set('borderTopRightRadius', P_RADIUS_TR); PROP.set('borderBottomRightRadius', P_RADIUS_BR); PROP.set('borderBottomLeftRadius', P_RADIUS_BL);
  PROP.set('borderTopColor', P_BORDER_TOP_COLOR); PROP.set('borderRightColor', P_BORDER_RIGHT_COLOR); PROP.set('borderBottomColor', P_BORDER_BOTTOM_COLOR); PROP.set('borderLeftColor', P_BORDER_LEFT_COLOR);
}
/** The id of a style key; -1 for a class token ('@...'), 0 for a key without an id. */
export function propId(key: string): i32 {
  if (PROP.size === 0) propInit();
  if (key.startsWith('@')) return -1;
  const id = PROP.get(key);
  return id === undefined ? 0 : id;
}
function applyNumber(n: UiNode, key: string, v: number): void { applyProp(n, propId(key), key, v); }
function applyProp(n: UiNode, id: i32, key: string, v: number): void {
  const iv: i32 = Math.round(v);
  if (id === 0 && applyInteraction(n, key, iv, v)) return;   // grab, dragAxis, tabIndex... keep their names
  if (id === P_OPACITY) { n.opacity = v; paintDirty = true; return; }
  if (id === P_TRANSLATE_X || id === P_TRANSLATE_X) { n.tx = v; paintDirty = true; return; }
  if (id === P_TRANSLATE_Y || id === P_TRANSLATE_Y) { n.ty = v; paintDirty = true; return; }
  if (id === P_BACKGROUND_COLOR || id === P_BACKGROUND_COLOR) { n.bg = iv; paintDirty = true; return; }
  if (id === P_BACKGROUND_ALPHA) { n.bgAlpha = iv; paintDirty = true; return; }
  if (id === P_BORDER_COLOR) { n.borderColor = iv; paintDirty = true; return; }
  if (id === P_COLOR) { n.fg = iv; paintDirty = true; return; }
  if (id === P_RADIUS || id === P_RADIUS) { n.radius = v; paintDirty = true; return; }
  if (id === P_NUMBER_OF_LINES) { n.clamp = iv > 0 ? iv : 0; n.ellipsis = iv > 0; layoutDirty = true; return; }   // React Native's <Text numberOfLines> (ZN-290)
  if (id >= P_BORDER_STYLE && id <= P_BORDER_LEFT_COLOR) {   // React Native's borderStyle, corner radii and side colours (ZN-363): the classes' border record
    const b = n.ownBd();
    if (id === P_BORDER_STYLE) b.borderStyle = iv;
    else if (id === P_RADIUS_TL) b.crTL = v; else if (id === P_RADIUS_TR) b.crTR = v; else if (id === P_RADIUS_BR) b.crBR = v; else if (id === P_RADIUS_BL) b.crBL = v;
    else if (id === P_BORDER_TOP_COLOR) b.bcT = iv; else if (id === P_BORDER_RIGHT_COLOR) b.bcR = iv; else if (id === P_BORDER_BOTTOM_COLOR) b.bcB = iv; else b.bcL = iv;
    paintDirty = true;
    return;
  }
  if (id >= P_ROTATE && id <= P_SCALE_Y) {   // React Native's transform array (ZN-361), around the centre
    if (n.tf === null) n.tf = new TransformX();
    const t = n.tf as TransformX;
    if (id === P_ROTATE) t.rot = v; else if (id === P_SKEW_X) t.skX = v; else if (id === P_SKEW_Y) t.skY = v; else if (id === P_SCALE_X) t.sx = v; else t.sy = v;
    paintDirty = true;
    return;
  }
  if (id === P_SCALE && n.tag !== TEXT) { n.k = v > 0 ? v : 1; paintDirty = true; return; }  // text: legacy font scale below
  if (id === P_LAZY && n.tag === CANVAS) {
    // a lazy canvas does not force a repaint every frame: it is drawn when something else changed (or ui.repaint())
    if (n.lazy !== (iv !== 0)) { n.lazy = iv !== 0; canvases += n.lazy ? -1 : 1; paintDirty = true; }
    return;
  }
  const e = n.ed;
  if (e !== null) {
    if (id === P_PASSWORD) { e.password = iv !== 0; e.rowsFor = '\u0000'; paintDirty = true; return; }
    if (id === P_READ_ONLY) { e.readOnly = iv !== 0; paintDirty = true; return; }
    if (id === P_LINE_NUMBERS) { e.lineNumbers = iv !== 0; e.rowsW = -1; paintDirty = true; return; }
    if (id === P_WRAP) { e.wrap = iv !== 0; e.rowsW = -1; paintDirty = true; return; }
    if (id === P_ROWS) { e.rows = iv; layoutDirty = true; return; }
  }
  if (id >= P_SHADOW_COLOR && id <= P_ELEVATION) {   // React Native's shadow keys (ZN-360): paint only
    if (id === P_SHADOW_COLOR) n.shColor = iv; else if (id === P_SHADOW_X) n.shX = v; else if (id === P_SHADOW_Y) n.shY = v;
    else if (id === P_SHADOW_OPACITY) n.shOpacity = v; else if (id === P_SHADOW_RADIUS) n.shBlur = v;
    else {   // elevation: one shadow along a curve close to Material's (offset e/2, blur 0.8e, opacity 0.12 + 0.012e up to 0.4), black
      n.shColor = 0; n.shX = 0; n.shY = v * 0.5; n.shBlur = v * 0.8; n.shOpacity = v > 0 ? Math.min(0.4, 0.12 + 0.012 * v) : 0;
    }
    paintDirty = true;
    return;
  }
  if (id === P_WIDTH) { n.w = iv; n.wFrac = 0; n.fullW = false; }
  else if (id === P_HEIGHT) { n.h = iv; n.hFrac = 0; n.fullH = false; }
  else if (id === P_WIDTH_PERCENT) { n.w = -1; n.wFrac = v; n.fullW = false; }
  else if (id === P_HEIGHT_PERCENT) { n.h = -1; n.hFrac = v; n.fullH = false; }
  else if (id === P_FLEX_DIRECTION) n.row = iv !== 0;
  else if (id === P_FLEX_WRAP) n.wrap = iv !== 0;
  else if (id === P_JUSTIFY_CONTENT) n.justify = iv;
  else if (id === P_ALIGN_ITEMS) n.align = iv;
  else if (id === P_POSITION) n.abs = iv !== 0;
  else if (id === P_OVERFLOW) { n.overflow = iv !== 0; n.scroll = iv === 2 ? 3 : 0; }
  else if (id === P_FONT_WEIGHT) n.bold = iv !== 0;
  else if (id === P_TEXT_ALIGN) n.talign = iv;
  else if (id === P_LINE_HEIGHT) n.leading = iv;
  else if (id === P_LETTER_SPACING) { n.letterSpace = v; n.tracking = v / (n.size > 0 ? n.size : 16); }
  else if (id === P_BORDER_WIDTH) n.borderW = v;
  else if (id === P_BORDER_TOP_WIDTH) n.ownBd().bT = v;
  else if (id === P_BORDER_RIGHT_WIDTH) n.ownBd().bR = v;
  else if (id === P_BORDER_BOTTOM_WIDTH) n.ownBd().bB = v;
  else if (id === P_BORDER_LEFT_WIDTH) n.ownBd().bL = v;
  else if (id === P_PADDING_TOP) n.pt = iv; else if (id === P_PADDING_RIGHT) n.pr = iv;
  else if (id === P_PADDING_BOTTOM) n.pb = iv; else if (id === P_PADDING_LEFT) n.pl = iv;
  else if (id === P_MARGIN_TOP) n.mt = iv; else if (id === P_MARGIN_RIGHT) n.mr = iv;
  else if (id === P_MARGIN_BOTTOM) n.mb = iv; else if (id === P_MARGIN_LEFT) n.ml = iv;
  else if (id === P_GROW) n.grow = v; else if (id === P_GAP) n.gap = iv;
  else if (id === P_PADDING) { n.pt = iv; n.pr = iv; n.pb = iv; n.pl = iv; }
  else if (id === P_SCALE) n.size = 8 * iv;
  else if (id === P_FONT_SIZE) { n.size = iv; if (n.letterSpace !== UNSET) n.tracking = n.letterSpace / (iv > 0 ? iv : 16); }
  else if (id === P_HIDDEN) n.hidden = iv !== 0;
  else if (id === P_KEEP_FOCUS) { n.keepFocus = iv !== 0; return; }
  else if (id === P_INPUT_MODE) { n.inputMode = iv; return; }
  else if (id === P_TOP) n.top = iv; else if (id === P_LEFT) n.left = iv;
  else if (id === P_RIGHT) n.right = iv; else if (id === P_BOTTOM) n.bottom = iv;
  else if (id === P_SHRINK) n.shrink = v;   // object styles of React Native (ZN-358)
  else if (id === P_BASIS) { n.basis = iv; n.basisFrac = 0; }
  else if (id === P_BASIS_PERCENT) { n.basis = v === 0 ? 0 : -1; n.basisFrac = v; }   // 0% is a basis of 0, not auto (ZN-289)
  else if (id === P_ALIGN_SELF) n.selfAlign = iv;
  else if (id === P_ALIGN_CONTENT) n.alignContent = iv;
  else if (id === P_MIN_WIDTH) n.minW = iv; else if (id === P_MAX_WIDTH) n.maxW = iv;   // (ZN-359; -1: none)
  else if (id === P_MIN_HEIGHT) n.minH = iv; else if (id === P_MAX_HEIGHT) n.maxH = iv;
  else if (id === P_ASPECT) n.aspect = v;
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
  if (s.startsWith('[')) return arbitrary(s.slice(1, s.length - 1));
  if (s.indexOf('/') > 0) { const p = s.split('/'); return parseFloat(p[0]) / parseFloat(p[1]); }
  if (s === 'px') return 1;
  return rootFont === 16 ? parseFloat(s) * 4 : parseFloat(s) * 4 * rootFont / 16;
}
/** The inside of `[...]`: pixels, rem (16 px), vh / vw (of the surface now); a % is handled by the width and height tokens. */
function arbitrary(v: string): number {
  if (v.startsWith('env(')) { envUsed = true; return envValue(v.slice(4, v.length - 1)); }
  if (v.endsWith('rem')) return parseFloat(v.slice(0, v.length - 3)) * rootFont;
  if (v.endsWith('vh')) return parseFloat(v.slice(0, v.length - 2)) * height() / 100;
  if (v.endsWith('vw')) return parseFloat(v.slice(0, v.length - 2)) * width() / 100;
  return parseFloat(v.replace('px', ''));
}
/** Border widths are pixels: border-2 = 2px, border-[3px] = 3px. */
function borderPx(s: string): number { return s.startsWith('[') ? num(s) : num(s) / 4; }
/** A Tailwind colour name ('indigo-500', 'white', '[#ff8800]') as 0xRRGGBB, or -1 if unknown (canvas drawing in theme colours). */
export function tailwindColor(name: string): i32 { const c = colorOf(name); return c < 0 ? -1 : c; }
/** CSS colours inside [...]: #rgb #rrggbb #rrggbbaa, rgb(r,g,b), rgba(r,g,b,a), hsl(h,s%,l%), hsla(h,s%,l%,a). Integer arithmetic only (no 24-bit value ever sits in a `number`, which overflows on fixed-point profiles). */
let cssAlpha: i32 = 255;
function hslToRgb(h0: i32, s: i32, l: i32): i32 {
  const h: i32 = ((h0 % 360) + 360) % 360;
  const c: i32 = Math.floor((100 - Math.abs(2 * l - 100)) * s / 100);   // chroma, 0..100
  const t: i32 = h % 120;
  const x: i32 = Math.floor(c * (60 - Math.abs(t - 60)) / 60);
  const m: i32 = l - Math.floor(c / 2);
  let r: i32 = 0, g: i32 = 0, b: i32 = 0;
  const sector: i32 = Math.floor(h / 60);
  if (sector === 0) { r = c; g = x; } else if (sector === 1) { r = x; g = c; } else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; } else if (sector === 4) { r = x; b = c; } else { r = c; b = x; }
  const R: i32 = Math.round((r + m) * 255 / 100), G: i32 = Math.round((g + m) * 255 / 100), B: i32 = Math.round((b + m) * 255 / 100);
  return (R << 16) | (G << 8) | B;
}
function cssParts(inner: string): string[] { return inner.replaceAll(' ', '').replaceAll('%', '').split(','); }
function byteOf(v: string): i32 { const x: i32 = Math.round(parseFloat(v)); return x < 0 ? 0 : x > 255 ? 255 : x; }
function alphaPart(v: string): i32 { const a = parseFloat(v); return a !== a ? 255 : Math.round(a <= 1 ? a * 255 : a * 2.55); }
/** -2 when `v` (the inside of the brackets) is not a CSS colour; sets cssAlpha. */
function cssColor(v: string): i32 {
  cssAlpha = 255;
  if (v.startsWith('var(--') && v.endsWith(')')) { varUsed = true; return schemeVar(v.slice(6, v.length - 1)); }
  if (v.startsWith('#')) {
    let hex = v.slice(1);
    if (hex.length === 3 || hex.length === 4) { let e = ''; for (let i = 0; i < hex.length; i++) e += hex.charAt(i) + hex.charAt(i); hex = e; }   // #f80 is #ff8800, #f808 is #ff880088
    if (hex.length !== 6 && hex.length !== 8) return -2;
    const c = parseHex(hex.slice(0, 6));
    if (c < 0) return -2;
    if (hex.length === 8) { const al = parseHex(hex.slice(6)); if (al < 0) return -2; cssAlpha = al; }
    return c;
  }
  const open = v.indexOf('('), close = v.lastIndexOf(')');
  if (open < 0 || close !== v.length - 1) return -2;
  const fn = v.slice(0, open), p = cssParts(v.slice(open + 1, close));
  if (fn === 'rgb' || fn === 'rgba') {
    if (p.length < 3) return -2;
    if (p.length > 3) cssAlpha = alphaPart(p[3]);
    return (byteOf(p[0]) << 16) | (byteOf(p[1]) << 8) | byteOf(p[2]);
  }
  if (fn === 'hsl' || fn === 'hsla') {
    if (p.length < 3) return -2;
    if (p.length > 3) cssAlpha = alphaPart(p[3]);
    const s: i32 = Math.round(parseFloat(p[1])), l: i32 = Math.round(parseFloat(p[2]));
    return hslToRgb(Math.round(parseFloat(p[0])), s < 0 ? 0 : s > 100 ? 100 : s, l < 0 ? 0 : l > 100 ? 100 : l);
  }
  return -2;
}
function colorOf(s: string): i32 {
  initColors();
  const slash = s.lastIndexOf('/');
  const base = slash > 0 && !s.startsWith('[') ? s.slice(0, slash) : slash > 0 && s.charAt(slash - 1) === ']' ? s.slice(0, slash) : s;
  if (base.startsWith('[')) return cssColor(base.slice(1, base.length - 1));
  if (base === 'transparent') return -1;
  if (base === 'current') return -3;
  return COLORS.get(base) ?? -2;
}
/** 0..100 percent to 0..255 with integers only (the same on every number profile). 50 and 90 give one less than the exact rounding: what Math.round(p * 2.55) always gave on f64, kept so every frame stays identical. */
function percentAlpha(p: i32): i32 {
  const a: i32 = Math.floor((p * 255 + 50) / 100);
  return p === 50 || p === 90 ? a - 1 : a;
}
/** The alpha of a colour token: `/50` (percent), or the alpha of a #rrggbbaa / rgba() / hsla() value. */
function alphaOf(s: string): i32 {
  const slash = s.lastIndexOf('/');
  if (slash > 0 && (!s.startsWith('[') || s.charAt(slash - 1) === ']')) return percentAlpha(Math.round(parseFloat(s.slice(slash + 1))));
  if (s.startsWith('[')) { cssColor(s.slice(1, s.length - 1)); return cssAlpha; }
  return 255;
}
const MAX_NAMES: string[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'];
const MAX_PX: number[] = [320, 384, 448, 512, 576, 672, 768, 896, 1024, 1152, 1280];
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
/** ring-N / ring-<colour> / ring-offset-N / outline-N / outline-none / outline-<colour> / outline-offset-N. `mode`: 0 always, 1 under focus:, 2 under focus-visible:. */
function ringStep(t: string, from: number): i32 { const w = parseInt(t.slice(from), 10); return w >= 0 && w <= 16 && t.slice(from) === `${w}` ? w : -1; }
function ringToken(n: UiNode, tok: string, mode: i32): boolean {
  const ring = tok === 'ring' || tok.startsWith('ring-'), out = tok === 'outline' || tok.startsWith('outline-');
  if (!ring && !out) return false;
  const pre = ring ? 4 : 7;
  if (mode > 0) n.ownRg().fVisible = mode === 2;
  if (tok === 'outline-none' || tok === 'outline-0') { if (mode === 0) n.ownRg().outNone = true; else n.ownRg().fOutW = 0; return true; }
  let w = -1, off = -1, c = -2;
  if (tok.length === pre) w = ring ? 3 : 1;
  else if (tok.startsWith(tok.slice(0, pre + 1) + 'offset-')) off = ringStep(tok, pre + 8);
  else { w = ringStep(tok, pre + 1); if (w < 0) c = colorOf(tok.slice(pre + 1)); }
  if (w < 0 && off < 0 && c === -2) return false;
  if (mode === 0) {
    if (ring) { if (w >= 0) n.ownRg().ringW = w; else if (off >= 0) n.ownRg().ringO = off; else n.ownRg().ringC = c; }
    else { if (w >= 0) n.ownRg().outW = w; else if (off >= 0) n.ownRg().outO = off; else n.ownRg().outC = c; }
  } else if (ring) { if (w >= 0) n.ownRg().fRingW = w; else if (off >= 0) n.ownRg().fRingO = off; else n.ownRg().fRingC = c; }
  else { if (w >= 0) n.ownRg().fOutW = w; else if (off >= 0) n.ownRg().fOutO = off; else n.ownRg().fOutC = c; }
  return true;
}
// ---- accessibility (ZN-276)
let rootFont: number = 16;
/** The size of 1rem in pixels (16 by default): rem lengths, the spacing scale and the text sizes follow it, and every node is restyled. */
export function setRootFontSize(px: number): void {
  if (px === rootFont || !(px > 0)) return;
  rootFont = px;
  for (let i = 0; i < nodes.length; i++) if (nodes[i].alive) { const c = nodes[i].cls; nodes[i].cls = '\u0000'; setClass(i, c); }
}
export function setRole(h: i32, role: string): void { node(h).role = role; }
export function setLabel(h: i32, label: string): void { node(h).label = label; }
export function setAriaHidden(h: i32, on: boolean): void { node(h).ariaHidden = on; }
const ROLE_OF_TAG: string[] = ['', 'text', 'button', 'img', 'scrollarea', '', '', 'textbox', 'textbox'];
/** The accessibility tree as text, one node per line indented by depth: `role "label" (hidden) (disabled)`. Plain boxes without role or label do not show; aria-hidden subtrees are listed once and skipped. */
export function inspect(): string {
  let out = '';
  const walk = (h: i32, depth: i32): void => {
    const n = nodes[h];
    if (!n.alive) return;
    const role = n.role !== '' ? n.role : ROLE_OF_TAG[n.tag];
    const label = n.label !== '' ? n.label : n.tag === TEXT ? n.text : n.ed !== null ? (n.ed as Edit).value : '';
    const hidden = n.ariaHidden || n.hidden;
    const shown = role !== '' || n.label !== '' || n.ariaHidden;
    if (shown) out += '  '.repeat(depth) + (role === '' ? 'node' : role) + (label !== '' ? ' "' + label + '"' : '') + (hidden ? ' (hidden)' : '') + (n.hs !== null && (n.hs as Handlers).disabled ? ' (disabled)' : '') + '\n';
    if (hidden) return;
    for (const c of n.children) walk(c, shown ? depth + 1 : depth);
  };
  if (root >= 0) walk(root, 0);
  return out;
}
// ---- media and container queries, env() lengths (ZN-272)
let envUsed = false, varUsed = false, coarse = platform() !== 'macos' && platform() !== 'linux' && platform() !== 'wasm', cqAny = false, inSettle = false, settlePasses: i32 = 0;
let kbInset: number = 0, safeT: number = 0, safeR: number = 0, safeB: number = 0, safeL: number = 0;
function envValue(name: string): number {
  return name === 'keyboard-inset' ? kbInset : name === 'safe-area-inset-top' ? safeT : name === 'safe-area-inset-right' ? safeR : name === 'safe-area-inset-bottom' ? safeB : name === 'safe-area-inset-left' ? safeL : 0;
}
function restyleMedia(mask: i32): i32 {
  let k = 0;
  for (let i = 0; i < nodes.length; i++) if (nodes[i].alive && (nodes[i].media & mask) !== 0) { const c = nodes[i].cls; nodes[i].cls = '\u0000'; setClass(i, c); k++; }
  return k;
}
// Colour schemes (ZN-271): `bg-[var(--card)]` and `dark:` classes follow the scheme; switching restyles the flagged nodes only, no component re-renders.
const schemeNames: string[] = [], varNames: string[] = [], schemeVals: i32[][] = [];
let schemeMode = env('ZINC_SCHEME') === '' ? 'light' : env('ZINC_SCHEME'), systemScheme = 'light', schemeCount: i32 = 0;
let scheme = schemeMode === 'auto' ? 'light' : schemeMode;
function schemeVar(name: string): i32 {
  const v = varNames.indexOf(name), s = schemeNames.indexOf(scheme);
  return v < 0 || s < 0 ? -2 : schemeVals[s][v];
}
/** Defines the variables of one scheme: names ('card'), colours (0xRRGGBB, -1 transparent). Several calls with the same names add schemes. */
export function defineScheme(name: string, names: string[], colors: i32[]): void {
  let s = schemeNames.indexOf(name);
  if (s < 0) { s = schemeNames.length; schemeNames.push(name); schemeVals.push([]); }
  for (let i = 0; i < names.length; i++) {
    let v = varNames.indexOf(names[i]);
    if (v < 0) { v = varNames.length; varNames.push(names[i]); }
    while (schemeVals[s].length <= v) schemeVals[s].push(-2);
    schemeVals[s][v] = colors[i];
  }
}
function applyScheme(name: string): void {
  if (name === scheme) return;
  scheme = name;
  schemeCount = restyleMedia(16);
}
/** Switches the colour scheme ('light', 'dark', or 'auto' to follow the system's). zinc.json: "scheme". */
export function setScheme(name: string): void { schemeMode = name; applyScheme(name === 'auto' ? systemScheme : name); }
export function currentScheme(): string { return scheme; }
/** The nodes the last scheme switch restyled. */
export function schemeRestyled(): i32 { return schemeCount; }
/** Called by the host when the operating system's preference changes. */
export function setSystemScheme(name: string): void { systemScheme = name; if (schemeMode === 'auto') applyScheme(name); }
/** The room an on-screen keyboard takes at the bottom of the surface, readable in classes as `pb-[env(keyboard-inset)]`. */
export function setKeyboardInset(px: number): void { if (px === kbInset) return; kbInset = px; restyleMedia(8); focusShown = -1; }   // the focused field is revealed again once the room is made
export function keyboardInset(): number { return kbInset; }
/** Safe-area insets (notches, rounded corners): `env(safe-area-inset-top|right|bottom|left)`. */
export function setSafeArea(t: number, r: number, b: number, l: number): void { if (t === safeT && r === safeR && b === safeB && l === safeL) return; safeT = t; safeR = r; safeB = b; safeL = l; restyleMedia(8); }
/** The last pointer was a finger or a pen (a touch screen), not a mouse. Devices that are not desktops start with it true. */
export function pointerIsCoarse(): boolean { return coarse; }
function setCoarse(c: boolean): void { if (c === coarse) return; coarse = c; restyleMedia(2); }
/** Layout passes the last container-query settling needed (1: nothing changed). */
export function layoutPasses(): i32 { return settlePasses; }
function containerOf(h: i32): i32 { if (h < 0) return -1; for (let p = nodes[h].parent; p >= 0; p = nodes[p].parent) if (nodes[p].container) return p; return -1; }
const CQ_PX: i32[] = [384, 448, 512, 576];
/** The value of one query prefix (`max-md`, `landscape`, `pointer-coarse`, `@md`...): 1 true, 0 false, -1 not a query. Sets the node's dependency bits. */
function queryOf(n: UiNode, q: string): i32 {
  if (q === 'dark' || q === 'light') { n.media = n.media | 16; return scheme === q ? 1 : 0; }
  if (q === 'landscape') { n.responsive = true; return width() >= height() ? 1 : 0; }
  if (q === 'portrait') { n.responsive = true; return width() < height() ? 1 : 0; }
  if (q === 'pointer-coarse' || q === 'hover-none') { n.media = n.media | 2; return coarse ? 1 : 0; }
  if (q === 'pointer-fine') { n.media = n.media | 2; return coarse ? 0 : 1; }
  if (q.startsWith('max-') || q.startsWith('min-')) {
    const max = q.startsWith('max-'), r = q.slice(4);
    let px: i32 = -1;
    if (r.startsWith('[') && r.endsWith(']')) px = Math.round(arbitrary(r.slice(1, r.length - 1)));
    else { const i = BREAKPOINTS.indexOf(r + ':'); if (i >= 0) px = BREAKPOINT_PX[i]; }
    if (px < 0) return -1;
    n.responsive = true;
    return max ? (width() < px ? 1 : 0) : (width() >= px ? 1 : 0);
  }
  if (q.startsWith('@')) {
    const r = q.slice(1);
    let px: i32 = -1;
    if (r.startsWith('[') && r.endsWith(']')) px = Math.round(arbitrary(r.slice(1, r.length - 1)));
    else { const i = ['sm', 'md', 'lg', 'xl'].indexOf(r); if (i >= 0) px = CQ_PX[i]; }
    if (px < 0) return -1;
    n.media = n.media | 4; cqAny = true;
    const c = containerOf(n.id);
    n.cqW = c >= 0 ? nodes[c].lw : 0;
    return c >= 0 && nodes[c].lw >= px ? 1 : 0;
  }
  return -1;
}
/** After a layout: nodes with `@md:` classes whose container changed width are restyled and laid out again (at most 2 extra passes). */
function settleContainers(): void {
  inSettle = true; settlePasses = 1;
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (let i = 0; i < nodes.length; i++) {
      const m = nodes[i];
      if (!m.alive || (m.media & 4) === 0) continue;
      const c = containerOf(i), w = c >= 0 ? nodes[c].lw : 0;
      if (w !== m.cqW) { const cl = m.cls; m.cls = '\u0000'; setClass(i, cl); changed = true; }
    }
    if (!changed) break;
    layout(); settlePasses++;
  }
  inSettle = false;
}
let layoutRuns: i32 = 0;
/** How many times the layout ran (a paint-only change must not move it). */
export function layoutCount(): i32 { return layoutRuns; }
const statefuls: i32[] = [];
const attrSlots: string[] = [];   // "aria-checked=true", "data-state=open": the conditions of the attribute variants, slot i is state bit 10 + i
/** The value of an aria-* or data-* attribute of a node ("" when unset). */
function attrOf(n: UiNode, k: string): string { const i = n.attrK.indexOf(k); return i < 0 ? '' : n.attrV[i]; }
/** Sets an aria-* or data-* attribute (aria-checked = "true", data-state = "open"): variants such as aria-checked: and data-[state=open]: follow it, paint only. */
export function setAttr(h: i32, name: string, value: string): void {
  const n = node(h), i = n.attrK.indexOf(name);
  if (i < 0) { if (n.attrK === NO_LINES) { n.attrK = []; n.attrV = []; } n.attrK.push(name); n.attrV.push(value); } else if (n.attrV[i] === value) return; else n.attrV[i] = value;
  paintDirty = true;
}
/** hover: focus: active: disabled: tokens of one node: only paint-only properties, copied from a scratch node that took the token. */
function stateToken(n: UiNode, variant: string, tok: string): boolean {
  let st = variant === 'hover' ? 0 : variant === 'focus' ? 1 : variant === 'active' ? 2 : variant === 'disabled' ? 3 : variant === 'group-hover' ? 4 : variant === 'group-focus' ? 5 : variant === 'group-active' ? 6 : variant === 'peer-hover' ? 7 : variant === 'peer-focus' ? 8 : variant === 'peer-active' ? 9 : -1;
  if (variant.startsWith('attr:')) {   // attr:aria-checked=true, attr:data-state=open: one slot per distinct condition (at most 20 in a program)
    const k = variant.slice(5);
    let i = attrSlots.indexOf(k);
    if (i < 0) { if (attrSlots.length >= 20) return false; attrSlots.push(k); i = attrSlots.length - 1; }
    st = 10 + i;
  }
  if (st < 0) return false;
  const t = new UiNode(n.tag);
  if (!applyToken(t, tok, '')) return false;
  const d = new UiNode(n.tag);
  let m: i32 = 0;
  if (tok.startsWith('opacity-')) m = 1;
  else if (tok.startsWith('translate-x') || tok.startsWith('-translate-x')) m = 2;
  else if (tok.startsWith('translate-y') || tok.startsWith('-translate-y')) m = 4;
  else if (tok.startsWith('shadow')) m = 16;
  else if (tok.startsWith('bg-') && t.grad === 0) m = 32;
  else if (tok.startsWith('text-') && t.size === d.size && t.leading === d.leading && t.fg !== d.fg) m = 64;
  else if (tok.startsWith('border-') && t.borderW === d.borderW && t.borderColor !== d.borderColor) m = 128;
  else if (tok.startsWith('rounded') && t.bd.crTL < 0 && t.bd.crTR < 0 && t.bd.crBR < 0 && t.bd.crBL < 0) m = 256;
  if (m === 0) return false;
  let ov = n.ov;
  if (ov === null) { ov = new StateOverlay(); n.ov = ov; if (n.id >= 0 && statefuls.indexOf(n.id) < 0) statefuls.push(n.id); }
  const o = ov as StateOverlay;
  let ss = o.s[st];
  if (ss === null) { ss = new StateStyle(); o.s[st] = ss; }
  const x = ss as StateStyle;
  x.mask = x.mask | m; o.all = o.all | m;
  if (m === 1) x.opacity = t.opacity; else if (m === 2) x.tx = t.tx; else if (m === 4) x.ty = t.ty; else if (m === 16) x.shadow = t.shadowLevel;
  else if (m === 32) { x.bg = t.bg; x.bgAlpha = t.bgAlpha; } else if (m === 64) { x.fg = t.fg; x.fgAlpha = t.fgAlpha; }
  else if (m === 128) { x.bc = t.borderColor; x.bcAlpha = t.borderAlpha; } else x.radius = t.radius;
  return true;
}
function stateBits(h: i32): i32 {
  const n = nodes[h];
  let b = (n.hovered ? 1 : 0) | (focus === h ? 2 : 0) | (pressed === h ? 4 : 0) | (isDisabled(h) ? 8 : 0);
  for (let p = n.parent; p >= 0; p = nodes[p].parent) if (nodes[p].group) {   // the nearest group above: its state decides the group-* classes
    b = b | (nodes[p].hovered ? 16 : 0) | (focus === p ? 32 : 0) | (pressed === p ? 64 : 0);
    break;
  }
  if (n.parent >= 0) {   // the nearest peer before this node among its siblings
    const sib = nodes[n.parent].children;
    for (let i = sib.indexOf(h) - 1; i >= 0; i--) if (nodes[sib[i]].peer) { const q = sib[i]; b = b | (nodes[q].hovered ? 128 : 0) | (focus === q ? 256 : 0) | (pressed === q ? 512 : 0); break; }
  }
  for (let i = 0; i < attrSlots.length; i++) {
    const k = attrSlots[i], e = k.indexOf('=');
    if (attrOf(n, k.slice(0, e)) === k.slice(e + 1)) b = b | (1 << (10 + i));
  }
  return b;
}
/** Puts the values of the active states on a node (and the base values back when they end): no layout, only a repaint. */
function syncState(h: i32): void {
  const n = nodes[h], o = n.ov as StateOverlay;
  const want = stateBits(h);
  if (want === o.act) return;
  const b = o.base;
  if (o.act === 0) {   // leaving the base: remember it
    b.opacity = n.opacity; b.tx = n.tx; b.ty = n.ty; b.shadow = n.shadowLevel; b.bg = n.bg; b.bgAlpha = n.bgAlpha; b.fg = n.fg; b.fgAlpha = n.fgAlpha; b.bc = n.borderColor; b.bcAlpha = n.borderAlpha; b.radius = n.radius;
  }
  const a = o.all;
  if ((a & 1) !== 0) n.opacity = b.opacity;
  if ((a & 2) !== 0) n.tx = b.tx;
  if ((a & 4) !== 0) n.ty = b.ty;
  if ((a & 16) !== 0) n.shadowLevel = b.shadow;
  if ((a & 32) !== 0) { n.bg = b.bg; n.bgAlpha = b.bgAlpha; }
  if ((a & 64) !== 0) { n.fg = b.fg; n.fgAlpha = b.fgAlpha; }
  if ((a & 128) !== 0) { n.borderColor = b.bc; n.borderAlpha = b.bcAlpha; }
  if ((a & 256) !== 0) n.radius = b.radius;
  for (let i = 0; i < 30; i++) {
    const ss = o.s[i];
    if (ss === null || (want & (1 << i)) === 0) continue;
    const x = ss as StateStyle;
    if ((x.mask & 1) !== 0) n.opacity = x.opacity;
    if ((x.mask & 2) !== 0) n.tx = x.tx;
    if ((x.mask & 4) !== 0) n.ty = x.ty;
    if ((x.mask & 16) !== 0) n.shadowLevel = x.shadow;
    if ((x.mask & 32) !== 0) { n.bg = x.bg; n.bgAlpha = x.bgAlpha; }
    if ((x.mask & 64) !== 0) { n.fg = x.fg; n.fgAlpha = x.fgAlpha; }
    if ((x.mask & 128) !== 0) { n.borderColor = x.bc; n.borderAlpha = x.bcAlpha; }
    if ((x.mask & 256) !== 0) n.radius = x.radius;
  }
  o.act = want;
  paintDirty = true;
}
function syncStates(): void {
  for (let i = statefuls.length - 1; i >= 0; i--) {
    const h = statefuls[i], n = nodes[h];
    if (!n.alive || n.ov === null) { statefuls.splice(i, 1); continue; }
    syncState(h);
  }
}
const FONT_WEIGHT_TOKENS: string[] = ['font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'];
function applyToken(n: UiNode, tok: string, variant: string): boolean {
  const qc = tok.indexOf(':');
  if (qc > 0 && !tok.startsWith('hover:') && !tok.startsWith('focus')) {
    const qv = queryOf(n, tok.slice(0, qc));
    if (qv >= 0) return qv === 1 ? applyToken(n, tok.slice(qc + 1), variant) : applyToken(new UiNode(n.tag), tok.slice(qc + 1), variant);
  }
  if (tok === '@container') { n.container = true; return true; }
  // responsive (mobile first): md:flex-row applies from 768 px wide; re-evaluated when the window is resized
  for (let i = 0; i < BREAKPOINTS.length; i++) if (tok.startsWith(BREAKPOINTS[i])) {
    n.responsive = true;
    const rest = tok.slice(BREAKPOINTS[i].length);
    return width() >= BREAKPOINT_PX[i] ? applyToken(n, rest, variant) : applyToken(new UiNode(n.tag), rest, variant);
  }
  if (tok.startsWith('selection:')) return applyToken(n, tok.slice(10), 'selection');
  if (tok.startsWith('focus-within:')) return applyToken(n, tok.slice(13), 'within');
  if (tok.startsWith('focus-visible:')) return ringToken(n, tok.slice(14), 2);
  if (tok.startsWith('focus:') && ringToken(n, tok.slice(6), 1)) return true;
  if (tok.startsWith('focus:')) return applyToken(n, tok.slice(6), 'focus');
  if (tok.startsWith('active:')) return applyToken(n, tok.slice(7), 'active');
  // hover: colors under the mouse (desktop); other hover: tokens are accepted and ignored
  if (tok.startsWith('hover:')) return applyToken(n, tok.slice(6), 'hover');
  if (tok.startsWith('disabled:')) return applyToken(n, tok.slice(9), 'disabled');
  if (tok.startsWith('group-hover:')) return applyToken(n, tok.slice(12), 'group-hover');
  if (tok.startsWith('group-focus:')) return applyToken(n, tok.slice(12), 'group-focus');
  if (tok.startsWith('group-active:')) return applyToken(n, tok.slice(13), 'group-active');
  if (tok.startsWith('peer-hover:')) return applyToken(n, tok.slice(11), 'peer-hover');
  if (tok.startsWith('peer-focus:')) return applyToken(n, tok.slice(11), 'peer-focus');
  if (tok.startsWith('peer-active:')) return applyToken(n, tok.slice(12), 'peer-active');
  if (tok.startsWith('aria-')) {   // aria-checked:bg-x == the attribute aria-checked is "true"
    const c = tok.indexOf(':');
    if (c > 5) return applyToken(n, tok.slice(c + 1), 'attr:' + tok.slice(0, c) + '=true');
  }
  if (tok.startsWith('data-[')) {   // data-[state=open]:bg-x
    const c = tok.indexOf(']:'), e = tok.indexOf('=');
    if (c > 6 && e > 6 && e < c) return applyToken(n, tok.slice(c + 2), 'attr:data-' + tok.slice(6, e) + '=' + tok.slice(e + 1, c));
  }
  if (tok === 'group') { n.group = true; return true; }
  if (tok === 'peer') { n.peer = true; return true; }
  if (variant === '' && ringToken(n, tok, 0)) return true;
  if (variant !== '') {
    const isBg = tok.startsWith('bg-'), isBorder = tok.startsWith('border-');
    const c = isBg ? colorOf(tok.slice(3)) : isBorder ? colorOf(tok.slice(7)) : tok.startsWith('text-') ? colorOf(tok.slice(5)) : -2;
    if (variant !== 'selection' && variant !== 'within' && (c === -2 || variant === 'disabled' || variant.startsWith('group-') || variant.startsWith('peer-') || variant.startsWith('attr:') || (variant === 'active' && isBorder) || (c >= 0 && alphaOf(isBg ? tok.slice(3) : isBorder ? tok.slice(7) : tok.slice(5)) !== 255))) return stateToken(n, variant, tok);
    if (c === -2) return false;
    if (variant === 'focus') { if (isBg) n.ownIt().focusBg = c; else if (isBorder) n.ownIt().focusBorder = c; else n.ownIt().focusFg = c; }
    else if (variant === 'hover') { if (isBg) n.ownIt().hoverBg = c; else if (isBorder) n.ownIt().hoverBorder = c; else n.ownIt().hoverFg = c; }
    else if (variant === 'selection') { if (isBg) n.selBg = c; else return false; }
    else if (variant === 'within') { if (isBg) n.ownIt().withinBg = c; else if (isBorder) n.ownIt().withinBorder = c; else n.ownIt().withinFg = c; }
    else { if (isBg) n.ownIt().activeBg = c; else if (isBorder) return false; else n.ownIt().activeFg = c; }
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
  if (tok === 'snap-none') { n.ownSn().snap = 0; return true; }
  if (tok === 'snap-y') { n.ownSn().snap = n.sn.snap | 1; return true; }
  if (tok === 'snap-x') { n.ownSn().snap = n.sn.snap | 2; return true; }
  if (tok === 'snap-both') { n.ownSn().snap = 3; return true; }
  if (tok === 'snap-mandatory') { n.ownSn().snapProx = false; return true; }
  if (tok === 'snap-proximity') { n.ownSn().snapProx = true; return true; }
  if (tok === 'snap-start') { n.ownSn().snapAlign = 1; return true; }
  if (tok === 'snap-center') { n.ownSn().snapAlign = 2; return true; }
  if (tok === 'snap-end') { n.ownSn().snapAlign = 3; return true; }
  if (tok === 'snap-align-none') { n.ownSn().snapAlign = 0; return true; }
  if (tok.startsWith('scroll-p')) {   // scroll-p-4, scroll-pt-2, scroll-px-3...
    const d = tok.indexOf('-', 8);
    const w = tok.slice(8, d < 0 ? 8 : d), v = d < 0 ? NaN : num(tok.slice(d + 1));
    if (v !== v || (w !== '' && w !== 't' && w !== 'b' && w !== 'l' && w !== 'r' && w !== 'x' && w !== 'y')) return false;
    if (w === '' || w === 't' || w === 'y') n.ownSn().spt = v;
    if (w === '' || w === 'b' || w === 'y') n.ownSn().spb = v;
    if (w === '' || w === 'l' || w === 'x') n.ownSn().spl = v;
    if (w === '' || w === 'r' || w === 'x') n.ownSn().spr = v;
    return true;
  }
  if (tok === 'relative') { n.rel = true; n.sticky = false; return true; }
  if (tok === 'static') { n.rel = false; n.sticky = false; return true; }
  if (tok === 'sticky') { n.sticky = true; n.rel = false; return true; }
  if (tok === 'invisible') { n.invisible = true; return true; }
  if (tok === 'visible') { n.invisible = false; return true; }
  if (tok === 'pointer-events-none') { n.noPointer = true; return true; }
  if (tok === 'pointer-events-auto') { n.noPointer = false; return true; }
  if (tok === 'z-auto') { n.z = 0; return true; }
  if (tok.startsWith('z-') || tok.startsWith('-z-')) {   // z-10, -z-10, z-[5]
    const neg = tok.startsWith('-'), k = tok.slice(neg ? 3 : 2);
    const zv = k.startsWith('[') ? parseFloat(k.slice(1, k.length - 1)) : parseFloat(k);
    if (zv !== zv) return false;
    n.z = Math.round(neg ? -zv : zv);
    return true;
  }
  if (tok === 'flex' || tok === 'transition' || tok === 'ease-out' || tok === 'ease-in' || tok === 'ease-in-out') return true;
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
  if (tok.startsWith('grow-') || tok.startsWith('shrink')) {   // grow-2, grow-[0.5], shrink, shrink-0, shrink-[0.5]
    const isGrow = tok.startsWith('grow-'), rest = isGrow ? tok.slice(5) : tok.slice(7);
    if (!isGrow && tok !== 'shrink' && tok.slice(6, 7) !== '-') return false;
    const v: number = !isGrow && tok === 'shrink' ? 1 : rest.startsWith('[') ? parseFloat(rest.slice(1, rest.length - 1)) : parseFloat(rest);
    if (v !== v || v < 0) return false;
    if (isGrow) n.grow = v; else n.shrink = v;
    return true;
  }
  if (tok === 'flex-none') { n.grow = 0; n.shrink = 0; n.basis = -1; n.basisFrac = 0; return true; }
  if (tok === 'flex-auto') { n.grow = 1; n.shrink = 1; n.basis = -1; n.basisFrac = 0; return true; }
  if (tok === 'flex-initial') { n.grow = 0; n.shrink = 1; n.basis = -1; n.basisFrac = 0; return true; }
  if (tok === 'flex-row-reverse') { n.row = true; n.reverse = true; return true; }
  if (tok === 'flex-col-reverse') { n.row = false; n.reverse = true; return true; }
  if (tok.startsWith('basis-')) {   // basis-0, basis-32, basis-1/2, basis-full, basis-auto, basis-[120px]
    const k = tok.slice(6);
    if (k === 'auto') { n.basis = -1; n.basisFrac = 0; return true; }
    if (k === 'full') { n.basis = -1; n.basisFrac = 1; return true; }
    if (k.indexOf('/') > 0) { const f = num(k); if (f !== f) return false; n.basis = -1; n.basisFrac = f; return true; }
    const v = num(k);
    if (v !== v) return false;
    n.basis = Math.round(v); n.basisFrac = 0;
    return true;
  }
  if (tok.startsWith('order-')) {
    const k = tok.slice(6);
    const ov = k === 'first' ? -9999 : k === 'last' ? 9999 : k === 'none' ? 0 : parseFloat(k);
    if (ov !== ov) return false;
    n.order = Math.round(ov);
    return true;
  }
  if (tok.startsWith('self-')) {
    const k = tok.slice(5);
    const i = ['start', 'center', 'end', 'stretch'].indexOf(k);
    if (k === 'auto') n.selfAlign = -1; else if (i >= 0) n.selfAlign = i; else return false;
    return true;
  }
  if (tok.startsWith('content-')) {
    const i = ['start', 'center', 'end', 'stretch', 'between', 'around', 'evenly'].indexOf(tok.slice(8));
    if (i < 0) return false;
    n.alignContent = i;
    return true;
  }
  if (tok === 'w-full') { n.fullW = true; return true; }
  if (tok === 'h-full') { n.fullH = true; return true; }
  if (tok.startsWith('inset-')) {   // inset-0, inset-4, inset-x-2, inset-y-0, inset-[10px]: an absolute box
    const k = tok.slice(6), ax = k.startsWith('x-'), ay = k.startsWith('y-');
    const fv = num(ax || ay ? k.slice(2) : k);
    if (fv !== fv) return false;
    const v = Math.round(fv);
    n.abs = true;
    if (!ay) { n.left = v; n.right = v; }
    if (!ax) { n.top = v; n.bottom = v; }
    return true;
  }
  const fw = FONT_WEIGHT_TOKENS.indexOf(tok);
  if (fw >= 0) { n.weight = (fw + 1) * 100; n.bold = fw >= 5; return true; }
  if (tok === 'italic') { n.italic = true; return true; }
  if (tok === 'text-shadow-none') { n.tsAlpha = 0; return true; }
  if (tok === 'text-shadow-sm') { n.tsX = 0; n.tsY = 1; n.tsAlpha = 115; return true; }
  if (tok === 'text-shadow') { n.tsX = 1; n.tsY = 1; n.tsAlpha = 110; return true; }
  if (tok === 'text-shadow-md') { n.tsX = 1; n.tsY = 2; n.tsAlpha = 110; return true; }
  if (tok === 'text-shadow-lg') { n.tsX = 2; n.tsY = 4; n.tsAlpha = 100; return true; }
  if (tok.startsWith('text-shadow-')) {   // text-shadow-red-500: the colour (a shadow is set when none is yet)
    const c = colorOf(tok.slice(12));
    if (c === -2) return false;
    n.tsColor = c; if (n.tsAlpha === 0) { n.tsX = 1; n.tsY = 1; n.tsAlpha = 110; }
    return true;
  }
  if (tok === 'select-text' || tok === 'select-all') { n.selectable = true; return true; }
  if (tok === 'select-none' || tok === 'select-auto') { n.selectable = false; return true; }
  if (tok === 'whitespace-normal' || tok === 'text-wrap') { n.ws = 0; return true; }
  if (tok === 'whitespace-nowrap' || tok === 'text-nowrap') { n.ws = 1; return true; }
  if (tok === 'whitespace-pre') { n.ws = 2; return true; }
  if (tok === 'whitespace-pre-wrap') { n.ws = 3; return true; }
  if (tok === 'break-normal') { n.brk = 0; return true; }
  if (tok === 'break-words') { n.brk = 1; return true; }
  if (tok === 'break-all') { n.brk = 2; return true; }
  if (tok === 'truncate') { n.ws = 1; n.ellipsis = true; return true; }
  if (tok === 'text-ellipsis') { n.ellipsis = true; return true; }
  if (tok === 'text-clip') { n.ellipsis = false; return true; }
  if (tok === 'text-balance') { n.balance = true; return true; }
  if (tok === 'text-justify') { n.talign = 3; return true; }
  if (tok === 'line-clamp-none') { n.clamp = 0; return true; }
  if (tok.startsWith('line-clamp-')) {
    const v = parseInt(tok.slice(11), 10);
    if (!(v >= 1) || `${v}` !== tok.slice(11)) return false;
    n.clamp = v; n.ellipsis = true;
    return true;
  }
  if (tok === 'sr-only') { n.abs = true; n.left = 0; n.top = 0; n.w = 1; n.h = 1; n.wFrac = 0; n.hFrac = 0; n.fullW = false; n.fullH = false; n.overflow = true; n.noPointer = true; n.invisible = true; return true; }
  if (tok === 'uppercase') { n.transform = 1; return true; }
  if (tok === 'lowercase') { n.transform = 2; return true; }
  if (tok === 'capitalize') { n.transform = 3; return true; }
  if (tok === 'normal-case') { n.transform = 0; return true; }
  if (tok === 'underline') { n.deco = n.deco | 1; return true; }
  if (tok === 'line-through') { n.deco = n.deco | 2; return true; }
  if (tok === 'overline') { n.deco = n.deco | 4; return true; }
  if (tok === 'no-underline') { n.deco = 0; return true; }
  if (tok === 'align-baseline') { n.vshift = 0; return true; }
  if (tok === 'align-super') { n.vshift = -0.35; return true; }
  if (tok === 'align-sub') { n.vshift = 0.2; return true; }
  if (tok.startsWith('word-') || tok.startsWith('-word-')) {   // word-4, word-[3px], -word-1: extra px after every space
    const neg = tok.startsWith('-');
    let t = tok.slice(neg ? 6 : 5);
    if (t.startsWith('[') && t.endsWith(']')) { t = t.slice(1, t.length - 1); if (t.endsWith('px')) t = t.slice(0, t.length - 2); }
    const v = parseInt(t, 10);
    if (!(v >= 0) || `${v}` !== t) return false;
    n.wordSp = neg ? -v : v;
    return true;
  }
  if (tok === 'not-italic') { n.italic = false; return true; }
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
  if (tok === 'transition-colors' || tok === 'transition-all') { if (n.it.transMs === 0) n.ownIt().transMs = 150; return true; }
  if (tok.startsWith('duration-')) { n.ownIt().transMs = parseFloat(tok.slice(9)); return true; }
  if (tok === 'shadow-none') { n.shadowLevel = 0; return true; }
  if (tok === 'shadow-sm') { n.shadowLevel = 1; return true; }
  if (tok === 'shadow') { n.shadowLevel = 2; return true; }
  if (tok === 'shadow-md') { n.shadowLevel = 3; return true; }
  if (tok === 'shadow-lg') { n.shadowLevel = 4; return true; }
  if (tok === 'shadow-xl') { n.shadowLevel = 5; return true; }
  if (tok === 'border') { n.borderW = 1; return true; }
  if (tok.startsWith('rounded-') && 'tblr'.indexOf(tok.slice(8, 9)) >= 0 && (tok.length === 9 || tok.slice(9, 10) === '-' || ('lr'.indexOf(tok.slice(9, 10)) >= 0 && tok.slice(8, 9) !== 'l' && tok.slice(8, 9) !== 'r' && (tok.length === 10 || tok.slice(10, 11) === '-')))) {
    // rounded-t-lg, rounded-tl, rounded-br-xl: the corners of one side or one corner
    const two = 'lr'.indexOf(tok.slice(9, 10)) >= 0 && tok.length >= 10 && tok.slice(8, 9) !== 'l' && tok.slice(8, 9) !== 'r';
    const sd = tok.slice(8, two ? 10 : 9), rest = tok.slice(two ? 11 : 10);
    const i = RADII.indexOf(rest);
    const rv = i >= 0 ? RADIUS_PX[i] : rest === '' ? RADIUS_PX[2] : num(rest);
    if (rv !== rv) return false;
    if (sd === 't' || sd === 'tl' || sd === 'l') n.ownBd().crTL = rv;
    if (sd === 't' || sd === 'tr' || sd === 'r') n.ownBd().crTR = rv;
    if (sd === 'b' || sd === 'br' || sd === 'r') n.ownBd().crBR = rv;
    if (sd === 'b' || sd === 'bl' || sd === 'l') n.ownBd().crBL = rv;
    return true;
  }
  if (tok === 'rounded' || tok.startsWith('rounded-')) {
    const k = tok === 'rounded' ? '' : tok.slice(8);
    const i = RADII.indexOf(k);
    const rv = i >= 0 ? RADIUS_PX[i] : num(k);
    if (rv !== rv) return false;
    n.radius = rv;
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
  if (tok === 'border-solid') { n.ownBd().borderStyle = 0; return true; }
  if (tok === 'border-dashed') { n.ownBd().borderStyle = 1; return true; }
  if (tok === 'border-dotted') { n.ownBd().borderStyle = 2; return true; }
  if (tok.startsWith('border-') && tok.length > 9 && tok.slice(8, 9) === '-' && 'trblxy'.indexOf(tok.slice(7, 8)) >= 0 && colorOf(tok.slice(9)) !== -2) {   // border-t-red-500: the colour of one side
    const sd = tok.slice(7, 8), c = colorOf(tok.slice(9));
    if (n.borderW === 0 && n.bd.bT < 0 && n.bd.bR < 0 && n.bd.bB < 0 && n.bd.bL < 0) n.borderW = -1;
    if (sd === 't' || sd === 'y') n.ownBd().bcT = c;
    if (sd === 'b' || sd === 'y') n.ownBd().bcB = c;
    if (sd === 'l' || sd === 'x') n.ownBd().bcL = c;
    if (sd === 'r' || sd === 'x') n.ownBd().bcR = c;
    return true;
  }
  if (tok.startsWith('border-') && (tok.length === 8 || tok.slice(8, 9) === '-') && 'trblxy'.indexOf(tok.slice(7, 8)) >= 0) {
    const sd = tok.slice(7, 8), bw = tok.length === 8 ? 1 : borderPx(tok.slice(9));
    if (bw !== bw) return false;
    if (n.borderW < 0) n.borderW = 0;  // a color token alone no longer implies all four sides
    if (sd === 't' || sd === 'y') n.ownBd().bT = bw;
    if (sd === 'b' || sd === 'y') n.ownBd().bB = bw;
    if (sd === 'l' || sd === 'x') n.ownBd().bL = bw;
    if (sd === 'r' || sd === 'x') n.ownBd().bR = bw;
    return true;
  }
  if (tok.startsWith('border-')) {
    const k = tok.slice(7);
    const c = colorOf(k);
    if (c !== -2) { n.borderColor = c; n.borderAlpha = alphaOf(k); if (n.borderW === 0 && n.bd.bT < 0 && n.bd.bR < 0 && n.bd.bB < 0 && n.bd.bL < 0) n.borderW = -1; return true; }  // -1: 1px unless a side is set
    n.borderW = borderPx(k);
    return true;
  }
  if (tok.startsWith('translate-') || tok.startsWith('-translate-')) {   // translate-x-2, -translate-y-1, translate-y-[3px]
    const neg = tok.startsWith('-'), r = tok.slice(neg ? 11 : 10);
    if (r.length < 3 || r.slice(1, 2) !== '-' || (r.slice(0, 1) !== 'x' && r.slice(0, 1) !== 'y')) return false;
    const v = num(r.slice(2));
    if (v !== v) return false;
    if (r.slice(0, 1) === 'x') n.tx = neg ? -v : v; else n.ty = neg ? -v : v;
    return true;
  }
  if (tok.startsWith('opacity-')) { n.opacity = parseFloat(tok.slice(8)) / 100; return true; }
  if (tok.startsWith('text-')) {
    const k = tok.slice(5);
    const i = TEXT_PX.indexOf(k);
    if (i >= 0) { n.size = rootFont === 16 ? TEXT_SIZE[i] : Math.round(TEXT_SIZE[i] * rootFont / 16); n.leading = rootFont === 16 ? TEXT_LEAD[i] : Math.round(TEXT_LEAD[i] * rootFont / 16); return true; }
    if (k.startsWith('[') && !k.startsWith('[#') && !k.startsWith('[rgb') && !k.startsWith('[hsl') && !k.startsWith('[var(')) { n.size = Math.round(num(k)); n.leading = 0; return true; }
    const c = colorOf(k);
    if (c === -2) return false;
    if (c !== -3) { n.fg = c; n.fgAlpha = alphaOf(k); }   // text-current: the colour it already has
    return true;
  }
  if (tok.startsWith('leading-')) { n.leading = Math.round(num(tok.slice(8))); return true; }
  if (tok.startsWith('gap-')) {
    const gx = tok.startsWith('gap-x-'), gy = tok.startsWith('gap-y-');
    const g = num(tok.slice(gx || gy ? 6 : 4));
    if (g !== g) return false;
    if (gx) n.gapX = Math.round(g); else if (gy) n.gapY = Math.round(g); else n.gap = Math.round(g);
    return true;
  }
  if (tok.startsWith('min-') || tok.startsWith('max-')) {   // min-w-0, max-w-md, max-h-[300px], min-h-screen
    const mn = tok.startsWith('min-'), axis = tok.slice(4, 5), k = tok.slice(6);
    if ((axis !== 'w' && axis !== 'h') || tok.slice(5, 6) !== '-' || k === '') return false;
    let v: number = -2;
    if (k === 'full' || k === 'none') v = -1;   // no limit: the parent already bounds the box
    else if (k === 'screen') v = axis === 'w' ? width() : height();
    else { const i = MAX_NAMES.indexOf(k); v = i >= 0 ? MAX_PX[i] : num(k); }
    if (v !== v || v === -2) return false;
    const iv = Math.round(v);
    if (axis === 'w') { if (mn) n.minW = iv; else n.maxW = iv; } else { if (mn) n.minH = iv; else n.maxH = iv; }
    if (k === 'screen') n.responsive = true;
    return true;
  }
  if (tok.startsWith('aspect-')) {
    const k = tok.slice(7);
    if (k === 'auto') n.aspect = 0;
    else if (k === 'square') n.aspect = 1;
    else if (k === 'video') n.aspect = 16 / 9;
    else if (k.startsWith('[') && k.indexOf('/') > 0) { const pr = k.slice(1, k.length - 1).split('/'); const a = parseFloat(pr[0]) / parseFloat(pr[1]); if (a !== a || a <= 0) return false; n.aspect = a; }
    else return false;
    return true;
  }
  if (tok === 'w-screen') { n.w = width(); n.wFrac = 0; n.fullW = false; n.responsive = true; return true; }
  if (tok === 'h-screen') { n.h = height(); n.hFrac = 0; n.fullH = false; n.responsive = true; return true; }
  if (tok.startsWith('size-')) { const v = num(tok.slice(5)); if (v !== v) return false; n.w = Math.round(v); n.h = Math.round(v); return true; }
  if (tok.startsWith('top-')) { const v = num(tok.slice(4)); if (v !== v) return false; n.top = Math.round(v); return true; }
  if (tok.startsWith('left-')) { const v = num(tok.slice(5)); if (v !== v) return false; n.left = Math.round(v); return true; }
  if (tok.startsWith('right-')) { const v = num(tok.slice(6)); if (v !== v) return false; n.right = Math.round(v); return true; }
  if (tok.startsWith('bottom-')) { const v = num(tok.slice(7)); if (v !== v) return false; n.bottom = Math.round(v); return true; }
  if (tok.startsWith('w-')) { const k = tok.slice(2); const f = k.startsWith('[') && k.endsWith('%]') ? parseFloat(k.slice(1, k.length - 2)) / 100 : k.indexOf('/') > 0 ? num(k) : -1, v = f >= 0 || f !== f ? f : num(k); if (v !== v) return false; if (f >= 0) n.wFrac = f; else n.w = Math.round(v); return true; }
  if (tok.startsWith('h-')) { const k = tok.slice(2); const f = k.startsWith('[') && k.endsWith('%]') ? parseFloat(k.slice(1, k.length - 2)) / 100 : k.indexOf('/') > 0 ? num(k) : -1, v = f >= 0 || f !== f ? f : num(k); if (v !== v) return false; if (f >= 0) n.hFrac = f; else n.h = Math.round(v); return true; }
  // negative margins: -m-2, -mt-4, -mx-1; auto margins: m-auto, mx-auto, ml-auto...
  const neg = tok.startsWith('-');
  const body = neg ? tok.slice(1) : tok;
  const dash = body.indexOf('-');
  if (dash > 0 && body.slice(0, 1) === 'm' && body.length - dash > 1) {
    const pre = body.slice(0, dash), val = body.slice(dash + 1);
    if (pre === 'm' || pre === 'mx' || pre === 'my' || pre === 'mt' || pre === 'mr' || pre === 'mb' || pre === 'ml') {
      if (val === 'auto') {
        if (neg) return false;
        const w = pre.slice(1);
        if (w === '' || w === 'x' || w === 'l') n.mAuto = n.mAuto | 1;
        if (w === '' || w === 'x' || w === 'r') n.mAuto = n.mAuto | 2;
        if (w === '' || w === 'y' || w === 't') n.mAuto = n.mAuto | 4;
        if (w === '' || w === 'y' || w === 'b') n.mAuto = n.mAuto | 8;
        return true;
      }
      const fv = num(val);
      if (fv !== fv) return false;
      const v: i32 = Math.round(fv);
      side(n, pre.slice(1), neg ? -v : v, true);
      return true;
    }
  }
  if (neg) return false;
  if (dash > 0) {
    const pre = tok.slice(0, dash);
    const fv = num(tok.slice(dash + 1));
    const v: i32 = Math.round(fv);
    if (fv !== fv && (pre === 'p' || pre === 'px' || pre === 'py' || pre === 'pt' || pre === 'pr' || pre === 'pb' || pre === 'pl' || pre === 'm' || pre === 'mx' || pre === 'my' || pre === 'mt' || pre === 'mr' || pre === 'mb' || pre === 'ml')) return false;
    if (pre === 'p' || pre === 'px' || pre === 'py' || pre === 'pt' || pre === 'pr' || pre === 'pb' || pre === 'pl') { side(n, pre.slice(1), v, false); return true; }
    if (pre === 'm' || pre === 'mx' || pre === 'my' || pre === 'mt' || pre === 'mr' || pre === 'mb' || pre === 'ml') { side(n, pre.slice(1), v, true); return true; }
  }
  return false;
}
function resetStyle(n: UiNode): void {
  n.media = 0; n.container = false; n.ov = null;
  const fresh = new UiNode(n.tag);
  defaults(fresh);
  n.row = false; n.wrap = false; n.justify = fresh.justify; n.align = fresh.align; n.grow = 0; n.shrink = -1; n.basis = -1; n.basisFrac = 0; n.order = 0; n.selfAlign = -1; n.alignContent = -1; n.reverse = false;
  n.pt = fresh.pt; n.pr = fresh.pr; n.pb = fresh.pb; n.pl = fresh.pl; n.mt = 0; n.mr = 0; n.mb = 0; n.ml = 0; n.gap = 0; n.gapX = -1; n.gapY = -1; n.mAuto = 0;
  n.w = -1; n.h = -1; n.wFrac = 0; n.hFrac = 0; n.fullW = false; n.fullH = false; n.minW = -1; n.maxW = -1; n.minH = -1; n.maxH = -1; n.aspect = 0;
  n.abs = false; n.top = UNSET; n.left = UNSET; n.right = UNSET; n.bottom = UNSET; n.hidden = false; n.overflow = n.tag === SCROLL; n.scroll = n.tag === SCROLL ? 1 : 0;
  n.bg = fresh.bg; n.bgAlpha = 255; n.grad = 0; n.gradFrom = -1; n.gradTo = -1; n.radius = 0; n.borderW = 0; n.shadowLevel = 0; n.shX = 0; n.shY = 0; n.shBlur = 0; n.shColor = 0; n.shOpacity = 0;
  n.tx = 0; n.ty = 0; n.k = 1; n.tf = null; n.z = 0; n.invisible = false; n.noPointer = false; n.rel = false; n.sticky = false; n.borderColor = fresh.borderColor; n.borderAlpha = 255; n.fgAlpha = 255;
  n.opacity = 1; n.fg = fresh.fg; n.size = 16; n.bold = false; n.weight = 0; n.italic = false; n.transform = 0; n.tsX = 0; n.tsY = 0; n.tsColor = -1; n.tsAlpha = 0; n.selBg = -1; n.selectable = false; n.group = false; n.peer = false; n.ws = 0; n.brk = 0; n.clamp = 0; n.ellipsis = false; n.balance = false; n.deco = 0; n.wordSp = 0; n.vshift = 0; n.family = 'sans'; n.tracking = 0; n.letterSpace = UNSET; n.talign = 0; n.leading = 0;
  n.cursor = -1;
  n.rg = DEF_RINGX; n.bd = DEF_BORDERX; n.sn = DEF_SNAPX;   // the cold records: back to the shared defaults
  if (n.it !== DEF_INTERX) { const o = n.it; o.focusBg = -1; o.activeBg = -1; o.focusFg = -1; o.activeFg = -1; o.transMs = 0; o.hoverBg = -1; o.hoverFg = -1; o.hoverBorder = -1; o.focusBorder = -1; o.withinBg = -1; o.withinFg = -1; o.withinBorder = -1; }   // curBg, fromBg and transStart stay: a transition goes on across a class change
  if (n.ed !== null) { n.borderW = fresh.borderW; n.borderColor = fresh.borderColor; n.radius = fresh.radius; n.size = fresh.size; n.overflow = true; }
}
export function setClass(h: i32, cls: string): void {
  const n = node(h);
  if (n.cls === cls) return;
  n.cls = cls;
  rebuildStyle(n);
  if (n.ed !== null) (n.ed as Edit).rowsW = -1;  // the font may have changed
  layoutDirty = true;
}
function sheetNumber(n: UiNode, key: string, id: i32, value: number): void {
  if (id >= 0) { applyProp(n, id, key, value); return; }   // a numeric property: no string work
  const colon = key.indexOf(':');
  if (key.startsWith('@') && colon > 0) {
    const c = parseHex(key.slice(colon + 1)), prop = key.slice(1, colon);
    if (prop === 'backgroundColor') n.bg = c; else if (prop === 'color') n.fg = c; else if (prop === 'shadowColor') n.shColor = c;
    else if (prop === 'borderColor') n.borderColor = c; else applyProp(n, propId(prop), prop, c);   // the side colours
    paintDirty = true; return;
  }
  applyToken(n, key.slice(1), '');
}
function rebuildStyle(n: UiNode): void {
  resetStyle(n);
  envUsed = false; varUsed = false;
  for (const c of n.cls.split(' ')) if (c.length > 0) applyToken(n, c, '');
  if (envUsed) n.media = n.media | 8;
  if (varUsed) n.media = n.media | 16;
  for (let i = 0; i < n.sheetKeys.length; i++) sheetNumber(n, n.sheetKeys[i], n.sheetIds[i], n.sheetVals[i]);
  for (let i = 0; i < n.styleKeys.length; i++) applyProp(n, n.styleIds[i], n.styleKeys[i], n.styleVals[i]);
  if (n.ed !== null) (n.ed as Edit).rowsW = -1;
  layoutDirty = true;
}
function sheetProperty(key: string): string {
  if (key.startsWith('@font-')) return 'fontFamily';
  if (key.startsWith('@') && key.indexOf(':') > 0) return key.slice(1, key.indexOf(':'));
  if (key === 'widthPercent') return 'width';
  if (key === 'heightPercent') return 'height';
  return key;
}
/** Last layer wins. Cache is bounded by the styles on this node; inline allocations compare by value. */
export function setStyles(h: i32, styles: Style[]): void {
  const n = node(h);
  let same = styles.length === n.sheets.length;
  if (same) for (let i = 0; i < styles.length; i++) if (styles[i] !== n.sheets[i]) same = false;
  if (same) return;
  const keys: string[] = [], vals: number[] = [], ids: i32[] = [];
  // ponytail: linear lookup over the small supported property set; index it if profiling warrants it.
  for (const s of styles) for (let j = 0; j < s.keys.length; j++) {
    const k = s.keys[j];
    // Width in px and in % are the same CSS property; font families likewise replace one another.
    for (let z = keys.length - 1; z >= 0; z--) if (sheetProperty(keys[z]) === sheetProperty(k)) { keys.splice(z, 1); vals.splice(z, 1); ids.splice(z, 1); }
    keys.push(k); vals.push(s.values[j]); ids.push(s.ids[j]);
  }
  n.sheets = styles;
  let shape = keys.length === n.sheetKeys.length;
  if (shape) for (let i = 0; i < keys.length; i++) if (keys[i] !== n.sheetKeys[i]) shape = false;
  if (!shape) {
    // Stateful numeric extensions (e.g. a lazy canvas) also need their reset hook.
    if (n.sheetKeys.indexOf('lazy') >= 0 && keys.indexOf('lazy') < 0) applyNumber(n, 'lazy', 0);
    n.sheetKeys = keys; n.sheetVals = vals; n.sheetIds = ids; rebuildStyle(n); return;
  }
  let changed = false;
  for (let i = 0; i < keys.length; i++) if (vals[i] !== n.sheetVals[i]) {
    n.sheetVals[i] = vals[i];
    sheetNumber(n, keys[i], ids[i], vals[i]);
    changed = true;
  }
  // Reapply all overrides: aliases and shorthands can affect the same property.
  if (changed) for (let i = 0; i < n.styleKeys.length; i++) applyProp(n, n.styleIds[i], n.styleKeys[i], n.styleVals[i]);
}
/** Class validation used by debug builds and tools. */
export function isKnownClass(tok: string): boolean { return applyToken(new UiNode(VIEW), tok, ''); }

// ---------------------------------------------------------------- layout (UI-08)
// Child lists of the layout passes: one per depth of the recursion, emptied and reused (a relayout allocates none).
const mKids: UiNode[][] = [], mAbs: UiNode[][] = [], pKids: UiNode[][] = [], pAbs: UiNode[][] = [];
let mDepth: i32 = 0, pDepth: i32 = 0;
function pooled(pool: UiNode[][], d: i32): UiNode[] {
  if (pool.length <= d) pool.push([]);
  const a = pool[d];
  a.length = 0;
  return a;
}
function flat(n: UiNode, out: UiNode[], wantAbs: boolean): void {
  for (const h of n.children) {
    const c = node(h);
    if (c.hidden || c.layer || c.leaving) continue;
    if (c.tag === FRAGMENT) flat(c, out, wantAbs);
    else if (c.abs === wantAbs) out.push(c);
  }
}
/** Text color: the node's own, else the nearest ancestor's (any element), like CSS `color`. */
export function textFgAlpha(h: i32): i32 {
  let q = h;
  while (q >= 0 && nodes[q].fg < 0) q = nodes[q].parent;
  return q >= 0 ? nodes[q].fgAlpha : 255;
}
/** The lines of a text node at its last layout and the font they were measured with (ZN-284.01: the host engine's lines are checked against these). */
export function textLines(h: i32): string[] { if (layoutDirty) layout(); return node(h).lines; }
export function textFont(h: i32): i32 { if (layoutDirty) layout(); return node(h).fontId; }
export function textFg(h: i32): i32 {
  let q = h;
  while (q >= 0 && nodes[q].fg < 0) q = nodes[q].parent;
  return q >= 0 ? nodes[q].fg : RN_STYLE ? 0x000000 : 0xffffff;   // React Native's text is black by default (ZN-367.01)
}
/** Text inherits size and weight from its parent text node. */
function inheritText(n: UiNode): void {
  if (n.parent < 0) return;
  let p = n.parent;
  while (p >= 0 && nodes[p].tag === FRAGMENT) p = nodes[p].parent;
  if (p >= 0 && nodes[p].tag === TEXT && n.cls === '\u0000') { const t = nodes[p]; n.size = t.size; n.bold = t.bold; n.weight = t.weight; n.italic = t.italic; n.transform = t.transform; n.tsX = t.tsX; n.tsY = t.tsY; n.tsColor = t.tsColor; n.tsAlpha = t.tsAlpha; n.ws = t.ws; n.brk = t.brk; n.clamp = t.clamp; n.ellipsis = t.ellipsis; n.balance = t.balance; n.deco = t.deco; n.wordSp = t.wordSp; n.vshift = t.vshift; n.family = t.family; n.tracking = t.tracking; n.leading = t.leading; }
}
const WEIGHT_FACE: string[] = ['Thin', 'ExtraLight', 'Light', '', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'];   // 100..900 ('' is the family file itself)
/** The baked face of one family for a weight: the nearest weight the family has (lighter first below 600, heavier first from 600), italic = the real Italic face or the baked slant (Name~i). -1: none. */
function familyFace(fam: string, weight: i32, italic: boolean, px: i32): i32 {
  const want = Math.max(0, Math.min(8, Math.round(weight / 100) - 1));
  for (let k = 0; k < 9; k++) {
    for (let s = 0; s < 2; s++) {
      const up = weight >= 600 ? s === 0 : s === 1;
      const i = up ? want + k : want - k;
      if (i < 0 || i > 8 || (k === 0 && s === 1)) continue;
      const name = fam === 'sans' ? (i >= 5 ? 'sans-bold' : i === 3 ? 'sans' : '') : WEIGHT_FACE[i] === '' ? fam : fam + '-' + WEIGHT_FACE[i];
      if (name === '') continue;
      if (italic) {
        let f = font(fam + (i >= 5 ? '-BoldItalic' : '-Italic'), px);
        if (f < 0) f = font(name + '~i', px);
        if (f >= 0) return f;
      }
      const f = font(name, px);
      if (f >= 0) return f;
    }
  }
  return -1;
}
/** font-[A,B,C]: the first family of the list that has a face wins; the built-in sans is the last resort. */
function faceOf(n: UiNode, px: i32): i32 {
  const w = n.weight > 0 ? n.weight : n.bold ? 700 : 400;
  if (n.family.indexOf(',') < 0) { const f = familyFace(n.family, w, n.italic, px); if (f >= 0) return f; }
  else for (const fam of n.family.split(',')) { const f = familyFace(fam.trim(), w, n.italic, px); if (f >= 0) return f; }
  return familyFace('sans', w, n.italic, px);
}
function fontOf(n: UiNode): i32 {
  n.fontId = faceOf(n, n.size);
  return n.fontId;
}
function lineHeightOf(n: UiNode): number { return n.leading > 0 ? n.leading : Math.round(n.size * 1.4); }
function trackPx(n: UiNode): number { return n.tracking * n.size; }
function shownText(n: UiNode): string {
  if (n.transform === 1) return n.text.toUpperCase();
  if (n.transform === 2) return n.text.toLowerCase();
  if (n.transform === 3) {
    let out = '', start = true;
    for (let i = 0; i < n.text.length; i++) { const c = n.text.slice(i, i + 1); out += start ? c.toUpperCase() : c; start = c === ' ' || c === '\n'; }
    return out;
  }
  return n.text;
}
function spaces(s: string): i32 { let k = 0; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 32) k++; return k; }
function lineWidth(n: UiNode, f: i32, s: string, tr: number): number { return textWidth(f, s, tr) + (n.wordSp !== 0 ? n.wordSp * spaces(s) : 0); }
/** Greedy wrap of one paragraph (break-words splits a word wider than the line, break-all breaks anywhere). */
function wrapPara(n: UiNode, f: i32, tr: number, text: string, avail: number, limit: i32): string[] {   // limit > 0: stops once there are more than `limit` lines (the caller only needs to know that there are more)
  const out: string[] = [];
  if (lineWidth(n, f, text, tr) <= avail || avail <= n.size) { out.push(text); return out; }
  let line = '';
  if (n.brk === 2) {
    for (let i = 0; i < text.length; i++) {
      const c = text.slice(i, i + 1), cand = line + c;
      if (lineWidth(n, f, cand, tr) > avail && line.length > 0) { out.push(line); line = c; if (limit > 0 && out.length > limit) return out; } else line = cand;
    }
  } else for (const word of text.split(' ')) {
    const cand = line.length === 0 ? word : line + ' ' + word;
    if (lineWidth(n, f, cand, tr) > avail && line.length > 0) { out.push(line); line = word; if (limit > 0 && out.length > limit) return out; }
    else line = cand;
    if (n.brk === 1) while (line.length > 1 && lineWidth(n, f, line, tr) > avail) {
      let k = line.length - 1;
      while (k > 1 && lineWidth(n, f, line.slice(0, k), tr) > avail) k--;
      out.push(line.slice(0, k)); line = line.slice(k);
    }
  }
  if (line.length > 0 || out.length === 0) out.push(line);
  return out;
}
/** `line` cut so that it and the ellipsis fit `avail`. */
function ellipsize(n: UiNode, f: i32, tr: number, line: string, avail: number): string {
  let lo = 0, hi = line.length;   // the largest k whose cut and ellipsis fit (the width never shrinks as k grows): a binary search instead of one slice per character
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineWidth(n, f, line.slice(0, mid).trimEnd() + '\u2026', tr) > avail) hi = mid - 1; else lo = mid;
  }
  return line.slice(0, lo).trimEnd() + '\u2026';
}
/** Word wrap with the baked font metrics (UI-10), white-space, break, line-clamp, ellipsis and balance (ZN-269). */
/** What the lines of a text node were computed from: when none of it changed, the last lines are still right (a relayout of an unchanged page wraps nothing). */
class WrapKey {
  avail: number = -1; f: i32 = -2; tr: number = 0; ws: i32 = 0; brk: i32 = 0; clamp: i32 = 0; flags: i32 = 0; wordSp: number = 0; transform: i32 = 0; size: i32 = 0; text: string = '';
}
function wrapText(n: UiNode, maxW: number): void {
  const f = fontOf(n), tr = trackPx(n);
  const avail = maxW - n.pl - n.pr;
  const flags = (n.ellipsis ? 1 : 0) | (n.balance ? 2 : 0);
  let k = n.wk;
  if (k !== null) {
    const c = k as WrapKey;
    if (c.avail === avail && c.f === f && c.tr === tr && c.ws === n.ws && c.brk === n.brk && c.clamp === n.clamp && c.flags === flags && c.wordSp === n.wordSp && c.transform === n.transform && c.size === n.size && c.text === n.text) return;
  } else { k = new WrapKey(); n.wk = k; }
  { const c = k as WrapKey; c.avail = avail; c.f = f; c.tr = tr; c.ws = n.ws; c.brk = n.brk; c.clamp = n.clamp; c.flags = flags; c.wordSp = n.wordSp; c.transform = n.transform; c.size = n.size; c.text = n.text; }
  n.lines = [];
  n.lineW = [];
  const text = shownText(n);
  let lines: string[] = [];
  if (n.ws === 0 && n.brk === 0 && n.clamp === 0 && !n.ellipsis && !n.balance) lines = wrapPara(n, f, tr, text, avail, 0);
  else {
    const paras = n.ws >= 2 ? text.split('\n') : [text];
    const cut = n.clamp > 0 && !n.balance;   // a clamp without balance needs one line more than the clamp, no more
    for (const para of paras) {
      if (cut && lines.length > n.clamp) break;
      if (n.ws === 1 || n.ws === 2) lines.push(para);
      else if (paras.length === 1) lines = wrapPara(n, f, tr, para, avail, cut ? n.clamp : 0);
      else for (const l of wrapPara(n, f, tr, para, avail, cut ? n.clamp + 1 - lines.length : 0)) lines.push(l);
    }
    if (n.balance && lines.length > 1 && lines.length <= 6 && n.ws !== 1 && n.ws !== 2) {   // like Chrome, only short blocks are balanced (the search wraps the paragraph a dozen times)   // the narrowest width that keeps the line count
      let lo = 0, hi = avail;
      const want = lines.length;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        let k = 0;
        for (const para of paras) { if (k > want) break; k += wrapPara(n, f, tr, para, mid, want + 1 - k).length; }
        if (k <= want) hi = mid; else lo = mid;
      }
      lines = [];
      for (const para of paras) for (const l of wrapPara(n, f, tr, para, hi, 0)) lines.push(l);
    }
    if (n.clamp > 0 && lines.length > n.clamp) {
      lines = lines.slice(0, n.clamp);
      lines[n.clamp - 1] = ellipsize(n, f, tr, lines[n.clamp - 1], avail);
    } else if (n.ellipsis && (n.ws === 1 || n.ws === 2 || n.clamp === 1)) {
      for (let i = 0; i < lines.length; i++) if (lineWidth(n, f, lines[i], tr) > avail && avail > n.size) lines[i] = ellipsize(n, f, tr, lines[i], avail);
    }
  }
  for (const l of lines) { n.lines.push(l); n.lineW.push(lineWidth(n, f, l, tr)); }
}
/** One text line, with word spacing and justification (the free width of the line goes to the spaces). */
function drawLine(n: UiNode, f: i32, tx: number, ty: number, line: string, fg: i32, alpha: i32, jx: number, kk: number): void {
  if (n.wordSp === 0 && jx === 0) { drawText(f, tx, ty, line, fg, alpha, trackPx(n)); return; }
  let cx = tx;
  const sp = textWidth(f, ' ', trackPx(n)) + (n.wordSp + jx) * kk;
  for (const word of line.split(' ')) { if (word.length > 0) drawText(f, cx, ty, word, fg, alpha, trackPx(n)); cx += textWidth(f, word, trackPx(n)) + sp; }
}
/** The size a node ends with: its width and height inside min/max, and aspect-ratio filling the side that is not set. */
let csW: number = 0, csH: number = 0;
function constrainSize(c: UiNode, w: number, h: number): void {
  if (c.maxW >= 0 && w > c.maxW) w = c.maxW;
  if (c.minW >= 0 && w < c.minW) w = c.minW;
  if (c.aspect > 0 && c.h < 0 && c.hFrac === 0 && !c.fullH) h = Math.round(w / c.aspect);
  else if (c.aspect > 0 && c.w < 0 && c.wFrac === 0 && !c.fullW) w = Math.round(h * c.aspect);
  if (c.maxH >= 0 && h > c.maxH) h = c.maxH;
  if (c.minH >= 0 && h < c.minH) h = c.minH;
  csW = w; csH = h;
}
/** `order`: a stable sort of the children of one container (only when some child has an order). */
function orderKids(kids: UiNode[]): void {
  let any = false;
  for (const c of kids) if (c.order !== 0) { any = true; break; }
  if (!any) return;
  for (let i = 1; i < kids.length; i++) {
    const c = kids[i];
    let j = i - 1;
    while (j >= 0 && kids[j].order > c.order) { kids[j + 1] = kids[j]; j--; }
    kids[j + 1] = c;
  }
}
/** flex-basis replaces the measured main size of a child (px, or a fraction of the container's main size). */
function applyBasis(c: UiNode, row: boolean, mainAvail: number): void {
  if (c.basis < 0 && c.basisFrac <= 0) return;
  const b: number = c.basis >= 0 ? c.basis : Math.round(mainAvail * c.basisFrac);
  if (row) c.lw = Math.max(b, c.pl + c.pr); else c.lh = Math.max(b, c.pt + c.pb);   // a box is never smaller than its padding (CSS border-box)
}
function gapMain(n: UiNode): number { return n.row ? (n.gapX >= 0 ? n.gapX : n.gap) : (n.gapY >= 0 ? n.gapY : n.gap); }
function gapCross(n: UiNode): number { return n.row ? (n.gapY >= 0 ? n.gapY : n.gap) : (n.gapX >= 0 ? n.gapX : n.gap); }
function outerW(c: UiNode): number { return c.lw + c.ml + c.mr; }
function outerH(c: UiNode): number { return c.lh + c.mt + c.mb; }
let pctBase: number = -1;   // the width a percent width is taken of: the container's content width, whatever margins the child has (CSS)
function measure(n: UiNode, maxW: number, maxH: number): void {
  const ownW: number = n.w >= 0 ? n.w : n.wFrac > 0 ? Math.round((pctBase >= 0 ? pctBase : maxW) * n.wFrac) : -1;
  pctBase = -1;
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
    const kids = pooled(mKids, mDepth), abs = pooled(mAbs, mDepth);
    mDepth++;
    flat(n, kids, false);
    orderKids(kids);
    const inner: number = (ownW >= 0 ? ownW : maxW) - n.pl - n.pr;
    const innerH: number = (n.scroll & 1) !== 0 ? 1000000 : (ownH >= 0 ? ownH : maxH) - n.pt - n.pb;
    const mainAvail: number = n.row ? inner : innerH;
    let main: number = 0, cross: number = 0, lineMain: number = 0, lineCross: number = 0;
    let count: i32 = 0;
    const gm = gapMain(n), gc = gapCross(n);
    // aspect-ratio children whose width comes from the line (grow in a row, stretch in a column): their height follows that width, so it counts in the container's size
    let aspects = false;
    for (const c of kids) if (c.aspect > 0 && c.h < 0 && c.hFrac === 0 && !c.fullH) aspects = true;
    let growSum: number = 0, growUsed: number = 0;
    if (aspects && n.row) {
      let cnt: i32 = 0;
      for (const c of kids) {
        measure(c, inner, innerH);
        applyBasis(c, true, mainAvail);
        growUsed += outerW(c) + (cnt > 0 ? gm : 0); cnt++;
        growSum += c.grow > 0 ? c.grow : c.fullW ? 1 : 0;
      }
    }
    const growFree: number = growSum > 0 ? Math.max(0, inner - growUsed) : 0;
    for (const c of kids) {
      pctBase = n.row ? -1 : inner;
      measure(c, n.row ? inner : inner - c.ml - c.mr, innerH);
      applyBasis(c, n.row, mainAvail);
      if (aspects && c.aspect > 0 && c.h < 0 && c.hFrac === 0 && !c.fullH) {
        const g: number = c.grow > 0 ? c.grow : c.fullW ? 1 : 0;
        const fw: number = n.row ? c.lw + (growSum > 0 ? growFree * g / growSum : 0) : (c.w < 0 && c.wFrac === 0 && (n.align === 3 || c.fullW) ? inner - c.ml - c.mr : c.lw);
        constrainSize(c, Math.round(fw), c.lh);
        c.lh = csH;
      }
      const cm = n.row ? outerW(c) : outerH(c), cc = n.row ? outerH(c) : outerW(c);
      if (n.wrap && count > 0 && lineMain + gm + cm > mainAvail) {
        if (lineMain > main) main = lineMain;
        cross += lineCross + gc;
        lineMain = 0;
        lineCross = 0;
        count = 0;
      }
      lineMain += (count > 0 ? gm : 0) + cm;
      if (cc > lineCross) lineCross = cc;
      count++;
    }
    if (lineMain > main) main = lineMain;
    cross += lineCross;
    n.lw = (n.row ? main : cross) + n.pl + n.pr;
    n.lh = (n.row ? cross : main) + n.pt + n.pb;
    flat(n, abs, true);
    for (const c of abs) measure(c, inner, innerH);
    mDepth--;
  }
  if (n.scroll !== 0) {
    // the viewport is sized by its constraints (grow / full / fixed), the content keeps its natural size
    n.contentW = n.lw; n.contentH = n.lh;
    if (n.virt !== null) { const v = n.virt as Virtual; n.contentH = (v.variable ? fwPrefix(v, v.count) : v.count * v.itemH) + n.pt + n.pb; }
    if ((n.scroll & 1) !== 0) n.lh = ownH >= 0 ? ownH : n.fullH || n.grow > 0 ? 0 : Math.min(n.contentH, maxH);
    if ((n.scroll & 2) !== 0) n.lw = ownW >= 0 ? ownW : n.fullW || n.grow > 0 ? 0 : Math.min(n.contentW, maxW);
  }
  if (ownW >= 0) n.lw = Math.max(ownW, n.pl + n.pr);
  if (ownH >= 0) n.lh = Math.max(ownH, n.pt + n.pb);
  if (n.maxW >= 0 || n.minW >= 0 || n.maxH >= 0 || n.minH >= 0 || n.aspect > 0) { constrainSize(n, n.lw, n.lh); n.lw = csW; n.lh = csH; }
}
/** The main sizes of the growing items of one line when one of them has a min or max on the main axis (ZN-288), else null (the legacy share runs):
 *  CSS's "resolve flexible lengths" loop, an item clamped by its limit is frozen at it and the others share what is left. */
function growWithLimits(n: UiNode, kids: UiNode[], start: i32, end: i32, free: number, grows: number): number[] | null {
  let limited = false;
  for (let i = start; i < end; i++) {
    const c = kids[i];
    const g = c.grow > 0 ? c.grow : (n.row ? c.fullW : c.fullH) ? 1 : 0;
    if (g > 0 && (n.row ? c.minW >= 0 || c.maxW >= 0 : c.minH >= 0 || c.maxH >= 0)) limited = true;
  }
  if (!limited) return null;
  const size: number[] = [], done: boolean[] = [];
  for (let i = start; i < end; i++) { size.push(n.row ? kids[i].lw : kids[i].lh); done.push(false); }
  let left = free, total = grows;
  for (let round = 0; round <= end - start; round++) {   // each round shares what is left among the unfrozen items, then freezes the clamped ones
    let nextLeft = left, nextTotal = total, clamped = false;
    for (let i = start; i < end; i++) {
      const c = kids[i], k = i - start;
      const g = c.grow > 0 ? c.grow : (n.row ? c.fullW : c.fullH) ? 1 : 0;
      if (g <= 0 || done[k]) continue;
      const lo = n.row ? c.minW : c.minH, hi = n.row ? c.maxW : c.maxH, base = n.row ? c.lw : c.lh;
      const want = base + Math.floor(left * g / total);
      const got = hi >= 0 && want > hi ? hi : lo >= 0 && want < lo ? lo : want;
      size[k] = got;
      if (got !== want) { done[k] = true; clamped = true; nextLeft -= got - base; nextTotal -= g; }
    }
    left = nextLeft; total = nextTotal;
    if (!clamped || total <= 0) break;
  }
  return size;
}
function place(n: UiNode, x: number, y: number, vw: number, vh: number): void {
  if (n.rel) { x += n.left !== UNSET ? n.left : n.right !== UNSET ? -n.right : 0; y += n.top !== UNSET ? n.top : n.bottom !== UNSET ? -n.bottom : 0; }   // position: relative: shifted, the layout around it is not
  n.x = x; n.y = y; n.lw = vw; n.lh = vh;
  if (n.tag === TEXT) {
    // measured at the width offered before grow and stretch were shared out: when it ends wider than the width it was wrapped at and has several lines, its lines
    // are wrapped again to use that width (ZN-287). A box narrower than the lines keeps them: its height was decided by them (re-wrapping would overflow it).
    const k = n.wk;
    if (k !== null && n.lines.length > 1 && vw - n.pl - n.pr > (k as WrapKey).avail + 0.5) wrapText(n, vw);
    return;
  }
  // scroll containers lay their content out at its natural size; the viewport only clips and offsets it
  const w = (n.scroll & 2) !== 0 ? Math.max(vw, n.contentW) : vw, h = (n.scroll & 1) !== 0 ? Math.max(vh, n.contentH) : vh;
  if (n.scroll !== 0) clampScroll(n);
  const kids = pooled(pKids, pDepth), abs = pooled(pAbs, pDepth);
  pDepth++;
  flat(n, kids, false);
  orderKids(kids);
  if (n.reverse) kids.reverse();   // row-reverse / col-reverse: the main axis runs the other way; start and end swap below
  const iw = w - n.pl - n.pr, ih = h - n.pt - n.pb;
  const innerMain = n.row ? iw : ih, innerCross = n.row ? ih : iw;
  const gm = gapMain(n), gc = gapCross(n);
  const jm: i32 = n.reverse ? (n.justify === 0 ? 2 : n.justify === 2 ? 0 : n.justify) : n.justify;
  // align-content: the free space across the lines of a wrapped container (start when unset, the old behaviour)
  let acStart: number = 0, acBetween: number = 0, acStretch: number = 0;
  if (n.wrap && n.alignContent >= 0) {
    const lc: number[] = [];
    let s0: i32 = 0;
    while (s0 < kids.length) {
      let e0: i32 = s0, u0: number = 0, c0: number = 0;
      while (e0 < kids.length) {
        const cm0 = n.row ? outerW(kids[e0]) : outerH(kids[e0]);
        if (e0 > s0 && u0 + gm + cm0 > innerMain) break;
        u0 += (e0 > s0 ? gm : 0) + cm0;
        const cc0 = n.row ? outerH(kids[e0]) : outerW(kids[e0]);
        if (cc0 > c0) c0 = cc0;
        e0++;
      }
      lc.push(c0);
      s0 = e0;
    }
    let total: number = gc * (lc.length - 1);
    for (const v of lc) total += v;
    const freeC = innerCross - total;
    if (freeC > 0 && lc.length > 0) {
      const ac = n.alignContent;
      if (ac === 1) acStart = freeC / 2; else if (ac === 2) acStart = freeC;
      else if (ac === 3) acStretch = freeC / lc.length;
      else if (ac === 4 && lc.length > 1) acBetween = freeC / (lc.length - 1);
      else if (ac === 5) { acBetween = freeC / lc.length; acStart = acBetween / 2; }
      else if (ac === 6) { acBetween = freeC / (lc.length + 1); acStart = acBetween; }
    }
  }
  let start: i32 = 0;
  let crossPos: number = acStart;
  while (start < kids.length) {
    let end: i32 = start;
    let used: number = 0;
    while (end < kids.length) {
      const cm = n.row ? outerW(kids[end]) : outerH(kids[end]);
      if (n.wrap && end > start && used + gm + cm > innerMain) break;
      used += (end > start ? gm : 0) + cm;
      end++;
    }
    let lineCross: number = 0;
    let grows: number = 0;
    for (let i = start; i < end; i++) {
      const c = kids[i];
      const cc = n.row ? outerH(c) : outerW(c);
      if (cc > lineCross) lineCross = cc;
      grows += c.grow > 0 ? c.grow : (n.row ? c.fullW : c.fullH) ? 1 : 0;
    }
    if (!n.wrap) lineCross = innerCross;
    lineCross += acStretch;
    const free = innerMain - used;
    const count = end - start;
    // flex-shrink (opt-in: a child without it never shrinks): the overflow is taken from the children that have it, weighted by shrink x size
    let shrinkTotal: number = 0;
    if (free < 0) for (let i = start; i < end; i++) { const c = kids[i]; if (c.shrink > 0) shrinkTotal += c.shrink * (n.row ? c.lw : c.lh); }
    let pos: number = 0, between: number = gm;
    // auto margins on the main axis take the free space of the line (they win over justify-content, like CSS)
    let autos: i32 = 0;
    if (grows === 0 && free > 0) for (let i = start; i < end; i++) { const am = kids[i].mAuto; if (am !== 0) autos += n.row ? ((am & 1) + ((am >> 1) & 1)) : (((am >> 2) & 1) + ((am >> 3) & 1)); }
    const autoShare: number = autos > 0 ? free / autos : 0;
    if (autos > 0) {}
    else if (grows === 0 && free > 0) {
      if (jm === 1) pos = Math.floor(free / 2);
      else if (jm === 2) pos = free;
      else if (jm === 3 && count > 1) between = gm + free / (count - 1);
      else if (jm === 3 && n.reverse) pos = free;   // one item: space-between is flex-start, which is the far end of a reversed axis
      else if (jm === 4) { between = gm + free / count; pos = between / 2 - gm / 2; }
      else if (jm === 5) { between = gm + free / (count + 1); pos = between - gm; }
    }
    const frozen = grows > 0 && free > 0 ? growWithLimits(n, kids, start, end, free, grows) : null;
    for (let i = start; i < end; i++) {
      const c = kids[i];
      let cm: number = n.row ? c.lw : c.lh;
      const g = c.grow > 0 ? c.grow : (n.row ? c.fullW : c.fullH) ? 1 : 0;
      if (frozen !== null && g > 0) cm = (frozen as number[])[i - start];
      else if (grows > 0 && free > 0 && g > 0) cm += Math.floor(free * g / grows);
      else if (free < 0 && shrinkTotal > 0 && c.shrink > 0) cm = Math.max(0, cm + Math.floor(free * c.shrink * cm / shrinkTotal));
      let cc: number = n.row ? c.lh : c.lw;
      const marginCross = n.row ? c.mt + c.mb : c.ml + c.mr;
      let off: number = 0;
      const al0: i32 = c.selfAlign >= 0 ? c.selfAlign : n.align;   // align-self
      const al: i32 = al0 === 4 ? 2 : al0;   // ponytail: baseline ends at the line's end in classic (Yoga aligns real baselines in rn)
      const stretch = (al === 3 && (n.row ? c.h < 0 && c.hFrac === 0 : c.w < 0 && c.wFrac === 0)) || (n.row ? c.fullH : c.fullW);   // a fixed or percent size on the cross axis wins over the stretch
      const am = c.mAuto;
      const autoCrossStart = (n.row ? (am >> 2) & 1 : am & 1) !== 0, autoCrossEnd = (n.row ? (am >> 3) & 1 : (am >> 1) & 1) !== 0;
      const fullCross = n.row ? c.fullH : c.fullW;   // w-full / h-full fill the line even with auto margins; an implicit stretch gives way to them
      if (stretch && (fullCross || (!autoCrossStart && !autoCrossEnd))) cc = lineCross - marginCross;
      if (c.maxW >= 0 || c.minW >= 0 || c.maxH >= 0 || c.minH >= 0 || c.aspect > 0) {   // the final size (grow, stretch) inside min/max and aspect-ratio
        constrainSize(c, n.row ? cm : cc, n.row ? cc : cm);
        cm = n.row ? csW : csH; cc = n.row ? csH : csW;
      }
      if (autoCrossStart || autoCrossEnd) off = autoCrossStart && autoCrossEnd ? Math.floor((lineCross - cc - marginCross) / 2) : autoCrossStart ? lineCross - cc - marginCross : 0;   // an auto cross margin beats align-items
      else if (!stretch && al === 1) off = Math.floor((lineCross - cc - marginCross) / 2);
      else if (!stretch && al === 2) off = lineCross - cc - marginCross;
      const lead: number = autos > 0 && am !== 0 ? (n.row ? (am & 1) : ((am >> 2) & 1)) * autoShare : 0;
      const trail: number = autos > 0 && am !== 0 ? (n.row ? ((am >> 1) & 1) : ((am >> 3) & 1)) * autoShare : 0;
      if (n.row) place(c, Math.round(x + n.pl + pos + lead + c.ml), Math.round(y + n.pt + crossPos + off + c.mt), cm, cc);
      else place(c, Math.round(x + n.pl + crossPos + off + c.ml), Math.round(y + n.pt + pos + lead + c.mt), cc, cm);
      pos += lead + cm + trail + (n.row ? c.ml + c.mr : c.mt + c.mb) + between;
    }
    crossPos += lineCross + gc + acBetween;
    start = end;
  }
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
  pDepth--;
}
/** The layout engine (ZN-282, docs/reports/layout-engines.md §5): `classic` is the measure and place passes above; a host engine (`rn`, Yoga, next/src/host/layout.h) comes in here with ZN-286. */
function calculate(r: UiNode, w: number, h: number): void {
  if (RN) { rnLayout(r, w, h); return; }
  measure(r, w, h);
  place(r, 0, 0, w, h);
}

// ---------------------------------------------------------------- the rn layout engine (ZN-286): Yoga in the host, zinc.json "ui": {"layout": "rn"}
// Each layout sends the engine what changed since the last one (per node: the values of RN_PROPS, the children, the text), lets it compute (it re-measures only
// what was dirtied), and reads the boxes back as absolute x, y, lw, lh and the text lines. Layers and anchors stay as in classic (they run after `calculate`).
const RN: boolean = UI_LAYOUT === 'rn';
const RN_STYLE: boolean = RN || UI_PRESET === 'react-native';   // React Native's style defaults (black text), in classic too with the preset (ZN-288)
let rnOpen = false;
class RnRec { sent: number[] = []; kids: i32[] = []; text: string = ''; textKey: number[] = []; leaf: i32 = 0; }
// zn::host::LayoutProp numbers; W, H and B are composites: size or percent or full, basis or basis percent
const RN_W: i32 = -1, RN_H: i32 = -2, RN_B: i32 = -3;
const RN_PROPS: i32[] = [RN_W, RN_H, 21, 1012, 22, 23, 24, 1010, 1011, 25, 26, 36, 37, 38, 39, 40, 41, 42, 43, 44, 1009, RN_B, 45, 1013, 1014, 1002, 1003, 1004, 1005, 1006, 48, 1015, 51, 52, 53, 54];
function rnValue(n: UiNode, p: i32): number {
  const inset = n.abs || n.rel;
  if (p === RN_W) return n.fullW ? -2 : n.wFrac > 0 ? -3 - n.wFrac : n.w;
  if (p === RN_H) return n.fullH ? -2 : n.hFrac > 0 ? -3 - n.hFrac : n.h;
  if (p === RN_B) return n.basisFrac > 0 ? -3 - n.basisFrac : n.basis;
  if (p === 21) return n.row ? 1 : 0;
  if (p === 1012) return n.reverse ? 1 : 0;
  if (p === 22) return n.wrap ? 1 : 0;
  if (p === 23) return n.justify;
  if (p === 24) return n.align;
  if (p === 1010) return n.selfAlign;
  if (p === 1011) return n.alignContent;
  if (p === 25) return n.abs ? 1 : 0;
  if (p === 26) return n.scroll !== 0 ? 2 : n.overflow ? 1 : 0;
  if (p === 36) return n.pt; if (p === 37) return n.pr; if (p === 38) return n.pb; if (p === 39) return n.pl;
  if (p === 40) return n.mt; if (p === 41) return n.mr; if (p === 42) return n.mb; if (p === 43) return n.ml;
  if (p === 44) return n.grow;
  if (p === 1009) return n.shrink;
  if (p === 45) return n.gap;
  if (p === 1013) return n.gapX;
  if (p === 1014) return n.gapY;
  if (p === 1002) return n.minW; if (p === 1003) return n.maxW; if (p === 1004) return n.minH; if (p === 1005) return n.maxH;
  if (p === 1006) return n.aspect;
  if (p === 48) return n.hidden ? 1 : 0;
  if (p === 1015) return n.tag === FRAGMENT ? 1 : 0;
  if (p === 51) return inset ? n.top : UNSET;
  if (p === 52) return inset ? n.left : UNSET;
  if (p === 53) return inset ? n.right : UNSET;
  return inset ? n.bottom : UNSET;   // 54
}
function rnSend(h: i32, p: i32, v: number): void {
  if (p === RN_W || p === RN_H) {
    if (v === -2) LY.style(h, p === RN_W ? 1000 : 1001, 1);
    else if (v < -2) LY.style(h, p === RN_W ? 19 : 20, -3 - v);
    else LY.style(h, p === RN_W ? 17 : 18, v);
  } else if (p === RN_B) {
    if (v < -2) LY.style(h, 1008, -3 - v); else LY.style(h, 1007, v);
  } else LY.style(h, p, v);
}
/** The children the engine lays out: those of the node except layers (laid out apart), in `order`. */
function rnKids(n: UiNode, out: i32[]): void {
  out.length = 0;
  if (n.tag === TEXT) return;   // a text's spans are measured with it
  let ordered = false;
  for (const c of n.children) { const k = nodes[c]; if (k.layer || k.leaving) continue; out.push(c); if (k.order !== 0) ordered = true; }
  if (ordered) out.sort((a: i32, b: i32): number => nodes[a].order - nodes[b].order);   // (stable)
}
const rnScratch: i32[] = [];
function rnSync(n: UiNode): void {
  const h = n.id;
  if (n.rn === null) { LY.create(h); n.rn = new RnRec(); }
  const r = n.rn as RnRec;
  for (let i = 0; i < RN_PROPS.length; i++) {
    const v = rnValue(n, RN_PROPS[i]);
    if (i >= r.sent.length) r.sent.push(NaN);
    if (r.sent[i] !== v) { r.sent[i] = v; rnSend(h, RN_PROPS[i], v); }
  }
  // the leaf measure: text, image or text field
  if (n.tag === TEXT) {
    inheritText(n);
    const f = fontOf(n), s = shownText(n), lh = lineHeightOf(n), flags = (n.ellipsis ? 1 : 0) | (n.balance ? 2 : 0);
    const key: number[] = [f, n.size, trackPx(n), n.wordSp, n.ws, n.brk, n.clamp, flags, lh];
    let same = r.leaf === 1 && r.text === s && r.textKey.length === key.length;
    for (let i = 0; same && i < key.length; i++) same = r.textKey[i] === key[i];
    if (!same) { r.leaf = 1; r.text = s; r.textKey = key; LY.text(h, s, f, n.size, trackPx(n), n.wordSp, n.ws, n.brk, n.clamp, flags, lh); }
  } else if (n.ed !== null) {
    fontOf(n);
    const e = n.ed as Edit;
    LY.field(h, e.multi ? e.rows : 1, lineHeightOf(n), n.fullW);   // (the engine ignores an unchanged field)
    r.leaf = 3;
  } else if (n.tag === IMAGE && n.img >= 0) {
    LY.image(h, imageWidth(n.img), imageHeight(n.img));
    r.leaf = 2;
  } else if (r.leaf !== 0) { LY.clear(h); r.leaf = 0; }
  // the children: told again only when the list changed
  rnKids(n, rnScratch);
  let same = rnScratch.length === r.kids.length;
  for (let i = 0; same && i < rnScratch.length; i++) same = rnScratch[i] === r.kids[i];
  if (!same) {
    for (const c of r.kids) LY.remove(h, c);
    r.kids = rnScratch.slice(0);
  }
  for (let i = 0; i < r.kids.length; i++) {
    const c = nodes[r.kids[i]];
    rnSync(c);
    if (!same) LY.insert(h, r.kids[i], i);
  }
}
function rnRead(n: UiNode, ax: number, ay: number): void {
  const h = n.id;
  n.x = ax + LY.x(h); n.y = ay + LY.y(h); n.lw = LY.width(h); n.lh = LY.height(h);
  if (n.tag === TEXT) {
    n.lines = []; n.lineW = [];
    const k = LY.lineCount(h);
    for (let i = 0; i < k; i++) { n.lines.push(LY.line(h, i)); n.lineW.push(LY.lineWidth(h, i)); }
    n.wk = null;   // (classic's wrap cache no longer describes these lines)
    return;
  }
  const r = n.rn as RnRec;
  for (const c of r.kids) rnRead(nodes[c], n.x, n.y);
  if (n.scroll !== 0) {   // the content: the extent of the children (through fragments, which have no box of their own), or the size of a virtual list
    rnCW = 0; rnCH = 0;
    rnExtent(n, n);
    n.contentW = Math.max(n.lw, rnCW + n.pr); n.contentH = Math.max(n.lh, rnCH + n.pb);
    if (n.virt !== null) { const v = n.virt as Virtual; n.contentH = (v.variable ? fwPrefix(v, v.count) : v.count * v.itemH) + n.pt + n.pb; }
    clampScroll(n);
  }
}
let rnCW: number = 0, rnCH: number = 0;
function rnExtent(n: UiNode, of: UiNode): void {
  if (n.rn === null) return;
  for (const c of (n.rn as RnRec).kids) {
    const k = nodes[c];
    if (k.hidden) continue;
    if (k.tag === FRAGMENT) { rnExtent(k, of); continue; }
    rnCW = Math.max(rnCW, k.x - of.x + k.lw + k.mr);
    rnCH = Math.max(rnCH, k.y - of.y + k.lh + k.mb);
  }
}
function rnLayout(r: UiNode, w: number, h: number): void {
  if (!rnOpen) { LY.open(false); rnOpen = true; }   // React Native's defaults (flex-shrink 0, as classic never shrinks)
  rnSync(r);
  LY.calculate(r.id, w, h);
  rnRead(r, 0, 0);
}
export function layout(): void {
  if (root < 0) return;
  layoutRuns++;
  // the root always fills the surface (which follows the window in fill mode)
  const r = node(root);
  r.w = width(); r.h = height();
  const laNow = laNext !== null;
  if (laNow) laSnapshot();
  calculate(r, width(), height());
  if (laNow) laStart();
  if (layers.length > 0) layoutLayers();
  if (anchors.length > 0) applyAnchors();
  layoutDirty = false;
  paintDirty = true;
  hoverDirty = true;
  if (cqAny && !inSettle) settleContainers();
  if (virtList.length > 0 && !inVirt) { inVirt = true; settleVirtuals(); if (layoutDirty) layout(); inVirt = false; }
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
  const t = n.tf;
  if (t !== null) { if (key === 'rotate') return t.rot; if (key === 'scaleX') return t.sx; if (key === 'scaleY') return t.sy; if (key === 'skewX') return t.skX; if (key === 'skewY') return t.skY; }
  if (key === 'scaleX' || key === 'scaleY') return 1;
  return 0;
}
/** Tweens a numeric property of node `h` (width, height, opacity, translateX, translateY...). */
export function animate(h: i32, key: string, to: number, dur: number, easing: string, delay: number): Promise<void> {
  for (const a of anims) if (a.node === h && a.key === key) a.node = -1;
  const a = new Anim(h, key, currentValue(node(h), key), to, clock + delay, dur, easeOf(easing));
  anims.push(a);
  return new Promise<void>(resolve => { a.done = resolve; });
}
// ---------------------------------------------------------------- LayoutAnimation (ZN-365): React Native's LayoutAnimation on zinc:ui
// configureNext(config) animates the next layout: every node that moved or resized goes from its old box to its new one (each node interpolates its own
// absolute box, so children follow their parents), new nodes fade or scale in, removed ones stay where they were and fade out before they leave. The presets
// and the curves are React Native's (iOS: the UIView curves; spring: damping ratio springDamping over the duration).
export type LayoutAnimationAnim = { type?: string; property?: string; springDamping?: number; duration?: number; delay?: number };
export type LayoutAnimationConfig = { duration: number; create?: LayoutAnimationAnim; update?: LayoutAnimationAnim; delete?: LayoutAnimationAnim };
function laAnim(type: string, property: string, damping: number): LayoutAnimationAnim { return { type: type, property: property, springDamping: damping }; }
export class LayoutAnimationPresets {
  easeInEaseOut: LayoutAnimationConfig = { duration: 300, create: laAnim('easeInEaseOut', 'opacity', 0), update: laAnim('easeInEaseOut', '', 0), delete: laAnim('easeInEaseOut', 'opacity', 0) };
  linear: LayoutAnimationConfig = { duration: 500, create: laAnim('linear', 'opacity', 0), update: laAnim('linear', '', 0), delete: laAnim('linear', 'opacity', 0) };
  spring: LayoutAnimationConfig = { duration: 700, create: laAnim('linear', 'opacity', 0), update: laAnim('spring', '', 0.4), delete: laAnim('linear', 'opacity', 0) };
}
/** The create/delete opacity LayoutAnimation gives a node now (1 outside an animation); for tests. */
export function fadeOf(h: i32): number { return node(h).fade; }
export function childCount(h: i32): i32 { return node(h).children.length; }
export function childAt(h: i32, i: i32): i32 { const c = node(h).children; return i >= 0 && i < c.length ? c[i] : -1; }
export class LayoutAnimation {
  static Presets: LayoutAnimationPresets = new LayoutAnimationPresets();
  /** Animates the layout that the next change causes; onEnd runs when every node has arrived. */
  static configureNext(config: LayoutAnimationConfig, onEnd: (() => void) | null = null): void { laNext = config; laOnEnd = onEnd; layoutDirty = true; }
  static create(duration: number, type: string = 'easeInEaseOut', property: string = 'opacity'): LayoutAnimationConfig {
    return { duration: duration, create: laAnim(type, property, 0), update: laAnim(type, '', 0.4), delete: laAnim(type, property, 0) };
  }
  static easeInEaseOut(): void { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); }
  static linear(): void { LayoutAnimation.configureNext(LayoutAnimation.Presets.linear); }
  static spring(): void { LayoutAnimation.configureNext(LayoutAnimation.Presets.spring); }
}
let laNext: LayoutAnimationConfig | null = null;
let laOnEnd: (() => void) | null = null;
let laCfg: LayoutAnimationConfig | null = null;
let laStartAt: number = 0;
let laRunning = false;
const laOld: number[] = [];          // per handle: x, y, w, h before the layout (NaN: not laid out yet)
const laFrom: number[] = [];         // per animated node: handle, x0, y0, w0, h0, x1, y1, w1, h1, kind (0 update, 1 create)
const laGone: i32[] = [];            // nodes leaving (removed during the animation)
const laStepper: () => void = (): void => laStep();   // one function value, so addStepper/removeStepper find it again
/** The curve of one animation kind at t in 0..1. */
function laCurve(a: LayoutAnimationAnim | undefined, t: number): number {
  if (a === undefined) return 1;
  const type = (a as LayoutAnimationAnim).type ?? 'easeInEaseOut';
  if (type === 'linear') return t;
  if (type === 'spring') {
    const z = (a as LayoutAnimationAnim).springDamping ?? 0.5;
    if (t >= 1) return 1;
    const w0 = Math.log(1000) / Math.max(0.05, z), wd = w0 * Math.sqrt(Math.max(0.0001, 1 - z * z));   // settles (to 1/1000) at the end of the duration
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  const x1 = type === 'easeOut' ? 0 : 0.42, x2 = type === 'easeIn' ? 1 : 0.58;   // the iOS curves: easeIn (.42,0,1,1), easeOut (0,0,.58,1), easeInEaseOut (.42,0,.58,1)
  return cubicBezier(x1, 0, x2, 1, t);
}
function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (u: number): number => ((1 - 3 * x2 + 3 * x1) * u + (3 * x2 - 6 * x1)) * u * u + 3 * x1 * u;
  let lo = 0, hi = 1, u = x;
  for (let i = 0; i < 30; i++) { const v = bx(u); if (Math.abs(v - x) < 1e-7) break; if (v < x) lo = u; else hi = u; u = (lo + hi) / 2; }
  return ((1 - 3 * y2 + 3 * y1) * u + (3 * y2 - 6 * y1)) * u * u + 3 * y1 * u;
}
function laSnapshot(): void {
  laOld.length = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const laid = n.alive && (n.lw > 0 || n.lh > 0 || n.x !== 0 || n.y !== 0);
    laOld.push(laid ? n.x : NaN); laOld.push(n.y); laOld.push(n.lw); laOld.push(n.lh);
  }
}
function laStart(): void {
  laCfg = laNext; laNext = null;
  laFrom.length = 0;
  const c = laCfg as LayoutAnimationConfig;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n.alive || n.leaving) continue;
    const x0 = i * 4 < laOld.length ? laOld[i * 4] : NaN;
    if (x0 !== x0) {   // created by this change: fades (or scales) in
      if (c.create !== undefined && (c.create as LayoutAnimationAnim).property === 'opacity') { n.fade = 0; laFrom.push(i); for (let k = 0; k < 8; k++) laFrom.push(0); laFrom.push(1); }
      continue;
    }
    const y0 = laOld[i * 4 + 1], w0 = laOld[i * 4 + 2], h0 = laOld[i * 4 + 3];
    if (x0 === n.x && y0 === n.y && w0 === n.lw && h0 === n.lh) continue;
    laFrom.push(i); laFrom.push(x0); laFrom.push(y0); laFrom.push(w0); laFrom.push(h0);
    laFrom.push(n.x); laFrom.push(n.y); laFrom.push(n.lw); laFrom.push(n.lh); laFrom.push(0);
  }
  laStartAt = clock;
  laRunning = true;
  addStepper(laStepper);
  laStep();
}
/** A node removed while an animation is armed or running fades out where it is; true: it stays in the tree until then. */
function laDeleting(h: i32): boolean {
  const c = laNext !== null ? laNext : laRunning ? laCfg : null;
  if (c === null) return false;
  const d = (c as LayoutAnimationConfig).delete;
  if (d === undefined || (d as LayoutAnimationAnim).property !== 'opacity') return false;
  const n = node(h);
  if (n.leaving) return true;
  n.leaving = true;
  laGone.push(h);
  if (!laRunning) { laStartAt = clock; laRunning = true; laCfg = c; addStepper(laStepper); }
  return true;
}
function laStep(): void {
  const c = laCfg;
  if (c === null) { removeStepper(laStepper); laRunning = false; return; }
  const cfg = c as LayoutAnimationConfig;
  const el = clock - laStartAt, t = el >= cfg.duration - 0.001 ? 1 : Math.max(0, el / Math.max(1, cfg.duration));   // (the engine clock adds frame times: an epsilon ends on time)
  const pu = laCurve(cfg.update, t), pc = laCurve(cfg.create, t), pd = laCurve(cfg.delete, t);
  for (let k = 0; k < laFrom.length; k += 10) {
    const n = nodes[laFrom[k]];
    if (!n.alive) continue;
    if (laFrom[k + 9] === 1) { n.fade = pc; continue; }
    if (t >= 1) { n.x = laFrom[k + 5]; n.y = laFrom[k + 6]; n.lw = laFrom[k + 7]; n.lh = laFrom[k + 8]; continue; }
    n.x = laFrom[k + 1] + (laFrom[k + 5] - laFrom[k + 1]) * pu; n.y = laFrom[k + 2] + (laFrom[k + 6] - laFrom[k + 2]) * pu;
    n.lw = laFrom[k + 3] + (laFrom[k + 7] - laFrom[k + 3]) * pu; n.lh = laFrom[k + 4] + (laFrom[k + 8] - laFrom[k + 4]) * pu;
  }
  for (const h of laGone) if (nodes[h].alive) nodes[h].fade = 1 - pd;
  paintDirty = true;
  if (t < 1) return;
  for (const h of laGone) {   // the fade-outs end: the nodes leave for real (a node its owner already destroyed leaves the list too)
    const n = nodes[h];
    n.leaving = false;
    if (n.parent >= 0) { const p = nodes[n.parent]; const i = p.children.indexOf(h); if (i >= 0) p.children.splice(i, 1); }
    if (n.alive) release(h);
  }
  laGone.length = 0;
  for (let k = 0; k < laFrom.length; k += 10) if (nodes[laFrom[k]].alive) nodes[laFrom[k]].fade = 1;
  laFrom.length = 0;
  laRunning = false; laCfg = null;
  removeStepper(laStepper);
  layoutDirty = true;
  const done = laOnEnd;
  laOnEnd = null;
  if (done !== null) (done as () => void)();
}

// steppers run each frame after the clock moved (zinc:ui/animated drives its animations from here, ZN-364); a frame is never kept while one is registered
const steppers: (() => void)[] = [];
export function addStepper(f: () => void): void { if (steppers.indexOf(f) < 0) steppers.push(f); }
export function removeStepper(f: () => void): void { const i = steppers.indexOf(f); if (i >= 0) steppers.splice(i, 1); }
function runSteppers(): void { for (let i = 0; i < steppers.length; i++) steppers[i](); }
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
  if (pressed === h && n.it.activeBg >= 0) return n.it.activeBg;
  if (focus === h && n.it.focusBg >= 0) return n.it.focusBg;
  if (n.it.withinBg >= 0 && focus >= 0 && isAncestor(h, focus)) return n.it.withinBg;
  if (n.hovered && n.it.hoverBg >= 0) return n.it.hoverBg;
  return n.bg;
}
/** transition-colors: the background eases toward its state color. */
function effectiveBg(h: i32, n: UiNode): i32 {
  const target = targetBg(h, n);
  if (n.it === DEF_INTERX) return target;   // never had a transition or a state colour: nothing to remember
  if (n.it.transMs <= 0 || n.it.curBg === -1) { n.it.curBg = target; n.it.fromBg = target; return target; }
  if (target !== n.it.curBg) { n.it.fromBg = mix(n.it.fromBg, n.it.curBg, 1); n.it.curBg = target; n.it.transStart = clock; }
  const t = (clock - n.it.transStart) / n.it.transMs;
  if (t >= 1 || n.it.fromBg === target) { n.it.fromBg = target; return target; }
  animating = true;
  return mix(n.it.fromBg, target, t);
}
const SHADOW_Y: number[] = [0, 1, 1, 4, 10, 20], SHADOW_BLUR: number[] = [0, 2, 3, 6, 15, 25];
const SHADOW_A: i32[] = [0, 20, 30, 40, 45, 50];
/** Font of a text node drawn at scale k (zoomed views): the nearest baked size. */
function fontAtScale(n: UiNode, k: number): i32 {
  if (k === 1) return n.fontId;
  const px: i32 = Math.max(1, Math.round(n.size * k));
  const f = faceOf(n, px);
  return f < 0 ? n.fontId : f;
}
// Coordinates: a layout point p of a node's children is drawn at p * k + o; a node's own box at (n.x + n.tx) * k + o,
// sized n.lw * k * n.k (style scale zooms the node and its subtree around its top-left corner).
function paint(h: i32, ox: number, oy: number, k: number, alpha: number): void {
  const n = node(h);
  if (n.hidden || n.invisible || (n.layer && h !== layerPass)) return;
  const a = alpha * n.opacity * n.fade;
  if (a <= 0.004) return;
  let x = (n.x + n.tx) * k + ox, y = (n.y + n.ty + (n.sticky ? stickyDy(n) : 0)) * k + oy, kk = k * n.k;
  if (n.tf !== null) { const s = tfK(n); x += n.lw * kk * (1 - s) / 2; y += n.lh * kk * (1 - s) / 2; kk *= s; }
  const w = n.lw * kk, hh = n.lh * kk;
  const ai: i32 = Math.round(a * 255);
  if (n.tag !== FRAGMENT) {
    const r = Math.min(n.radius * kk, Math.min(w, hh) / 2);
    if (n.shadowLevel > 0) shadow(x, y + SHADOW_Y[n.shadowLevel] * kk, w, hh, r, SHADOW_BLUR[n.shadowLevel] * kk, 0x000000, Math.round(SHADOW_A[n.shadowLevel] * a));
    if (n.shOpacity > 0) shadow(x + n.shX * kk, y + n.shY * kk, w, hh, r, n.shBlur * kk, n.shColor as u32, Math.round(Math.min(1, n.shOpacity) * 255 * a));
    if (n.grad > 0 && n.gradFrom >= 0 && n.gradTo >= 0) {
      const flip = n.grad === 3 || n.grad === 4;
      gradient(x, y, w, hh, r, flip ? n.gradTo : n.gradFrom, flip ? n.gradFrom : n.gradTo, n.grad === 1 || n.grad === 3, ai);
    } else {
      const bg = effectiveBg(h, n);
      if (bg >= 0) { if (n.bd.crTL >= 0 || n.bd.crTR >= 0 || n.bd.crBR >= 0 || n.bd.crBL >= 0) polygon(roundedPath(x, y, w, hh, cornerR(n.bd.crTL, r, kk, w, hh), cornerR(n.bd.crTR, r, kk, w, hh), cornerR(n.bd.crBR, r, kk, w, hh), cornerR(n.bd.crBL, r, kk, w, hh)), bg, Math.round(n.bgAlpha * a)); else rrect(x, y, w, hh, r, bg, Math.round(n.bgAlpha * a)); }
    }
    const focused = h === focus;
    let bc = focused && n.it.focusBorder >= 0 ? n.it.focusBorder : focused && n.ed !== null ? 0x3b82f6 : n.it.withinBorder >= 0 && focus >= 0 && isAncestor(h, focus) ? n.it.withinBorder : n.hovered && n.it.hoverBorder >= 0 ? n.it.hoverBorder : n.borderColor;
    const bw = n.borderW < 0 ? 1 : n.borderW;
    const bai: i32 = n.borderAlpha === 255 ? ai : Math.round(ai * n.borderAlpha / 255);
    if (bc === -3) bc = textFg(h);   // border-current
    if (n.bd.borderStyle !== 0 || n.bd.bcT >= 0 || n.bd.bcR >= 0 || n.bd.bcB >= 0 || n.bd.bcL >= 0 || n.bd.crTL >= 0 || n.bd.crTR >= 0 || n.bd.crBR >= 0 || n.bd.crBL >= 0) paintBorderExt(n, x, y, w, hh, kk, r, bc, bai, bw);
    else if (n.bd.bT >= 0 || n.bd.bR >= 0 || n.bd.bB >= 0 || n.bd.bL >= 0) {
      // ponytail: per-side borders are straight bands (no rounded corners), enough for dividers and underlines
      const t = (n.bd.bT >= 0 ? n.bd.bT : bw) * kk, rr = (n.bd.bR >= 0 ? n.bd.bR : bw) * kk, b = (n.bd.bB >= 0 ? n.bd.bB : bw) * kk, l = (n.bd.bL >= 0 ? n.bd.bL : bw) * kk;
      if (t > 0) rrect(x, y, w, t, 0, bc, bai);
      if (b > 0) rrect(x, y + hh - b, w, b, 0, bc, bai);
      if (l > 0) rrect(x, y + t, l, hh - t - b, 0, bc, bai);
      if (rr > 0) rrect(x + w - rr, y + t, rr, hh - t - b, 0, bc, bai);
    } else if (bw > 0 || (focused && n.ed !== null)) border(x, y, w, hh, r, Math.max(bw, focused && n.ed !== null ? 2 : 0) * kk, bc, bai);
    let rw = n.rg.ringW, rc = n.rg.ringC, ro = n.rg.ringO, ow = n.rg.outW, oc = n.rg.outC, oo = n.rg.outO;
    if (focused && n.rg.fRingW + n.rg.fOutW > -2 && (!n.rg.fVisible || keyboardFocus || n.ed !== null)) {
      if (n.rg.fRingW >= 0) { rw = n.rg.fRingW; ro = n.rg.fRingO; } if (n.rg.fRingC !== -1) rc = n.rg.fRingC;
      if (n.rg.fOutW >= 0) { ow = n.rg.fOutW; oo = n.rg.fOutO; } if (n.rg.fOutC !== -1) oc = n.rg.fOutC;
    }
    if (ow > 0) border(x - (oo + ow) * kk, y - (oo + ow) * kk, w + 2 * (oo + ow) * kk, hh + 2 * (oo + ow) * kk, r + (oo + ow) * kk, ow * kk, oc >= 0 ? oc : 0x000000, ai);
    if (rw > 0) border(x - (ro + rw) * kk, y - (ro + rw) * kk, w + 2 * (ro + rw) * kk, hh + 2 * (ro + rw) * kk, r + (ro + rw) * kk, rw * kk, rc >= 0 ? rc : 0x3b82f6, ai);
    if (focused && rw + ow === 0 && !n.rg.outNone && n.it.focusBg < 0 && n.it.focusBorder < 0 && n.ed === null && n.focusable) border(x - 2, y - 2, w + 4, hh + 4, r + 2, 2, 0xfacc15, ai);
    if (n.tag === IMAGE && n.img >= 0) drawImage(n.img, x, y, w, hh, ai, r);
    if (n.tag === TEXT && n.text.length > 0) {
      const lh = lineHeightOf(n);
      let fg = textFg(h);
      let p = n.parent;
      while (p >= 0 && nodes[p].it.activeFg < 0 && nodes[p].it.focusFg < 0 && nodes[p].it.hoverFg < 0 && nodes[p].it.withinFg < 0 && nodes[p].tag !== VIEW && nodes[p].tag !== BUTTON) p = nodes[p].parent;
      if (p >= 0 && pressed === p && nodes[p].it.activeFg >= 0) fg = nodes[p].it.activeFg;
      else if (p >= 0 && focus === p && nodes[p].it.focusFg >= 0) fg = nodes[p].it.focusFg;
      else if (p >= 0 && nodes[p].it.withinFg >= 0 && focus >= 0 && isAncestor(p, focus)) fg = nodes[p].it.withinFg;
      else if (p >= 0 && nodes[p].hovered && nodes[p].it.hoverFg >= 0) fg = nodes[p].it.hoverFg;
      const top = Math.round((lh - n.size * 1.21) / 2);
      const f = fontAtScale(n, kk);
      const fa = textFgAlpha(h);
      const tai: i32 = fa === 255 ? ai : Math.round(ai * fa / 255);
      for (let i = 0; i < n.lines.length; i++) {
        const free = n.lw - n.pl - n.pr - n.lineW[i];
        const off = n.talign === 1 ? Math.floor(free / 2) : n.talign === 2 ? free : 0;
        const tx = x + (n.pl + off) * kk, ty = y + (n.pt + i * lh + top + n.vshift * n.size) * kk;
        if (tsNode === h && tsA !== tsB) {   // the selected part of this line, under the text
          const ls = tsStart(n, i), a0 = imax(imin(tsA, tsB), ls), b0 = imin(imax(tsA, tsB), ls + n.lines[i].length);
          if (b0 > a0) { const x0 = textWidth(f, n.lines[i].slice(0, a0 - ls), trackPx(n)), x1 = textWidth(f, n.lines[i].slice(0, b0 - ls), trackPx(n)); rrect(tx + x0 * kk, y + (n.pt + i * lh) * kk, (x1 - x0) * kk, lh * kk, 0, n.selBg >= 0 ? n.selBg : SEL_FOCUSED, 110); }
        }
        const jx = n.talign === 3 && i < n.lines.length - 1 && spaces(n.lines[i]) > 0 ? (n.lw - n.pl - n.pr - n.lineW[i]) / spaces(n.lines[i]) : 0;   // justify: the free width goes to the spaces
        if (n.tsAlpha > 0 && commandsFree() > 32) drawLine(n, f, tx + n.tsX * kk, ty + n.tsY * kk, n.lines[i], n.tsColor >= 0 ? n.tsColor : 0x000000, Math.round(tai * n.tsAlpha / 255), jx, kk);
        drawLine(n, f, tx, ty, n.lines[i], fg, tai, jx, kk);
        if (n.deco !== 0) {
          const th = Math.max(1, Math.round(n.size / 14)) * kk, asc = fontAscent(f), lw = (n.lineW[i] + jx * spaces(n.lines[i])) * kk;
          if ((n.deco & 1) !== 0) rrect(tx, ty + asc + Math.round(n.size * 0.1) * kk, lw, th, 0, fg, tai);
          if ((n.deco & 2) !== 0) rrect(tx, ty + asc - Math.round(n.size * 0.3) * kk, lw, th, 0, fg, tai);
          if ((n.deco & 4) !== 0) rrect(tx, ty, lw, th, 0, fg, tai);
        }
      }
    }
    if (n.ed !== null) paintEdit(h, n, n.ed as Edit, x, y, kk, ai);
    const d = n.onDraw;
    if (d !== null) d(Math.round(x), Math.round(y), Math.round(w), Math.round(hh));
    if (n.overflow) {
      // children stay inside the border and its rounded corners, like CSS overflow: hidden (the padding box)
      const bw = n.borderW < 0 ? 1 : n.borderW;
      const t = (n.bd.bT >= 0 ? n.bd.bT : bw) * kk, rr = (n.bd.bR >= 0 ? n.bd.bR : bw) * kk, b = (n.bd.bB >= 0 ? n.bd.bB : bw) * kk, l = (n.bd.bL >= 0 ? n.bd.bL : bw) * kk;
      clip(x + l, y + t, w - l - rr, hh - t - b, Math.max(0, r - Math.max(Math.max(t, b), Math.max(l, rr))));
    }
  }
  const cx = x - (n.x + n.sx) * kk, cy = y - (n.y + n.sy) * kk;
  const zp = zSorted(n);
  if (zp !== null) { for (const c of zp) paint(c, cx, cy, kk, a); } else for (const c of n.children) paint(c, cx, cy, kk, a);
  if (n.scroll !== 0) paintScrollbars(n, x, y, kk, a);
  if (n.overflow && n.tag !== FRAGMENT) unclip();
}
// ---- extended borders (ZN-257): dashed and dotted lines, a colour per side, a radius per corner; the plain border keeps its old drawing (border() and rrect() bands)
function pt(o: number[], x: number, y: number): void { o.push(x); o.push(y); }
function cornerR(own: number, base: number, kk: number, w: number, h: number): number {
  const r = own >= 0 ? own * kk : base;
  return Math.min(r, Math.min(w, h) / 2);
}
/** Points of a rounded rectangle path (clockwise from the top-left corner's end), `steps` points per corner arc. */
function arcPoints(out: number[], cx: number, cy: number, r: number, a0: number, a1: number): void {
  const steps: i32 = r < 3 ? 2 : r < 12 ? 6 : 10;
  for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; pt(out, cx + r * Math.cos(a), cy + r * Math.sin(a)); }
}
function roundedPath(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): number[] {
  const o: number[] = [], P = Math.PI;
  if (tl > 0) arcPoints(o, x + tl, y + tl, tl, P, 1.5 * P); else pt(o, x, y);
  if (tr > 0) arcPoints(o, x + w - tr, y + tr, tr, 1.5 * P, 2 * P); else pt(o, x + w, y);
  if (br > 0) arcPoints(o, x + w - br, y + h - br, br, 0, 0.5 * P); else pt(o, x + w, y + h);
  if (bl > 0) arcPoints(o, x + bl, y + h - bl, bl, 0.5 * P, P); else pt(o, x, y + h);
  return o;
}
/** Draws the polyline `pts` (x, y pairs) with the border style: solid, or dashes / dots of the line width along it. */
function strokeStyled(pts: number[], bw: number, color: i32, alpha: i32, style: i32): void {
  if (pts.length < 4 || bw <= 0) return;
  if (style === 0) { stroke(pts, bw, color, alpha, false); return; }
  const dash = style === 1 ? Math.max(2, bw * 3) : Math.max(1, bw), gap = style === 1 ? Math.max(2, bw * 2) : Math.max(1, bw);
  let on = true, left = dash;
  let cur: number[] = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const ax0 = pts[i - 2], ay0 = pts[i - 1], bx = pts[i], by = pts[i + 1];
    const len = Math.sqrt((bx - ax0) * (bx - ax0) + (by - ay0) * (by - ay0));
    let done: number = 0;
    while (len - done > 0.0001) {
      const take = Math.min(left, len - done);
      done += take; left -= take;
      if (on) pt(cur, ax0 + (bx - ax0) * done / len, ay0 + (by - ay0) * done / len);
      if (left <= 0.0001) {
        if (on && cur.length >= 4) stroke(cur, bw, color, alpha, false);
        on = !on; left = on ? dash : gap;
        cur = [ax0 + (bx - ax0) * done / len, ay0 + (by - ay0) * done / len];
      }
    }
  }
  if (on && cur.length >= 4) stroke(cur, bw, color, alpha, false);
}
function paintBorderExt(n: UiNode, x: number, y: number, w: number, hh: number, kk: number, r: number, bc: i32, bai: i32, bw: number): void {
  const t = (n.bd.bT >= 0 ? n.bd.bT : bw) * kk, rr = (n.bd.bR >= 0 ? n.bd.bR : bw) * kk, b = (n.bd.bB >= 0 ? n.bd.bB : bw) * kk, l = (n.bd.bL >= 0 ? n.bd.bL : bw) * kk;
  if (t <= 0 && rr <= 0 && b <= 0 && l <= 0) return;
  const rtl = cornerR(n.bd.crTL, r, kk, w, hh), rtr = cornerR(n.bd.crTR, r, kk, w, hh), rbr = cornerR(n.bd.crBR, r, kk, w, hh), rbl = cornerR(n.bd.crBL, r, kk, w, hh);
  // the centre line of the border: the box inset by half of each side's width, the radii reduced by the same
  const x0 = x + l / 2, y0 = y + t / 2, x1 = x + w - rr / 2, y1 = y + hh - b / 2;
  const ctl = Math.max(0, rtl - Math.max(l, t) / 2), ctr = Math.max(0, rtr - Math.max(rr, t) / 2), cbr = Math.max(0, rbr - Math.max(rr, b) / 2), cbl = Math.max(0, rbl - Math.max(l, b) / 2);
  const sides: number[][] = [[], [], [], []];   // top, right, bottom, left: each from the middle of one corner arc to the middle of the next
  const P = Math.PI;
  const s0 = sides[0], s1 = sides[1], s2 = sides[2], s3 = sides[3];
  if (ctl > 0) arcPoints(s0, x0 + ctl, y0 + ctl, ctl, 1.25 * P, 1.5 * P); else pt(s0, x0, y0);
  if (ctr > 0) arcPoints(s0, x1 - ctr, y0 + ctr, ctr, 1.5 * P, 1.75 * P); else pt(s0, x1, y0);
  if (ctr > 0) arcPoints(s1, x1 - ctr, y0 + ctr, ctr, 1.75 * P, 2 * P); else pt(s1, x1, y0);
  if (cbr > 0) arcPoints(s1, x1 - cbr, y1 - cbr, cbr, 0, 0.25 * P); else pt(s1, x1, y1);
  if (cbr > 0) arcPoints(s2, x1 - cbr, y1 - cbr, cbr, 0.25 * P, 0.5 * P); else pt(s2, x1, y1);
  if (cbl > 0) arcPoints(s2, x0 + cbl, y1 - cbl, cbl, 0.5 * P, 0.75 * P); else pt(s2, x0, y1);
  if (cbl > 0) arcPoints(s3, x0 + cbl, y1 - cbl, cbl, 0.75 * P, P); else pt(s3, x0, y1);
  if (ctl > 0) arcPoints(s3, x0 + ctl, y0 + ctl, ctl, P, 1.25 * P); else pt(s3, x0, y0);
  const cols: i32[] = [n.bd.bcT >= 0 ? n.bd.bcT : bc, n.bd.bcR >= 0 ? n.bd.bcR : bc, n.bd.bcB >= 0 ? n.bd.bcB : bc, n.bd.bcL >= 0 ? n.bd.bcL : bc];
  const wd: number[] = [t, rr, b, l];
  for (let i = 0; i < 4; i++) strokeStyled(sides[i], wd[i], cols[i], bai, n.bd.borderStyle);
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
const GUTTER_NUM: i32 = 0x64748b, GUTTER_LINE: i32 = 0x334155, HL_COMMENT: i32 = 0x64748b;
function shown(e: Edit): string { return e.password ? '•'.repeat(e.value.length) : e.value; }
function isWordChar(c: i32): boolean { return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128; }
function codeMode(n: UiNode, e: Edit): boolean { return e.multi && (e.lineNumbers || n.family === 'mono'); }
/** Visual rows of the field for its current width: logical lines, word-wrapped unless `wrap` is off. */
function ensureRows(n: UiNode, e: Edit): void {
  if (e.rowsFor === e.value && e.rowsW === n.lw) return;
  e.rowsFor = e.value; e.rowsW = n.lw; e.widest = -1;
  const s = shown(e), f = n.fontId;
  // one pass over the lines: indexing a non-ASCII string (UTF-8 storage) costs O(offset), so the work below only
  // indexes each line's own string
  const parts: string[] = e.multi ? s.split('\n') : [s];
  e.gutter = e.lineNumbers ? textWidth(f, '0'.repeat(imax(2, `${parts.length}`.length)), 0) + 16 : 0;
  const w = n.lw - n.pl - n.pr - e.gutter;
  e.rs = []; e.re = [];
  let start: i32 = 0;
  for (const part of parts) {
    const len: i32 = part.length;
    // lines that fit are one row (measured once, not per character: long files re-wrap quickly)
    if (!e.multi || !e.wrap || w <= n.size || len === 0 || textWidth(f, part, 0) <= w) { e.rs.push(start); e.re.push(start + len); }
    else {
      // greedy wrap, breaking after the last space that fits (or anywhere in a long word)
      let a: i32 = 0;
      while (a < len) {
        let x: number = 0, i: i32 = a, space: i32 = -1;
        while (i < len) {
          const cw = textWidth(f, part.slice(i, i + 1), 0);
          if (x + cw > w && i > a) break;
          x += cw;
          if (part.charCodeAt(i) === 32) space = i;
          i++;
        }
        if (i < len && space >= a) i = space + 1;
        e.rs.push(start + a); e.re.push(start + i);
        a = i;
      }
    }
    start += len + 1;
  }
}
/** Row of an offset; the end of a wrapped row belongs to the next row. */
function rowOf(e: Edit, off: i32): i32 {
  for (let r = 0; r < e.rs.length; r++) if (off < e.re[r] || (off === e.re[r] && (r + 1 >= e.rs.length || e.rs[r + 1] !== off))) return r;
  return e.rs.length - 1;
}
function xIn(n: UiNode, e: Edit, row: i32, off: i32): number { return textWidth(n.fontId, sub(shown(e), e.rs[row], off), 0); }
/** The x of offset `off` in visual row r of a field painted from `chunk` (the visible text starting at c0): a function, not a closure, so a paint allocates nothing. */
function xrOf(n: UiNode, chunk: string, e: Edit, c0: i32, r: i32, off: i32): number { return textWidth(n.fontId, sub(chunk, e.rs[r] - c0, off - c0), 0); }
/** s.slice(a, b), or s itself when that is the whole string: painting a one-line field allocates nothing (ZN-192). */
function sub(s: string, a: i32, b: i32): string { return b <= a ? '' : a === 0 && b === s.length ? s : s.slice(a, b); }
function rowEnd(e: Edit, r: i32): i32 { return r + 1 < e.rs.length && e.rs[r + 1] === e.re[r] && e.re[r] > e.rs[r] ? e.re[r] - 1 : e.re[r]; }
function offAtX(n: UiNode, e: Edit, r: i32, x: number): i32 {
  const row = shown(e).slice(e.rs[r], e.re[r]);
  let w: number = 0;
  for (let i = 0; i < row.length; i++) {
    const cw = textWidth(n.fontId, row.slice(i, i + 1), 0);
    if (x < w + cw / 2) return e.rs[r] + i;
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
  if (e.reveal) { revealCaret(n, e); e.reveal = false; e.ay = null; }
  const lh = lineHeightOf(n), f = fontAtScale(n, k), g = e.gutter, s = shown(e);
  const cl = n.pl + g, cw = n.lw - n.pl - n.pr - g, ch = n.lh - n.pt - n.pb, top = editTop(n, e);
  const base = Math.round((lh - n.size * 1.21) / 2);
  const focused = focus === h;
  const first: i32 = e.multi ? imax(0, Math.floor(e.sy / lh)) : 0;
  const last: i32 = e.multi ? imin(e.rs.length - 1, Math.floor((e.sy + ch) / lh)) : 0;
  const mk = e.marks;
  // the visible rows (and a margin) as one string: rows are sliced from it, since indexing the whole value of a
  // non-ASCII text costs O(offset) per call (UTF-8 storage)
  const c0: i32 = e.rs[imax(0, first - 20)], c1: i32 = e.re[imin(e.rs.length - 1, last + 20)];
  const chunk = sub(s, c0, c1);
  if (g > 0) {
    // line numbers: the first row of each logical line (brighter on a line with a MARK_LINE, a dot for MARK_GUTTER)
    clip(x, y + n.pt * k, cl * k, ch * k);
    let line: i32 = 1;
    for (let r = 1; r <= first; r++) if (e.rs[r] !== e.re[r - 1]) line++;
    for (let r = first; r <= last; r++) {
      if (r > first && e.rs[r] !== e.re[r - 1]) line++;
      if (r > 0 && e.rs[r] === e.re[r - 1]) continue;
      const num = `${line}`, ry = y + (top + r * lh - e.sy) * k;
      let active = false;
      for (let i = 0; i + 3 < mk.length; i += 4) {
        if (mk[i + 3] === MARK_LINE && mk[i] <= e.re[r] && mk[i + 1] >= e.rs[r]) active = true;
        if (mk[i + 3] === MARK_GUTTER && mk[i] >= e.rs[r] && mk[i] <= e.re[r]) rrect(x + (n.pl / 2 - 3) * k, ry + (lh / 2 - 3) * k, 6 * k, 6 * k, 3 * k, mk[i + 2], ai);
      }
      drawText(f, x + (cl - 10 - textWidth(n.fontId, num, 0)) * k, ry + base * k, num, active ? editColor(e, 1, n.fg) : editColor(e, 0, GUTTER_NUM), ai, 0);
    }
    unclip();
    const gl = editColor(e, 2, GUTTER_LINE);
    if (gl >= 0) rrect(x + (cl - 5) * k, y + n.pt * k, k, ch * k, 0, gl, ai);
  }
  clip(x + cl * k, y + n.pt * k, cw * k, ch * k);
  const s0 = imin(e.caret, e.anchor), s1 = imax(e.caret, e.anchor);
  const selColor = n.selBg >= 0 ? n.selBg : editColor(e, 3, focused ? SEL_FOCUSED : SEL_BLURRED), selAlpha: i32 = focused ? 110 : 70;
  const guide = editColor(e, 5, -1), indentW = guide >= 0 ? textWidth(n.fontId, '  ', 0) : 0;
  for (let r = first; r <= last; r++) {
    const a = e.rs[r], b = e.re[r];
    const rx = x + (cl - e.sx) * k, ry = y + (top + r * lh - e.sy) * k;
    const line = sub(chunk, a - c0, b - c0);
    // decorations under the text: line backgrounds, indent guides, range fills and boxes
    for (let i = 0; i + 3 < mk.length; i += 4) {
      const ma = mk[i], mb = mk[i + 1], kind = mk[i + 3];
      if (ma > b || mb < a || kind === MARK_SQUIGGLE || kind === MARK_GUTTER) continue;
      if (kind === MARK_LINE) { rrect(x + cl * k, ry, cw * k, lh * k, 0, mk[i + 2], ai); continue; }
      const x0 = xrOf(n, chunk, e, c0, r, imax(ma, a)), x1 = xrOf(n, chunk, e, c0, r, imin(mb, b));
      if (x1 <= x0) continue;
      if (kind === MARK_BOX) border(rx + x0 * k, ry, (x1 - x0) * k, lh * k, 2 * k, k, mk[i + 2], ai);
      else rrect(rx + x0 * k, ry, (x1 - x0) * k, lh * k, 2 * k, mk[i + 2], kind === MARK_STRONG ? 150 : 70);
    }
    if (guide >= 0 && (r === 0 || e.rs[r] !== e.re[r - 1])) {
      let ind = spacesAt(line, 0);
      if (ind < 0) ind = indentAt(chunk, a - c0);
      for (let c: i32 = 0; c < ind; c += 2) rrect(rx + c / 2 * indentW * k, ry, k, lh * k, 0, guide, ai);
    }
    if (s1 > s0 && s0 <= b && s1 >= a) {
      const x0 = xrOf(n, chunk, e, c0, r, imax(s0, a));
      let x1 = xrOf(n, chunk, e, c0, r, imin(s1, b));
      if (s1 > b && r + 1 < e.rs.length && e.rs[r + 1] > b) x1 += 6;  // the selected line break
      if (x1 > x0) rrect(rx + x0 * k, ry, (x1 - x0) * k, lh * k, 0, selColor, selAlpha);
    }
    if (line.length === 0) continue;
    // squiggles (diagnostics) under the glyphs' baseline
    for (let i = 0; i + 3 < mk.length; i += 4) {
      if (mk[i + 3] !== MARK_SQUIGGLE || mk[i] > b || mk[i + 1] < a) continue;
      const x0 = xrOf(n, chunk, e, c0, r, imax(mk[i], a)), x1 = Math.max(xrOf(n, chunk, e, c0, r, imin(mk[i + 1], b)), x0 + 6);
      const pts: number[] = [];
      for (let px = x0; px <= x1 + 0.01; px += 2) { pts.push(rx + px * k); pts.push(ry + (lh - 2.5 + (Math.round(px / 2) % 2 === 0 ? -1 : 1)) * k); }
      if (pts.length >= 4) stroke(pts, k, mk[i + 2], ai, false);
    }
    const hl = e.highlight, hla = e.highlightAt;
    if ((hl === null && hla === null) || e.password) { drawText(f, rx, ry + base * k, line, n.fg, ai, 0); continue; }
    let runs: i32[] = [];
    if (hla !== null) runs = hla(line, a); else if (hl !== null) runs = hl(line);
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
    rrect(x + (cl + xIn(n, e, r, e.caret) - e.sx) * k - 0.5, y + (top + r * lh - e.sy) * k, 1.5, lh * k, 0, editColor(e, 4, n.fg), ai);
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
/** Horizontal scroll limit of a field: its widest row (measured once per text and width) minus the text box. */
function editMaxX(n: UiNode, e: Edit): number {
  if (e.widest < 0) {
    // wrapped rows fit the box; otherwise the widest line (measured on the line strings, see ensureRows)
    let w: number = 0;
    if (e.multi && e.wrap) w = n.lw - n.pl - n.pr - e.gutter - 2;
    else for (const part of (e.multi ? shown(e).split('\n') : [shown(e)])) w = Math.max(w, textWidth(n.fontId, part, 0));
    e.widest = w;
  }
  return Math.max(0, e.widest - (n.lw - n.pl - n.pr - e.gutter) + 2);
}
function editMaxY(n: UiNode, e: Edit): number { return Math.max(0, e.rs.length * lineHeightOf(n) - (n.lh - n.pt - n.pb)); }
const editScrollers: i32[] = [];   // text fields whose scroll is animating (wheel easing, rubber band)
/**
 * Wheel over a scrollable field, like scroll containers: trackpads scroll 1:1 (the OS supplies the momentum) and
 * stretch past the edges, mouse notches ease 60 px each. False when it cannot scroll that way and an enclosing
 * scroller (`outer`) can take the wheel.
 */
function editAxis(e: Edit): ScrollAxis { let a = e.ay; if (a === null) { a = new ScrollAxis(); a.pos = e.sy; e.ay = a; } return a as ScrollAxis; }
function wakeEdit(h: i32): void { if (editScrollers.indexOf(h) < 0) editScrollers.push(h); paintDirty = true; }
/** Mouse-wheel notches over a field: single-line fields scroll sideways, text areas ease like scroll containers.
 *  False when the field cannot move that way (an enclosing scroll container gets the wheel instead). */
function editWheel(h: i32, n: UiNode, e: Edit, wy: number, wx: number, outer: boolean): boolean {
  ensureRows(n, e);
  if (!e.multi) {
    const ox = e.sx;
    e.sx = Math.max(0, Math.min(editMaxX(n, e), e.sx + (wx - wy) * 40));
    if (e.sx !== ox) { paintDirty = true; return true; }
    return false;
  }
  const maxY = editMaxY(n, e), maxX = wx !== 0 ? editMaxX(n, e) : 0;
  const a = editAxis(e), base = a.mode === WHEEL ? a.target : a.pos;
  const dy = -wy * NOTCH_PX, dx = wx * NOTCH_PX;
  const stuckY = dy === 0 || (dy < 0 && base <= 0) || (dy > 0 && base >= maxY);
  const stuckX = dx === 0 || (dx < 0 && e.sx <= 0) || (dx > 0 && e.sx >= maxX);
  if (stuckY && stuckX && outer) return false;
  if (!stuckY) { a.target = Math.max(0, Math.min(maxY, base + dy)); a.mode = WHEEL; }
  e.sx = Math.max(0, Math.min(maxX, e.sx + dx));
  wakeEdit(h);
  return true;
}
/** Trackpad fingers over a text area: 1:1 with the rubber band, then inertia / bounce on release. */
function editDirect(h: i32, n: UiNode, e: Edit, dx: number, dy: number): void {
  ensureRows(n, e);
  const a = editAxis(e), maxY = editMaxY(n, e);
  beginDirect(a, maxY, n.lh);
  if (dy !== 0) directBy(a, dy, maxY, n.lh);
  e.sy = a.pos;
  e.sx = Math.max(0, Math.min(editMaxX(n, e), e.sx + dx));
  wakeEdit(h);
}
function editRelease(h: i32): void { const e = nodes[h].ed; if (e !== null && e.ay !== null) releaseAxis(e.ay as ScrollAxis, editMaxY(nodes[h], e as Edit)); wakeEdit(h); }
/** Advances the text areas whose scroll is animating (wheel easing, inertia, bounce). */
function stepEdits(dt: number): void {
  for (let i = editScrollers.length - 1; i >= 0; i--) {
    const n = nodes[editScrollers[i]];
    if (!n.alive || n.ed === null) { editScrollers.splice(i, 1); continue; }
    const e = n.ed as Edit, a = e.ay;
    if (a === null) { editScrollers.splice(i, 1); continue; }
    const maxY = editMaxY(n, e);
    if (a.mode === IDLE && (a.pos < 0 || a.pos > maxY)) a.mode = BOUNCE;
    const moving = stepAxis(a, maxY, dt);
    e.sy = a.pos;
    paintDirty = true;
    if (!moving) editScrollers.splice(i, 1);
  }
}

const TS_KEYWORDS: string[] = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'of', 'in', 'new', 'class',
  'extends', 'implements', 'import', 'export', 'from', 'type', 'interface', 'enum', 'true', 'false', 'null', 'undefined', 'this', 'super',
  'async', 'await', 'yield', 'break', 'continue', 'switch', 'case', 'default', 'throw', 'try', 'catch', 'finally', 'as', 'void',
  'static', 'readonly', 'private', 'public', 'protected', 'abstract', 'get', 'set', 'typeof', 'instanceof', 'using'];
/** Small TypeScript / Zinc highlighter for code editors (highlight={ui.tsHighlight}): keywords, types, strings,
 *  numbers, line comments and block comments within a line (an unclosed one runs to the end of the line).
 *  ponytail: per line, so comments and strings spanning lines are not tracked (setHighlightAt gives the offset of
 *  the line, for highlighters that keep a state per line). */
export function tsHighlight(line: string): i32[] {
  const out: i32[] = [];
  const n = line.length;
  let i: i32 = 0;
  while (i < n) {
    const c = line.charCodeAt(i);
    let j: i32 = i + 1, color: i32 = -1;
    if (c === 47 && j < n && line.charCodeAt(j) === 47) { j = n; color = HL_COMMENT; }
    else if (c === 47 && j < n && line.charCodeAt(j) === 42) { const close = line.indexOf('*/', i + 2); j = close < 0 ? n : close + 2; color = HL_COMMENT; }
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

// ---------------------------------------------------------------- code editor extensions (examples/zed-editor)
/** Mark kinds of setMarks: a translucent range fill, the background of every row of a line (also brightens its line
 *  number), a 1px box, a wavy underline, a stronger fill, a dot in the line number gutter. */
export const MARK_FILL: i32 = 0, MARK_LINE: i32 = 1, MARK_BOX: i32 = 2, MARK_SQUIGGLE: i32 = 3, MARK_STRONG: i32 = 4, MARK_GUTTER: i32 = 5;
/** Decorations of a textarea, flat [start, end, color, kind] per mark (UTF-16 offsets): current line, search
 *  matches, matching brackets, diagnostics. Drawn under the text (squiggles over it); replaces the previous marks. */
export function setMarks(h: i32, marks: i32[]): void { editOf(h).marks = marks; paintDirty = true; }
/** Colours of a code editor: [lineNumber, activeLineNumber, gutterLine, selection, caret, indentGuide]; -1 keeps
 *  the default, -2 draws none (gutterLine). Indent guides (every 2 columns of leading spaces) are off by default. */
export function setEditColors(h: i32, colors: i32[]): void { editOf(h).colors = colors; paintDirty = true; }
function editColor(e: Edit, i: i32, def: i32): i32 { return i < e.colors.length && e.colors[i] !== -1 ? e.colors[i] : def; }
/** Like setHighlight, with the offset of the row in the value: highlighters that track comments or strings across
 *  lines look the state of that line up. Takes precedence over setHighlight. */
export function setHighlightAt(h: i32, f: (line: string, start: i32) => i32[]): void { editOf(h).highlightAt = f; paintDirty = true; }
/** Scroll and geometry of a text field: [scrollX, scrollY, contentHeight, viewportHeight, lineHeight, rows, gutter,
 *  contentWidth]. contentWidth is measured on demand (the widest row). */
export function editView(h: i32): number[] {
  if (layoutDirty) layout();
  const n = node(h), e = editOf(h);
  ensureRows(n, e);
  const lh = lineHeightOf(n);
  return [e.sx, e.sy, e.rs.length * lh, n.lh - n.pt - n.pb, lh, e.rs.length, e.gutter, editMaxX(n, e) + n.lw - n.pl - n.pr - e.gutter - 2];
}
/** Scrolls a text field to (x, y) pixels (clamped), stopping any wheel easing. */
export function scrollEditTo(h: i32, x: number, y: number): void {
  if (layoutDirty) layout();
  const n = node(h), e = editOf(h);
  ensureRows(n, e);
  e.sy = e.multi ? Math.max(0, Math.min(editMaxY(n, e), y)) : 0;
  e.sx = Math.max(0, Math.min(editMaxX(n, e), x));
  e.ay = null; e.reveal = false;
  paintDirty = true;
}
/** Visual row of an offset (the logical line when wrapping is off). */
export function editRowOf(h: i32, off: i32): i32 {
  if (layoutDirty) layout();
  const n = node(h), e = editOf(h);
  ensureRows(n, e);
  return rowOf(e, clampI(off, 0, e.value.length));
}
/** Leading spaces of the line starting at `a`; a blank line takes the smaller indentation of its neighbours. */
function indentAt(s: string, a: i32): i32 {
  const own = spacesAt(s, a);
  if (own >= 0) return own;
  let up: i32 = 0, down: i32 = 0;
  let p: i32 = a;
  for (let i = 0; i < 100 && p > 0; i++) { p = lineStart(s, p - 1); const v = spacesAt(s, p); if (v >= 0) { up = v; break; } }
  p = s.indexOf('\n', a);
  for (let i = 0; i < 100 && p >= 0; i++) { const v = spacesAt(s, p + 1); if (v >= 0) { down = v; break; } p = s.indexOf('\n', p + 1); }
  return imin(up, down);
}
/** Leading spaces of the line starting at `a`, -1 when it is blank. */
function spacesAt(s: string, a: i32): i32 {
  let i: i32 = a;
  while (i < s.length && s.charCodeAt(i) === 32) i++;
  return i >= s.length || s.charCodeAt(i) === 10 ? -1 : i - a;
}
/** Asks for a repaint at the next frame (lazy canvases whose drawing depends on the program's own state). */
export function repaint(): void { paintDirty = true; }

// ---------------------------------------------------------------- scrolling input
// Drag-to-scroll belongs to fingers and pens: a mouse scrolls with the wheel, the trackpad and the scrollbar (a click-drag selects or drags).
// Touch screens that reach us as a mouse (Pi evdev, ESP32 and e-ink panels) keep it: only the desktop platforms (macos, linux) wait until a
// real touch has been seen. ZINC_POINTER=mouse | touch forces the policy (tests, kiosks with a touch panel on a desktop OS).
let touchSeen = false;
const pointerPolicy: string = env('ZINC_POINTER');
function dragScrolls(): boolean {
  if (pointerPolicy === 'touch') return true;
  if (pointerPolicy === 'mouse') return touchSeen;
  if (synthetic || env('ZINC_HEADLESS') !== '' || env('ZINC_DETERMINISTIC') !== '') return true;   // test hooks, headless and deterministic runs have no device to tell: the pointer is a finger
  const p = platform();
  return touchSeen || (p !== 'macos' && p !== 'linux');
}
let dragScroller: i32 = -1, dragging = false, dragX: number = 0, dragY: number = 0, lastX: number = 0, lastY: number = 0;
let focusShown: i32 = -1;
const scrollers: i32[] = [];   // containers whose offset is animating (wheel easing, inertia, rubber band)
/** Innermost scroll container under (px, py) that scrolls along `axes` (1 vertical, 2 horizontal). */
function scrollerAt(h: i32, px: number, py: number, ox: number, oy: number, k: number, axes: i32): i32 {
  const n = node(h);
  if (n.hidden || (n.layer && h !== layerPass)) return -1;
  let x0 = (n.x + n.tx) * k + ox, y0 = (n.y + n.ty) * k + oy, kk = k * n.k;
  if (n.tf !== null) { const s = tfK(n); x0 += n.lw * kk * (1 - s) / 2; y0 += n.lh * kk * (1 - s) / 2; kk *= s; untransform(n, px, py, x0 + n.lw * kk / 2, y0 + n.lh * kk / 2); px = tpx; py = tpy; }
  const inside = px >= x0 && py >= y0 && px < x0 + n.lw * kk && py < y0 + n.lh * kk;
  if (n.overflow && n.tag !== FRAGMENT && !inside) return -1;
  const cx = x0 - (n.x + n.sx) * kk, cy = y0 - (n.y + n.sy) * kk;
  for (let i = n.children.length - 1; i >= 0; i--) { const r = scrollerAt(n.children[i], px, py, cx, cy, kk, axes); if (r >= 0) return r; }
  const canY = (n.scroll & 1) !== 0 && n.contentH > n.lh, canX = (n.scroll & 2) !== 0 && n.contentW > n.lw;
  if (inside && (((axes & 1) !== 0 && canY) || ((axes & 2) !== 0 && canX))) return h;
  return -1;
}
// ---- scroll physics, per axis, after UIScrollView / Flutter / Chromium (docs/ui.md, scrolling):
//   direct   fingers (trackpad, touch, drag) move the content 1:1; past an edge the closed-form rubber band
//            (1 - 1/(x*c/dim + 1)) * dim of the raw overscroll is shown (c = 0.55)
//   release  velocity = least-squares slope of the last 100 ms of positions (0 if the fingers rested > 40 ms);
//            overscrolled -> bounce with that velocity, fast enough -> inertia, else stop
//   inertia  v(t) = v0 * 0.998^ms (iOS normal deceleration); crossing an edge hands the velocity to the bounce
//   bounce   critically damped spring toward the edge (omega 10/s, like the iOS / GTK overshoot)
//   wheel    mouse-wheel notches: a critically damped spring (omega 30/s) toward a target 48 px per notch
// Trackpad deltas arrive resampled at frame time (HAL scroll_dx / dy), so the stream is even and nothing judders.
const RUBBER_C: number = 0.55, DECEL: number = 0.998, BOUNCE_W: number = 10, WHEEL_W: number = 30;
const MIN_FLING: number = 100, MAX_FLING: number = 8000, MAX_EDGE_V: number = 5000, NOTCH_PX: number = 48;
const IDLE: i32 = 0, DIRECT: i32 = 1, INERTIA: i32 = 2, BOUNCE: i32 = 3, WHEEL: i32 = 4;
export class ScrollAxis {
  mode: i32 = 0;
  pos: number = 0;       // shown offset
  raw: number = 0;       // unclamped offset during a direct gesture
  v: number = 0;         // px/s
  target: number = 0;    // wheel easing target
  ts: number[] = [];     // recent direct samples (engine ms, raw) for the release velocity
  ps: number[] = [];
}
function rubberOf(x: number, dim: number): number { return (1 - 1 / (x * RUBBER_C / Math.max(1, dim) + 1)) * dim; }
function unrubber(f: number, dim: number): number { return f < dim ? f * dim / (RUBBER_C * (dim - f)) : dim * 100; }
/** Shown offset for a raw one: inside [0, max] as is, beyond it squashed by the rubber band. */
function banded(raw: number, max: number, dim: number): number {
  return raw < 0 ? -rubberOf(-raw, dim) : raw > max ? max + rubberOf(raw - max, dim) : raw;
}
function beginDirect(a: ScrollAxis, max: number, dim: number): void {
  if (a.mode === DIRECT) return;
  // continue from what is shown, even mid-bounce: the raw offset is the rubber band inverted
  a.raw = a.pos < 0 ? -unrubber(-a.pos, dim) : a.pos > max ? max + unrubber(a.pos - max, dim) : a.pos;
  a.mode = DIRECT; a.v = 0; a.ts = []; a.ps = [];
}
function directBy(a: ScrollAxis, d: number, max: number, dim: number): void {
  a.raw += d;
  a.pos = banded(a.raw, max, dim);
  a.ts.push(clock); a.ps.push(a.raw);
  while (a.ts.length > 1 && clock - a.ts[0] > 100) { a.ts.shift(); a.ps.shift(); }
}
/** Least-squares slope (px/s) of the samples of the last 100 ms; 0 when the fingers rested before lifting. */
function releaseVelocity(a: ScrollAxis): number {
  const n = a.ts.length;
  if (n < 2 || clock - a.ts[n - 1] > 40) return 0;
  let mt = 0, mp = 0;
  for (let i = 0; i < n; i++) { mt += a.ts[i]; mp += a.ps[i]; }
  mt /= n; mp /= n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const dt = a.ts[i] - mt; num += dt * (a.ps[i] - mp); den += dt * dt; }
  return den > 0 ? Math.max(-MAX_FLING, Math.min(MAX_FLING, num / den * 1000)) : 0;
}
function releaseAxis(a: ScrollAxis, max: number): void {
  if (a.mode !== DIRECT) return;
  const v = releaseVelocity(a);
  if (a.pos < 0 || a.pos > max) { a.mode = BOUNCE; a.v = Math.max(-MAX_EDGE_V, Math.min(MAX_EDGE_V, v)); }
  else if (Math.abs(v) > MIN_FLING) { a.mode = INERTIA; a.v = v; }
  else { a.mode = IDLE; a.v = 0; }
}
/** Critically damped spring step toward `to` (semi-implicit, small substeps: stable at any frame time). */
function springStep(a: ScrollAxis, to: number, w: number, dt: number): boolean {
  const n: i32 = Math.max(1, Math.ceil(dt * 480)), h = dt / n;
  for (let i = 0; i < n; i++) { a.v += (-w * w * (a.pos - to) - 2 * w * a.v) * h; a.pos += a.v * h; }
  if (Math.abs(a.pos - to) < 0.3 && Math.abs(a.v) < 6) { a.pos = to; a.v = 0; return false; }
  return true;
}
/** One frame of an axis; false once it rests. */
function stepAxis(a: ScrollAxis, max: number, dt: number): boolean {
  if (a.mode === INERTIA) {
    const f = Math.pow(DECEL, dt * 1000), k = 1000 * Math.log(DECEL);
    a.pos += a.v * (f - 1) / k;
    a.v *= f;
    if (a.pos < 0 || a.pos > max) { a.mode = BOUNCE; a.v = Math.max(-MAX_EDGE_V, Math.min(MAX_EDGE_V, a.v)); }
    else if (Math.abs(a.v) < 6) { a.mode = IDLE; a.v = 0; return false; }
    return true;
  }
  if (a.mode === BOUNCE) { if (!springStep(a, Math.max(0, Math.min(max, a.pos < 0 ? 0 : max)), BOUNCE_W, dt)) a.mode = IDLE; return a.mode !== IDLE; }
  if (a.mode === WHEEL) { if (!springStep(a, a.target, WHEEL_W, dt)) a.mode = IDLE; return a.mode !== IDLE; }
  return a.mode === DIRECT;
}
function maxScrollY(n: UiNode): number { return Math.max(0, n.contentH - n.lh); }
function maxScrollX(n: UiNode): number { return Math.max(0, n.contentW - n.lw); }
function axisY(n: UiNode): ScrollAxis { let a = n.ay; if (a === null) { a = new ScrollAxis(); a.pos = n.sy; n.ay = a; } return a as ScrollAxis; }
function axisX(n: UiNode): ScrollAxis { let a = n.ax; if (a === null) { a = new ScrollAxis(); a.pos = n.sx; n.ax = a; } return a as ScrollAxis; }
function wakeScroll(h: i32): void {
  const n = node(h);
  n.live = true;
  if (scrollers.indexOf(h) < 0) scrollers.push(h);
}
/** A direct (finger) scroll by (dx, dy) pixels of content offset. */
function directScroll(h: i32, dx: number, dy: number): void {
  const n = node(h);
  if ((n.scroll & 1) !== 0) { const a = axisY(n); beginDirect(a, maxScrollY(n), n.lh); if (dy !== 0) directBy(a, dy, maxScrollY(n), n.lh); n.sy = a.pos; }
  // the horizontal axis follows the fingers only when its content is wider than the viewport (iOS and React Native's alwaysBounceHorizontal = false); the
  // vertical one always does, so a short page still rubber-bands vertically
  if ((n.scroll & 2) !== 0 && maxScrollX(n) > 0.5) { const a = axisX(n); beginDirect(a, maxScrollX(n), n.lw); if (dx !== 0) directBy(a, dx, maxScrollX(n), n.lw); n.sx = a.pos; }
  n.scrolledAt = clock; paintDirty = true;
  wakeScroll(h);
}
/** The fingers left: inertia or bounce from the release velocity. */
function releaseScroll(h: i32): void {
  const n = node(h);
  if (n.ay !== null) releaseAxis(n.ay as ScrollAxis, maxScrollY(n));
  if (n.ax !== null) releaseAxis(n.ax as ScrollAxis, maxScrollX(n));
  wakeScroll(h);
}
/** Fingers landed on a moving scroller: it stops where it is (an overscroll still springs back). */
function catchScroll(h: i32): void {
  const n = node(h);
  for (const a of [n.ay, n.ax]) if (a !== null && (a.mode === INERTIA || a.mode === WHEEL)) { a.mode = IDLE; a.v = 0; }
}
// ---- scroll snap: the snap points are the offsets that put a child with snap-start / snap-center / snap-end at the start, centre or end of the scroll container's padded viewport
const snapPts: number[] = [];
function collectSnap(n: UiNode, sc: UiNode, yAxis: boolean): void {
  for (const h of n.children) {
    const c = node(h);
    if (c.hidden) continue;
    if (c.sn.snapAlign !== 0) {
      const pos = yAxis ? c.y - sc.y : c.x - sc.x, size = yAxis ? c.lh : c.lw, view = yAxis ? sc.lh : sc.lw;
      const ps = yAxis ? sc.sn.spt : sc.sn.spl, pe = yAxis ? sc.sn.spb : sc.sn.spr;
      snapPts.push(c.sn.snapAlign === 1 ? pos - ps : c.sn.snapAlign === 2 ? pos + size / 2 - view / 2 : pos + size - view + pe);
    }
    collectSnap(c, sc, yAxis);
  }
}
/** The snap offset for `v`: with dir 0 the nearest; otherwise the nearest one beyond `v` in direction dir (a wheel notch moves to the next point). `v` itself when there is none. */
function snapTo(sc: UiNode, yAxis: boolean, v: number, dir: number): number {
  snapPts.length = 0;
  collectSnap(sc, sc, yAxis);
  const mx = yAxis ? maxScrollY(sc) : maxScrollX(sc);
  let best = v, bd = 1e9;
  for (let i = 0; i < snapPts.length; i++) {
    const q = Math.max(0, Math.min(mx, snapPts[i])), d = q - v;
    if (dir > 0 && d <= 0.5) continue;
    if (dir < 0 && d >= -0.5) continue;
    const ad = Math.abs(d);
    if (ad < bd) { bd = ad; best = q; }
  }
  if (sc.sn.snapProx && bd > 32) return v;
  return best;
}
function stepScroll(dt: number): void {
  for (let i = scrollers.length - 1; i >= 0; i--) {
    const h = scrollers[i], n = node(h);
    if (!n.alive) { scrollers.splice(i, 1); continue; }
    let moving = false;
    if (n.ay !== null) {
      const a = n.ay as ScrollAxis, my = maxScrollY(n);
      if (a.mode === IDLE && (a.pos < 0 || a.pos > my)) a.mode = BOUNCE;   // content shrank, or a press ended an overscroll
      if (stepAxis(a, my, dt)) moving = true;
      else if ((n.sn.snap & 1) !== 0 && a.mode === IDLE && a.pos >= 0 && a.pos <= my) {   // the scroll stopped between snap points: settle on the nearest
        const t = snapTo(n, true, a.pos, 0);
        if (Math.abs(t - a.pos) > 0.5) { a.target = t; a.mode = WHEEL; moving = true; }
      }
      n.sy = a.pos;
    }
    if (n.ax !== null) {
      const a = n.ax as ScrollAxis, mx = maxScrollX(n);
      if (a.mode === IDLE && (a.pos < 0 || a.pos > mx)) a.mode = BOUNCE;
      if (stepAxis(a, mx, dt)) moving = true;
      else if ((n.sn.snap & 2) !== 0 && a.mode === IDLE && a.pos >= 0 && a.pos <= mx) {
        const t = snapTo(n, false, a.pos, 0);
        if (Math.abs(t - a.pos) > 0.5) { a.target = t; a.mode = WHEEL; moving = true; }
      }
      n.sx = a.pos;
    }
    n.scrolledAt = clock;
    paintDirty = true;
    if (!moving) { n.live = false; n.vx = 0; n.vy = 0; clampScroll(n); scrollers.splice(i, 1); }
  }
}
/** Scrolls the enclosing containers so the focused node is visible (again): call it after the layout changed, e.g. an on-screen keyboard took room. */
export function revealFocused(): void { if (focus >= 0) revealFocus(focus); }
/** Keyboard focus: scroll every enclosing container so the focused node is visible. */
function revealFocus(h: i32): void {
  const f = node(h);
  let p = f.parent;
  while (p >= 0) {
    const n = node(p);
    if (n.scroll !== 0) {
      const cover = kbInset > 0 ? Math.max(0, n.y + n.lh - (height() - kbInset)) : 0;   // the on-screen keyboard hides the bottom of a scroll area that reaches it
      if (f.y < n.y + n.sy) n.sy = f.y - n.y;
      else if (f.y + f.lh > n.y + n.sy + n.lh - cover) n.sy = f.y + f.lh - n.y - n.lh + cover;
      clampScroll(n); n.scrolledAt = clock; paintDirty = true;
    }
    if (n.layer) break;   // a layer is placed on the surface, apart from its ancestors: their scrolling cannot reveal it
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
  return n.onClick !== null || n.ed !== null || s !== null || n.selectable;
}
function editScrolls(n: UiNode, e: Edit): boolean {
  ensureRows(n, e);
  return e.multi && e.rs.length * lineHeightOf(n) > n.lh - n.pt - n.pb;
}
/** position: sticky; top-N: how far the box is held down from its place while its scroll container is scrolled past it (kept inside its parent). */
function stickyDy(n: UiNode): number {
  if (!n.sticky || n.top === UNSET) return 0;
  let p = n.parent;
  while (p >= 0 && nodes[p].scroll === 0) p = nodes[p].parent;
  if (p < 0) return 0;
  const sc = nodes[p];
  let dy = sc.y + sc.sy + n.top - n.y;
  if (dy <= 0) return 0;
  const par = n.parent >= 0 ? nodes[n.parent] : sc;
  const room = par.y + par.lh - par.pb - (n.y + n.lh);
  return dy < room ? dy : (room > 0 ? room : 0);
}
/** Children in paint order (hit test: the reverse): by z-index, a stable sort; null when none has a z-index or is sticky (the order of the tree). */
function zSorted(n: UiNode): i32[] | null {
  let any = false;
  for (const c of n.children) { const q = nodes[c]; if (q.z !== 0 || q.sticky) { any = true; break; } }
  if (!any) return null;
  const out: i32[] = [];
  for (const c of n.children) out.push(c);
  for (let i = 1; i < out.length; i++) {
    const c = out[i], zc = nodes[c].z !== 0 ? nodes[c].z : nodes[c].sticky ? 1 : 0;
    let j = i - 1;
    while (j >= 0 && (nodes[out[j]].z !== 0 ? nodes[out[j]].z : nodes[out[j]].sticky ? 1 : 0) > zc) { out[j + 1] = out[j]; j--; }
    out[j + 1] = c;
  }
  return out;
}
/** Topmost node under (px, py) that `wants` the mode, through clips, scroll offsets and style transforms. */
function hitIn(h: i32, px: number, py: number, ox: number, oy: number, k: number, mode: i32): i32 {
  const n = node(h);
  if (n.hidden || n.invisible || n.noPointer || (n.layer && h !== layerPass)) return -1;
  const sd = n.sticky ? stickyDy(n) : 0;
  let x = (n.x + n.tx) * k + ox, y = (n.y + n.ty + sd) * k + oy, kk = k * n.k;
  if (n.tf !== null) { const s = tfK(n); x += n.lw * kk * (1 - s) / 2; y += n.lh * kk * (1 - s) / 2; kk *= s; untransform(n, px, py, x + n.lw * kk / 2, y + n.lh * kk / 2); px = tpx; py = tpy; }
  const inside = px >= x && py >= y && px < x + n.lw * kk && py < y + n.lh * kk;
  if (n.overflow && n.tag !== FRAGMENT && !inside) return -1;
  const cx = x - (n.x + n.sx) * kk, cy = y - (n.y + n.sy) * kk;
  const zs = zSorted(n);
  for (let i = n.children.length - 1; i >= 0; i--) {
    const r = hitIn(zs !== null ? zs[i] : n.children[i], px, py, cx, cy, kk, mode);
    if (r >= 0) return r;
  }
  if (n.tag !== FRAGMENT && inside && wants(n, mode)) return h;
  return -1;
}
function hit(px: number, py: number, mode: i32): i32 {
  if (layers.length > 0) { const l = layerHit(px, py, mode, 0); if (l !== -2) return l; }
  return root < 0 ? -1 : hitIn(root, px, py, 0, 0, 1, mode);
}
let boxX: number = 0, boxY: number = 0, boxK: number = 1;
/** Surface position (boxX, boxY) and scale (boxK) of a node's box. */
function boxOf(h: i32): void {
  const chain: i32[] = [];
  for (let p = h; p >= 0; p = nodes[p].parent) { chain.push(p); if (nodes[p].layer) break; }  // a layer is placed on the surface
  let ox: number = 0, oy: number = 0, k: number = 1;
  for (let i = chain.length - 1; i >= 1; i--) {
    const a = nodes[chain[i]];
    let x = (a.x + a.tx) * k + ox, y = (a.y + a.ty + (a.sticky ? stickyDy(a) : 0)) * k + oy, kk = k * a.k;
    if (a.tf !== null) { const s = tfK(a); x += a.lw * kk * (1 - s) / 2; y += a.lh * kk * (1 - s) / 2; kk *= s; }
    ox = x - (a.x + a.sx) * kk; oy = y - (a.y + a.sy) * kk; k = kk;
  }
  const n = nodes[h];
  boxX = (n.x + n.tx) * k + ox; boxY = (n.y + n.ty + (n.sticky ? stickyDy(n) : 0)) * k + oy; boxK = k * n.k;
  if (n.tf !== null) { const s = tfK(n); boxX += n.lw * boxK * (1 - s) / 2; boxY += n.lh * boxK * (1 - s) / 2; boxK *= s; }
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
const hoverA: i32[] = [], hoverB: i32[] = [];
let hoverPath: i32[] = hoverA;
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
  if (kind >= PTAP) return kind === PTAP ? t.tap : kind === PLONG ? t.long : kind === PDRAG ? t.drag : kind === PPINCH ? t.pinch : t.cancel;
  return kind === PDOWN ? t.down : kind === PMOVE ? t.move : kind === PUP ? t.up : kind === PDBL ? t.dbl : kind === PCONTEXT ? t.ctx : kind === PWHEEL ? t.wheel : kind === PENTER ? t.enter : t.leave;
}
/** Nearest node from h up with a handler of `kind` (stopping at a button or text field when `stop`). */
function bubble(h: i32, kind: i32, stop: boolean): i32 {
  for (let p = h; p >= 0; p = nodes[p].parent) {
    const n = nodes[p];
    if (handlerOf(n, kind) !== null) return isDisabled(p) ? -1 : p;
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
let keyboardFocus = false;   // the last input was the keyboard: focus-visible: applies
function setFocusTo(h: i32): void {
  if (focus === h) return;
  if (focus >= 0 && nodes[focus].alive) { const e = nodes[focus].ed; if (e !== null) commit(e as Edit); }
  focus = h;
  if (h >= 0) { const e = nodes[h].ed; if (e !== null) { e.blinkAt = clock; e.reveal = true; } }
  paintDirty = true;
  for (const f of focusHandlers) f(h);
}
const focusHandlers: ((h: i32) => void)[] = [];
/** Called with the new focused node (-1: none) whenever the focus moves (virtual keyboards show / hide on it). */
export function onFocusChange(f: (h: i32) => void): void { focusHandlers.push(f); }
/** Gives the keyboard focus to a node (-1: none). A text field starts the text input. */
export function focusNode(h: i32): void { setFocusTo(h); }
export function focused(): i32 { if (overlays.length > 0 || restoreTo >= 0) flushOverlays(); return focus; }
function focusStep(back: boolean): void {
  keyboardFocus = true;
  const list: i32[] = [];
  focusables(focusRoot(), list);
  if (list.length > 1) tabOrder(list);
  if (list.length === 0) return;
  const i = list.indexOf(focus);
  setFocusTo(i < 0 ? list[0] : list[(i + (back ? list.length - 1 : 1)) % list.length]);
  const e = nodes[focus].ed;
  if (e !== null && !e.multi) { e.anchor = 0; moveTo(e as Edit, e.value.length, true); }  // like browsers: Tab into a field selects it
}
function pointerMove(px: number, py: number): void {
  // drag to scroll: past a few pixels the press becomes a scroll gesture
  if ((held & 1) !== 0 && grabber === -1 && (dragScroller >= 0 || dragCands.length > 0)) arbitrate(px, py);
  else if ((held & 1) !== 0 && grabber >= 0 && grabber !== dragScroller && (px !== ptrX || py !== ptrY)) gestureMove(px, py);
  if ((held & 1) !== 0 && dragScroller >= 0) {
    if (dragging) {
      directScroll(dragScroller, -(px - lastX), -(py - lastY));
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
  if (tsDrag && tsNode >= 0 && (held & 1) !== 0) { boxOf(tsNode); const nb = tsPosAt(nodes[tsNode], (px - boxX) / boxK, (py - boxY) / boxK); if (nb !== tsB) { tsB = nb; paintDirty = true; } }
  if (capture >= 0) { fire(capture, PMOVE, px, py, -1); return; }
  if (grabKind !== 0) return;   // a gesture took this press: raw handlers got onPointerCancel
  const t = bubble(hit(px, py, HIT_ANY), PMOVE, false);
  if (t >= 0) fire(t, PMOVE, px, py, -1);
}
function keepsFocus(h: i32): boolean { for (let p = h; p >= 0; p = nodes[p].parent) if (nodes[p].keepFocus) return true; return false; }
// ---- selection of static text (select-text, ZN-270): positions run over the displayed lines laid end to end
let tsNode: i32 = -1, tsA: i32 = 0, tsB: i32 = 0, tsDrag = false;
function tsStart(n: UiNode, line: i32): i32 { let k = 0; for (let i = 0; i < line; i++) k += n.lines[i].length; return k; }
function tsPosAt(n: UiNode, lx: number, ly: number): i32 {
  if (n.lines.length === 0) return 0;
  const lh = lineHeightOf(n), f = n.fontId;
  const line = Math.max(0, Math.min(n.lines.length - 1, Math.floor((ly - n.pt) / lh)));
  const text = n.lines[line], free = n.lw - n.pl - n.pr - n.lineW[line];
  const x = lx - n.pl - (n.talign === 1 ? Math.floor(free / 2) : n.talign === 2 ? free : 0);
  let col = 0, prev = 0;
  for (let c = 1; c <= text.length; c++) {
    const w = textWidth(f, text.slice(0, c), trackPx(n));
    if (w >= x) { col = x - prev < w - x ? c - 1 : c; break; }
    prev = w; col = c;
  }
  return tsStart(n, line) + col;
}
/** The selected text of the static text node, lines of a wrapped paragraph joined by a space. */
function tsSelected(): string {
  if (tsNode < 0 || !nodes[tsNode].alive || tsA === tsB) return '';
  const n = nodes[tsNode], a = imin(tsA, tsB), b = imax(tsA, tsB);
  let out = '', at = 0;
  for (let i = 0; i < n.lines.length; i++) {
    const t = n.lines[i], s0 = imax(a, at), s1 = imin(b, at + t.length);
    if (s1 > s0) out += (out.length > 0 ? ' ' : '') + t.slice(s0 - at, s1 - at);
    at += t.length;
  }
  return out;
}
/** The selected text of a static node, for tests and for programs that copy it. */
export function selectedStaticText(): string { return tsSelected(); }
function pressAt(px: number, py: number, button: i32): void {
  keyboardFocus = false;
  held = held | bitOf(button);
  if (button === lastBtn && clock - lastDownAt < 400 && Math.abs(px - lastDownX) + Math.abs(py - lastDownY) < 6) clicks++; else clicks = 1;
  lastBtn = button; lastDownAt = clock; lastDownX = px; lastDownY = py;
  if (overlays.length > 0) outsidePress(px, py, button);
  const t = hit(px, py, HIT_ANY);
  if (t >= 0 && isDisabled(t)) { hoverDirty = true; return; }   // a disabled subtree swallows the press
  const d = bubble(t, PDOWN, true);
  if (d >= 0 && capture < 0) { capture = d; captureBtn = button; }
  if (d >= 0) fire(d, PDOWN, px, py, button);
  if (button === 2) { const c = bubble(t, PCONTEXT, false); if (c >= 0) fire(c, PCONTEXT, px, py, button); }
  if (clicks === 2 && button === 0) { const c = bubble(t, PDBL, true); if (c >= 0) fire(c, PDBL, px, py, button); }
  if (button !== 0) return;
  if (tsNode >= 0 && tsNode !== t) { tsNode = -1; paintDirty = true; }
  if (t >= 0 && nodes[t].selectable && nodes[t].tag === TEXT) {
    boxOf(t);
    tsNode = t; tsA = tsB = tsPosAt(nodes[t], (px - boxX) / boxK, (py - boxY) / boxK); tsDrag = true; paintDirty = true;
  }
  if (keepsFocus(t)) {
    // a virtual keyboard key: it activates on release like a button, but the focused field keeps the focus
    const h = hit(px, py, HIT_CLICK);
    if (h >= 0) { pressed = h; paintDirty = true; }
  } else if (t >= 0 && nodes[t].ed !== null) {
    // text field: caret, word / line selection, drag to select
    setFocusTo(t);
    boxOf(t);
    editPress(t, nodes[t], nodes[t].ed as Edit, (px - boxX) / boxK, (py - boxY) / boxK, clicks, (curMods & SHIFT) !== 0);
    selecting = t;
  } else {
    const h = hit(px, py, HIT_CLICK);
    if (h >= 0 && !isDisabled(h)) { setFocusTo(h); pressed = h; paintDirty = true; }
    else if (h < 0) {
      // the nearest focusable node takes the focus; a click elsewhere blurs a text field
      let fz = t;
      while (fz >= 0 && !nodes[fz].focusable) fz = nodes[fz].parent;
      if (fz >= 0) setFocusTo(fz);
      else if (focus >= 0 && nodes[focus].ed !== null) setFocusTo(-1);
    }
  }
  dragScroller = selecting >= 0 || keepsGrab(capture) || !dragScrolls() ? -1 : scrollerTop(px, py, 3);
  dragX = px; dragY = py; lastX = px; lastY = py; dragging = false;
  if (dragScroller >= 0) { catchScroll(dragScroller); wakeScroll(dragScroller); }   // a press stops the inertia
  if (button === 0) gestureBegin(t, px, py);
  hoverDirty = true;
}
function releaseAt(px: number, py: number, button: i32): void {
  held = held & ~bitOf(button);
  if (capture >= 0 && button === captureBtn) { const c = capture; capture = -1; fire(c, PUP, px, py, button); }
  else if (capture < 0 && grabKind === 0) { const u = bubble(hit(px, py, HIT_ANY), PUP, false); if (u >= 0) fire(u, PUP, px, py, button); }
  hoverDirty = true;
  if (button !== 0) return;
  gestureEnd(px, py);
  selecting = -1;
  tsDrag = false;
  if (pressed >= 0) {
    const h = pressed;
    pressed = -1;
    if (!dragging && hit(px, py, HIT_CLICK) === h) activate(h);
    paintDirty = true;
  }
  if (dragging && dragScroller >= 0) releaseScroll(dragScroller);   // inertia and bounce from the release velocity
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
  const sc = scrollerTop(px, py, (wy !== 0 ? 1 : 0) | (wx !== 0 ? 2 : 0));
  if (w >= 0 && (sc < 0 || isAncestor(sc, w))) {
    if (handlerOf(nodes[w], PWHEEL) === null) { if (editWheel(w, nodes[w], nodes[w].ed as Edit, wy, wx, sc >= 0)) return; }
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
  // mouse wheel notches: a spring toward a target NOTCH_PX per notch (turning further moves the target)
  const n = node(sc);
  if (wy !== 0 && (n.scroll & 1) !== 0) {
    const a = axisY(n), base = a.mode === WHEEL ? a.target : a.pos;
    a.target = Math.max(0, Math.min(maxScrollY(n), base - wy * NOTCH_PX)); a.mode = WHEEL;
    if ((n.sn.snap & 1) !== 0) a.target = snapTo(n, true, base, -wy > 0 ? 1 : -1);   // a notch moves to the next snap point
  }
  if (wx !== 0 && (n.scroll & 2) !== 0) {
    const a = axisX(n), base = a.mode === WHEEL ? a.target : a.pos;
    a.target = Math.max(0, Math.min(maxScrollX(n), base + wx * NOTCH_PX)); a.mode = WHEEL;
    if ((n.sn.snap & 2) !== 0) a.target = snapTo(n, false, base, wx > 0 ? 1 : -1);
  }
  n.scrolledAt = clock; paintDirty = true;
  wakeScroll(sc);
}
// Trackpad gestures (HAL: pixels resampled at frame time + the finger phase): the scroller under the pointer when
// the gesture starts (or the text area) follows the fingers until they lift, then its inertia takes over. A node
// with its own wheel handler gets the deltas as wheel steps instead.
let padScroller: i32 = -1, padEdit: i32 = -1;
function trackpadInput(px: number, py: number, dx: number, dy: number, phase: i32): void {
  if (phase === 3) { const sc = scrollerTop(px, py, 3); if (sc >= 0) catchScroll(sc); return; }
  if (phase === 0) return;
  if (padEdit < 0 && (padScroller < 0 || !nodes[padScroller].alive)) {
    if (dx === 0 && dy === 0 && phase !== 2) return;
    const w = hit(px, py, HIT_WHEEL);
    const sc = scrollerTop(px, py, (dy !== 0 ? 1 : 0) | (dx !== 0 ? 2 : 0));
    if (w >= 0 && (sc < 0 || isAncestor(sc, w))) {
      const ed = nodes[w].ed;
      if (ed !== null && (ed as Edit).multi && handlerOf(nodes[w], PWHEEL) === null) padEdit = w;   // a text area follows the fingers
      else { wheelInput(px, py, dy / 40, -dx / 40, 1); return; }
    } else padScroller = sc;
    if (padEdit < 0 && sc < 0) return;
  }
  if (padEdit >= 0) {
    if (nodes[padEdit].alive && nodes[padEdit].ed !== null) {
      editDirect(padEdit, nodes[padEdit], nodes[padEdit].ed as Edit, -dx, -dy);
      if (phase === 2) editRelease(padEdit);
    }
    if (phase === 2) padEdit = -1;
    return;
  }
  directScroll(padScroller, -dx, -dy);
  if (phase === 2) { releaseScroll(padScroller); padScroller = -1; }
}
function hasHoverStyle(n: UiNode): boolean { return n.it.hoverBg >= 0 || n.it.hoverFg >= 0 || n.it.hoverBorder >= 0 || n.ov !== null; }
/** Hover path under the pointer: hover: classes, onPointerEnter / onPointerLeave, the cursor shape. */
function updateHover(): void {
  hoverDirty = false;
  const t = ptrX >= 0 ? hit(ptrX, ptrY, HIT_NODE) : -1;
  const old = hoverPath;
  const path = old === hoverA ? hoverB : hoverA;   // two arrays swap: no allocation per call (ZN-192)
  while (path.length > 0) path.pop();
  for (let p = t; p >= 0; p = nodes[p].parent) path.push(p);
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
  if (statefuls.length > 0) syncStates();
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
  if (!ev.handled && key === 'Escape' && overlays.length > 0 && dismissTop()) ev.handled = true;
  if (!ev.handled && keymap.length > 0 && (mods & (CTRL | META)) !== 0) ev.handled = runKeymap(key, mods);
  if (!ev.handled && ev.primary && key === 'c' && !(focus >= 0 && nodes[focus].ed !== null) && tsSelected().length > 0) { setClipboardText(tsSelected()); ev.handled = true; }
  let byApp = ev.handled;
  if (!ev.handled && focus >= 0 && nodes[focus].ed !== null) ev.handled = editKey(focus, nodes[focus], nodes[focus].ed as Edit, ev);
  if (!ev.handled && keymap.length > 0 && (mods & (CTRL | META)) === 0 && runKeymap(key, mods)) { ev.handled = true; byApp = true; }
  const before = ev.handled;
  for (const f of keyHandlers) { if (ev.handled) break; f(ev); }
  if (!before && ev.handled) byApp = true;
  // a printable key the program used (⌥Z as a shortcut) does not also type its character, like DOM preventDefault
  if (byApp && key.length === 1 && (mods & (CTRL | META)) === 0) dropText = true;
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
let dropText = false;   // the text event of a key down that a handler consumed is skipped
function navPressed(b: i32): boolean { return wasPressed(b) || (navKeys & (1 << b)) !== 0; }
function inputFrame(): void {
  curMods = modifiers();
  const px = pointerX(), py = pointerY();
  if (pick !== null) { pickInput(px, py); return; }
  const wy = wheel(), wx = wheelX(), pz = pinch();
  if (wy !== 0 || wx !== 0 || pz !== 1) wheelInput(px, py, wy, wx, pz);
  trackpadInput(px, py, scrollDX(), scrollDY(), scrollPhase());
  // button events in order (fast clicks are not lost), else the held state (HALs without button events)
  const nb = buttonEventCount();
  for (let i = 0; i < nb; i++) pointerSample(buttonEventX(i), buttonEventY(i), buttonEventButton(i), buttonEventDown(i));
  pointerSample(px, py, 0, nb > 0 ? (held & 1) !== 0 : pointerDown());
  if (touchCount() > 0) { touchSeen = true; setCoarse(true); }
  if (touchCount() > 1 || halFingers.length > 0) halTouches();
  const nk = keyCount();
  dropText = false;
  for (let i = 0; i < nk; i++) {
    const kind = keyKind(i);
    if (kind === KeyKind.Text) { if (dropText) dropText = false; else typeInto(focus, keyName(i)); }
    else if (kind === KeyKind.Down || kind === KeyKind.Repeat) dispatchKey(keyName(i), keyMods(i), kind === KeyKind.Repeat);
  }
}

// ---------------------------------------------------------------- frame loop
function focusables(h: i32, out: i32[]): void {
  const n = node(h);
  if (n.hidden || (n.hs !== null && (n.hs as Handlers).disabled)) return;
  if (n.focusable && n.tag !== FRAGMENT && (n.hs === null || (n.hs as Handlers).tabIndex >= 0)) out.push(h);
  for (const c of n.children) focusables(c, out);
}
function activate(h: i32): void {
  if (isDisabled(h)) return;
  const f = node(h).onClick;
  if (f !== null) f();
  paintDirty = true;
}
/** One UI frame: engine clock, animations, input, layout when needed, paint (or keep the previous frame). */
export function frame(dt: number, background: i32): void {
  if (root < 0) return;
  const prof = profiling();
  if (prof) profMark(PROF_APP);
  clock += dt * 1000;
  frameDt = dt;
  stepAnims();
  if (steppers.length > 0) runSteppers();
  if (prof) profMark(PROF_ANIM);
  if (width() !== surfW || height() !== surfH) {  // window resized: responsive classes, then a new layout
    const crossed = surfW < 0 || BREAKPOINT_PX.some((b: i32) => (surfW >= b) !== (width() >= b));
    surfW = width(); surfH = height(); layoutDirty = true; paintDirty = true;
    if (crossed) for (let i = 0; i < nodes.length; i++) if (nodes[i].alive && nodes[i].responsive) { const c = nodes[i].cls; nodes[i].cls = '\u0000'; setClass(i, c); }
  }
  if (layoutDirty) layout();
  if (prof) profMark(PROF_LAYOUT);
  const typing = focus >= 0 && nodes[focus].ed !== null;  // gamepad-style navigation is off while typing
  if (!synthetic) inputFrame();
  stepScroll(dt);
  if (scrollWatch.length > 0) fireScrolls();
  stepEdits(dt);
  if (!typing && (navPressed(Btn.Down) || navPressed(Btn.Right) || navPressed(Btn.Up) || navPressed(Btn.Left) || navPressed(Btn.Select))) focusStep(navPressed(Btn.Up) || navPressed(Btn.Left) || navBack);
  if (focus >= 0 && focus !== focusShown) { focusShown = focus; revealFocus(focus); }
  if (!typing && (navPressed(Btn.A) || navPressed(Btn.Start)) && focus >= 0) { pressed = focus; activate(focus); }
  else if (pressed >= 0 && (held & 1) === 0) { pressed = -1; paintDirty = true; }
  navKeys = 0; navBack = false;
  if (grabber === -1 && longNode >= 0) stepGestures();
  if (overlays.length > 0 || restoreTo >= 0) flushOverlays();
  // text input (IME, on-screen keyboard) follows the focused field; the caret blinks
  const ed = focus >= 0 ? nodes[focus].ed : null;
  const want: i32 = ed !== null && !(ed as Edit).readOnly ? focus : -1;
  if (want !== textOn) {
    if (want >= 0) { boxOf(want); startTextInput(boxX, boxY, nodes[want].lw * boxK, nodes[want].lh * boxK); } else stopTextInput();
    textOn = want;
  }
  if (ed !== null) { const ph = Math.floor((clock - (ed as Edit).blinkAt) / 530); if (ph !== blinkShown) { blinkShown = ph; paintDirty = true; } }
  if (prof) profMark(PROF_INPUT);
  for (const h of virtuals()) syncVirtual(h, node(h));
  if (layoutDirty) layout();
  if (anchors.length > 0) applyAnchors();
  if (prof) profMark(PROF_LAYOUT);
  if (hoverDirty || paintDirty) updateHover();
  if (prof) profMark(PROF_INPUT);
  if (!paintDirty && !animating && anims.length === 0 && steppers.length === 0 && canvases === 0 && scrollers.length === 0 && editScrollers.length === 0) { keep(); return; }
  animating = false;
  paintDirty = false;
  if (background >= 0) clear(background);
  paint(root, 0, 0, 1, 1);
  if (layers.length > 0) paintLayers();
  lastCommands = commandCount();
  if (highlight >= 0 && nodes[highlight].alive) {
    const n = nodes[highlight];
    boxOf(highlight);  // on the surface: through scroll offsets, transforms and layers
    rrect(boxX, boxY, n.lw * boxK, n.lh * boxK, 0, 0x3b82f6, 90);
    border(boxX, boxY, n.lw * boxK, n.lh * boxK, 0, 1, 0x60a5fa, 255);
  }
  if (prof) profMark(PROF_PAINT);
}
const PROF_APP: i32 = 0, PROF_INPUT: i32 = 1, PROF_ANIM: i32 = 2, PROF_LAYOUT: i32 = 3, PROF_PAINT: i32 = 4;  // gfx.cpp prof phases
// ---------------------------------------------------------------- inspector hooks (plugins/devtools)
let highlight: i32 = -1;
/** Root handle, or -1. */
export function inspectRoot(): i32 { return root; }
/** A live node, or null (freed or out of range). */
export function inspectNode(h: i32): UiNode | null { return h >= 0 && h < nodes.length && nodes[h].alive ? nodes[h] : null; }
/** Draws a highlight box over node h (-1: none). */
export function inspectHighlight(h: i32): void { if (highlight !== h) { highlight = h; paintDirty = true; } }
/** Interaction state for the inspector: "hover", "focus", "active", "disabled" (space-separated, '' for none). */
export function inspectState(h: i32): string {
  const n = nodes[h], s: string[] = [];
  if (n.hovered) s.push('hover');
  if (focus === h) s.push('focus');
  if (pressed === h) s.push('active');
  if (n.hs !== null && (n.hs as Handlers).disabled) s.push('disabled');
  return s.join(' ');
}
const componentNames = new Map<i32, string>();
/** Name of the component a wrapper node stands for (dev builds: recorded by the JSX compiler for the inspector). */
export function setComponentName(h: i32, name: string): void { componentNames.set(h, name); }
/** '' when the node is not a component's wrapper. */
export function componentName(h: i32): string { return componentNames.get(h) ?? ''; }
let pick: ((h: i32, pressed: boolean) => void) | null = null, pickDown = false;
/** Pick mode (the DevTools inspect arrow): the pointer highlights the node under it and f gets it, pressed on a
 *  click; the app gets no pointer or key input meanwhile. null ends it. */
export function inspectPick(f: ((h: i32, pressed: boolean) => void) | null): void {
  pick = f; pickDown = pointerDown();
  if (f === null) inspectHighlight(-1);
}
function pickInput(px: number, py: number): void {
  const h = hit(px, py, HIT_NODE);
  let pressed = false;
  for (let i = 0; i < buttonEventCount(); i++) if (buttonEventDown(i)) pressed = true;
  const down = pointerDown();
  if (down && !pickDown) pressed = true;
  pickDown = down;
  inspectHighlight(h);
  if (pick !== null) (pick as (h: i32, pressed: boolean) => void)(h, pressed);
}
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
/** Draw commands the last painted frame recorded (tests assert what a style costs: a ring is one border). */
let lastCommands: i32 = 0;
export function lastFrameCommands(): i32 { return lastCommands; }
/** The mounted root (-1 before mount): where a program hangs nodes made outside its tree (an alert). */
export function rootNode(): i32 { return root; }
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
export function tick(ms: number): void { clock += ms; stepAnims(); if (steppers.length > 0) runSteppers(); if (grabber === -1 && longNode >= 0) stepGestures(); }

// ---------------------------------------------------------------- input test hooks: from the first call on, the
// HAL's pointer and keyboard are ignored, so runs are identical on the sim and on native targets.
/** Pointer at (x, y) with `button` (0 left, 1 middle, 2 right) held or not: moves, presses, releases, drags. */
export function pointerAt(x: number, y: number, down: boolean, button: i32 = 0, mods: i32 = 0): void {
  synthetic = true; setCoarse(false);
  curMods = mods;
  if (layoutDirty) layout();
  if (overlays.length > 0 || restoreTo >= 0) flushOverlays();
  pointerSample(x, y, button, down);
  updateHover();
}
/** Mouse wheel / trackpad at (x, y): dy steps (+ up), dx steps (+ right), pinch factor. */
export function wheelAt(x: number, y: number, dy: number, dx: number = 0, pinchBy: number = 1): void {
  synthetic = true;
  if (layoutDirty) layout();
  wheelInput(x, y, dy, dx, pinchBy);
}
/** A trackpad sample, as the HAL reports it: dx / dy pixels (+ = up / left), phase 1 fingers down, 2 lifted, 3 landed. */
export function trackpadAt(x: number, y: number, dx: number, dy: number, phase: i32): void {
  synthetic = true;
  if (layoutDirty) layout();
  trackpadInput(x, y, dx, dy, phase);
}
/** Key down (key names like gfx keyName: 'a', 'Enter', 'ArrowLeft'...) with the focus on h (-1: keep the focus).
 *  Returns whether something handled it. */
export function keyDown(h: i32, key: string, mods: i32 = 0): boolean {
  synthetic = true;
  keyboardFocus = true;
  if (h >= 0) setFocusTo(h);
  if (layoutDirty) layout();
  if (overlays.length > 0 || restoreTo >= 0) flushOverlays();
  return dispatchKey(key, mods, false).handled;
}
// ---- virtual keyboards (lib/std/kit/keyboard.tsx): the same path as the physical keyboard, not the test hooks
/** Types `s` into the focused text field (replacing the selection), like typed text. */
export function insertText(s: string): void { if (focus >= 0) { typeInto(focus, s); paintDirty = true; } }
/** A key press as the physical keyboard would send it ('Backspace', 'Enter', 'ArrowLeft', 'Tab'...). */
export function sendKey(key: string, mods: i32 = 0): boolean { if (layoutDirty) layout(); return dispatchKey(key, mods, false).handled; }
/** The focused editable text field, or -1. */
export function focusedField(): i32 { return focus >= 0 && nodes[focus].ed !== null && !(nodes[focus].ed as Edit).readOnly ? focus : -1; }
/** inputMode of a text field (0 text, 1 numeric, 2 decimal, 3 tel, 4 email, 5 url, 6 search); multiline: 7. */
export function fieldMode(h: i32): i32 { const e = nodes[h].ed; return e !== null && (e as Edit).multi ? 7 : nodes[h].inputMode; }
/** Text typed into the focused field (focus moves to h first when h >= 0). */
export function typeText(h: i32, s: string): void {
  synthetic = true;
  if (h >= 0) setFocusTo(h);
  if (layoutDirty) layout();
  typeInto(focus, s);
}

// ================================================================ interaction (docs/ui.md "Gestures", "Focus scopes and
// keymaps", "Layers"; docs/reports/qt-comparison.md §8–9, kit-v2 engine items 1–4): gesture arbitration, multitouch,
// focus scopes, keymaps, layers, anchored positioning and dismissal. Nothing here costs anything until a program uses it.

function hsOf(n: UiNode): Handlers { let s = n.hs; if (s === null) { s = new Handlers(); n.hs = s; } return s as Handlers; }
/** setNumber keys of this section: grab (1: keep), dragAxis (1 x, 2 y, 3 both), dragThreshold, tabIndex, disabled. */
function applyInteraction(n: UiNode, key: string, iv: i32, v: number): boolean {
  if (key === 'grab') { hsOf(n).keep = iv === 1; hsOf(n).keepX = iv === 2; return true; }
  if (key === 'dragAxis') { hsOf(n).dragAxis = iv; return true; }
  if (key === 'dragThreshold') { hsOf(n).dragThreshold = v; return true; }
  if (key === 'tabIndex') { hsOf(n).tabIndex = iv; n.focusable = true; return true; }
  if (key === 'disabled') { hsOf(n).disabled = iv !== 0; paintDirty = true; return true; }
  if (key === 'ariaHidden') { n.ariaHidden = iv !== 0; return true; }
  return false;
}
/** The node or an ancestor has `disabled`: no pointer events, no activation, no focus. */
export function isDisabled(h: i32): boolean {
  for (let p = h; p >= 0; p = nodes[p].parent) { const s = nodes[p].hs; if (s !== null && (s as Handlers).disabled) return true; }
  return false;
}
function keepsX(h: i32): boolean { if (h < 0) return false; const s = nodes[h].hs; return s !== null && (s as Handlers).keepX; }
function keepsGrab(h: i32): boolean { if (h < 0) return false; const s = nodes[h].hs; return s !== null && (s as Handlers).keep; }

// ---- gesture arbitration (Qt pointer handlers): the press goes to the raw onPointerDown node (capture) and, passively,
// to every onDrag ancestor and to the scroll container under it. The first of them, innermost first, whose threshold
// the pointer crosses (along its axis; 8 px for scrolling) takes the exclusive grab: the capture node gets
// onPointerCancel and no click / tap follows. grab="keep" on the capture node stops the stealing.
const SLOP: number = 8, LONG_MS: number = 500;
let grabber: i32 = -1, grabKind: i32 = 0;      // exclusive grab of the current press: 1 scroll, 2 drag, 3 pinch
let dragCands: i32[] = [];
let pressX: number = 0, pressY: number = 0, pressMs: number = 0, gHit: i32 = -1;
let tapNode: i32 = -1, longNode: i32 = -1, longFired = false;
function gestureBegin(t: i32, px: number, py: number): void {
  grabber = -1; grabKind = 0; longFired = false; pressX = px; pressY = py; pressMs = clock; gHit = t;
  tapNode = -1; longNode = -1; dragCands = [];
  if (selecting >= 0) return;   // a text selection keeps the pointer
  tapNode = bubble(t, PTAP, false); longNode = bubble(t, PLONG, false);
  const keep = keepsGrab(capture);
  let scroller = false;
  for (let p = t; p >= 0; p = nodes[p].parent) {
    if (p === dragScroller) { dragCands.push(p); scroller = true; }
    else if (!keep && handlerOf(nodes[p], PDRAG) !== null && !isDisabled(p)) dragCands.push(p);
  }
  if (!scroller && dragScroller >= 0) dragCands.push(dragScroller);
}
function arbitrate(px: number, py: number): void {
  const dx = px - pressX, dy = py - pressY;
  for (const c of dragCands) {
    const n = nodes[c];
    if (!n.alive) continue;
    let crossed = false;
    if (c === dragScroller) {
      crossed = ((n.scroll & 1) !== 0 && n.contentH > n.lh && Math.abs(dy) > SLOP) || ((n.scroll & 2) !== 0 && n.contentW > n.lw && Math.abs(dx) > SLOP);
      if (crossed && keepsX(capture) && Math.abs(dy) < 2 * Math.abs(dx)) crossed = false;   // a keep-x node (slider) keeps its horizontal drags
    }
    else {
      const s = n.hs as Handlers, th = s.dragThreshold;
      crossed = s.dragAxis === 1 ? Math.abs(dx) > th : s.dragAxis === 2 ? Math.abs(dy) > th : dx * dx + dy * dy > th * th;
    }
    if (crossed) { takeGrab(c, c === dragScroller ? 1 : 2, px, py); return; }
  }
}
function takeGrab(c: i32, kind: i32, px: number, py: number): void {
  grabber = c; grabKind = kind;
  if (capture >= 0 && capture !== c) {
    const cap = capture;
    capture = -1;
    if (handlerOf(nodes[cap], PCANCEL) !== null) fire(cap, PCANCEL, px, py, 0);
  }
  if (pressed >= 0) { pressed = -1; paintDirty = true; }
  selecting = -1;
  if (kind === 1) { dragging = true; return; }
  if (dragScroller >= 0 && dragging) releaseScroll(dragScroller);
  dragScroller = -1; dragging = false;
  if (kind === 2) fireGesture(c, PDRAG, px, py, 0);
}
function gestureMove(px: number, py: number): void {
  if (grabKind === 3) { if (pinching) pinchUpdate(px, py); return; }
  if (grabKind === 2 && nodes[grabber].alive) fireGesture(grabber, PDRAG, px, py, 1);
}
function gestureEnd(px: number, py: number): void {
  if (grabKind === 2 && nodes[grabber].alive) fireGesture(grabber, PDRAG, px, py, 2);
  else if (grabKind === 3 && pinching) pinchEnd(px, py);
  else if (grabber === -1 && !longFired && tapNode >= 0 && nodes[tapNode].alive && isAncestor(tapNode, hit(px, py, HIT_NODE))) fireGesture(tapNode, PTAP, px, py, 0);
  grabber = -1; grabKind = 0; tapNode = -1; longNode = -1; dragCands = []; pinching = false;
}
/** Long press: held LONG_MS without a grab taken; the click and the tap are dropped. */
function stepGestures(): void {
  if ((held & 1) === 0 || longFired || longNode < 0 || !nodes[longNode].alive || clock - pressMs < LONG_MS) return;
  longFired = true;
  if (pressed >= 0) { pressed = -1; paintDirty = true; }
  fireGesture(longNode, PLONG, ptrX, ptrY, 0);
}
function fireGesture(h: i32, kind: i32, gx: number, gy: number, phase: i32): void {
  boxOf(h);
  const e = new PointerEvent();
  e.gx = gx; e.gy = gy; e.x = (gx - boxX) / boxK; e.y = (gy - boxY) / boxK; e.mods = curMods; e.clicks = clicks;
  e.phase = phase; e.dx = gx - pressX; e.dy = gy - pressY; e.scale = pinchScale; e.rotation = pinchRot;
  const f = handlerOf(nodes[h], kind);
  if (f !== null) f(e);
}

// ---- multitouch: the first finger is the pointer (everything above); a second finger over an onPinch node (from the
// press up) takes the grab from anything else and pinches: scale and rotation since it landed, at the centroid.
let primaryId: i32 = -1;                                        // touchAt: the finger driving the pointer
let fIds: i32[] = [], fXs: number[] = [], fYs: number[] = [];   // the other fingers
let pinching = false, pinchD0: number = 1, pinchA0: number = 0, pinchScale: number = 1, pinchRot: number = 0;
let halPrimary: i32 = -1, halFingers: i32[] = [];
function secondFinger(): void {
  if ((held & 1) === 0 || pinching) return;
  let pn = bubble(gHit, PPINCH, false);
  if (pn < 0) pn = bubble(hit(fXs[0], fYs[0], HIT_ANY), PPINCH, false);
  if (pn < 0) return;
  if (grabKind === 2 && nodes[grabber].alive) fireGesture(grabber, PDRAG, ptrX, ptrY, 3);
  takeGrab(pn, 3, ptrX, ptrY);
  pinching = true; pinchScale = 1; pinchRot = 0;
  const dx = fXs[0] - ptrX, dy = fYs[0] - ptrY;
  pinchD0 = Math.max(1, Math.sqrt(dx * dx + dy * dy)); pinchA0 = Math.atan2(dy, dx);
  fireGesture(pn, PPINCH, (ptrX + fXs[0]) / 2, (ptrY + fYs[0]) / 2, 0);
}
function pinchUpdate(ax: number, ay: number): void {
  const dx = fXs[0] - ax, dy = fYs[0] - ay;
  pinchScale = Math.sqrt(dx * dx + dy * dy) / pinchD0;
  let r = Math.atan2(dy, dx) - pinchA0;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  pinchRot = r;
  if (nodes[grabber].alive) fireGesture(grabber, PPINCH, (ax + fXs[0]) / 2, (ay + fYs[0]) / 2, 1);
}
function pinchEnd(ax: number, ay: number): void {
  pinching = false;
  const bx = fXs.length > 0 ? fXs[0] : ax, by = fYs.length > 0 ? fYs[0] : ay;
  if (nodes[grabber].alive) fireGesture(grabber, PPINCH, (ax + bx) / 2, (ay + by) / 2, 2);
}
/** A finger other than the pointer one: phase 0 down, 1 move, 2 up. */
function touchSecondary(id: i32, x: number, y: number, phase: i32): void {
  const i = fIds.indexOf(id);
  if (phase === 0) { if (i < 0) { fIds.push(id); fXs.push(x); fYs.push(y); if (fIds.length === 1) secondFinger(); } return; }
  if (i < 0) return;
  fXs[i] = x; fYs[i] = y;
  if (phase === 2) {
    if (i === 0 && pinching) pinchEnd(ptrX, ptrY);
    fIds.splice(i, 1); fXs.splice(i, 1); fYs.splice(i, 1);
  } else if (i === 0 && pinching) pinchUpdate(ptrX, ptrY);
}
/** HAL touch screens: the pointer already follows the first finger (mouse emulation); the others come from here. */
function halTouches(): void {
  const n = touchCount();
  const ids: i32[] = [];
  for (let i = 0; i < n; i++) ids.push(touchId(i));
  if (halPrimary >= 0 && ids.indexOf(halPrimary) < 0) halPrimary = -1;
  if (halPrimary < 0 && halFingers.length === 0 && n > 0) halPrimary = ids[0];
  for (const id of halFingers.slice()) if (ids.indexOf(id) < 0) {
    const k = fIds.indexOf(id);
    touchSecondary(id, k >= 0 ? fXs[k] : 0, k >= 0 ? fYs[k] : 0, 2);
    halFingers.splice(halFingers.indexOf(id), 1);
  }
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    if (id === halPrimary) continue;
    const known = halFingers.indexOf(id) >= 0;
    if (!known) halFingers.push(id);
    touchSecondary(id, touchX(i), touchY(i), known ? 1 : 0);
  }
}
/** Test hook: finger `id` at (x, y), phase 0 down, 1 move, 2 up. The first finger down drives the pointer (taps,
 *  scrolling, drags); the next ones pinch. Deterministic multi-finger tests, like pointerAt. */
export function touchAt(id: i32, x: number, y: number, phase: i32): void {
  synthetic = true; touchSeen = true; setCoarse(true);
  if (layoutDirty) layout();
  if (overlays.length > 0 || restoreTo >= 0) flushOverlays();
  if (id === primaryId || (primaryId < 0 && phase === 0 && fIds.indexOf(id) < 0)) {
    primaryId = phase === 2 ? -1 : id;
    pointerSample(x, y, 0, phase !== 2);
  } else touchSecondary(id, x, y, phase);
  updateHover();
}

// ---- focus scopes, dismissal, outside presses: one record per node, following whether the node is on screen
// (mounted and not hidden), so kit overlays that stay mounted and toggle `hidden` behave like mounted / unmounted ones.
class Overlay {
  node: i32;
  scope = false; trap = false; restore = false; auto = false;
  prev: i32 = -1;                                     // the focus when the scope showed
  dismiss: (() => void) | null = null;
  outside: ((e: PointerEvent) => void) | null = null;
  except: i32 = -1;
  shown = false; seq: i32 = 0;
  constructor(node: i32) { this.node = node; }
}
const overlays: Overlay[] = [];
let overlaySeq: i32 = 0, restoreTo: i32 = -1;
function overlayOf(h: i32): Overlay {
  for (const o of overlays) if (o.node === h) return o;
  const o = new Overlay(h);
  overlays.push(o);
  return o;
}
export interface FocusScopeOptions { trap?: boolean; restore?: boolean; autoFocus?: boolean }
/**
 * Makes h a focus scope. trap: Tab / Shift+Tab and the arrow navigation cycle inside it while it is on screen (the
 * latest shown trap wins). restore: when it leaves the screen, the focus goes back to where it was when it showed.
 * autoFocus: when it shows, its first focusable node takes the focus.
 */
export function focusScope(h: i32, o: FocusScopeOptions): void {
  const r = overlayOf(h);
  r.scope = true; r.trap = o.trap ?? false; r.restore = o.restore ?? false; r.auto = o.autoFocus ?? false;
}
/** Escape closes the most recently shown node with a dismiss handler (a stack of overlays). */
export function onDismiss(h: i32, f: () => void): void { overlayOf(h).dismiss = f; }
/** f runs when a press lands outside h (and outside `except`, the button that toggles it) while h is on screen. */
export function onOutsidePointer(h: i32, f: (e: PointerEvent) => void, except: i32 = -1): void { const r = overlayOf(h); r.outside = f; r.except = except; }
/** The focused node is h or inside it (what focus-within: styles follow). */
export function hasFocusWithin(h: i32): boolean { if (overlays.length > 0 || restoreTo >= 0) flushOverlays(); return focus >= 0 && isAncestor(h, focus); }
/** Mounted, not hidden, and on screen (reaches the root, or is a free layer). */
function shownNow(h: i32): boolean {
  if (h < 0 || h >= nodes.length) return false;
  for (let p = h; p >= 0; p = nodes[p].parent) {
    const n = nodes[p];
    if (!n.alive || n.hidden) return false;
    if (p === root) return true;
    if (n.parent < 0) return n.layer;
  }
  return false;
}
function flushOverlays(): void {
  if (restoreTo >= 0) { const r = restoreTo; restoreTo = -1; if (focus < 0 && shownNow(r)) setFocusTo(r); }
  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i];
    const vis = shownNow(o.node);
    if (vis === o.shown) continue;
    o.shown = vis;
    if (vis) {
      o.seq = ++overlaySeq;
      if (!o.scope) continue;
      o.prev = focus;
      if (o.auto && (focus < 0 || !isAncestor(o.node, focus))) {
        const l: i32[] = [];
        focusables(o.node, l);
        if (l.length > 1) tabOrder(l);
        if (l.length > 0) setFocusTo(l[0]);
      }
    } else if (o.scope && o.restore && (focus < 0 || isAncestor(o.node, focus))) setFocusTo(o.prev >= 0 && shownNow(o.prev) ? o.prev : -1);
  }
}
/** Where Tab and the arrows look for focusable nodes: the latest trap on screen, else the whole tree. */
function focusRoot(): i32 {
  let best: Overlay | null = null;
  for (const o of overlays) if (o.trap && o.shown && (best === null || o.seq > (best as Overlay).seq)) best = o;
  return best !== null ? (best as Overlay).node : root;
}
function tabIndexOf(h: i32): i32 { const s = nodes[h].hs; return s !== null ? (s as Handlers).tabIndex : 0; }
/** Positive tabIndex first (ascending, stable), then the rest in tree order. */
function tabOrder(list: i32[]): void {
  const pos: i32[] = [], rest: i32[] = [];
  for (const h of list) { if (tabIndexOf(h) > 0) pos.push(h); else rest.push(h); }
  if (pos.length === 0) return;
  for (let i = 1; i < pos.length; i++) {
    const v = pos[i];
    let j = i - 1;
    while (j >= 0 && tabIndexOf(pos[j]) > tabIndexOf(v)) { pos[j + 1] = pos[j]; j--; }
    pos[j + 1] = v;
  }
  let k: i32 = 0;
  for (const h of pos) { list[k] = h; k++; }
  for (const h of rest) { list[k] = h; k++; }
}
function dismissTop(): boolean {
  let best: Overlay | null = null;
  for (const o of overlays) if (o.dismiss !== null && o.shown && (best === null || o.seq > (best as Overlay).seq)) best = o;
  if (best === null) return false;
  const f = (best as Overlay).dismiss;
  if (f !== null) f();
  paintDirty = true;
  return true;
}
function outsidePress(px: number, py: number, button: i32): void {
  const t = hit(px, py, HIT_NODE);
  for (const o of overlays.slice()) {
    const f = o.outside;
    if (f === null || !o.shown || (t >= 0 && isAncestor(o.node, t)) || (o.except >= 0 && t >= 0 && isAncestor(o.except, t))) continue;
    const e = new PointerEvent();
    e.gx = px; e.gy = py; e.x = px; e.y = py; e.button = button; e.mods = curMods;
    f(e);
    paintDirty = true;
  }
}
/** A released node leaves every registry (handles are reused). */
function forget(h: i32): void {
  for (let i = overlays.length - 1; i >= 0; i--) if (overlays[i].node === h) {
    const o = overlays[i];
    if (o.shown && o.scope && o.restore && o.prev >= 0 && o.prev !== h) restoreTo = o.prev;
    overlays.splice(i, 1);
  }
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].node === h) { layers.splice(i, 1); layoutDirty = true; }
  for (let i = anchors.length - 1; i >= 0; i--) if (anchors[i].float === h || anchors[i].target === h) anchors.splice(i, 1);
}

// ---- keymaps (GPUI): bindKeys('cmd-s', 'save', 'Editor'); the deepest keyContext on the focus path that binds the
// keystroke wins, global bindings ('' context) last; the action goes to the nearest onAction handler from the focus up,
// then to the global ones (onAction(-1, ...)). Keys with Cmd / Ctrl are matched before a focused text field edits;
// the others only when the field did not use them (typing never triggers a single-letter binding).
class Binding {
  stroke: string; key: string; mods: i32; action: string; ctx: string;
  constructor(stroke: string, key: string, mods: i32, action: string, ctx: string) { this.stroke = stroke; this.key = key; this.mods = mods; this.action = action; this.ctx = ctx; }
}
const keymap: Binding[] = [];
const globalActs: string[] = [], globalActFns: (() => void)[] = [];
const PRIMARY_MOD: i32 = 16;   // 'mod-': Cmd or Ctrl
// ponytail: one string instead of two arrays (smaller code on MCUs)
const KEY_ALIASES = '|enter=Enter|return=Enter|escape=Escape|esc=Escape|tab=Tab|space= |backspace=Backspace|delete=Delete|up=ArrowUp|down=ArrowDown|left=ArrowLeft|right=ArrowRight|home=Home|end=End|pageup=PageUp|pagedown=PageDown|';
/**
 * Binds a keystroke to an action in a key context ('': everywhere). A keystroke is modifiers and a key joined by
 * '-': 'cmd-s', 'ctrl-shift-p', 'mod-k' (Cmd or Ctrl), 'alt-up', 'escape', 'f5', 'j'. Later bindings win.
 */
export function bindKeys(keys: string, action: string, context: string = ''): void {
  const parts = keys.split('-');
  let key = parts[parts.length - 1];
  let last: i32 = parts.length - 1;
  if (key.length === 0 && parts.length >= 2) { key = '-'; last = parts.length - 2; }   // 'cmd--'
  let mods: i32 = 0;
  for (let i = 0; i < last; i++) {
    const m = parts[i].toLowerCase();
    mods = mods | (m === 'cmd' || m === 'meta' || m === 'super' ? META : m === 'ctrl' ? CTRL : m === 'alt' || m === 'option' ? ALT : m === 'shift' ? SHIFT : m === 'mod' ? PRIMARY_MOD : 0);
  }
  const l = key.toLowerCase(), a = KEY_ALIASES.indexOf(`|${l}=`);
  const canon = a >= 0 ? KEY_ALIASES.slice(a + l.length + 2, KEY_ALIASES.indexOf('|', a + 1)) : l.length === 1 ? l : l.length >= 2 && l.charCodeAt(0) === 102 && l.charCodeAt(1) >= 48 && l.charCodeAt(1) <= 57 ? 'F' + l.slice(1) : key;
  keymap.push(new Binding(keys, canon, mods, action, context));
}
/** A node's key context (keyContext="Editor"). */
export function keyContext(h: i32, ctx: string): void { handlers(h).keyCtx = ctx; }
/** Action handler of a node (runs while it or a descendant has the focus), or a global one with h = -1. */
export function onAction(h: i32, action: string, f: () => void): void {
  if (h < 0) {
    const i = globalActs.indexOf(action);
    if (i >= 0) globalActFns[i] = f; else { globalActs.push(action); globalActFns.push(f); }
    return;
  }
  const s = handlers(h), i = s.acts.indexOf(action);
  if (i >= 0) s.actFns[i] = f; else { s.acts.push(action); s.actFns.push(f); }
}
/** Keystrokes bound to an action, as written in bindKeys (menu and tooltip hints). */
export function keysFor(action: string): string[] { const out: string[] = []; for (const b of keymap) if (b.action === action) out.push(b.stroke); return out; }
/** Runs an action as its keystroke would (menus, command palettes); false when nothing handles it. */
export function dispatchAction(action: string): boolean {
  for (let p = focus; p >= 0; p = nodes[p].parent) {
    const s = nodes[p].hs;
    if (s === null) continue;
    const i = (s as Handlers).acts.indexOf(action);
    if (i >= 0 && !isDisabled(p)) { const f = (s as Handlers).actFns[i]; f(); paintDirty = true; return true; }
  }
  const i = globalActs.indexOf(action);
  if (i < 0) return false;
  const f = globalActFns[i];
  f();
  paintDirty = true;
  return true;
}
function bindingIn(ctx: string, key: string, mods: i32): string {
  for (let i = keymap.length - 1; i >= 0; i--) {
    const b = keymap[i];
    if (b.ctx !== ctx || b.key !== key) continue;
    const ok = (b.mods & PRIMARY_MOD) !== 0 ? (mods & (CTRL | META)) !== 0 && (mods & (SHIFT | ALT)) === (b.mods & (SHIFT | ALT)) : (mods & 15) === b.mods;
    if (ok) return b.action;
  }
  return '';
}
function runKeymap(key: string, mods: i32): boolean {
  let action = '';
  for (let p = focus; p >= 0 && action.length === 0; p = nodes[p].parent) {
    const s = nodes[p].hs;
    if (s !== null && (s as Handlers).keyCtx.length > 0) action = bindingIn((s as Handlers).keyCtx, key, mods);
  }
  if (action.length === 0) action = bindingIn('', key, mods);
  return action.length > 0 && dispatchAction(action);
}

// ---- layers (GPUI deferred): a layer node stays where it is in the tree (its component owns it), but is laid out on
// the whole surface (absolute: its classes place it, or ui.anchor), painted after the root in priority order and
// hit-tested first; the overflow clipping of its ancestors does not apply. A modal layer blocks everything below it.
export interface LayerOptions { priority?: i32; modal?: boolean; backdrop?: i32; backdropAlpha?: i32 }
class Layer {
  node: i32; priority: i32 = 0; modal = false; backdrop: i32 = -1; alpha: i32 = 110; seq: i32 = 0;
  constructor(node: i32) { this.node = node; }
}
const layers: Layer[] = [];   // bottom first: priority, then opening order
let layerSeq: i32 = 0, layerPass: i32 = -1;
/** Opens (or updates) a layer; backdrop: a colour drawn over the whole surface below it (backdropAlpha, default 110). */
export function openLayer(h: i32, o: LayerOptions): void {
  let l: Layer | null = null;
  for (let i = 0; i < layers.length; i++) if (layers[i].node === h) { l = layers[i]; layers.splice(i, 1); break; }
  if (l === null) { l = new Layer(h); l.seq = ++layerSeq; layoutDirty = true; }
  const ll = l as Layer;
  ll.priority = o.priority ?? 0; ll.modal = o.modal ?? false; ll.backdrop = o.backdrop ?? -1; ll.alpha = o.backdropAlpha ?? 110;
  layers.push(ll);
  let at: i32 = layers.length - 1;
  while (at > 0 && (layers[at - 1].priority > ll.priority || (layers[at - 1].priority === ll.priority && layers[at - 1].seq > ll.seq))) { layers[at] = layers[at - 1]; at--; }
  layers[at] = ll;
  node(h).layer = true;
  paintDirty = true;
}
/** Back into its parent's flow. */
export function closeLayer(h: i32): void {
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].node === h) layers.splice(i, 1);
  node(h).layer = false;
  layoutDirty = true;
}
function layoutLayers(): void {
  const W: number = width(), H: number = height();
  for (const l of layers) {
    if (!shownNow(l.node)) continue;
    const n = nodes[l.node];
    measure(n, W, H);
    let cw: number = n.fullW ? W : n.lw, ch: number = n.fullH ? H : n.lh;
    if (n.left !== UNSET && n.right !== UNSET) cw = W - n.left - n.right;
    if (n.top !== UNSET && n.bottom !== UNSET) ch = H - n.top - n.bottom;
    place(n, n.left !== UNSET ? n.left : n.right !== UNSET ? W - n.right - cw : 0, n.top !== UNSET ? n.top : n.bottom !== UNSET ? H - n.bottom - ch : 0, cw, ch);
  }
}
function paintLayers(): void {
  for (const l of layers) {
    if (!shownNow(l.node)) continue;
    if (l.backdrop >= 0) rrect(0, 0, width(), height(), 0, l.backdrop, l.alpha);
    layerPass = l.node;
    paint(l.node, 0, 0, 1, 1);
    layerPass = -1;
  }
}
/** Topmost layer's answer at (px, py): a node, -1 when a modal layer blocks what is below, -2: go on to the tree.
 *  axes > 0: the scroll container (scrollerAt) instead of a hit. */
function layerHit(px: number, py: number, mode: i32, axes: i32): i32 {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!shownNow(l.node)) continue;
    layerPass = l.node;
    const r = axes > 0 ? scrollerAt(l.node, px, py, 0, 0, 1, axes) : hitIn(l.node, px, py, 0, 0, 1, mode);
    layerPass = -1;
    if (r >= 0) return r;
    if (l.modal) return -1;
  }
  return -2;
}
function scrollerTop(px: number, py: number, axes: i32): i32 {
  if (axes === 0) return -1;
  if (layers.length > 0) { const l = layerHit(px, py, HIT_ANY, axes); if (l !== -2) return l; }
  return root < 0 ? -1 : scrollerAt(root, px, py, 0, 0, 1, axes);
}

// ---- anchored positioning (GPUI anchored): a float placed next to a target node or point on every frame, flipped to
// the other side when it does not fit, and kept `margin` px inside the surface.
class Anchor {
  float: i32; target: i32; px: number = 0; py: number = 0;
  side: i32 = 0; align: i32 = 0; offset: number = 4; flip = true; margin: number = 8;
  constructor(float: i32, target: i32) { this.float = float; this.target = target; }
}
const anchors: Anchor[] = [];
const SIDES: string[] = ['bottom', 'top', 'right', 'left'];
function setAnchor(float: i32, target: i32, x: number, y: number, placement: string, offset: number, flip: boolean, margin: number): void {
  let a: Anchor | null = null;
  for (const b of anchors) if (b.float === float) a = b;
  if (a === null) { a = new Anchor(float, target); anchors.push(a); }
  const aa = a as Anchor;
  const dash = placement.indexOf('-');
  const side = SIDES.indexOf(dash < 0 ? placement : placement.slice(0, dash)), al = dash < 0 ? '' : placement.slice(dash + 1);
  aa.target = target; aa.px = x; aa.py = y; aa.side = side < 0 ? 0 : side; aa.align = al === 'start' ? 0 : al === 'end' ? 2 : 1;
  aa.offset = offset; aa.flip = flip; aa.margin = margin;
  paintDirty = true;
}
/** Places `float` next to `target`: placement 'bottom' | 'top' | 'left' | 'right', optionally '-start' / '-end'. */
export function anchor(float: i32, target: i32, placement: string = 'bottom-start', offset: number = 4, flip: boolean = true, margin: number = 8): void {
  setAnchor(float, target, 0, 0, placement, offset, flip, margin);
}
/** Same, next to a surface point (context menus). */
export function anchorPoint(float: i32, x: number, y: number, placement: string = 'bottom-start', offset: number = 0, flip: boolean = true, margin: number = 8): void {
  setAnchor(float, -1, x, y, placement, offset, flip, margin);
}
export function unanchor(float: i32): void { for (let i = anchors.length - 1; i >= 0; i--) if (anchors[i].float === float) anchors.splice(i, 1); }
/** Room on side s (0 bottom, 1 top, 2 right, 3 left) of the box (x, y, w, h). */
function roomOn(s: i32, x: number, y: number, w: number, h: number, off: number, m: number): number {
  return s === 0 ? height() - m - (y + h + off) : s === 1 ? y - off - m : s === 2 ? width() - m - (x + w + off) : x - off - m;
}
function applyAnchors(): void {
  const W: number = width(), H: number = height();
  for (const a of anchors) {
    if (!shownNow(a.float) || (a.target >= 0 && !shownNow(a.target))) continue;
    let tx: number = a.px, ty: number = a.py, tw: number = 0, th: number = 0;
    if (a.target >= 0) { boxOf(a.target); tx = boxX; ty = boxY; tw = nodes[a.target].lw * boxK; th = nodes[a.target].lh * boxK; }
    const n = nodes[a.float], fw = n.lw, fh = n.lh, m = a.margin;
    let side = a.side;
    const here = roomOn(side, tx, ty, tw, th, a.offset, m);
    if (a.flip && here < (side <= 1 ? fh : fw) && roomOn(side ^ 1, tx, ty, tw, th, a.offset, m) > here) side = side ^ 1;
    let x: number = 0, y: number = 0;
    if (side <= 1) {
      y = side === 0 ? ty + th + a.offset : ty - a.offset - fh;
      x = a.align === 0 ? tx : a.align === 2 ? tx + tw - fw : tx + (tw - fw) / 2;
    } else {
      x = side === 2 ? tx + tw + a.offset : tx - a.offset - fw;
      y = a.align === 0 ? ty : a.align === 2 ? ty + th - fh : ty + (th - fh) / 2;
    }
    x = Math.round(Math.max(m, Math.min(x, W - m - fw)));
    y = Math.round(Math.max(m, Math.min(y, H - m - fh)));
    boxOf(a.float);
    const dx = x - (boxX - n.tx * boxK), dy = y - (boxY - n.ty * boxK);
    if (dx !== 0 || dy !== 0) { place(n, n.x + dx / boxK, n.y + dy / boxK, n.lw, n.lh); paintDirty = true; hoverDirty = true; }
  }
}
