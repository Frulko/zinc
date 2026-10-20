// QuickJS workload "objects" of docs/reports/quickjs-aot-jit-and-ffi.md: game/UI logic, 2,000 entities with polymorphic components in plain
// objects, Map lookups by string, an event emitter with closures, short-lived objects, filter/map.
// zinc profile bench/qjs/objects.mjs --engine quickjs (a ZN_QJS_PROFILE build)
const ticks = globalThis.ZN_FRAMES ?? 300;
const listeners = new Map();
const on = (name, fn) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); };
const emit = (name, data) => { const l = listeners.get(name); if (l) for (const fn of l) fn(data); };
const kinds = ['move', 'health', 'timer', 'label'];
const entities = [], byName = new Map();
for (let k = 0; k < 2000; k++) {
  const e = { name: 'e' + k, alive: true, components: [] };
  const kind = kinds[k % 4];
  if (kind === 'move') e.components.push({ kind, x: k, y: 0, dx: 1, dy: 0.5 });
  else if (kind === 'health') e.components.push({ kind, hp: 100, regen: 0.1 });
  else if (kind === 'timer') e.components.push({ kind, left: k % 50, every: 50 });
  else e.components.push({ kind, text: 'entity ' + k, dirty: false });
  entities.push(e); byName.set(e.name, e);
}
let events = 0;
on('tick', (t) => { if (t % 10 === 0) events++; });
on('fire', (e) => { const target = byName.get('e' + ((e.name.length * 7 + events) % 2000)); if (target) target.components[0].hp = 100; });
const t0 = performance.now();
function tick(t) {
  for (const e of entities) for (const c of e.components) {
    if (c.kind === 'move') { c.x += c.dx; c.y += c.dy; }
    else if (c.kind === 'health') c.hp = Math.min(100, c.hp + c.regen);
    else if (c.kind === 'timer') { if (--c.left <= 0) { c.left = c.every; emit('fire', e); } }
    else c.dirty = { at: t, len: c.text.length }.len > 0;
  }
  emit('tick', t);
  const moving = entities.filter((e) => e.components[0].kind === 'move').map((e) => ({ name: e.name, x: e.components[0].x }));
  if (moving.length !== 500) throw new Error('lost entities');
}
for (let t = 0; t < ticks; t++) tick(t);
console.log('objects: ' + ticks + ' ticks, ' + ((performance.now() - t0) / ticks).toFixed(3) + ' ms/tick, ' + events + ' events');
