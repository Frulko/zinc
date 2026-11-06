// What `zinc run main.py` would generate: the Zinc modules a Python program reaches, as one table of calls. Everything in lib/std stays compiled TypeScript.
import { render, createSignal, _el, _class, _append, _textOf, _dynTextOf } from 'zinc:ui/solid';
import { onFrame, clear, rect, text, width, height } from 'zinc:gfx';
import { Button } from 'zinc:ui/kit';
import { start, invoke, invokeStr } from 'zinc:luahost';

const getters: (() => number)[] = [];
const setters: ((v: number) => void)[] = [];
let rootFn: i32 = -1;
let tickFn: i32 = -1;

function dispatch(fn: i32, a: f64, b: f64, c: f64, d: f64, e: f64, s: string): f64 {
  switch (fn) {
    case 0: return 0;   // the cost of crossing, nothing else
    case 1: clear(a as i32); return 0;
    case 2: rect(a, b, c, d, e as i32); return 0;
    case 3: text(a, b, s, c as i32, d as i32); return 0;
    case 4: return width();
    case 5: return height();
    case 6: { const id: i32 = a as i32; onFrame((dt: number) => { invoke(id, dt); }); return 0; }
    case 10: return _el(a as i32);
    case 11: _class(a as i32, s); return 0;
    case 12: _append(a as i32, b as i32); return 0;
    case 13: _textOf(a as i32, s); return 0;
    case 14: { const id: i32 = b as i32; _dynTextOf(a as i32, () => invokeStr(id)); return 0; }
    case 15: { const id: i32 = a as i32; return Button({ label: s, onClick: () => { invoke(id, 0); } }); }
    case 20: { const [g, st] = createSignal<number>(a); getters.push(g); setters.push(st); return getters.length - 1; }
    case 21: return getters[a as i32]();
    case 22: setters[a as i32](b); return 0;
    case 30: rootFn = a as i32; return 0;
    case 31: tickFn = a as i32; return 0;
  }
  return 0;
}

start('app/app.lua', 'app/?.lua;rocks/share/?.lua', dispatch);
if (rootFn >= 0) {
  const id: i32 = rootFn;
  render((): i32 => invoke(id, 0) as i32, 0x111827, (dt: number) => { if (tickFn >= 0) invoke(tickFn, dt); });
}
