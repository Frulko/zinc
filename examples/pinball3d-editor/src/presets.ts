// The palette: what can be added to a table. An entry is a list of the format and the fields that make a useful start (a right
// flipper rests and swings the other way, a drop target is a target of another kind); where it goes comes from clicks on the top
// view, in the order of the format's fields: one click per point, then one per point of its path. Every list of the format whose items
// have a place gets an entry even when this file names none for it, so a kind added to the format can be placed at once.
import { Schema, Field, Kind } from '../../pinball3d/src/format/schema';
import { TableDef, formatSchema, parseTable } from '../../pinball3d/src/format/table';
import { FORMAT, VERSION } from '../../pinball3d/src/format/table-schema';
import { isPoint, isPath, isProfile } from './doc';
import { Outline, outlines } from './shapes';

export class Preset {
  /** What it is called where a command names it ("+wall" in the box that goes to things): a word that does not change. */
  key: string;
  /** The list of the table it adds to; '' for the plunger lane, which is several things at once (LANE). */
  list: string;
  /** Its name in the palette, in English and in French; '' for the name of the kind. */
  en: string;
  fr: string;
  /** Its fields beyond the format's defaults, as a file would hold them. */
  json: string;
  constructor(key: string, list: string, en: string, fr: string, json: string) { this.key = key; this.list = list; this.en = en; this.fr = fr; this.json = json; }
}
/** The plunger lane: the wall that makes it, the one-way gate at its top, and the plunger at its bottom (state.ts addLane). */
export const LANE = new Preset('plunger-lane', '', 'Plunger lane', 'Couloir de lancement', '');

// The surfaces, looks and groups named here are those of the editor's starter table (assets/new-table); on a table that does not
// have them the names are dropped when the thing is added (doc.ts add), and the thing gets the game's plain defaults.
const KNOWN: Preset[] = [
  new Preset('wall', 'walls', 'Wall', 'Mur', '{ "surface": "metal", "look": "steel" }'),
  new Preset('lane-guide', 'walls', 'Lane guide', 'Guide de couloir', '{ "height": 2.2, "thickness": 0.5, "surface": "rubber", "look": "rubber" }'),
  new Preset('left-flipper', 'flippers', 'Left flipper', 'Batteur gauche', '{ "group": "flippers", "rest": 25, "stroke": -50, "button": "left", "surface": "bat", "look": "bat" }'),
  new Preset('right-flipper', 'flippers', 'Right flipper', 'Batteur droit', '{ "group": "flippers", "rest": 155, "stroke": 50, "button": "right", "surface": "bat", "look": "bat" }'),
  new Preset('bumper', 'bumpers', 'Bumper', 'Bumper', '{ "group": "bumpers", "surface": "rubber", "look": "bumper", "cap": "cap" }'),
  new Preset('slingshot', 'slingshots', 'Slingshot', 'Slingshot', '{ "group": "slingshots", "surface": "rubber", "look": "rubber" }'),
  new Preset('standup-target', 'targets', 'Standup target', 'Cible fixe', '{ "group": "targets", "surface": "plastic", "look": "target" }'),
  new Preset('drop-target', 'targets', 'Drop target', 'Cible tombante', '{ "group": "targets", "kind": "drop", "surface": "plastic", "look": "target" }'),
  new Preset('ramp', 'ramps', 'Ramp', 'Rampe', '{ "profile": [[0, 0], [0.4, 5], [1, 5]], "surface": "plastic", "look": "ramp" }'),
  new Preset('wire-rail', 'ramps', 'Wire rail', 'Rail', '{ "profile": [[0, 5], [1, 3]], "width": 3, "style": "wire", "look": "steel" }'),
  new Preset('round-light', 'lights', 'Round light', 'Lampe ronde', '{}'),
  new Preset('arrow-light', 'lights', 'Arrow light', 'Lampe flèche', '{ "shape": "arrow", "size": 1.5 }'),
  new Preset('bar-light', 'lights', 'Bar light', 'Lampe barre', '{ "shape": "bar", "size": 1.5, "angle": 0 }'),
  new Preset('box', 'models', 'Box', 'Bloc', '{ "shape": "box", "scale": [4, 4, 3] }'),
  new Preset('cylinder', 'models', 'Cylinder', 'Cylindre', '{ "shape": "cylinder", "scale": [4, 4, 3] }'),
];

/** The palette for these lists of the format (those whose items have a place), in their order, then the plunger lane. */
export function palette(lists: string[]): Preset[] {
  const out: Preset[] = [];
  for (const list of lists) {
    const named = KNOWN.filter((p: Preset) => p.list === list);
    // a kind this file names nothing for: its defaults, under the name the format gives its items ("bumper", "gate")
    if (named.length === 0) out.push(new Preset(schemaOf(list).name.replaceAll(' ', '-'), list, '', '', '{}'));
    for (const p of named) out.push(p);
  }
  out.push(LANE);
  return out;
}
function schemaOf(list: string): Schema { return (formatSchema().field(list) as Field).of as Schema; }
/** How many clicks place an item of a list: one per point it has. */
export function pointsNeeded(list: string): i32 {
  let n = 0;
  for (const f of schemaOf(list).fields) if (isPoint(f)) n++;
  return n;
}
/** After its points, how many more clicks its path needs at least (0: it has no path, the last point ends the placing). */
export function rowsNeeded(list: string): i32 {
  for (const f of schemaOf(list).fields) if (isPath(f)) return f.minRows;
  return 0;
}
/** The item a preset makes at these places of the top view ([x, y] each), as a file would hold it, without a name. */
export function itemOf(p: Preset, clicks: number[][]): any {
  const item: any = JSON.parse(p.json);
  let k = 0;
  for (const f of schemaOf(p.list).fields) {
    if (isPoint(f)) { const c = clicks[k++]; item[f.name] = f.cols === 3 ? [c[0], c[1], 0] : [c[0], c[1]]; }
    else if (isPath(f)) { const rows: number[][] = []; for (; k < clicks.length; k++) rows.push([clicks[k][0], clicks[k][1]]); item[f.name] = rows; }
    // a height the format requires and the preset does not give: level with the playfield
    else if (f.kind === Kind.Rows && f.required && item[f.name] === undefined && isProfile(f)) item[f.name] = [[0, 0], [1, 0]];
  }
  return item;
}
/** The pieces of a plunger lane for a playfield and a ball of these sizes: [wall, gate, where the plunger goes]. */
export function laneOf(width: number, length: number, ballRadius: number): any[] {
  const lane = Math.round((ballRadius * 2 + 0.6) * 10) / 10, x = Math.round((width - 1 - lane) * 100) / 100, top = Math.round(length * 0.28);
  const wall: any = { id: 'shooterLane', points: [[x, length - 1], [x, top]] };
  const gate: any = { id: 'laneGate', a: [width - 1, top - 1.5], b: [x, top - 1.5] };
  return [wall, gate, [Math.round((x + lane / 2) * 100) / 100, length - 7]];
}

// What a new item holds in a list whose items have no place on the table, by the name the format gives the items of the list: the
// fields the format requires, as a start that the game accepts and that plainly asks to be changed. A list not named here starts
// with the format's defaults (a surface, a look, a sound, a lamp need nothing more than their name).
const BLANKS: string[] = [
  'rule', '{ "on": "game", "event": "start", "do": [{ "do": "score", "value": 100 }] }',
  'action', '{ "do": "score", "value": 100 }',
  'condition', '{ "test": "mode", "target": "normal" }',
  'mission', '{ "name": "New mission", "steps": [{ "text": "Do this", "on": "game", "event": "start" }] }',
  'step', '{ "text": "Do this", "on": "game", "event": "start" }',
  'high score', '{ "name": "AAA", "score": 1000 }',
  'panel item', '{ "show": "score", "box": [0, 0, 100, 30] }',
  'credit', '{ "author": "?", "licence": "?" }',
];
/** A new item for a list whose items the format calls `kind` ("rule", "sound"), as a file would hold it. */
export function blankOf(kind: string): any {
  for (let i = 0; i < BLANKS.length; i += 2) if (BLANKS[i] === kind) return JSON.parse(BLANKS[i + 1]);
  const none: any = {};
  return none;
}
/** What the table must have beside a new item of this kind: missions promote the player, so a table with a mission has a rank. */
export function alongWith(kind: string): ((d: any) => void) | null {
  if (kind !== 'mission') return null;
  return (d: any): void => { if (d.rules.ranks.length === 0) d.rules.ranks = ['Rookie']; };
}

/** What an entry of the palette looks like: the top view's own drawing of it, around (0, 0), a few centimetres across. */
export function miniature(p: Preset): Outline[] {
  const t: any = { format: FORMAT, version: VERSION, name: 'palette', plunger: { at: [0, 30] } };
  if (p.list === '') {
    const parts = laneOf(12, 16, 1.35);
    t['walls'] = [parts[0]]; t['gates'] = [parts[1]]; t['plunger'] = { at: parts[2] };
    const data: any = parseTable(JSON.stringify(t), 'the palette');
    return outlines(data as TableDef, data, formatSchema(), ['walls', 'gates'], ['plunger']);
  }
  const points = pointsNeeded(p.list), rows = rowsNeeded(p.list), clicks: number[][] = [];
  if (points === 1) clicks.push([0, 0]);
  else if (points > 1) { clicks.push([-3, 0]); clicks.push([3, 0]); }
  if (rows >= 3) { clicks.push([-4, -3]); clicks.push([4, -3]); clicks.push([4, 3]); clicks.push([-4, 3]); }
  else if (rows > 0) { clicks.push([-4, 3]); clicks.push([-1.5, -2.5]); clicks.push([4, -2.5]); }
  // the miniature is the shape alone: the surfaces and looks an entry names are those of another table
  const item: any = itemOf(p, clicks);
  item.id = 'sample';
  for (const name of ['surface', 'look', 'cap']) if (item[name] !== undefined) item[name] = '';
  t[p.list] = [item];
  const data: any = parseTable(JSON.stringify(t), 'the palette');
  return outlines(data as TableDef, data, formatSchema(), [p.list], []);
}
