// The editor's document without a window: one line per property, `FAILED:` and exit code 1 when one does not hold.
//   zinc run examples/pinball3d-editor/src/selftest.ts -- examples/pinball3d/assets/tables/tidal-lock/table.json
import { args, env, exit } from 'zinc:sys';
import { readText } from 'zinc:fs';
import { Schema, Field, Kind, Variants } from '../../pinball3d/src/format/schema';
import { parseTable, formatSchema } from '../../pinball3d/src/format/table';
import { EVENTS } from '../../pinball3d/src/format/table-schema';
import { Doc, steps, pathOf, listOf, indexOf, fieldAt, schemaAt, canTurn, isPlaced, isProfile, isOffset, isPath, isClosed, found, mirrorName, newTableText } from './doc';
import { Preset, palette, itemOf, pointsNeeded, rowsNeeded, laneOf, blankOf, alongWith, startOf } from './presets';
import { complete, f, setUiLang, step, fieldName, listName, fieldKnown, DONE_UNDONE, phrase, phrasesComplete } from './strings';
import { Piece, pieces, sentenceOf, wordSaid, ruleSaid, said, kindSaid, extrasOf, word, worded } from './sentences';
import { ScoreRow, scoreRows, scoreEvents, scoreOf, scoreChange } from './scores';

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
    && role('models[0].rotation') === 'rotation' && role('ramps[0].profile') === 'profile' && role('flippers[0].speed') === ''
    && role('bumpers[0].radius') === 'radius' && role('kickers[0].radius') === 'radius' && role('lights[0].glow') === 'radius' && role('physics.ball.radius') === '');
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

// ---- conditions and actions: an object of a kind is whole at once, and is said as a sentence in both languages
{
  const d = new Doc(sample, sample);
  const rule = d.add('rules.when', blankOf('rule'));
  const names = (space: string): string[] => d.namesOf(space), among = (list: string): string[] => d.namesAmong(list);
  let kinds = 0, made = 0, said = 0;
  const lists = ['if', 'do'];
  for (const list of lists) {
    const of = (fieldAt(`${rule}.${list}`) as Field).of as Schema, vs = of.variants as Variants;
    for (const v of vs.all) {
      kinds++;
      const start = startOf(of, v.word, names, among, d.data);
      // (a kind that speaks of what this table does not have, a sound on a table without sounds, says what is missing instead)
      if (start.item === null && start.lacks !== '' && d.namesOf(start.lacks).length === 0) { made++; console.log(`a new ${of.name} "${v.word}" needs one of the ${start.lacks}: this table has none`); }
      else if (start.item !== null && d.add(`${rule}.${list}`, start.item, 'Add', start.also) !== '') made++; else console.log(`  ${of.name} ${v.word}: ${d.refused}`);
      // its sentence, with each of its ways: every part the kind reads is in it, and nothing else, in both languages
      const ways = v.ways.length === 0 ? [''] : v.ways;
      let fits = true;
      for (const lang of ['en', 'fr']) {
        setUiLang(lang);
        for (const way of ways) {
          const slots: string[] = [];
          for (const p of pieces(sentenceOf(of.name, v, way))) if (p.slot !== '') slots.push(p.slot);
          const want: string[] = [];
          if (v.aimed) want.push('target');
          if (v.ways.length > 0) want.push('way');
          for (const n of v.numbers) { const name = n.indexOf(':') < 0 ? n : n.slice(0, n.indexOf(':')); if (v.uses(name, way)) want.push(name); }
          const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
          if (phrase(`say.${of.name}.${v.word}`) === '' || slots.sort(order).join(' ') !== want.sort(order).join(' ') || phrase(`kind.${of.name}.${v.word}`) === '') { fits = false; console.log(`  the sentence of ${of.name} ${v.word} ${way} (${lang}): ${slots.join(' ')} for ${want.join(' ')}`); }
          if (way !== '' && wordSaid(of.name, v.word, way) === way && phrase(`word.${way}`) === '' && phrase(`word.${of.name}.${v.word}.${way}`) === '') { fits = false; console.log(`  no word for ${of.name} ${v.word} ${way} (${lang})`); }
        }
      }
      setUiLang('en');
      if (fits) said++;
    }
  }
  check('every kind of condition and of action starts whole, as an object the game accepts', kinds > 10 && made === kinds && plays(d.text()));
  check('every kind has its sentence in English and in French, with the parts the format says it reads', said === kinds && phrasesComplete());
  let events = 0;
  for (const lang of ['en', 'fr']) { setUiLang(lang); for (const e of EVENTS) if (phrase(`when.${e}`) !== '') events++; }
  setUiLang('en');
  check('every event of the format is said in both languages', events === EVENTS.length * 2);
  const action = (fieldAt(`${rule}.do`) as Field).of as Schema, bank = startOf(action, 'reset', names, among, d.data), lit = startOf((fieldAt(`${rule}.if`) as Field).of as Schema, 'lights', names, among, d.data);
  check('a new object speaks of what the table has: its first bank of drop targets, its first group of lights', bank.item.target === 'bank' && lit.item.target === 'lanes' && lit.item.is === 'on');
  const before: i32 = d.get(`${rule}.do`).length;
  check('an action becomes one of another kind in one step, and is taken away alone', d.put(`${rule}.do[0]`, startOf(action, 'say', names, among, d.data).item, null) && d.get(`${rule}.do[0].do`) === 'say' && d.get(`${rule}.do[0].target`) === 'WELL DONE'
    && d.undoLabel === 'Edit action 1' && d.remove(`${rule}.do[0]`, true) && d.get(`${rule}.do`).length === before - 1 && plays(d.text()));
  const e = new Doc(newTableText('New table'), ''), bare = e.add('rules.when', blankOf('rule'));
  const none = startOf(action, 'sound', (space: string): string[] => e.namesOf(space), (list: string): string[] => e.namesAmong(list), e.data);
  const count = startOf(action, 'count', (space: string): string[] => e.namesOf(space), (list: string): string[] => e.namesAmong(list), e.data);
  check('on a table that lacks what a kind speaks of, the kind says so; a counter comes with the first thing that counts', none.item === null && none.lacks === 'sounds'
    && e.add(`${bare}.do`, count.item, 'Add', count.also) !== '' && JSON.stringify(e.get('rules.counters')) === '["counter1"]' && e.remove(`${bare}.do[1]`, true) && !e.remove(`${bare}.do[0]`, true)
    && e.refused === 'rules.when[0].do: a rule that does nothing' && plays(e.text()));
  const all = (fd: Field, at: string): boolean => false;
  check('a part of an item of a list is found from the thing that holds the list', found(schemaAt(rule), rule, 'do[1].target', fieldName, all, d.data).join(' ') === `${rule}.do[1].target`
    && found(schemaAt(rule), rule, 'do', fieldName, all, d.data).join(' ') === `${rule}.do` && found(schemaAt(rule), rule, 'do[1].target', fieldName, all).length === 0);
  // the rules of the table as the editor says them, in both languages (tests/t1/pinball3d_editor_rules.sh reads some of these lines)
  const f = new Doc(sample, sample), ruleSchema = schemaAt('rules.when[0]');
  for (const lang of ['en', 'fr']) {
    setUiLang(lang);
    const n: i32 = f.get('rules.when').length;
    for (let i = 0; i < n; i++) console.log(`${lang} rule ${i + 1}: ${ruleSaid(ruleSchema, f.get(`rules.when[${i}]`))}`);
  }
  setUiLang('en');
}

// ---- missions as sentences: a step is an event chosen among the events, and a thing among those that send it
{
  const d = new Doc(sample, sample), mission = d.add('rules.missions', blankOf('mission'));
  const step = (fieldAt(`${mission}.steps`) as Field).of as Schema, vs = step.variants as Variants;
  const names = (space: string): string[] => d.namesOf(space), among = (list: string): string[] => d.namesAmong(list);
  let fits = vs.all.length > 20 && vs.loose && vs.of('launch') === null;
  for (const lang of ['en', 'fr']) {
    setUiLang(lang);
    for (const v of vs.all) {
      const slots = pieces(sentenceOf('step', v, '')).filter((x: Piece) => x.slot !== '').map((x: Piece) => x.slot).join(' ');
      if (slots !== (v.names === '' ? 'count' : 'target count') || kindSaid('step', v.word).length < 4) { fits = false; console.log(`  the sentence of the step ${v.word} (${lang}): ${slots}`); }
    }
  }
  setUiLang('en');
  check('every event a step can wait for has its sentence in both languages, with the thing and how many times', fits && phrasesComplete() && extrasOf(step).join(' ') === 'text light'
    && kindSaid('step', 'hit') === 'Hit …' && kindSaid('step', 'drain') === 'Lose a ball' && kindSaid('action', 'score') === 'Add points');
  const hit = startOf(step, 'hit', names, among, d.data), down = startOf(step, 'down', names, among, d.data), caught = startOf(step, 'capture', names, among, d.data), lost = startOf(step, 'drain', names, among, d.data);
  check('a new step waits for the first thing that sends its event: a group before a single thing, the game for its own events', hit.item.on === 'pops' && hit.item.count === 1 && down.item.on === 'bank' && caught.item.on === 'dock' && lost.item.on === 'game'
    && d.namesAmong('bumpers|targets').join(' ') === 'pops bank stand pop1 pop2 pop3 drop1 drop2 drop3 stand1 stand2' && d.namesAmong('kickers').join(' ') === 'dock');
  // the text the panel shows is the editor's until someone types another: it follows the parts
  const one: any = hit.item;
  word(step, one);
  const first = `${one.text}`;
  one.count = 3; const stale = worded(step, one); word(step, one);
  const many = `${one.text}`;
  one.text = 'Clear the rocks';
  setUiLang('fr');
  const french = said(step, one);
  setUiLang('en');
  check('the text of a step is written from its sentence, and is the editor\'s until someone types another', first === 'Hit pops' && !stale && many === 'Hit pops 3 times' && worded(step, JSON.parse('{ "text": "Start a game", "on": "game", "event": "start" }'))
    && !worded(step, one) && french === 'Toucher pops 3 fois' && said(step, lost.item) === 'Lose a ball' && d.add(`${mission}.steps`, one) !== '' && plays(d.text()));
  setUiLang('fr');
  const cargo = ruleSaid(schemaAt('rules.missions[0]'), d.get('rules.missions[0]'));
  setUiLang('en');
  check('a mission is said by its name and its steps', ruleSaid(schemaAt('rules.missions[2]'), d.get('rules.missions[2]')) === 'Night Berth: Roll over lanes 3 times; Shoot into dock'
    && cargo === 'Cargo Run : Parcourir rail jusqu’au bout 2 fois' && ruleSaid(schemaAt('rules.when[1]'), d.get('rules.when[1]')) === 'When the ball hits slings: add 110 points');
}

// ---- a deletion says what it would take with it before anything is deleted
{
  const d = new Doc(sample, sample), dock = d.find('kickers', 'dock'), before = d.text();
  const tried = d.wouldRemove(dock), went = d.went.join(' '), told: string[] = [];
  for (let i = 0; i < d.went.length; i++) told.push(ruleSaid(schemaAt(d.went[i]), d.lost[i]));
  check('a deletion is tried first: what would go with it is known, and the table is as it was', tried && d.text() === before && !d.canUndo && !d.dirty
    && went === 'rules.missions[2] rules.when[18] rules.when[17] rules.when[16]' && told[0] === 'Night Berth: Roll over lanes 3 times; Shoot into dock'
    && told[2] === 'When dock catches the ball, if the game is in normal play: add 3,000 points; award a ball lock'
    && d.wouldRemove(d.find('lights', 'laneLight1')) && d.went.join(' ') === 'rollovers[0].light' && d.lost[0] === 'laneLight1' && !d.wouldRemove('plunger')
    && d.remove(dock) && d.went.join(' ') === went && d.lost.length === 4 && plays(d.text()));
}

// ---- the scores grid: a cell reads and writes the first rule that scores there without a condition
{
  const d = new Doc(sample, sample), rows = scoreRows(d.data), names = rows.map((r: ScoreRow) => r.name);
  const bank = rows[names.indexOf('bank')];
  check('the scores grid has a row per group, then per element, that sends events, with the events it sends', names.indexOf('pops') >= 0 && names.indexOf('pops') < names.indexOf('pop1')
    && names.indexOf('laneLight1') < 0 && bank.group && bank.list === 'targets' && bank.sends.join(' ') === 'hit down' && scoreEvents().join(' ') === 'hit down roll spin capture eject enter exit pass flip');
  const n: i32 = d.get('rules.when').length;
  check('a cell reads the rule that scores whatever else holds', scoreOf(d.data, 'pops', 'hit') === 500 && scoreOf(d.data, 'lanes', 'roll') === 300 && scoreOf(d.data, 'dock', 'capture') === 0 && scoreOf(d.data, 'left', 'flip') === 0);
  check('a number typed in a cell changes the points of that rule, and no other', d.edit('Change pops.hit', scoreChange('pops', 'hit', 750)) && d.get('rules.when[0].do[0].value') === 750
    && d.edit('Change lanes.roll', scoreChange('lanes', 'roll', 350)) && d.get('rules.when[3].do[0].value') === 350 && d.get('rules.when[2].do[1].value') === 1000 && d.get('rules.when').length === n);
  check('a cell without a rule gets one, or a scoring action more in the rule that listens there', d.edit('Change laneGate.pass', scoreChange('laneGate', 'pass', 150)) && d.get('rules.when').length === n + 1
    && d.summaryOf(`rules.when[${n}]`) === 'laneGate pass [score 150]' && d.edit('Change left.flip', scoreChange('left', 'flip', 25)) && d.summaryOf('rules.when[5]') === 'left flip [score 25, rotate lanes -1]'
    && scoreOf(d.data, 'left', 'flip') === 25);
  check('an emptied cell loses its scoring action, and its rule when the rule did nothing else', d.edit('Change stand.hit', scoreChange('stand', 'hit', 0)) && d.summaryOf('rules.when[9]') === 'stand hit [bonus 200]'
    && d.edit('Change slings.hit', scoreChange('slings', 'hit', 0)) && d.get('rules.when').length === n && scoreOf(d.data, 'slings', 'hit') === 0 && d.get('rules.when[1].on') === 'lanes'
    && !d.edit('Change slings.hit', scoreChange('slings', 'hit', 0)) && plays(d.text()));
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
