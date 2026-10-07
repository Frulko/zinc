// The window state file and the clamp to the displays (ZN-240): `zinc test plugins/system/tests`
import * as assert from 'zinc:assert';
import * as fs from 'zinc:fs';
import { State, Rect, clampToDisplays, stateToJson, stateFromJson, saveState, loadState } from '../window';

function st(x: number, y: number, w: number, h: number): State { const s = new State(); s.x = x; s.y = y; s.w = w; s.h = h; return s; }
const one = [new Rect(0, 0, 1920, 1080)];
const two = [new Rect(0, 0, 1920, 1080), new Rect(1920, 0, 2560, 1440)];

// a window already on a display stays as it is
let c = clampToDisplays(st(100, 100, 800, 600), one);
assert.equal(c.x, 100); assert.equal(c.y, 100); assert.equal(c.w, 800); assert.equal(c.h, 600);
// a removed monitor: the window was at x 2500, only the first display is left: it comes back inside
c = clampToDisplays(st(2500, 200, 800, 600), one);
assert.equal(c.x, 1120); assert.equal(c.y, 200);
// partly off the left edge and the top
c = clampToDisplays(st(-300, -50, 800, 600), one);
assert.equal(c.x, 0); assert.equal(c.y, 0);
// too big for the display: cut to it
c = clampToDisplays(st(0, 0, 4000, 3000), one);
assert.equal(c.w, 1920); assert.equal(c.h, 1080);
// on the second display of two: stays
c = clampToDisplays(st(2000, 100, 800, 600), two);
assert.equal(c.x, 2000);
// straddling two displays: the one with more of it wins, the window is moved inside it
c = clampToDisplays(st(1800, 100, 800, 600), two);
assert.equal(c.x, 1920);
// a fullscreen flag saved on a display that is gone is dropped
const fs1 = st(5000, 100, 800, 600); fs1.fullscreen = true;
assert.equal(clampToDisplays(fs1, one).fullscreen, false);
// no displays known, or an empty state: unchanged
assert.equal(clampToDisplays(st(9, 9, 5, 5), []).x, 9);
assert.equal(clampToDisplays(new State(), one).w, 0);
// JSON round trip and a file in a temp dir
const s = st(10, 20, 640, 480); s.maximized = true;
const back = stateFromJson(stateToJson(s))!;
assert.equal(back.x, 10); assert.equal(back.h, 480); assert.ok(back.maximized); assert.ok(!back.fullscreen);
assert.ok(stateFromJson('{"nope":1}') === null);
const dir = fs.mkdtemp('zn-window-state-');
const file = dir + '/window-state.json';
assert.ok(loadState(file) === null);
saveState(file, s);
const loaded = loadState(file)!;
assert.equal(loaded.w, 640); assert.equal(loaded.y, 20);
fs.remove(dir, true);
console.log('window state: ok');
