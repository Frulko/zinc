// Museum table: the app of the table. Everything it shows comes from assets/project.json (docs/museum-table-format.md), played by the
// player (player.ts) in the whole window. This file is the window and the command line; a kiosk has no way out of it.
//   zinc run examples/museum-table [-- --sequence <id>] [--lang <code>] [--statistics <directory>] [--story] [--log] [--controls]
//     [--stress <cards>] [--pins] [--time]
// --statistics names the directory where a table whose project has `kiosk.statistics` writes the counts of each day (stats.ts): without
// it nothing is counted;
// --story prints what happens to the story, one line per event: sequences, links, overlays, the storyboard, presentations, the narration
// clips asked for and the subtitles shown, the language, the side the texts turn to, the attract loop and the reset (the tests read it);
// --log prints the pose of every card that moved, and the view and points of the 3D object and of the panorama, one line per change;
// --controls prints where every control is, each time one moves: its place on the table, how many texts did not fit where they are
// written and how many controls the subtitle lies on (the tests check the reach of a visitor, that nothing is clipped or covered);
// --stress lays out that many cards, keeps them moving and prints the frame time; --time prints the time the 3D object takes to draw;
// --pins puts a red ball on every point of interest of the object (the test of their projection).
import { onFrame, width, height, clear, escapeByApp } from 'zinc:gfx';
import { readText } from 'zinc:assets';
import { args, clock } from 'zinc:sys';
import * as fs from 'zinc:fs';
import { parseProject, Project, Sequence } from './project';
import { Player } from './player';
import { Statistics } from './stats';
import { Updates } from './update';
import { startProbe } from './probe';

/** The project, or when it cannot be read a table with nothing on it: the fault is logged for the staff and never shown to a visitor. */
function load(): Project {
  try { return parseProject(readText('project.json')); } catch (e) {
    console.error(`museum-table: project.json: ${e.message}`);
    const empty = new Project(), nothing = new Sequence();
    empty.languages = ['en']; nothing.id = 'empty'; empty.start = 'empty'; empty.sequences = [nothing];
    empty.kiosk.attractAfter = 0; empty.kiosk.resetAfter = 0;
    return empty;
  }
}
const project = load();
const a = args();
let first = '', lang = project.languages[0];
for (let i = 0; i < a.length - 1; i++) {
  if (a[i] === '--lang') lang = a[i + 1];
  else if (a[i] === '--sequence') first = a[i + 1];
}
const player = new Player(project, first, lang);
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--log') player.logging = true;
  else if (a[i] === '--story') player.telling = true;
  else if (a[i] === '--controls') player.checking = true;
  else if (a[i] === '--pins') player.pins = true;
  else if (a[i] === '--time') player.timing = true;
  else if (a[i] === '--stress' && i + 1 < a.length) player.stress = parseInt(a[++i], 10);
  else if (a[i] === '--statistics' && i + 1 < a.length && project.kiosk.statistics) {
    const dir = a[++i];
    fs.mkdir(dir, true);
    player.counting = new Statistics(
      (day: string): string => fs.exists(`${dir}/${day}.csv`) ? fs.readText(`${dir}/${day}.csv`) : '',
      (day: string, csv: string): void => {   // a disk that is full or gone is the staff's to know, and nothing a visitor sees
        try { fs.writeText(`${dir}/${day}.csv`, csv); } catch (e) { console.error(`museum-table: statistics: ${e.message}`); }
      });
  }
}
const probing = a.includes('--probe');
if (probing) {
  project.kiosk.attractAfter = 0; project.kiosk.resetAfter = 0;
  startProbe(player);
}
let probeTime = clock();
// a project that names where the museum publishes looks there for a newer version; what happens is written for the staff and in the story
const updates = new Updates(project.kiosk.updateUrl, (what: string): void => { console.error(`museum-table: update: ${what}`); player.note(`update: ${what}`); });
if (project.kiosk.fullscreen) escapeByApp(true);   // a kiosk: Escape leads nowhere (the window itself is made a kiosk by ZINC_KIOSK=1 or zinc.json)

// A remote driver observes real time, including a headless run whose normal dt is a fixed test step.
onFrame((dt: number) => {
  if (probing) { const now = clock(); dt = Math.max(0, Math.min(0.1, (now - probeTime) / 1000)); probeTime = now; }
  clear(project.theme.background);
  player.frame(dt, 0, 0, width(), height());
  updates.frame(dt, player.quiet);
});
