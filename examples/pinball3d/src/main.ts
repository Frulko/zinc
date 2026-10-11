// pinball3d: a pinball table in real 3D. Everything about the table comes from its file (docs/pinball-table-format.md):
// this program has no table in it. This file is only the window: it opens a table, picks a layout, and each frame
// reads the controls, lets the game run the time that passed, and draws the table and the panel.
//   zinc run examples/pinball3d [-- options]
//   --table=<folder | table.json | file.zpinball>   the table to play (default: the first one the game ships with)
// While a table waits for a player, the list of the tables is over it (chooser.ts): the ones of the game's assets and the one
// --table names. Tab goes to the next one, a press on its card takes one; Start plays the one that is on.
//   --layout=landscape | portrait                    force a layout (default: by the window, portrait when it is taller than wide)
//   --settings=<file.json>                           controls (default: settings.json beside zinc.json, when there is one)
//   --log                                            print every event of the game as it happens (scripted runs compare it)
//   --sounds                                         print every sound as it is played, with its volume, pitch and place, and each change of music
//   --volume=<0 to 1>                                the volume of everything (0: silence)
//   --scores=<file>                                  keep the high scores in this file instead of the application's storage
//   --stats                                          print the time of the physics and of the drawing every 5 seconds
//   --demo                                           a player who cannot see holds the controls: start, the plunger every 5 s, the flippers in turn
import { onFrame, width, height, rect } from 'zinc:gfx';
import { args, clock, env } from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as storage from 'zinc:storage';
import { setVolume } from 'zinc:audio';
import { Table, TableError, loadTable } from './format/table';
import { openTable } from './format/source';
import { TableScene, rgb } from './scene';
import { View } from './view';
import { Game, Controls, Phase } from './game';
import { Choice, tablesOf, placeOf, drawChooser, chosenNow } from './chooser';
import { Bindings, readControls } from './input';
import { drawPanel } from './panel';
import { TableAudio } from './audio';

function option(name: string): string {
  for (const a of args()) if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  return '';
}
function flag(name: string): boolean { return args().indexOf(`--${name}`) >= 0; }

/** The tables to choose among. */
let choices: Choice[] = [];
/** The table to play first: the one the player names, else the first one the game ships with. */
function open(): Table {
  const path = option('table');
  const named = path === '' ? null : loadTable(openTable(path));
  choices = tablesOf(path);
  if (named !== null) return named;
  if (choices.length === 0) throw new Error('no table: the game ships none (assets/tables/<name>/table.json) and --table names none');
  return loadTable(choices[0].source);
}

let table: Table;
try { table = open(); } catch (e) {
  console.log(e instanceof TableError ? (e as TableError).message : `pinball3d: ${(e as Error).message}`);
  throw e;
}
const bindings = new Bindings();
{
  const file = option('settings') !== '' ? option('settings') : 'settings.json';
  if (fs.exists(file)) { const wrong = bindings.apply(fs.readText(file)); if (wrong !== '') console.log(`pinball3d: ${file}: ${wrong}`); }
  else if (option('settings') !== '') console.log(`pinball3d: ${file}: there is no such file`);
}

let chosen = placeOf(choices, table.def.name);
let game = new Game(table);
let scene = new TableScene(table);
const controls = new Controls();
let audio = new TableAudio(table);
audio.logging = flag('sounds');
if (option('volume') !== '') setVolume(parseFloat(option('volume')));
if (audio.logging) console.log(`audio ${audio.describe()}`);
const logging = flag('log'), stats = flag('stats'), demo = flag('demo');
// the high scores players signed are kept between runs: in the file --scores names, else in the application's storage
// (a scripted or golden run keeps nothing there: its high scores are the table's). "NAME score" lines, the best first
const scoresFile = option('scores'), scoresKey = (): string => `pinball3d.scores.${table.def.name}`;
const keeps = scoresFile !== '' || env('ZINC_DETERMINISTIC') === '' || env('ZINC_DETERMINISTIC') === '0';
/** The high scores kept for the table that is on. */
function readScores(): void {
  if (!keeps) return;
  const kept = scoresFile === '' ? storage.get(scoresKey()) : fs.exists(scoresFile) ? fs.readText(scoresFile) : '';
  const lines = kept.split('\n');
  for (let i = 0; i < lines.length && i < game.highScores.length; i++) {
    const cut = lines[i].indexOf(' ');
    if (cut > 0) { game.highScores[i] = lines[i].slice(0, cut); game.highValues[i] = parseFloat(lines[i].slice(cut + 1)); }
  }
}
readScores();

let view = new View(table.def, width(), height(), option('layout'));
scene.setCamera(view.layout);
let seenW = width(), seenH = height();
let owed = 0, logged = 0, saved = 0;
let physicsMs = 0, drawMs = 0, frames = 0, statsAt = 5, played = 0;
const hint = 'Z and /: flippers   SPACE: plunger   X . UP: bump   ENTER: start';

/** Puts another table of the list on: its scene, its game waiting for a player, its sounds, its high scores. A table with a fault
 *  is told, and the one that was on stays.
 *  ponytail: the scene and the sounds of the table that leaves are not freed; a list of many heavy tables gone through many times
 *  would need it. */
function show(at: i32): void {
  let next: Table;
  try { next = loadTable(choices[at].source); } catch (e) {
    console.log(e instanceof TableError ? (e as TableError).message : `pinball3d: ${(e as Error).message}`);
    return;
  }
  audio.stop();
  game.physics.destroy();
  table = next; chosen = at;
  game = new Game(table); scene = new TableScene(table); audio = new TableAudio(table);
  audio.logging = flag('sounds');
  view = new View(table.def, seenW, seenH, option('layout'));
  scene.setCamera(view.layout);
  owed = 0; logged = 0; saved = 0;
  readScores();
  if (logging) console.log(`table ${table.def.name}`);
  if (audio.logging) console.log(`audio ${audio.describe()}`);
}

onFrame((dt: number) => {
  if (width() !== seenW || height() !== seenH) {   // a resized or turned window: the layout that fits it
    seenW = width(); seenH = height();
    view = new View(table.def, seenW, seenH, option('layout'));
    scene.setCamera(view.layout);
  }
  // the list of tables answers while the table that is on waits for a player
  const to = chosenNow(view, choices, chosen);
  if (to >= 0 && game.phase === Phase.Attract) show(to);
  const l = view.layout;
  readControls(controls, bindings, view.x(l.view), view.y(l.view), view.w(l.view), view.h(l.view));
  if (demo) {
    played += dt;
    const beat = played % 5, flip = played % 1.2;
    controls.start = played > 0.3 && played < 0.4;
    controls.plunger = beat > 1 && beat < 2.2;
    controls.left = flip < 0.15;
    controls.right = flip > 0.6 && flip < 0.75;
  }

  // the game runs at the table's rate whatever the frame rate; a frame that took too long is not caught up beyond a tenth of a second
  const t0 = clock();
  owed = Math.min(owed + dt, 0.1);
  while (owed >= game.dt()) { game.step(controls); owed -= game.dt(); }
  audio.update(game);
  const t1 = clock();
  if (audio.logging) { for (const line of audio.log) console.log(line); audio.log = []; }
  if (logging) { for (; logged < game.rules.log.length; logged++) console.log(game.rules.log[logged]); if (game.rules.log.length < logged) logged = 0; }
  if (keeps && game.signed !== saved) {   // a player signed a high score
    saved = game.signed;
    const lines: string[] = [];
    for (let i = 0; i < game.highScores.length; i++) lines.push(`${game.highScores[i]} ${game.highValues[i]}`);
    if (scoresFile === '') storage.set(scoresKey(), lines.join('\n')); else fs.writeText(scoresFile, `${lines.join('\n')}\n`);
  }

  game.show(scene);
  rect(0, 0, seenW, seenH, rgb(table.def.lighting.background));
  scene.render(view.x(l.view), view.y(l.view), view.w(l.view), view.h(l.view));
  drawPanel(view, game, hint);
  if (game.phase === Phase.Attract) drawChooser(view, choices, chosen);
  if (stats) {
    physicsMs += t1 - t0; drawMs += clock() - t1; frames++;
    if (game.clock >= statsAt) {
      console.log(`pinball3d: ${frames} frames, physics and rules ${(physicsMs / frames).toFixed(3)} ms a frame (${Math.round(1 / game.dt())} steps a second), scene and panel ${(drawMs / frames).toFixed(3)} ms a frame`);
      physicsMs = 0; drawMs = 0; frames = 0; statsAt += 5;
    }
  }
});
