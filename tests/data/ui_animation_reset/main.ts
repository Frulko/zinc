import * as ui from 'zinc:ui';

const keys = ['rotate', 'rotate', 'translateX', 'translateY', 'scaleX', 'scaleY', 'opacity'];
const bases = [0, 0, 0, 0, 1, 1, 1];
const ends = [360, 360, 60, 90, 2, 3, 0];
const nodes: i32[] = [], series: i32[] = [];
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-row gap-2');
for (let i = 0; i < keys.length; i++) {
  const n = ui.createNode(ui.VIEW);
  ui.setClass(n, 'w-10 h-10 bg-gray-500');
  ui.setNumber(n, keys[i], bases[i]);
  ui.insert(root, n, -1);
  nodes.push(n);
}
function near(i: i32, want: number): void {
  if (Math.abs(ui.getNumber(nodes[i], keys[i]) - want) > 0.001) throw new Error('reset ' + i + ': expected ' + want + ', got ' + ui.getNumber(nodes[i], keys[i]));
}
function start(): void {
  ui.animate(nodes[0], keys[0], ends[0], 900, 'linear', 0, Infinity);
  series.length = 0;
  for (let i = 1; i < keys.length; i++) series.push(ui.animateSeries(nodes[i], keys[i], [bases[i], ends[i]], 900, 0, null));
}
function reset(): void {
  ui.animate(nodes[0], keys[0], bases[0], 0, 'linear', 0);
  for (let i = 1; i < keys.length; i++) {
    if (!ui.stopSeries(series[i - 1]) || ui.stopSeries(series[i - 1])) throw new Error('stop lifecycle');
    ui.setNumber(nodes[i], keys[i], bases[i]);
  }
  ui.tick(1);
  for (let i = 0; i < keys.length; i++) near(i, bases[i]);
  ui.tick(1000);
  for (let i = 0; i < keys.length; i++) near(i, bases[i]);
}
let frame = 0, paints = 0, settled = 0;
ui.setAfterPaint(() => { paints++; });
ui.mount(root, 0xffffff, (dt: number) => {
  frame++;
  if (frame === 1) ui.alarm(ui.now(), start);
  if (frame === 2 || frame === 3) {
    if (frame === 2) {
      let layered = 0;
      for (const uid of series) if (ui.animState(uid) === 4) layered++;
      console.log('layered ' + layered);
    }
    // Samples stay outside the base style, including a restart from that base.
    const before = ui.getNumber(nodes[0], keys[0]);
    ui.tick(120);
    near(0, before + 48);
    for (let i = 1; i < keys.length; i++) {
      if (Math.abs(ui.getNumber(nodes[i], keys[i]) - bases[i]) < 0.001) throw new Error('series did not move ' + i);
    }
    reset();
    if (frame === 2) start();
  }
  if (frame === 4) settled = paints;
  if (frame === 4 || frame === 5) {
    for (let i = 0; i < keys.length; i++) ui.setNumber(nodes[i], keys[i], bases[i]);
    ui.setNumber(nodes[0], 'width', 40);
    ui.setNumber(nodes[0], 'fontWeight', 1); // normalized to 700: retain the cached equality fast path
  }
  if (frame === 5) settled = paints;
  if (frame === 6) {
    if (paints !== settled) throw new Error('equal styles repainted an idle view');
    console.log('animation reset ok');
  }
});
