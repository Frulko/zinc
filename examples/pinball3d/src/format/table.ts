// A table in memory, and the way in and out of a file. loadTable() reads `table.json` from a source (a folder, the
// built-in assets or a package: source.ts), checks it against the schema (table-schema.ts) and against itself (names
// that must exist, shapes that must make sense), and gives every fault at once, each with the path of the value.
// The game works on `def`, where every field holds a value (the file's or the default); `data` is the same tree as
// the format describes it, which saveTable() writes back and an editor changes.
import { Schema, Names, check, checkRefs, write } from './schema';
import { tableSchema, VERSION } from './table-schema';
import { TableSource } from './source';

export interface SurfaceDef { id: string; friction: number; restitution: number }
export interface LookDef { id: string; color: string; shading: string; specular: string; shininess: number; glow: string; texture: string }
export interface SoundDef { id: string; file: string; wave: string; hz: number; seconds: number; volume: number; volumeVariation: number; pitch: number; pitchVariation: number; loop: boolean }
export interface MusicDef { attract: string; play: string; multiball: string; gameOver: string }
export interface PlayfieldDef { width: number; length: number; slope: number; glass: number; surface: string; look: string }
export interface BallDef { radius: number; mass: number; friction: number; restitution: number; drag: number; spin: number; look: string }
export interface PhysicsDef { rate: i32; gravity: number; maxSpeed: number; nudge: number; ball: BallDef }
export interface HitSounds { hit: string }
export interface WallDef { id: string; group: string; points: number[][]; closed: boolean; z: number; height: number; thickness: number; surface: string; look: string; sounds: HitSounds }
export interface PassSounds { pass: string }
export interface GateDef { id: string; group: string; a: number[]; b: number[]; z: number; height: number; surface: string; look: string; sounds: PassSounds }
export interface FlipperSounds { up: string; down: string }
export interface FlipperDef {
  id: string; group: string; pivot: number[]; z: number; length: number; baseRadius: number; tipRadius: number; height: number;
  rest: number; stroke: number; speed: number; returnSpeed: number; button: string; surface: string; look: string; sounds: FlipperSounds
}
export interface PlungerSounds { pull: string; release: string }
export interface PlungerDef { at: number[]; z: number; angle: number; travel: number; pullTime: number; speed: number; width: number; height: number; surface: string; look: string; sounds: PlungerSounds }
export interface BumperDef { id: string; group: string; at: number[]; z: number; radius: number; height: number; kick: number; threshold: number; surface: string; look: string; cap: string; sounds: HitSounds }
export interface SlingshotDef { id: string; group: string; a: number[]; b: number[]; z: number; height: number; thickness: number; kick: number; threshold: number; surface: string; look: string; sounds: HitSounds }
export interface KickerSounds { capture: string; eject: string }
export interface KickerDef {
  id: string; group: string; at: number[]; z: number; radius: number; captureSpeed: number; hold: number; exit: number[];
  speed: number; angle: number; elevation: number; look: string; light: string; sounds: KickerSounds
}
export interface TargetSounds { hit: string; reset: string }
export interface TargetDef { id: string; group: string; kind: string; at: number[]; z: number; angle: number; width: number; height: number; thickness: number; surface: string; look: string; light: string; sounds: TargetSounds }
export interface RollSounds { roll: string }
export interface RolloverDef { id: string; group: string; a: number[]; b: number[]; z: number; light: string; sounds: RollSounds }
export interface SpinSounds { spin: string }
export interface SpinnerDef { id: string; group: string; a: number[]; b: number[]; z: number; height: number; turns: number; damping: number; look: string; sounds: SpinSounds }
export interface RampSounds { enter: string; exit: string }
export interface RampDef { id: string; group: string; points: number[][]; profile: number[][]; width: number; wall: number; thickness: number; style: string; surface: string; look: string; sounds: RampSounds }
export interface FloorDef { id: string; group: string; points: number[][]; z: number; thickness: number; surface: string; look: string }
export interface LightDef { id: string; group: string; at: number[]; z: number; shape: string; size: number; angle: number; color: string }
export interface ModelDef { id: string; group: string; mesh: string; shape: string; at: number[]; rotation: number[]; scale: number[]; collide: string; surface: string; look: string }
export interface ConditionDef { test: string; target: string; is: string; value: number }
export interface ActionDef { do: string; target: string; value: number; mode: string; seconds: number }
export interface RuleDef { on: string; event: string; if: ConditionDef[]; do: ActionDef[] }
export interface StepDef { text: string; on: string; event: string; count: i32; light: string }
export interface MissionDef { id: string; name: string; award: number; steps: StepDef[] }
export interface MultiballDef { balls: i32; locks: i32; ballSave: number; scoreMultiplier: number; jackpotOn: string; jackpotEvent: string; jackpot: number; jackpotStep: number }
export interface TiltDef { warnings: i32; recovery: number; penalty: string }
export interface HighScoreDef { name: string; score: number }
export interface RulesDef {
  balls: i32; ballSave: number; extraBalls: i32; multiplierMax: i32; tilt: TiltDef; ranks: string[]; counters: string[];
  missions: MissionDef[]; multiball: MultiballDef; when: RuleDef[]; highScores: HighScoreDef[]
}
export interface CameraDef { position: number[]; target: number[]; fov: number }
export interface PanelItemDef { show: string; box: number[]; size: number; color: string; align: string; label: string }
export interface PanelDef { box: number[]; color: string; items: PanelItemDef[] }
export interface LayoutDef { window: number[]; view: number[]; camera: CameraDef; panel: PanelDef }
export interface LayoutsDef { landscape: LayoutDef; portrait: LayoutDef }
export interface LampDef { direction: number[]; color: string }
export interface LightingDef { background: string; ambient: string; lamps: LampDef[] }
export interface TableDef {
  format: string; version: i32; name: string; author: string; description: string;
  playfield: PlayfieldDef; physics: PhysicsDef; surfaces: SurfaceDef[]; looks: LookDef[]; sounds: SoundDef[]; music: MusicDef;
  walls: WallDef[]; gates: GateDef[]; flippers: FlipperDef[]; plunger: PlungerDef; bumpers: BumperDef[]; slingshots: SlingshotDef[];
  kickers: KickerDef[]; targets: TargetDef[]; rollovers: RolloverDef[]; spinners: SpinnerDef[]; ramps: RampDef[]; floors: FloorDef[];
  lights: LightDef[]; models: ModelDef[]; rules: RulesDef; lighting: LightingDef; layouts: LayoutsDef
}

/** The name of the table file in a table folder or package. */
export const TABLE_FILE = 'table.json';

/** Every fault of a table file, one per line: "path: what is wrong". */
export class TableError extends Error {
  errors: string[];
  constructor(origin: string, errors: string[]) {
    super(`${origin}: ${errors.length === 1 ? 'the table has a fault' : `the table has ${errors.length} faults`}\n  ${errors.join('\n  ')}`);
    this.name = 'TableError';
    this.errors = errors;
  }
}

export class Table {
  /** Every field with a value: what the game reads. */
  def: TableDef;
  /** The same as the format describes it: what is saved, what an editor changes (then call refresh()). */
  data: any;
  /** Where its assets are read from; null for a table made in memory. */
  source: TableSource | null;
  constructor(data: any, source: TableSource | null) { this.data = data; this.def = data as TableDef; this.source = source; }
  /** After `data` was changed: checks it again and renews `def`. Throws TableError, and leaves `def` as it was. */
  refresh(): void {
    const again = checkTable(this.data, 'the table');
    this.data = again;
    this.def = again as TableDef;
  }
}

let schema: Schema | null = null;
/** The schema of the format (built once). */
export function formatSchema(): Schema {
  if (schema === null) schema = tableSchema();
  return schema as Schema;
}

/** The files a table names (models, images, sounds), each once, in file order: what a package must hold beside table.json. */
export function filesOf(t: TableDef): string[] {
  const out: string[] = [];
  const add = (f: string): void => { if (f !== '' && out.indexOf(f) < 0) out.push(f); };
  for (const l of t.looks) add(l.texture);
  for (const s of t.sounds) add(s.file);
  for (const m of t.models) add(m.mesh);
  return out;
}

/** Reads and checks the table of a source. Throws TableError with every fault. */
export function loadTable(source: TableSource): Table {
  if (!source.has(TABLE_FILE)) throw new TableError(source.describe(), [`${TABLE_FILE}: there is no such file`]);
  return new Table(parseTable(source.text(TABLE_FILE), source.describe()), source);
}

/** Checks the text of a table file and returns its data with the defaults filled in. */
export function parseTable(text: string, origin: string): any {
  let raw: any = null;
  try { raw = JSON.parse(text); } catch (e) { throw new TableError(origin, [`the file is not JSON: ${(e as Error).message}`]); }
  return checkTable(raw, origin);
}

/** The canonical text of a table: fields in the order of the format, defaults left out, a newline at the end. Loading
 *  it and saving it again gives the same bytes. */
export function saveTable(t: Table): string { return `${write(formatSchema(), t.data, '')}\n`; }

function checkTable(raw: any, origin: string): any {
  const errors: string[] = [];
  if (raw !== null && typeof raw === 'object' && typeof raw.version === 'number' && raw.version > VERSION) {
    throw new TableError(origin, [`version: this game reads tables up to version ${VERSION}, the file is version ${raw.version}: update the game`]);
  }
  const names = new Names();
  names.add('game', 'game');
  const data = check(formatSchema(), raw, '', names, errors);
  // a fault of shape can leave a list without what the checks below rely on: names and rules are checked once the shape is right
  if (errors.length > 0) throw new TableError(origin, errors);
  const t = data as TableDef;
  declareGroups(t, names);
  checkRefs(names, errors);
  checkShapes(t, errors);
  checkRules(t, names, errors);
  if (errors.length > 0) throw new TableError(origin, errors);
  return data;
}

/** Groups are declared by use: a name in an element's `group`, in a light's `group`; counters by the rules' list. */
function declareGroups(t: TableDef, names: Names): void {
  for (const g of groupsOf(t)) names.add('groups', g);
  for (const l of t.lights) if (l.group !== '') names.add('light groups', l.group);
  for (const c of t.rules.counters) names.add('counters', c);
}

/** The groups of every element, in file order. */
export function groupsOf(t: TableDef): string[] {
  const out: string[] = [];
  const add = (g: string): void => { if (g !== '' && out.indexOf(g) < 0) out.push(g); };
  for (const e of t.walls) add(e.group);
  for (const e of t.gates) add(e.group);
  for (const e of t.flippers) add(e.group);
  for (const e of t.bumpers) add(e.group);
  for (const e of t.slingshots) add(e.group);
  for (const e of t.kickers) add(e.group);
  for (const e of t.targets) add(e.group);
  for (const e of t.rollovers) add(e.group);
  for (const e of t.spinners) add(e.group);
  for (const e of t.ramps) add(e.group);
  for (const e of t.floors) add(e.group);
  for (const e of t.models) add(e.group);
  return out;
}

function checkPath(points: number[][], closed: boolean, path: string, errors: string[]): void {
  if (closed && points.length < 3) errors.push(`${path}: a closed path needs at least 3 points, it has ${points.length}`);
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    if (p.length === 3 && Math.abs(p[2]) > 4) errors.push(`${path}[${i}]: a bulge of ${p[2]} is more than a full circle (1 is a half circle)`);
    if ((closed || i + 1 < points.length) && p[0] === q[0] && p[1] === q[1]) errors.push(`${path}[${i}]: the point is the same as the next one`);
  }
}
function checkSegment(a: number[], b: number[], path: string, errors: string[]): void {
  if (a[0] === b[0] && a[1] === b[1]) errors.push(`${path}.b: must not be the same point as a`);
}

function checkShapes(t: TableDef, errors: string[]): void {
  for (let i = 0; i < t.walls.length; i++) checkPath(t.walls[i].points, t.walls[i].closed, `walls[${i}].points`, errors);
  for (let i = 0; i < t.floors.length; i++) checkPath(t.floors[i].points, true, `floors[${i}].points`, errors);
  for (let i = 0; i < t.ramps.length; i++) {
    const r = t.ramps[i];
    checkPath(r.points, false, `ramps[${i}].points`, errors);
    const pr = r.profile;
    if (pr[0][0] !== 0) errors.push(`ramps[${i}].profile[0]: the first row must start at 0 (the start of the path), not ${pr[0][0]}`);
    if (pr[pr.length - 1][0] !== 1) errors.push(`ramps[${i}].profile[${pr.length - 1}]: the last row must end at 1 (the end of the path), not ${pr[pr.length - 1][0]}`);
    for (let k = 1; k < pr.length; k++) if (pr[k][0] <= pr[k - 1][0]) errors.push(`ramps[${i}].profile[${k}]: the fractions must grow, ${pr[k][0]} comes after ${pr[k - 1][0]}`);
    for (let k = 0; k < pr.length; k++) if (pr[k][1] < 0) errors.push(`ramps[${i}].profile[${k}]: a height under the playfield (${pr[k][1]})`);
  }
  for (let i = 0; i < t.gates.length; i++) checkSegment(t.gates[i].a, t.gates[i].b, `gates[${i}]`, errors);
  for (let i = 0; i < t.slingshots.length; i++) checkSegment(t.slingshots[i].a, t.slingshots[i].b, `slingshots[${i}]`, errors);
  for (let i = 0; i < t.rollovers.length; i++) checkSegment(t.rollovers[i].a, t.rollovers[i].b, `rollovers[${i}]`, errors);
  for (let i = 0; i < t.spinners.length; i++) checkSegment(t.spinners[i].a, t.spinners[i].b, `spinners[${i}]`, errors);
  for (let i = 0; i < t.flippers.length; i++) {
    const f = t.flippers[i];
    if (f.tipRadius > f.baseRadius) errors.push(`flippers[${i}].tipRadius: the tip (${f.tipRadius}) must not be wider than the base (${f.baseRadius})`);
    if (f.stroke === 0) errors.push(`flippers[${i}].stroke: a flipper that does not swing (0)`);
  }
  if (t.lighting.lamps.length > 4) errors.push(`lighting.lamps: the scene has at most 4 lamps, the table has ${t.lighting.lamps.length}`);
  if (t.physics.ball.radius * 2 >= t.playfield.glass) errors.push(`playfield.glass: the glass (${t.playfield.glass}) is lower than the ball is tall (${t.physics.ball.radius * 2})`);
  checkLayout(t.layouts.landscape, 'layouts.landscape', errors);
  checkLayout(t.layouts.portrait, 'layouts.portrait', errors);
}

function checkLayout(l: LayoutDef, path: string, errors: string[]): void {
  if (l.window[0] < 160 || l.window[1] < 160) errors.push(`${path}.window: a window of ${l.window[0]} x ${l.window[1]} is too small (160 at least)`);
  if (l.view[2] <= 0 || l.view[3] <= 0) errors.push(`${path}.view: the table needs a box with a width and a height, not ${l.view[2]} x ${l.view[3]}`);
  const c = l.camera;
  if (c.position[0] === c.target[0] && c.position[1] === c.target[1] && c.position[2] === c.target[2]) errors.push(`${path}.camera.target: the camera looks at the point it is at`);
}

// What a rule's `target` must name depends on what the rule tests or does.
function checkRules(t: TableDef, names: Names, errors: string[]): void {
  const r = t.rules;
  const need = (path: string, what: string, space: string, name: string): void => {
    if (name === '') errors.push(`${path}.target: ${what} needs the name of one of the ${space.split('|').join(' or ')}`);
    else if (!names.has(space, name)) errors.push(`${path}.target: "${name}" is not one of the ${space.split('|').join(' or ')} (${names.list(space)})`);
  };
  const condition = (c: ConditionDef, path: string): void => {
    const numeric = c.is === 'atLeast' || c.is === 'below' || c.is === 'equal';
    if (c.test === 'counter') { need(path, 'the test "counter"', 'counters', c.target); if (!numeric) errors.push(`${path}.is: a counter is compared with atLeast, below or equal, not "${c.is}"`); }
    else if (c.test === 'lights') { if (c.target !== 'self') need(path, 'the test "lights"', 'lights|light groups', c.target); if (c.is !== 'on' && c.is !== 'off') errors.push(`${path}.is: lights are on or off, not "${c.is}"`); }
    else if (c.test === 'targets') { need(path, 'the test "targets"', 'elements|groups', c.target); if (c.is !== 'down' && c.is !== 'up') errors.push(`${path}.is: targets are down or up, not "${c.is}"`); }
    else if (c.test === 'mode') { if (c.target !== 'normal' && c.target !== 'multiball') errors.push(`${path}.target: the mode is "normal" or "multiball", not "${c.target}"`); }
    else if (c.test === 'mission') need(path, 'the test "mission"', 'missions', c.target);
    else if (!numeric) errors.push(`${path}.is: ${c.test} is compared with atLeast, below or equal, not "${c.is}"`);
  };
  const action = (a: ActionDef, path: string): void => {
    const modes = (allowed: string[]): void => { if (allowed.indexOf(a.mode) < 0) errors.push(`${path}.mode: "${a.do}" takes ${allowed.map((m: string) => m === '' ? 'no mode' : m).join(', ')}, not "${a.mode}"`); };
    if (a.do === 'light') { if (a.target !== 'self') need(path, '"light"', 'lights|light groups', a.target); modes(['on', 'off', 'blink', 'flash', 'toggle']); }
    else if (a.do === 'count') { need(path, '"count"', 'counters', a.target); modes(['', 'set']); }
    else if (a.do === 'reset') need(path, '"reset"', 'elements|groups', a.target);
    else if (a.do === 'sound') need(path, '"sound"', 'sounds', a.target);
    else if (a.do === 'rotate') need(path, '"rotate"', 'light groups', a.target);
    else if (a.do === 'say') { if (a.target === '') errors.push(`${path}.target: "say" needs a text`); }
    else if (a.do === 'award') modes(['extraBall', 'ballSave', 'lock', 'multiball', 'mission']);
    else if (a.value === 0) errors.push(`${path}.value: "${a.do}" of 0 does nothing`);
  };
  for (let i = 0; i < r.when.length; i++) {
    const w = r.when[i];
    if (w.do.length === 0) errors.push(`rules.when[${i}].do: a rule that does nothing`);
    for (let k = 0; k < w.if.length; k++) condition(w.if[k], `rules.when[${i}].if[${k}]`);
    for (let k = 0; k < w.do.length; k++) action(w.do[k], `rules.when[${i}].do[${k}]`);
  }
  for (let i = 0; i < r.missions.length; i++) if (r.missions[i].steps.length === 0) errors.push(`rules.missions[${i}].steps: a mission needs at least one step`);
  if (r.missions.length > 0 && r.ranks.length === 0) errors.push('rules.ranks: missions promote the player, so the table needs at least one rank');
}
