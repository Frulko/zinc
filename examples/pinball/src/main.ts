// Nova Patrol: a space pinball on zinc:gfx, after the classic desktop pinball of the 90s (original table, names and
// art). The table on the left in pseudo-3D, the score panel on the right.
//   zinc run examples/pinball                         play (see README.md for the controls)
//   ZINC_DEMO=<state> zinc run examples/pinball       a scripted state or the benchmark (demo.ts)
// Frame: read the controls -> rules and physics (fixed 960 Hz substeps) -> table -> panel -> overlays.
import { onFrame, width, height, escapeByApp } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Controls, readControls } from './input';
import { Game, PH_PLAY } from './game/game';
import { Store } from './game/store';
import { Scene } from './render/scene';
import { Panel } from './ui/panel';
import { Menu, drawTableOverlay } from './ui/menu';
import { setSound } from './audio/sound';
import { demo, stepDemo, setTimes } from './demo';

escapeByApp(true);
const W = width(), H = height();
const tableW: number = Math.round(Math.min(W * 0.6, H * 0.98));

const store = new Store(demo === '');
setSound(store.settings.sound);
const game = new Game(store);
const scene = new Scene(game, 0, 0, tableW, H);
const panel = new Panel(game, tableW, 0, W - tableW, H);
const menu = new Menu(game);
const controls = new Controls();
let prevPlunger = false;

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
  else game.update(Math.min(dt, 0.05), controls);
  const t1 = clock();
  scene.draw();
  panel.draw();
  drawTableOverlay(game, 0, 0, tableW, H);
  if (menu.open) menu.draw(0, 0, tableW, H);
  setTimes(t1 - t0, clock() - t1);
});

console.log(`pinball: ${W}x${H}, table ${tableW} px wide${demo !== '' ? `, demo ${demo}` : ''}`);
