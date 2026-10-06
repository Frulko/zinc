// A stand-in for zinc:ui/solid: records what the lowered JSX asks for, so the golden shows the structure the lowering produces.
class N { tag: i32; ops: string[] = []; kids: N[] = []; constructor(tag: i32) { this.tag = tag; } }
const all: N[] = [];
function n(h: i32): N { return all[h]; }
export function _el(tag: i32): i32 { all.push(new N(tag)); return all.length - 1; }
export function _text(p: i32, s: string): void { const t = _el(100); n(t).ops.push('text ' + s); n(p).kids.push(n(t)); }
export function _textOf(h: i32, s: string): void { n(h).ops.push('textOf ' + s); }
export function _dynTextOf(h: i32, f: () => string): void { n(h).ops.push('dynTextOf ' + f()); }
export function _append(p: i32, c: i32): void { n(p).kids.push(n(c)); }
export function _class(h: i32, s: string): void { n(h).ops.push('class ' + s); }
export function _dynClass(h: i32, f: () => string): void { _class(h, f()); }
export function _on(h: i32, f: () => void): void { n(h).ops.push('on'); f(); }
export function _draw(h: i32, f: (x: i32, y: i32, w: i32, hh: i32) => void): void { n(h).ops.push('draw'); }
export function _num(h: i32, k: string, v: number): void { n(h).ops.push('num ' + k + '=' + v); }
export function _dynNum(h: i32, k: string, f: () => number): void { _num(h, k, f()); }
export function _dynText(p: i32, f: () => string): void { _text(p, f()); }
export function _show(p: i32, c: () => boolean, yes: () => i32, no: (() => i32) | null): void {
  if (c()) _append(p, yes()); else if (no !== null) _append(p, no());
}
export function _for<T>(p: i32, list: () => T[], f: (item: T, i: i32) => i32): void {
  const xs = list();
  for (let i: i32 = 0; i < xs.length; i++) _append(p, f(xs[i], i));
}
export function _img(h: i32, s: string): void { n(h).ops.push('img ' + s); }
export function _dynImg(h: i32, f: () => string): void { _img(h, f()); }
export function _ref(h: i32, f: (h: i32) => void): void { n(h).ops.push('ref'); f(h); }
export function _focusable(h: i32): void { n(h).ops.push('focusable'); }
export function _virtual(h: i32, count: () => number, itemH: number, f: (i: i32) => i32): void { n(h).ops.push('virtual'); }
export function _dynStr(h: i32, k: string, f: () => string): void { n(h).ops.push('str ' + k + '=' + f()); }
export function _str(h: i32, k: string, v: string): void { n(h).ops.push('str ' + k + '=' + v); }
export function _dynStyles(h: i32, f: () => i32[]): void { n(h).ops.push('styles'); }
export function _styles(h: i32, s: i32[]): void { n(h).ops.push('styles'); }
export function _ptr(h: i32, kind: i32, f: () => void): void { n(h).ops.push('ptr ' + kind); }
export function _key(h: i32, f: () => void): void { n(h).ops.push('key'); }
export function _onText(h: i32, change: boolean, f: (v: string) => void): void { n(h).ops.push('onText'); }
export function _hl(h: i32, f: (line: string) => i32[]): void { n(h).ops.push('highlight'); }
export function _ctx(h: i32, s: string): void { n(h).ops.push('ctx ' + s); }
function out(x: N, ind: string): void {
  console.log(ind + 'node ' + x.tag);
  for (const o of x.ops) console.log(ind + '  ' + o);
  for (const k of x.kids) out(k, ind + '  ');
}
export function dump(h: i32): void { out(n(h), ''); }
