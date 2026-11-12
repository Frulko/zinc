import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('targets/web/runtime.js', 'utf8');
const helper = source.slice(source.indexOf('function mountDeviceFrame('), source.indexOf('\nif (!mountDeviceFrame(CFG))'));
function run(cfg, query = '', child = false, viewport = [320, 600]) {
  const nodes = new Map(), events = {};
  const element = () => ({ style: {}, appendChild(child) { this.append(child); }, append(...children) { this.children = children; for (const c of children) nodes.set(c.id, c); }, remove() { this.removed = true; }, addEventListener(k, fn) { this[k] = fn; } });
  const document = { documentElement: { clientWidth: viewport[0] }, head: element(), body: element(), createElement: element, getElementById: id => nodes.get(id) };
  const context = vm.createContext({ G: { frameElement: child ? { id: 'zinc-device-app' } : null }, document, location: { search: query, href: 'https://example.test/app/' + query + '#screen' }, URLSearchParams, innerHeight: viewport[1], addEventListener: (k, fn) => events[k] = fn });
  const mount = vm.runInContext(helper + '\nmountDeviceFrame', context);
  return { mounted: mount(cfg), nodes, document, events, context };
}
for (const frame of [undefined, 'none', 'wrong', 42]) assert.equal(run({ frame }).mounted, false);
assert.equal(run({ frame: 'phone' }, '?frame=none').mounted, false);
assert.equal(run({ frame: 'phone' }, '', true).mounted, false);
for (const [frame, expected] of [['phone', [390, 844]], ['tablet', [768, 1024]]]) {
  const r = run({ frame }, '?frame=invalid');
  assert.equal(r.mounted, true);
  const app = r.nodes.get('zinc-device-app'), rotate = r.nodes.get('zinc-device-rotate');
  assert.equal(app.style.width, expected[0] + 'px'); assert.equal(app.style.height, expected[1] + 'px');
  assert.equal(app.src, 'https://example.test/app/?frame=invalid#screen');
  assert.equal(rotate.type, 'button'); assert.equal(rotate.textContent, 'Rotate to landscape');
  const scale = Number(r.nodes.get('zinc-device-case').style.transform.match(/[\d.]+/)[0]);
  assert.ok(scale > 0 && scale < 1);
  rotate.click();
  assert.equal(app.style.width, expected[1] + 'px'); assert.equal(app.style.height, expected[0] + 'px');
  assert.equal(rotate.textContent, 'Rotate to portrait');
  r.context.innerHeight = 1200; r.document.documentElement.clientWidth = 1400; r.events.resize();
  assert.equal(r.nodes.get('zinc-device-case').style.transform, 'scale(1)');
}
const override = run({ frame: 'none', fixed: [960, 600] }, '?frame=tablet');
assert.equal(override.nodes.get('zinc-device-app').style.width, '960px');
assert.equal(override.nodes.get('zinc-device-app').style.height, '600px');
console.log('web frame: boundary, logical sizes, rotate, shrink and resize ok');

const exporter = readFileSync('src/cli_web.cpp', 'utf8');
const page = exporter.slice(exporter.indexOf('std::string pageFor('), exporter.indexOf('// the config the runtime reads'));
assert.ok(page.indexOf('importmap') < page.indexOf('h += preloads;'), 'import map must precede modulepreload resolution');
assert.ok(!source.includes('    unlockAudio();'), 'canvas gestures are already handled by native-services');
assert.ok(exporter.includes('const fs::path outDir = fs::absolute(output);'), 'prerender paths survive cd into output');
