import * as ui from 'zinc:ui';
let ticks = 0, paints = 0, settled = 0;
export function painted(): void { paints++; }
function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null || n.hidden) return -1;
  if (n.label === label) return h;
  for (const c of n.children) { const found = find(c, label); if (found >= 0) return found; }
  return -1;
}
function revealed(): void {
  for (const label of ['Basic', 'Rich']) {
    const root = find(ui.rootNode(), label), tab = find(root, 'Account');
    check(root >= 0 && tab >= 0, 'missing selected tab');
    const box = ui.screenBox(tab), track = ui.screenBox(root);
    check(box[0] >= track[0] && box[0] + box[2] <= track[0] + track[2], 'latest selection clipped');
  }
}
export function drive(show: (on: boolean) => void, mount: (on: boolean) => void, select: (n: i32) => void): void {
  ticks++;
  if (ticks === 4 || ticks === 28 || ticks === 40) settled = paints;
  if (ticks === 12) { check(paints === settled, 'initial hidden tabs repaint'); select(3); ui.systemSignal('reducemotion 1'); }
  if (ticks === 15) show(true);
  if (ticks === 22) { revealed(); show(false); }
  if (ticks === 32) { check(paints === settled, 'hidden cached geometry repaints'); select(0); }
  if (ticks === 35) select(3);
  if (ticks === 44) { check(paints === settled, 'hidden selection repaints'); show(true); }
  if (ticks === 51) { revealed(); mount(false); }
  if (ticks === 54) settled = paints;
  if (ticks === 60) { check(paints === settled, 'disposed tabs repaint'); mount(true); }
  if (ticks === 67) { revealed(); console.log('hidden tabs idle: ok'); }
}
