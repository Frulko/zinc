// The editor's document without a window: one line per property, `FAILED:` and exit code 1 when one does not hold.
//   zinc run examples/pinball3d-editor/src/selftest.ts -- examples/pinball3d/assets/tables/tidal-lock/table.json
import { args, env, exit } from 'zinc:sys';
import { readText } from 'zinc:fs';
import { Schema, Field, Kind } from '../../pinball3d/src/format/schema';
import { parseTable, formatSchema } from '../../pinball3d/src/format/table';
import { Doc, steps, pathOf, listOf, indexOf, fieldAt, schemaAt, canTurn, isPlaced, isProfile, isOffset, isPath, isClosed, found, mirrorName, newTableText } from './doc';
import { Preset, palette, itemOf, pointsNeeded, rowsNeeded, laneOf, blankOf, alongWith } from './presets';
import { complete, f, setUiLang, step, fieldName, listName, fieldKnown, DONE_UNDONE } from './strings';

let failed = false;
function check(what: string, ok: boolean): void {
  console.log(`${ok ? 'ok' : 'FAILED'}: ${what}`);
  if (!ok) failed = true;
}
/** Whether the game's loader accepts `text` and the document would write the same bytes from it. */
function plays(text: string): boolean {
  try { parseTable(text, 'selftest'); return new Doc(text, '').text() === text; } catch (e) { console.log(`  refused: ${(e as Error).message}`); return false; }
}

// zinc starts a project's program in the project's directory: a relative path is taken from where the command was typed
const given = args()[0];
const sample = readText(given.startsWith('/') || env('PWD').length === 0 ? given : `${env('PWD')}/${given}`);

check('paths read as the loader writes them', steps('walls[2].points[1]').join(' ') === 'walls 2 points 1' && pathOf(steps('rules.when[3].do[0].target')) === 'rules.when[3].do[0].target'
  && listOf('walls[2]') === 'walls' && indexOf('walls[2]') === 2 && listOf('plunger') === '' && indexOf('plunger') === -1
  && fieldAt('flippers[1].speed') !== null && fieldAt('flippers[1].sped') === null && schemaAt('bumpers[0]').name === 'bumper' && schemaAt('').name === 'table'
  && canTurn(schemaAt('flippers[0]')) && canTurn(schemaAt('walls[0]')) && !canTurn(schemaAt('bumpers[0]')));

// ---- the interface: one table of texts, two languages; the names of the format have labels, and a name not known yet is still shown
{
  setUiLang('en');
  const english = `${f(DONE_UNDONE, step('Move pop1'))} / ${fieldName('baseRadius')} / ${listName('walls', false)} / ${listName('walls', true)} / ${fieldName('someNewField')} / ${listName('gizmos', false)}`;
  setUiLang('fr');
  const french = `${f(DONE_UNDONE, step('Move pop1'))} / ${fieldName('baseRadius')} / ${listName('walls', false)} / ${listName('walls', true)} / ${fieldName('someNewField')} / ${listName('gizmos', false)}`;
  check('every text of the interface exists in English and in French', complete() && english === 'Undone: Move pop1. / Radius at the pivot / Walls and guides / Wall / Some new field / Gizmos'
    && french === 'Annulé : Déplacer pop1. / Rayon au pivot / Murs et guides / Mur / Some new field / Gizmos');
  // every field of the format, wherever it is: the ones the label tables do not know are shown by their key (not a fault: a note)
  const seen: Schema[] = [], unknown: string[] = [];
  const walk = (sc: Schema): void => {
    if (seen.indexOf(sc) >= 0) return;
    seen.push(sc);
    for (const fd of sc.fields) { if (!fieldKnown(fd.name) && unknown.indexOf(fd.name) < 0) unknown.push(fd.name); if (fd.of !== null) walk(fd.of as Schema); }
  };
  walk(formatSchema());
  console.log(`the format: ${seen.length} kinds of object; fields without a label of their own: ${unknown.length === 0 ? 'none' : unknown.join(', ')}`);
  setUiLang('en');
}

// ---- a table opened and saved untouched is the same bytes
{
  const d = new Doc(sample, sample);
  check('the sample table opened and saved untouched is byte-identical', d.text() === sample && !d.dirty && !d.canUndo);
  check('a new table is one the game accepts', plays(new Doc(newTableText('New table'), '').text()));
}

// ---- one field, with the format's limits; undo follows the bytes
{
  const d = new Doc(sample, sample);
  const left = d.find('flippers', 'left');
  check('a field is set and the file says so', left === 'flippers[0]' && d.set(`${left}.speed`, 2600) && d.text().indexOf('"pivot": [14.4, 94], "speed": 2600,') > 0 && d.dirty && d.undoLabel === 'Change left.speed');
  check('a value outside the limits of the format is refused with the loader\'s message', !d.set(`${left}.speed`, 20000) && d.refused === 'flippers[0].speed: must be a number from 100 to 10000, not 20000'
    && !d.set(`${left}.button`, 'middle') && d.refused.startsWith('flippers[0].button: must be one of left, right')
    && !d.set('walls[0].surface', 'glue') && d.refused.startsWith('walls[0].surface: "glue" is not one of the surfaces'));
  check('a field set to its default leaves the file', d.set(`${left}.speed`, 2300) && d.text() === sample && !d.dirty && d.isDefault(`${left}.speed`) && !d.isDefault(`${left}.surface`));
  d.undo(); d.undo();
  check('undo gives the saved bytes back', d.text() === sample && !d.dirty && !d.canUndo && d.redo() === 'Change left.speed' && d.get(`${left}.speed`) === 2600);
}

// ---- moving and turning, whatever the kind
{
  const d = new Doc(sample, sample);
  const pop = d.find('bumpers', 'pop1'), outer = d.find('walls', 'outer'), right = d.find('flippers', 'right'), sling = d.find('slingshots', 'slingLeft');
  d.move(pop, 1.5, -2); d.move(outer, 0.5, 0); d.move('plunger', 0, -1);
  const at: any = d.get(`${pop}.at`), pts: any = d.get(`${outer}.points`), pl: any = d.get('plunger.at');
  check('an element moves by its points and its path', at[0] === 19 && at[1] === 29 && pts[0][0] === 1.5 && pts[1][2] === 1 && pts[3][0] === 50.5 && pl[1] === 99 && plays(d.text()));
  d.turn(right, 15); d.turn(sling, 90);
  const a: any = d.get(`${sling}.a`), b: any = d.get(`${sling}.b`);
  check('an element turns around its middle: its directions and its points', d.get(`${right}.rest`) === 170 && a[0] === 17.3 && a[1] === 75.6 && b[0] === 4.9 && b[1] === 80 && plays(d.text()));
  d.seal(); d.move(pop, 0.1, 0); d.move(pop, 0.1, 0); d.move(pop, 0.1, 0);
  const before = d.text();
  check('nudges of one element are one step', d.undo() === 'Move pop1' && d.get(`${pop}.at`)[0] === 19 && d.redo() === 'Move pop1' && d.text() === before);
}

// ---- names: a new name goes wherever the old one was named; a deleted thing takes what cannot do without it
{
  const d = new Doc(sample, sample);
  check('an id used twice is refused', !d.set(`${d.find('bumpers', 'pop1')}.id`, 'pop2') && d.refused === 'bumpers[1].id: "pop2" is used twice');
  check('a renamed element is renamed in the rules that name it', d.set(`${d.find('kickers', 'dock')}.id`, 'berth') && d.text().indexOf('"on": "dock"') < 0 && d.text().split('"on": "berth"').length === 5 && plays(d.text()));
  check('a renamed light is renamed where it is named', d.set(`${d.find('lights', 'extra')}.id`, 'bonusBall') && d.text().indexOf('"target": "extra"') < 0 && d.text().split('"target": "bonusBall"').length === 5 && plays(d.text()));
  const rules: i32 = d.get('rules.when').length, missions: i32 = d.get('rules.missions').length;
  check('deleting a light clears the name that pointed to it', d.remove(d.find('lights', 'laneLight1')) && d.went.join(' ') === 'rollovers[0].light' && d.get('rollovers[0].light') === '' && plays(d.text()));
  check('deleting a kicker takes the rules and the mission that need it, in one step', d.remove(d.find('kickers', 'berth')) && d.went.length === 4 && d.get('rules.when').length === rules - 3 && d.get('rules.missions').length === missions - 1
    && plays(d.text()) && d.undo() === 'Delete berth' && d.get('rules.when').length === rules && d.find('kickers', 'berth') !== '');
  check('only an item of a list is deleted', !d.remove('plunger') && d.refused.length > 0);
  const json = d.jsonOf(d.find('bumpers', 'pop3'));
  check('an element is shown as the file has it, and taken back edited', json === '{ "id": "pop3", "group": "pops", "at": [23.85, 41], "surface": "rubber", "look": "pop", "cap": "popCap" }'
    && d.replace(d.find('bumpers', 'pop3'), json.replace('41]', '43], "kick": 180')) && d.get('bumpers[2].kick') === 180 && d.get('bumpers[2].at')[1] === 43
    && !d.replace('bumpers[2]', '{ "id": "pop3", "at": [1, 2], "kik": 3 }') && d.refused === 'bumpers[2].kik: unknown field (did you mean "kick"?)' && !d.replace('bumpers[2]', '{ "id": ') && plays(d.text()));
  check('the names a field may hold are listed', d.namesOf('surfaces').join(' ') === 'wood metal rubber plastic wire bat' && d.namesOf('light groups').join(' ') === 'lanes arrows locks ranks'
    && d.namesOf('elements|groups|game').indexOf('game') > 0 && d.namesOf('groups').indexOf('pops') >= 0 && d.namesOf('counters').join(' ') === 'laps');
}

// ---- sounds: the sound of an event is one of the table's sounds, chosen by name
{
  const d = new Doc(sample.replace('"walls": [', '"sounds": [{ "id": "clack" }, { "id": "hum", "loop": true }],\n  "walls": ['), '');
  const hit = fieldAt('bumpers[0].sounds.hit');
  check('the sound of an event is a choice among the sounds of the table', hit !== null && hit.kind === Kind.Ref && d.namesOf(hit.to).join(' ') === 'clack hum'
    && d.set('bumpers[0].sounds.hit', 'clack') && !d.set('bumpers[0].sounds.hit', 'clock') && d.refused.startsWith('bumpers[0].sounds.hit: "clock" is not one of the sounds')
    && d.set('music.play', 'hum') && plays(d.text()) && d.remove(d.find('sounds', 'clack')) && d.went.join(' ') === 'bumpers[0].sounds.hit' && plays(d.text()));
  check('what has a place on the table is read from the format', isPlaced(schemaAt('bumpers[0]')) && isPlaced(schemaAt('plunger')) && isPlaced(schemaAt('lights[0]')) && !isPlaced(schemaAt('looks[0]')) && !isPlaced(schemaAt('rules')));
}

// ---- the roles of the format: what a field stands for in space is not guessed from its name or its shape
{
  const d = new Doc(sample, sample);
  const role = (path: string): string => { const fd = fieldAt(path); return fd === null ? '?' : fd.role; };
  check('a point, a path, a direction and a rotation are what the format says they are', role('bumpers[0].at') === 'point' && role('walls[0].points') === 'path' && role('flippers[0].rest') === 'direction'
    && role('models[0].rotation') === 'rotation' && role('ramps[0].profile') === 'profile' && role('flippers[0].speed') === '');
  const giant = d.find('models', 'giant');
  check('a model turns by the third number of its rotation, and moves by its point', canTurn(schemaAt(giant)) && d.turn(giant, 30) && d.get(`${giant}.rotation`)[2] === 30 && d.get(`${giant}.rotation`)[0] === 0
    && d.move(giant, 1, 0) && d.get(`${giant}.at`)[0] === 6.2 && d.get(`${giant}.at`)[2] === 0 && plays(d.text()));
}

// ---- finding a field of a form by what someone types: its key alone when the text is a key, else what holds the text
{
  const all = (fd: Field, at: string): boolean => false;
  const flipper = schemaAt('flippers[0]'), wall = schemaAt('walls[12]');
  check('a field is found by its key, alone', found(flipper, 'flippers[0]', 'speed', fieldName, all).join(' ') === 'flippers[0].speed' && found(wall, 'walls[12]', 'Surface', fieldName, all).join(' ') === 'walls[12].surface'
    && found(flipper, 'flippers[0]', 'sounds.up', fieldName, all).join(' ') === 'flippers[0].sounds.up');
  // (the format may grow: these say what is among the answers, not how many there are)
  const part = found(flipper, 'flippers[0]', 'spee', fieldName, all);
  check('or by a part of its key or of its label, with the fields of the objects inside', part.indexOf('flippers[0].speed') >= 0 && part.indexOf('flippers[0].returnSpeed') > part.indexOf('flippers[0].speed')
    && found(flipper, 'flippers[0]', 'angle at', fieldName, all).indexOf('flippers[0].rest') >= 0 && found(flipper, 'flippers[0]', 'sounds', fieldName, all).indexOf('flippers[0].sounds.down') >= 0
    && found(flipper, 'flippers[0]', 'zzz', fieldName, all).length === 0);
}

// ---- drawing: the palette, new names, a copy, a mirror image, a point dragged
{
  const d = new Doc(sample, sample);
  const lists: string[] = [];
  for (const fd of formatSchema().fields) if (fd.kind === Kind.List && fd.of !== null && isPlaced(fd.of as Schema)) lists.push(fd.name);
  const entries = palette(lists);
  let kinds = 0, made = 0;
  for (const list of lists) if (entries.filter((e: Preset) => e.list === list).length > 0) kinds++;
  for (const e of entries) {
    if (e.list === '') continue;
    // as many clicks as the entry needs, at places of their own
    const clicks: number[][] = [], n = Math.max(1, pointsNeeded(e.list) + rowsNeeded(e.list));
    for (let i = 0; i < n; i++) clicks.push([10 + i * 6, 40 + (i % 2) * 7 + i]);
    if (d.add(e.list, itemOf(e, clicks)) !== '') made++; else console.log(`  +${e.key}: ${d.refused}`);
  }
  console.log(`the palette: ${entries.length} entries for ${lists.length} kinds of thing`);
  check('the palette has an entry for every kind the format places, and each makes a thing the game accepts', kinds === lists.length && made === entries.length - 1 && plays(d.text())
    && entries.filter((e: Preset) => e.key === 'bumper' || e.key === 'plunger-lane' || e.key === 'left-flipper').length === 3);
  const lane = laneOf(51, 107, 1.35);
  check('the plunger lane follows from the board and the ball', JSON.stringify(lane[0].points) === '[[46.7,106],[46.7,30]]' && JSON.stringify(lane[1].b) === '[46.7,28.5]' && JSON.stringify(lane[2]) === '[48.35,100]');
}
{
  const d = new Doc(sample, sample);
  check('a new thing gets a name that is free', d.freeId('bumpers', 'pop3') === 'pop4' && d.freeId('walls', 'wall') === 'wall1' && mirrorName('guideLeft') === 'guideRight' && mirrorName('right') === 'left' && mirrorName('pop1') === 'pop1');
  const copy = d.duplicate(d.find('bumpers', 'pop1'), 2, 2);
  check('a copy is the same thing beside the original, under a name of its own', copy === 'bumpers[3]' && d.get(`${copy}.id`) === 'pop4' && d.get(`${copy}.at`)[0] === 19.5 && d.get(`${copy}.group`) === 'pops'
    && d.undoLabel === 'Duplicate pop4' && plays(d.text()));
  // Tidal Lock is the same on both sides of x = 23.85: the mirror image of what is on the left is what the table has on the right
  const guide = JSON.stringify(d.get(`${d.find('walls', 'guideRight')}.points`)), sling = d.jsonOf(d.find('slingshots', 'slingRight')).replace('slingRight', 'x');
  d.remove(d.find('walls', 'guideRight')); d.remove(d.find('slingshots', 'slingRight')); d.remove(d.find('flippers', 'right'));
  const g = d.mirror(d.find('walls', 'guideLeft'), 23.85), s = d.mirror(d.find('slingshots', 'slingLeft'), 23.85), fl = d.mirror(d.find('flippers', 'left'), 23.85);
  check('the mirror image of a guide is the guide of the other side, under the other side\'s name', d.get(`${g}.id`) === 'guideRight' && JSON.stringify(d.get(`${g}.points`)) === guide);
  check('a slingshot mirrored still kicks towards the middle: its ends change places', d.jsonOf(s).replace('slingRight', 'x') === sling);
  check('the mirror image of a left flipper is a right flipper', d.get(`${fl}.id`) === 'right' && d.get(`${fl}.pivot`)[0] === 33.3 && d.get(`${fl}.rest`) === 155 && d.get(`${fl}.stroke`) === 50 && d.get(`${fl}.button`) === 'right' && plays(d.text()));
  const arc = d.mirror(d.find('walls', 'outer'), 25.5);
  check('an arc mirrored bends the other way', JSON.stringify(d.get(`${arc}.points`)) === '[[50,92],[50,27,-1],[1,27],[1,106]]');
  d.seal();
  d.set('walls[0].points[0]', [2, 92], true); d.set('walls[0].points[0]', [3, 91.5], true);
  const dragged = d.undoLabel === 'Change outer.points' && d.get('walls[0].points[0]')[1] === 91.5;
  d.undo();
  check('a point dragged is one step, and its path keeps its other points', dragged && d.get('walls[0].points[0]')[0] === 1 && d.get('walls[0].points').length === 4
    && !d.set('walls[0].points[1]', [1, 92]) && d.refused === 'walls[0].points[0]: the point is the same as the next one');
  const ramp = fieldAt('ramps[0].profile');
  check('a height profile is what the format says it is', ramp !== null && isProfile(ramp) && !isProfile(fieldAt('ramps[0].points') as Field));
}

// ---- lists inside forms (the rules, the missions and their steps): a line per item, new items, their order
{
  const d = new Doc(sample, sample);
  check('an item of a list is told by a line', d.summaryOf('rules.when[0]') === 'pops hit [score 500, bonus 100]' && d.summaryOf('rules.missions[0]') === 'cargo: Cargo Run'
    && d.summaryOf('rules.missions[0].steps[0]') === 'Shoot the ramp rail exit 2 rampArrow' && d.nameOf('rules.when[3]') === 'rule 4');
  const rule = d.add('rules.when', blankOf('rule')), action = d.add(`${rule}.do`, blankOf('action'));
  check('a rule, and an action of it, are added where they belong', rule === 'rules.when[24]' && action === 'rules.when[24].do[1]' && d.undoLabel === 'Add action' && plays(d.text()));
  const up = d.reorder(rule, -1);
  check('an item moves up and down its list', up === 'rules.when[23]' && d.summaryOf(up) === 'game start [score 100, score 100]' && d.reorder('rules.when[0]', -1) === '' && plays(d.text()));
  const e = new Doc(newTableText('New table'), '');
  const mission = e.add('rules.missions', blankOf('mission'), 'Add', alongWith('mission'));
  check('the first mission of a table brings the rank it needs', mission === 'rules.missions[0]' && e.get('rules.ranks').length === 1 && e.get(`${mission}.id`) === 'mission1' && plays(e.text()));
  check('a step is called by the thing it changes', d.set('physics.ball.radius', 1.4) && d.undoLabel === 'Change physics.ball.radius' && d.set('bumpers[0].kick', 150) && d.undoLabel === 'Change pop1.kick'
    && d.set('rules.when[0].do[0].value', 600) && d.undoLabel === 'Change action 1.value');
  // a step counted from a thing turns and mirrors with it, and stays when the thing moves
  const dock = d.find('kickers', 'dock');
  d.set(`${dock}.exit`, [2, 0, 6]); d.move(dock, 1, 1); d.turn(dock, 90);
  const turned = JSON.stringify(d.get(`${dock}.exit`));
  const twin = d.mirror(dock, 23.85);
  check('an offset turns and mirrors with its thing, and does not move with it', turned === '[0,2,6]' && isOffset(fieldAt(`${dock}.exit`) as Field) && JSON.stringify(d.get(`${twin}.exit`)) === '[0,2,6]'
    && d.turn(twin, -90) && JSON.stringify(d.get(`${twin}.exit`)) === '[2,0,6]' && plays(d.text()));
  const area = fieldAt('floors[0].points');
  check('the outline of an upper playfield closes by itself', area !== null && area.role === 'area' && isPath(area) && isClosed(area, e.get('plunger')) && !isClosed(fieldAt('walls[0].points') as Field, d.get('walls[0]')));
}

// ---- 50 mixed operations: undo and redo give back every file, byte for byte
{
  const d = new Doc(sample, sample);
  const texts: string[] = [d.text()], kinds = new Map<string, i32>();
  const lists = ['walls', 'gates', 'flippers', 'bumpers', 'slingshots', 'kickers', 'targets', 'rollovers', 'spinners', 'ramps', 'lights', 'models'];
  let seed = 7;
  const pick = (n: i32): i32 => { seed = (seed * 75 + 74) % 65537; return seed % n; };
  for (let tries = 0; texts.length < 51 && tries < 4000; tries++) {
    const list = lists[pick(lists.length)], n: i32 = d.get(list).length;
    if (n === 0) continue;
    const path = `${list}[${pick(n)}]`, step: i32 = texts.length, op = (tries * 7) % 12;
    if (op === 0 || op === 1) d.move(path, (pick(41) - 20) / 10, (pick(41) - 20) / 10);
    else if (op === 2) d.turn(path, (pick(13) - 6) * 15);
    else if (op === 3) d.move('plunger', 0, (pick(5) - 2) / 10);
    else if (op === 4) d.set(`flippers[${pick(2)}].speed`, 1500 + pick(20) * 100);
    else if (op === 5) d.set(`walls[${pick(d.get('walls').length)}].surface`, d.namesOf('surfaces')[pick(6)]);
    else if (op === 6) d.set(`looks[${pick(d.get('looks').length)}].color`, ['#aa3355', '#3355aa', '#55aa33', '#b0b8c0'][pick(4)]);
    else if (op === 7) d.set(`${path}.id`, `${list}${step}`);
    else if (op === 8) d.set(`${path}.group`, pick(3) === 0 ? '' : `set${pick(3)}`);
    else if (op === 9 && n > 1) d.remove(path);
    else if (op === 10) d.set('physics.gravity', 900 + pick(30) * 10);
    else if (op === 11) d.set('name', `Table ${step}`);
    d.seal();
    if (d.text() === texts[texts.length - 1]) continue;
    texts.push(d.text());
    const kind = d.undoLabel.split(' ')[0];
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  const mix: string[] = [];
  for (const k of kinds.keys()) mix.push(`${kinds.get(k) ?? 0} ${k}`);
  console.log(`50 operations: ${mix.join(', ')}`);
  let accepted = texts.length === 51;
  for (let k = 1; k < texts.length; k++) if (!plays(texts[k])) accepted = false;
  check('every state on the way is a file the game accepts, in canonical form', accepted);
  let back = true;
  for (let k = 49; k >= 0; k--) { d.undo(); if (d.text() !== texts[k]) back = false; }
  check('50 undos give back every earlier file, byte for byte', back && !d.canUndo && d.text() === sample);
  let forth = true;
  for (let k = 1; k <= 50; k++) { d.redo(); if (d.text() !== texts[k]) forth = false; }
  check('50 redos give back every later file, byte for byte', forth && !d.canRedo);
  d.undo(); d.undo();
  d.move('bumpers[0]', 1, 1);
  check('an edit after an undo drops what was undone', !d.canRedo && d.canUndo);
}
if (failed) exit(1);
