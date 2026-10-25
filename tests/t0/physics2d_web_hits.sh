#!/bin/sh
# The browser C shim's hit events and packed JS protocol, tested on the development host without a cross build.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
${CC:-cc} -std=c17 -O2 -ffp-contract=off -Iplugins/physics2d/vendor/box2d/include tests/native/physics2d_web_hits.c plugins/physics2d/vendor/box2d.c -lm -o "$tmp/check" || exit 1
"$tmp/check" || exit 1
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const memory = { buffer: new ArrayBuffer(1024) };
let api, steps = 0;
const data = new Float64Array(memory.buffer);
const moved = [7,1,2,0,3,4,0], hit = [1,7,8,1,2,1,0,80,120];
const exports = { memory, p2d_out:()=>0, p2d_step:()=>steps++,
 p2d_moved:()=>{ data.set(moved);return moved.length; }, p2d_events:()=>{ data.set(hit);return hit.length; } };
vm.runInNewContext(readFileSync('plugins/physics2d/web/physics2d.js','utf8'), {
 TextDecoder, Uint8Array, Float64Array, globalThis:{__zincWeb:{registerNative:(_, value)=>api=value, wasmInstance:()=>({exports})}}
});
assert.deepEqual(Array.from(api.stepState(0,1/240,1)), [moved.length,...moved,...hit]);
assert.equal(steps, 1);
JS
