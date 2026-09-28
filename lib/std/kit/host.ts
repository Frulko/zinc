// zinc:ui/kit — JSX helpers shared by both UI models.
//
// Kit components are written once, in JSX, and lowered against this module (`@jsxHelpers ./host` at the top of each
// component file). Every helper asks one question: is the React engine rendering this program?
//   - Solid model: dynamic classes and texts become fine-grained effects (the Solid helpers).
//   - React model: a component re-runs as a whole on each render, so dynamic values are simply read once and host
//     nodes come from React's reconciler (reused by position, like any React component).
import * as ui from 'zinc:ui';
import * as solid from 'zinc:ui/solid';
import * as react from 'zinc:ui/react';

/** Solid model (fine-grained effects), unless the program renders with the React (or Inferno) engine. */
function fineGrained(): boolean { return !react._active(); }

// ---- static helpers: identical in both models (node creation goes through React's reconciler when it renders)
export function _el(tag: i32): i32 { return react._el(tag); }
export function _text(parent: i32, s: string): void { react._text(parent, s); }
export function _textOf(n: i32, s: string): void { ui.setText(n, s); }
export function _append(parent: i32, child: i32): void { ui.insert(parent, child, -1); }
export function _class(n: i32, c: string): void { ui.setClass(n, c); }
export function _on(n: i32, f: () => void): void { ui.listen(n, f); }
export function _draw(n: i32, f: (x: i32, y: i32, w: i32, h: i32) => void): void { ui.draw(n, f); }
export function _num(n: i32, key: string, v: number): void { ui.setNumber(n, key, v); }
export function _img(n: i32, src: string): void { ui.setImage(n, src); }
export function _focusable(n: i32): void { ui.setFocusable(n, true); }
export function _ref(n: i32, r: solid.NodeRef): void { r.node = n; }

// ---- dynamic helpers: effects under Solid, one read under React
export function _dynTextOf(n: i32, get: () => string): void {
  if (fineGrained()) solid._dynTextOf(n, get); else ui.setText(n, get());
}
export function _dynText(parent: i32, get: () => string): void {
  if (fineGrained()) solid._dynText(parent, get); else react._text(parent, get());
}
export function _dynClass(n: i32, get: () => string): void {
  if (fineGrained()) solid._dynClass(n, get); else ui.setClass(n, get());
}
export function _dynNum(n: i32, key: string, get: () => number): void {
  if (fineGrained()) solid._dynNum(n, key, get); else ui.setNumber(n, key, get());
}
export function _dynImg(n: i32, get: () => string): void {
  if (fineGrained()) solid._dynImg(n, get); else ui.setImage(n, get());
}

/** <Show when fallback>: a reactive branch under Solid, a plain condition under React. */
export function _show(parent: i32, when: () => boolean, render: () => i32, fallback: (() => i32) | null): void {
  if (fineGrained()) { solid._show(parent, when, render, fallback); return; }
  const frag = react._el(ui.FRAGMENT);
  ui.insert(parent, frag, -1);
  if (when()) ui.insert(frag, render(), -1);
  else if (fallback !== null) ui.insert(frag, fallback(), -1);
}

/** {items.map(...)}: a keyed list under Solid, every item rendered in order under React. */
export function _for<T>(parent: i32, each: () => T[], render: (item: T, i: i32) => i32): void {
  if (fineGrained()) { solid._for(parent, each, render); return; }
  const frag = react._el(ui.FRAGMENT);
  ui.insert(parent, frag, -1);
  const items = each();
  for (let i = 0; i < items.length; i++) ui.insert(frag, render(items[i], i), -1);
}

export function _virtual(n: i32, count: () => i32, itemH: number, render: (i: i32) => i32): void {
  if (fineGrained()) solid._virtual(n, count, itemH, render); else react._virtual(n, count(), itemH, render);
}

/** Renders an optional node-valued prop (`children`, `leading`...): an empty fragment when it is absent. */
export function renderSlot(slot: (() => i32) | undefined): i32 { return slot !== undefined ? slot() : _el(ui.FRAGMENT); }

// Text fields and pointer/keyboard events (same behaviour in both models).
export function _ptr(n: i32, kind: i32, f: (e: ui.PointerEvent) => void): void { ui.onPointer(n, kind, f); }
export function _key(n: i32, f: (e: ui.KeyEvent) => void): void { ui.onKeyDown(n, f); }
export function _ctx(n: i32, c: string): void { ui.keyContext(n, c); }
export function _onText(n: i32, change: boolean, f: (v: string) => void): void { ui.onText(n, change, f); }
export function _str(n: i32, key: string, s: string): void { if (key === 'value') ui.setValue(n, s); else ui.setPlaceholder(n, s); }
export function _dynStr(n: i32, key: string, get: () => string): void {
  if (fineGrained()) solid._dynStr(n, key, get); else _str(n, key, get());
}
export function _hl(n: i32, f: (line: string) => i32[]): void { ui.setHighlight(n, f); }
