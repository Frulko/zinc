// Nova Patrol: a space pinball on zinc:gfx, after the classic desktop pinball of the 90s (original table, names and
// art). The table on the left in pseudo-3D, the score panel on the right; on a vertical screen the table alone, under
// a strip with the score.
//   zinc run examples/pinball                         play (see README.md for the controls)
//   ZINC_DEMO=<state> zinc run examples/pinball       a scripted state or the benchmark (demo.ts)
// Frame: read the controls -> rules and physics (fixed 960 Hz substeps) -> table -> panel -> overlays.
import { onFrame, onResize, width, height, escapeByApp } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Controls, readControls, setPlungerZone } from './input';
import { Game, PH_ATTRACT, PH_PLAY } from './game/game';
import { Store } from './game/store';
import { Scene } from './render/scene';
import { Panel } from './ui/panel';
import { Menu, drawTableOverlay } from './ui/menu';
import { setSound } from './audio/sound';
import { demo, stepDemo, setTimes } from './demo';

/** The height of the score strip of a vertical screen. */
const STRIP: number = 56;

escapeByApp(true);
const store = new Store(demo === '');
setSound(store.settings.sound);
const game = new Game(store);
const menu = new Menu(game);
const controls = new Controls();
let prevPlunger = false;

let W: number = width(), H: number = height();
let vertical = false;
let tableY: number = 0, tableW: number = 0, tableH: number = 0;
let scene: Scene = layout();
let panel: Panel = new Panel(game, vertical ? 0 : tableW, 0, vertical ? W : W - tableW, vertical ? STRIP : H);

/** Sizes everything for W x H; the new table, whose art is baked again at its first frame. */
function layout(): Scene {
  vertical = H > W;
  tableY = vertical ? STRIP : 0;
  tableW = vertical ? W : Math.round(Math.min(W * 0.6, H * 0.98));
  tableH = H - tableY;
  if (vertical) setPlungerZone(W / 3, H * 0.8, W * 2 / 3, H);
  else setPlungerZone(tableW, 0, W, H);
  return new Scene(game, 0, tableY, tableW, tableH);
}

onResize((w: number, h: number) => {
  if (w === W && h === H) return;
  W = w; H = h;
  scene.dispose();
  scene = layout();
  panel = new Panel(game, vertical ? 0 : tableW, 0, vertical ? W : W - tableW, vertical ? STRIP : H);
  console.log(`pinball: ${W}x${H}, table ${tableW} px wide${vertical ? ', vertical' : ''}`);
});

onFrame((dt: number) => {
  const t0 = clock();
  readControls(controls, tableW);
  const plungerEdge = controls.plunger && !prevPlunger;
  prevPlunger = controls.plunger;
  stepDemo(game, menu);
  if (menu.open) menu.update(controls, plungerEdge);
  else if (controls.pause) menu.show();
  else if (controls.start && game.canAddPlayer()) game.addPlayer();
  else if (controls.start && game.phase === PH_PLAY) menu.show();
  else game.update(Math.min(dt, 0.1), controls);
  const t1 = clock();
  scene.draw();
  if (vertical) {
    panel.drawStrip();
    if (game.phase !== PH_ATTRACT) panel.drawPlungerHint(W / 3, H * 0.8, W / 3, H * 0.2);
  } else panel.draw();
  drawTableOverlay(game, 0, tableY, tableW, tableH);
  if (menu.open) menu.draw(0, 0, W, H);
  setTimes(t1 - t0, clock() - t1);
});

console.log(`pinball: ${W}x${H}, table ${tableW} px wide${demo !== '' ? `, demo ${demo}` : ''}`);
