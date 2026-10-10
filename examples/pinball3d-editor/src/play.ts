// The game inside the editor: the table being edited, shown and played by the game's own code (../../pinball3d/src: scene.ts builds
// the 3D scene, game.ts plays it with the real physics and the table's rules, audio.ts makes it heard). Nothing of the game is
// written again here: the editor builds a scene from the document, drops a ball where one points, steps the game with the time of
// each frame, and keeps what it has to show on the top view: where the balls are, what they touched, which switches fired.
// A change of the table ends the game being played: the next one is the changed table's.
import { createSignal, batch } from 'zinc:ui/solid';
import { Camera } from 'zinc:3d';
import { Table, LayoutDef } from '../../pinball3d/src/format/table';
import { FolderSource } from '../../pinball3d/src/format/source';
import { Game, Controls, Phase } from '../../pinball3d/src/game';
import { Part } from '../../pinball3d/src/physics';
import { TableScene } from '../../pinball3d/src/scene';
import { TableAudio } from '../../pinball3d/src/audio';
import { Bindings, readControls } from '../../pinball3d/src/input';
import { tableImage } from '../../pinball3d/src/images';
import { boardImage } from './shapes';
import { doc, folder } from './state';

/** Whether the pane beside the top view shows the table in 3D (true) or its heights (false). */
export const [view3d, setView3d] = createSignal<boolean>(false);
/** A game is being played (it may be paused). */
export const [playing, setPlaying] = createSignal<boolean>(false);
export const [paused, setPaused] = createSignal<boolean>(false);
/** The next click on the top view drops a ball there. */
export const [dropping, setDropping] = createSignal<boolean>(false);
/** Counts the frames in which the game moved: what shows the game reads it. */
export const [moved, setMoved] = createSignal<i32>(0);
/** With --log on the command line: every event of the game played is printed, as the game prints its own. */
export let logging = false;
export function setLogging(on: boolean): void { logging = on; }

/** Something to show on the top view for a moment: a thing a ball touched (`event` ''), or a switch or a rule that fired. */
export class Flash {
  path: string; event: string; until: number;
  constructor(path: string, event: string, until: number) { this.path = path; this.event = event; this.until = until; }
}
export const flashes: Flash[] = [];
/** The last events of the game played, the newest last: the lines of its own log. */
export const events: string[] = [];

let built: Table | null = null, scene: TableScene | null = null, game: Game | null = null, audio: TableAudio | null = null;
// the document the scene was built from: a change makes it stale
let builtFrom: any = null;
const controls = new Controls(), fromWindow = new Controls(), bindings = new Bindings();
let owed = 0, logged = 0, clock = 0, windowHeard = 0;
// where each element of the table is in its file, by its name: the events of the game name their element
let paths = new Map<string, string>();
/** The lists of the table whose items a ball can touch, by the part the physics reports. */
function listOf(part: Part): string {
  return part === Part.Wall ? 'walls' : part === Part.Flipper ? 'flippers' : part === Part.Bumper ? 'bumpers' : part === Part.Slingshot ? 'slingshots' : part === Part.Target ? 'targets'
    : part === Part.Ramp ? 'ramps' : part === Part.Floor ? 'floors' : part === Part.Gate ? 'gates' : part === Part.Model ? 'models' : '';
}

/** Forgets what was built: the table changed, or another one was opened. */
function forget(): void { drop(); built = null; builtFrom = null; }
/** The same asked from outside: the files of the table changed, its scene and its sounds are made again from them. */
export function rebuild(): void { forget(); }
/** Takes the game and its scene away. It writes no signal: it runs while views are being drawn (a table that changed is found
 *  out when its scene is asked for); advance(), once a frame, then says that no game is being played any more. */
function drop(): void {
  if (audio !== null) audio.stop();
  if (game !== null) game.physics.destroy();
  game = null; audio = null; scene = null;   // the scene too: it is in the state the game left it
  clear();
}
/** The table of the document as the game takes one: its files are those of its folder. */
function tableNow(): Table {
  const d = doc();
  if (built === null || builtFrom !== d.data) {
    forget();
    built = new Table(d.data, folder().length > 0 ? new FolderSource(folder()) : null);
    builtFrom = d.data;
    paths = new Map<string, string>();
    for (const o of ['walls', 'gates', 'flippers', 'bumpers', 'slingshots', 'kickers', 'targets', 'rollovers', 'spinners', 'ramps', 'floors', 'models']) {
      const items: any = d.get(o);
      if (Array.isArray(items)) for (let i = 0; i < items.length; i++) paths.set(`${items[i].id}`, `${o}[${i}]`);
    }
    paths.set('plunger', 'plunger');
  }
  return built as Table;
}
/** The image painted on the board, for the top view: read from the table's folder by the game's own keeper of images (which keeps
 *  one image per file however often the scene is built again). -1 when the board has none, or the table no folder yet. */
export function boardPainting(): i32 {
  const t = tableNow();
  return tableImage(t.source, boardImage(t.def));
}
/** The 3D scene of the table as the document has it now, in the state of the game when one is played. */
export function sceneNow(): TableScene {
  const t = tableNow();
  if (scene === null) scene = new TableScene(t);
  if (game !== null) game.show(scene);
  return scene as TableScene;
}
/** The game on the table as the document has it now; made when it is first asked for. */
export function gameNow(): Game {
  const t = tableNow();
  if (game === null) { game = new Game(t); audioNow(); logged = 0; }
  return game as Game;
}
/** The sounds of the table as the document has it now: its files are read, its tones made, when they are first asked for. */
function audioNow(): TableAudio {
  const t = tableNow();
  if (audio === null) { audio = new TableAudio(t); audio.logging = logging; }
  return audio as TableAudio;
}
/** Plays one sound of the table as an event of the game would (its volume and its pitch varied as the sound says): the button
 *  beside the name of a sound. Returns its length in seconds (0 without an audio output, or when the table has no such sound). */
export function previewSound(name: string): number {
  const a = audioNow();
  a.preview(name);
  told(a);
  return a.seconds(name);
}
/** With --log: what the sounds of the table played, as the game's own --sounds prints it. */
function told(a: TableAudio): void {
  if (!logging) return;
  for (const line of a.log) console.log(line);
  a.log = [];
}
/** The game being played, null when none was started on this state of the table. */
export function gameIfAny(): Game | null { doc(); return built !== null && builtFrom === doc().data ? game : null; }

/** A camera that looks at the table as one of its layouts does, in a box of another shape: the field of view opens so that the
 *  box shows at least the width the layout's own view shows. */
export function aim(camera: Camera, l: LayoutDef, w: number, h: number): void {
  const c = l.camera, flat = Math.abs(c.position[0] - c.target[0]) + Math.abs(c.position[1] - c.target[1]) < 0.001;
  // the game's scene swaps the table's y (down the table) and z (up) for the engine's axes: so does this
  camera.setPosition(c.position[0], c.position[2], c.position[1]).lookAt(c.target[0], c.target[2], c.target[1]);
  camera.up[0] = 0; camera.up[1] = flat ? 0 : 1; camera.up[2] = flat ? -1 : 0;
  camera.near = 4; camera.far = 2000;
  const own = l.view[2] / Math.max(1, l.view[3]), box = w / Math.max(1, h);
  camera.fov = box >= own ? c.fov : 2 * Math.atan2(Math.tan(c.fov * Math.PI / 360) * own / box, 1) * 180 / Math.PI;
}

// ---------------------------------------------------------------- playing

/** Nothing to show of a game yet. */
function clear(): void { flashes.splice(0, flashes.length); events.splice(0, events.length); logged = 0; owed = 0; }
/** Starts a game by putting a ball on the table at (x, y) of the top view, at rest on the level of height `on` (0: the playfield):
 *  it rolls from there. */
export function dropBall(x: number, y: number, on: number): void {
  const g = gameNow(), t = tableNow().def;
  g.placeBall(x, y, on + t.physics.ball.radius + 0.02, 0, 0, 0);
  clear();
  batch(() => { setPlaying(true); setPaused(false); setDropping(false); setMoved(moved() + 1); });
}
/** Starts a game as a player does (a ball in front of the plunger), or goes on with the one that is paused. */
export function play(): void {
  const g = gameNow();
  if (!playing()) { g.start(); clear(); }
  batch(() => { setPlaying(true); setPaused(false); setMoved(moved() + 1); });
}
export function pause(): void { if (playing()) setPaused(!paused()); }
/** Ends the game being played; the table is shown at rest again. */
export function stop(): void {
  drop();
  batch(() => { setPlaying(false); setPaused(false); setDropping(false); setMoved(moved() + 1); });
}
/** One step of the game and what it did. */
function stepOnce(g: Game): void {
  g.step(controls);
  for (const touch of g.physics.touches) {
    const list = listOf(touch.part);
    if (touch.part === Part.Plunger) flash('plunger', '');
    else if (list !== '' && touch.speed > 12) flash(`${list}[${touch.index}]`, '');
  }
}
function flash(path: string, event: string): void {
  for (const f of flashes) if (f.path === path && f.event === event) { f.until = clock + (event === '' ? 0.18 : 0.7); return; }
  flashes.push(new Flash(path, event, clock + (event === '' ? 0.18 : 0.7)));
}
/** The lines the game's log gained: printed with --log, kept for the panel, and shown on the element each one names. */
function hear(g: Game): void {
  const log = g.rules.log;
  if (log.length < logged) logged = 0;   // a new game starts its log again
  for (; logged < log.length; logged++) {
    const line = log[logged];
    if (logging) console.log(line);
    events.push(line);
    if (events.length > 200) events.splice(0, 100);
    // "1.040 dock eject +3000 = 3500": the second word is who, the third what
    const words = line.split(' ');
    if (words.length >= 3) { const path = paths.get(words[1]); if (path !== undefined) flash(path, words[2]); }
  }
}
/** Once a frame, with the seconds it lasted and the box of the 3D view in the window (where a touch is a flipper button, as on the
 *  game's own view): the game runs at the table's rate whatever the frame rate. */
export function advance(dt: number, vx: number, vy: number, vw: number, vh: number): void {
  clock += dt;
  for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].until < clock) flashes.splice(i, 1);
  const g = gameIfAny();
  if (g === null) { if (playing()) stop(); return; }   // the table changed under the game
  if (!playing() || paused()) return;
  readControls(controls, bindings, vx, vy, vw, vh);
  if (windowHeard > 0) {
    // what is held in the game's own window counts as well (it was read when that window was last drawn)
    windowHeard--;
    controls.left = controls.left || fromWindow.left; controls.right = controls.right || fromWindow.right; controls.plunger = controls.plunger || fromWindow.plunger;
    controls.nudgeLeft = controls.nudgeLeft || fromWindow.nudgeLeft; controls.nudgeRight = controls.nudgeRight || fromWindow.nudgeRight;
    controls.nudgeUp = controls.nudgeUp || fromWindow.nudgeUp; controls.start = controls.start || fromWindow.start;
  }
  owed = Math.min(owed + dt, 0.1);
  while (owed >= g.dt()) { stepOnce(g); owed -= g.dt(); }
  hear(g);
  if (audio !== null) { audio.update(g); audio.log = []; }   // the events of the game are what --log prints of a game; its sounds are in the game's own test
  setMoved(moved() + 1);
}
/** Called while the game's own window is being drawn, with the box of the table in it: reads the controls held there. */
export function setWindowControls(vx: number, vy: number, vw: number, vh: number): void {
  readControls(fromWindow, bindings, vx, vy, vw, vh);
  windowHeard = 2;
}
/** While the game is paused: one frame of it (a sixtieth of a second). */
export function stepFrame(): void {
  const g = gameIfAny();
  if (g === null || !playing() || !paused()) return;
  const n: i32 = Math.max(1, Math.round(1 / 60 / g.dt()));
  for (let i = 0; i < n; i++) stepOnce(g);
  hear(g);
  setMoved(moved() + 1);
}
