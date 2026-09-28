#!/usr/bin/env node
// Drives a running mapper through the companion's HTTP API (what the web UI does): reads the state, then warps,
// masks and recolours layers. Fails loudly when the app does not answer or ignores the changes.
//   node demo.mjs [http://localhost:8080]
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:8080';
const osc = msgs => fetch(`${base}/osc`, { method: 'POST', body: JSON.stringify(msgs) }).then(r => assert.equal(r.status, 204));
const state = async () => { const r = await fetch(`${base}/state`); assert.equal(r.status, 200, 'app did not answer /sync'); return r.json(); };

const before = await state();
assert.ok(before.layers.length >= 2, 'expected the demo layers');
await osc([
  ['/select', 0],
  ['/layer/0/corner', 0, 0.02, 0.02],                        // corner pin: pull the top-left corner out
  ['/layer/0/mesh', 3, 3],                                    // 3x3 mesh warp, then bulge the centre point
  ['/layer/0/point', 1, 1, 0.62, 0.38],
  ['/layer/1/mask/0', 0.08, 0, 0.5, 0.05, 0.95, 0.5, 0.5, 0.95, 0.05, 0.5],  // feathered diamond (show inside)
  ['/layer/1/mask/1', 0.02, 1, 0.4, 0.4, 0.6, 0.4, 0.6, 0.6, 0.4, 0.6],     // hole (hide inside)
  ['/layer/1/hue', 120], ['/layer/1/saturation', 1.6],
  ['/layer/1/edge', 0, 0.25, 0, 0, 2.2],                      // right edge blend
  ['/layer/2/rotation', 20], ['/layer/2/scale', 1.3], ['/layer/2/blend', 'add'],
]);
await new Promise(r => setTimeout(r, 150));
const after = await state();
assert.deepEqual(after.layers[0].corners.slice(0, 2), [0.02, 0.02]);
assert.deepEqual(after.layers[0].mesh.slice(0, 2), [3, 3]);
assert.equal(after.layers[1]['mask/1'][1], 1);
assert.equal(after.layers[2].blend[0], 'add');
assert.equal(after.selected, 0);
console.log(`ok: ${after.layers.length} layers, warp/mask/colour/blend changes applied`);
