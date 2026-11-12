import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('targets/web/runtime.js', 'utf8');
const rows = source.split('\n').filter(line => /^  fs(TryLock|Unlock|Failed):/.test(line)).join('\n');
const nativeError = 'EACCES: native lock refused';
const context = vm.createContext({ assert, nativeError });
vm.runInContext(`let fsErr = ''; const rows = { ${rows} }; const G = {};
for (const n of ['fsTryLock', 'fsUnlock']) {
  rows[n]('file'); assert(rows.fsFailed()); assert.match(rows.fsError(), /^ENOTSUP:/);
}
let viaBridge = false; const Z = {bridge: {call: (_module, name) => name === 'fsFailed' ? true : name === 'fsError' ? nativeError : 0}};
`, context);
const bridge = source.split('\n').filter(line => line.includes("for (const n of ['fsTryLock', 'fsUnlock'])") || /^  G.__host_fs(Failed|Error) =/.test(line)).join('\n');
vm.runInContext(bridge + `
for (const n of ['fsTryLock', 'fsUnlock']) {
  viaBridge = false; G['__host_' + n]('file'); assert.equal(viaBridge, true);
  assert.equal(G.__host_fsFailed(), true); assert.equal(G.__host_fsError(), nativeError);
}`, context);
const worker = readFileSync('targets/wasm/glue/worker.mjs', 'utf8').split('\n').filter(line => /^      case 'host.fs(TryLock|Unlock|Failed|Error)'/.test(line)).join('\n');
vm.runInNewContext(`let fsError='', fsFailure=false, out;
function call(row) { switch(row) { ${worker} } return out; }
for (const row of ['host.fsTryLock', 'host.fsUnlock']) {
  assert.equal(call(row), 0); assert.equal(call('host.fsFailed'), 1); assert.match(call('host.fsError'), /^ENOTSUP:/);
}`, { assert });
console.log('web and browser WASM filesystem locks: unavailable; bridge errors: native');
