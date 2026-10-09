// Run with: node tests/cli/draw-pool.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import ts from '@typescript/typescript6';

const root = new URL('../../', import.meta.url);
let frame, held = false, reset = false, count;
const source = fs.readFileSync(new URL('examples/bouncing-ball/src/main.ts', root), 'utf8').replace(/^import .*;$/gm, '');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
  onFrame: cb => { frame = cb; }, width: () => 320, height: () => 240,
  isDown: () => held, wasPressed: () => reset, pointerDown: () => false,
  Btn: { Up: 0, A: 1, Down: 2 }, clear() {}, rect() {}, console: { log() {} },
  Ball: class { update() {} }, Hud: class { tick(n) { count = n; } draw() {} },
});
frame(1 / 60); assert.equal(count, 1);
held = true;
for (let i = 0; i < 90; i++) frame(1 / 60);
assert.equal(count, 9000, 'holding the key must keep spawning beyond 8192');
held = false; frame(1 / 60); assert.equal(count, 9000, 'release must stop spawning');
reset = true; frame(1 / 60); assert.equal(count, 1);

// FPS must reflect 200 ms frames (5 FPS), not the physics timestep's 100 ms clamp.
let now = 0, label = '';
const hudSource = fs.readFileSync(new URL('examples/bouncing-ball/src/hud.ts', root), 'utf8')
  .replace(/^import .*;$/gm, '').replace('export class Hud', 'class Hud');
const hud = vm.runInNewContext(ts.transpileModule(hudSource + '\nnew Hud();', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, { clock: () => now, height: () => 240, text: (x, y, s) => { if (y === 4) label = s; } });
for (let i = 0; i < 3; i++) { now += 200; hud.tick(9000); }
hud.draw(); assert.match(label, /9000 balls  5 fps/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-draw-pool-'));
function run(args, env = {}) {
  const result = spawnSync(process.execPath, ['compiler/bin/zinc.mjs', ...args], {
    cwd: root, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, ZINC_FRAMES: '3', ZINC_DETERMINISTIC: '1', ...env },
  });
  assert.ifError(result.error);
  return result;
}
try {
  const entry = path.join(dir, 'main.ts');
  fs.writeFileSync(entry, `import { onFrame, clear, rect } from 'zinc:gfx';
onFrame((dt: number) => { clear(0); for (let i = 0; i < 9000; i++) rect(0, 0, 1, 1, 0xffffff); rect(20, 20, 20, 20, 0xff0000); });\n`);
  for (const flags of [[], ['-DZRT_MAX_DRAW_CMDS=20000'], []]) {
    const result = run(['run', entry, '--headless', ...flags]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr.includes('draw command pool is full'), flags.length === 0, JSON.stringify({ flags, stdout: result.stdout, stderr: result.stderr }));
  }
  const fixed = path.join(dir, 'fixed.png'), grown = path.join(dir, 'grown.png');
  let result = run(['run', entry, '--headless', '-DZRT_MAX_DRAW_CMDS=20000'], { ZINC_SHOT: fixed });
  assert.equal(result.status, 0, result.stderr);
  const target = process.platform === 'darwin' ? 'macos' : 'linux';
  fs.writeFileSync(path.join(dir, 'zinc.json'), JSON.stringify({ name: 'draw-pool', targets: { [target]: { growDrawCommands: true } } }));
  result = run(['run', entry, '--headless', '-DZRT_MAX_DRAW_CMDS=64'], { ZINC_SHOT: grown });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stderr.includes('draw command pool is full'), result.stderr);
  assert.deepEqual(fs.readFileSync(grown), fs.readFileSync(fixed), 'growing both buffers must preserve all commands, including the final rectangle');
  for (const value of ['0', '-1', '1.5', '2147483648', '20000;bad']) {
    const result = run(['build', entry, `-DZRT_MAX_DRAW_CMDS=${value}`]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /positive 32-bit integer/);
  }
  console.log('ok: held input, real FPS, fixed/growing pools, pixel equality, rebuild, invalid capacities');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
