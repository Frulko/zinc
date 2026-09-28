// zinc:gpio for sim: simulated board, same ZINC_GPIO_SCRIPT format as runtime/mod/gpio.cpp
const pins = new Map();
const pin = n => { if (!pins.has(n)) pins.set(n, { value: 0, cb: null, edge: 2, debounce: 0, last: -1e9 }); return pins.get(n); };
let started = false;
function start() {
  if (started) return;
  started = true;
  const t0 = $z.perfNow();
  for (const step of (process.env.ZINC_GPIO_SCRIPT ?? '').split(',').filter(Boolean)) {
    const [, p, v, at] = step.match(/^(\d+):(\d+)(?:@([\d.]+))?$/) ?? [];
    if (p !== undefined) $z.setTimeout(() => deliver(Number(p), Number(v)), Math.max(0, Number(at ?? 0) - ($z.perfNow() - t0)));
  }
}
function deliver(n, value) {
  const p = pin(n), old = p.value;
  p.value = value;
  if (!p.cb || old === value) return;
  const rising = value > old;
  if ((p.edge === 0 && !rising) || (p.edge === 1 && rising)) return;
  const t = $z.perfNow();
  if (t - p.last < p.debounce) return;
  p.last = t;
  const cb = p.cb;
  queueMicrotask(() => cb({ pin: n, value, timestampMs: t }));
}
export const setup = (n, mode, pull) => { start(); pin(n).value = mode[0] !== 'o' && pull[0] === 'u' ? 1 : 0; };
export const write = (n, v) => { start(); pin(n).value = v ? 1 : 0; };
export const read = n => { start(); return pin(n).value; };
export const watch = (n, edge, debounceMs, cb) => { start(); Object.assign(pin(n), { edge: edge[0] === 'r' ? 0 : edge[0] === 'f' ? 1 : 2, debounce: debounceMs, cb }); };
export const simulate = (n, v) => { start(); deliver(n, v ? 1 : 0); };
