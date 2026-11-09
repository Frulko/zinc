import * as ui from 'zinc:ui';
import { equal, ok } from 'zinc:assert';

function box(parent: i32, contentW: i32 = 500, contentH: i32 = 500): i32[] {
  const h = ui.createNode(ui.SCROLL), child = ui.createNode(ui.VIEW);
  ui.setClass(h, 'absolute w-[100] h-[100] overflow-auto');
  ui.setNumber(child, 'width', contentW); ui.setNumber(child, 'height', contentH);
  ui.insert(h, child, -1); ui.insert(parent, h, -1);
  return [h, child];
}
function offset(h: i32, x: number, y: number, label: string): void {
  equal(ui.scrollLeft(h), x, label + ' x'); equal(ui.scrollTop(h), y, label + ' y');
}
function record(h: i32): ui.UiNode {
  const n = ui.inspectNode(h); if (n === null) throw new Error('missing scroll node'); return n;
}
const root = ui.createNode(ui.VIEW), initial = box(root), h = initial[0], child = initial[1];
ui.scrollTo(h, 270, 310); ui.scrollTo(h, 90, 110);
ui.setRoot(root); ui.layout(); offset(h, 90, 110, 'latest initial');
ui.setNumber(child, 'width', 550); ui.scrollTo(h, 200, 200, true); ui.scrollTo(h, 0, 0);
ui.layout(); offset(h, 0, 0, 'explicit zero replaces animation'); ok(!record(h).live, 'zero cancelled animation');
ui.setNumber(child, 'width', 600); ui.setNumber(child, 'height', 700);
ui.scrollTo(h, 400, 500); ui.scrollBy(h, 25, 30); ui.layout(); offset(h, 425, 530, 'grow and pending relative');
ui.setNumber(child, 'width', 120); ui.setNumber(child, 'height', 140);
ui.scrollTo(h, 999, 999); ui.layout(); offset(h, 20, 40, 'shrink clamps current bounds');
ui.setNumber(child, 'width', 500); ui.setNumber(child, 'height', 500); ui.layout();
ui.setNumber(h, 'hidden', 1); ui.scrollTo(h, 70, 80); ui.layout();
ui.setNumber(h, 'hidden', 0); ui.layout(); offset(h, 70, 80, 'hidden reveal');
ui.detach(root, h); ui.scrollTo(h, 130, 140); ui.layout(); offset(h, 70, 80, 'detached waits');
ui.insert(root, h, -1); ui.layout(); offset(h, 130, 140, 'reattached applies');
ui.setNumber(child, 'height', 600); ui.scrollTo(h, 220, 330, true); ui.layout();
const animated = record(h), ax = animated.ax, ay = animated.ay;
ok(ax !== null && ay !== null && animated.live, 'animation intent survives layout');
if (ax !== null && ay !== null) { equal(ax.target, 220); equal(ay.target, 330); }
ui.setNumber(child, 'height', 650); ui.scrollBy(h, 10, 20); ui.layout();
const shifted = record(h), shiftedX = shifted.ax, shiftedY = shifted.ay;
if (shiftedX === null || shiftedY === null) throw new Error('relative request stopped animation');
equal(shiftedX.target, 230); equal(shiftedY.target, 350);
ui.setNumber(child, 'height', 700); ui.scrollTo(h, 35, 45, true); ui.systemSignal('reducemotion 1'); ui.layout();
offset(h, 35, 45, 'reduced motion sampled when applied'); ui.systemSignal('reducemotion 0');

// Key changes and imperative calls share ordering: the most recent intent wins.
ui.setScrollKey(h, 'request-key'); ui.scrollTo(h, 50, 60); ui.remove(root, h);
const restored = box(root)[0]; ui.setScrollKey(restored, 'request-key'); ui.scrollTo(restored, 0, 0);
ui.layout(); offset(restored, 0, 0, 'explicit request replaces restore'); ui.remove(root, restored);
const saved = box(root)[0]; ui.setScrollKey(saved, 'request-key'); ui.layout();
ui.scrollTo(saved, 80, 90); ui.remove(root, saved);
const unmounted = box(root)[0]; ui.setScrollKey(unmounted, 'request-key'); ui.remove(root, unmounted);
const last = box(root)[0]; ui.setScrollKey(last, 'request-key'); ui.scrollBy(last, 5, 10);
ui.layout(); offset(last, 85, 100, 'unapplied restoration preserved and shifted');

// Pending work never follows a recycled slot, nor another surface's layout.
const doomed = box(root)[0]; ui.scrollTo(doomed, 390, 390); const oldSerial = ui.nodeSerial(doomed); ui.remove(root, doomed);
const reused = box(root)[0]; equal(reused, doomed, 'reused handle'); ok(ui.nodeSerial(reused) !== oldSerial);
ui.scrollTo(reused, 25, 35); ui.layout(); offset(reused, 25, 35, 'new identity owns request');
const otherRoot = ui.createNode(ui.VIEW), other = box(otherRoot)[0];
ui.scrollTo(other, 210, 220); ui.layout(); offset(other, 0, 0, 'other surface not consumed');
ui.setRoot(otherRoot); ui.layout(); offset(other, 210, 220, 'own surface applies');
ui.setRoot(root); ui.layout();

function virtual(parent: i32, variable: boolean): i32 {
  const v = ui.createNode(ui.SCROLL); ui.setClass(v, 'absolute w-[100] h-[100]'); ui.insert(parent, v, -1);
  ui.virtualize(v, 100, variable ? -30 : 20, (i: i32): i32 => {
    const row = ui.createNode(ui.VIEW); ui.setNumber(row, 'height', variable && i % 2 === 1 ? 40 : 20); return row;
  }, null);
  return v;
}
const fixed = virtual(root, false); ui.scrollToRow(fixed, 30); ui.scrollToRow(fixed, 12); ui.layout();
offset(fixed, 0, 160, 'row alignment uses laid out viewport');
const variable = virtual(root, true); ui.scrollToRow(variable, 50); ui.layout(); ui.frame(0, 0xffffff);
const vn = record(variable), vv = vn.virt;
if (vv === null) throw new Error('missing virtual state');
const row = vv.rows.get(50); if (row === undefined) throw new Error('requested virtual row not mounted');
const rn = record(row); ok(rn.top >= vn.sy - 0.01 && rn.top + rn.lh <= vn.sy + vn.lh + 0.01, 'variable row visible');
ui.setScrollKey(variable, 'variable-request'); const before = ui.scrollTop(variable); ui.remove(root, variable);
const again = virtual(root, true); ui.setScrollKey(again, 'variable-request'); ui.layout(); ui.frame(0, 0xffffff);
ok(Math.abs(ui.scrollTop(again) - before) < 1, 'variable row restoration retained');
console.log('scroll requests: pass');
