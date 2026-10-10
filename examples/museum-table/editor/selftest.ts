// The editor's document without a window: one line per property, `FAILED:` and exit code 1 when one does not hold.
//   zinc run examples/museum-table/editor/selftest.ts -- examples/museum-table/assets/project.json
import { args, env, exit } from 'zinc:sys';
import { readText } from 'zinc:fs';
import { parseProject, serializeProject } from '../src/project';
import { Doc, newProject, slug } from './doc';

let failed = false;
function check(what: string, ok: boolean): void {
  console.log(`${ok ? 'ok' : 'FAILED'}: ${what}`);
  if (!ok) failed = true;
}
/** Whether the player accepts `text` and would write the same bytes. */
function plays(text: string): boolean {
  try { return serializeProject(parseProject(text)) === text; } catch (e) { console.log(`  refused: ${e.message}`); return false; }
}

check('titles become ids', slug('Le vase à décor') === 'le-vase-a-decor' && slug('Œuvres d’Édo !') === 'oeuvres-d-edo' && slug('  ') === '');

// zinc starts a project's program in the project's directory: a relative path is taken from where the command was typed
const given = args()[0];
const sample = readText(given.startsWith('/') || env('PWD').length === 0 ? given : `${env('PWD')}/${given}`);
check('the sample project is in canonical form', serializeProject(parseProject(sample)) === sample);

// ---- typing a title: one step, and the id the editor gave follows the title
{
  const d = new Doc(newProject(), '');
  let id = d.addSequence(100, 100);
  for (const t of ['A', 'Ac', 'Acc', 'Accu', 'Accue', 'Accuei', 'Accueil']) id = d.renameSequence(id, 'fr', t);
  const named = id === 'accueil' && d.project.start === 'accueil';
  check('typing a title is one step and the id follows it', named && d.renameSequence(id, 'fr', '') === 'accueil' && d.titleOf(id, 'fr') === 'Accueil'
    && d.undo() === 'Rename sequence' && d.project.sequences[0].id === 'sequence-1' && d.undo() === 'New sequence' && !d.canUndo);
}

// ---- deleting a sequence takes what named it; unsaved follows the bytes, not the history
{
  const d = new Doc(newProject(), '');
  const a = d.addSequence(0, 0), b = d.addSequence(300, 0), c = d.addSequence(600, 0);
  check('a new project is not unsaved, a sequence makes it so', !new Doc(newProject(), '').dirty && d.dirty);
  d.addLink(a, b); d.addLink(c, b); d.addLink(b, a); d.addLink(a, c);
  d.setStart(b);
  d.markSaved();
  const before = d.text();
  const links = d.linksTo(b);
  d.deleteSequence(b, '');
  const left = d.project.sequences[0].links.length + d.project.sequences[1].links.length;
  check('deleting a sequence removes the 2 links that led to it and moves the start', links === 2 && left === 1 && d.project.start === a && d.project.sequences.length === 2 && plays(d.text()) && d.dirty);
  d.undo();
  check('undo gives the saved bytes back and the project is no longer unsaved', d.text() === before && !d.dirty);
  // the same deletion with the links led to another sequence: c's link to b now leads to a, a's own link to b goes (no link to oneself)
  d.deleteSequence(b, a);
  const ca = d.project.sequences[1].links, aa = d.project.sequences[0].links;
  check('or leads them to another sequence, which becomes the start', ca.length === 1 && ca[0].to === a && aa.length === 1 && aa[0].to === c && d.project.start === a && plays(d.text()));
  d.undo();
  check('a link to the sequence itself is not made', d.addLink(a, a) === -1 && !d.dirty);
  check('one sequence and one link are shown as the file has them', d.jsonOf(a, -1).startsWith('{\n  "id": "sequence-1",\n  "title": {') && d.jsonOf(a, -1).endsWith('\n}')
    && d.jsonOf(a, 1).startsWith('{\n  "to": "sequence-3",') && d.jsonOf(a, 1).endsWith('"y": 1030\n}') && d.jsonOf(a, 2) === '' && d.jsonOf('nowhere', -1) === '');
  const lost = d.addSequence(900, 0);
  const said = d.problems().filter(p => p.level === 'warning' && p.sequence === lost && p.message.startsWith('No link leads to')).length;
  check('a sequence no link leads to is a warning that names it', said === 1 && d.problems().filter(p => p.level === 'error').length === 0);
  // five buttons of one sequence: five places, all within reach of an edge
  for (let k = 0; k < 4; k++) d.addLink(a, lost);
  const places = new Set<string>();
  for (const l of d.project.sequences[0].links) places.add(`${l.x},${l.y}`);
  check('the buttons of a sequence get places of their own that the player accepts', places.size === d.project.sequences[0].links.length && plays(d.text()));
}

// ---- 50 mixed operations from an empty project: undo and redo give back every file, byte for byte
{
  const d = new Doc(newProject(), '');
  const texts: string[] = [d.text()], kinds = new Map<string, i32>();
  let seed = 7;
  const pick = (n: i32): i32 => { seed = (seed * 75 + 74) % 65537; return seed % n; };
  for (let tries = 0; texts.length < 51 && tries < 2000; tries++) {
    const seqs = d.project.sequences, n: i32 = seqs.length, step: i32 = texts.length;
    const any = n > 0 ? seqs[pick(n)].id : '', other = n > 0 ? seqs[pick(n)].id : '';
    const from = n > 0 ? seqs[pick(n)] : null, li: i32 = from !== null && from.links.length > 0 ? pick(from.links.length) : -1;
    const op = n < 3 ? 0 : (tries * 5) % 12;   // every kind of operation in turn, on sequences and links picked at random
    if (op === 0) d.addSequence(pick(40) * 20, pick(20) * 20);
    else if (op === 1) d.renameSequence(any, 'fr', `Salle ${step}`);
    else if (op === 2) d.renameSequence(any, 'en', pick(4) === 0 ? '' : `Room ${step}`);
    else if (op === 3) d.moveSequence(any, pick(40) * 20, pick(20) * 20);
    else if (op === 4 && n < 8) d.duplicateSequence(any);
    else if (op === 5 || op === 6) d.addLink(any, other);
    else if (op === 7 && from !== null) d.setLinkLabel(from.id, li, pick(2) === 0 ? 'fr' : 'en', `Vers ${step}`);
    else if (op === 8 && from !== null) d.setLinkTransition(from.id, li, ['fade', 'slide', 'none'][pick(3)]);
    else if (op === 9 && from !== null) d.setLinkOverlay(from.id, li, pick(2) === 0);
    else if (op === 10 && from !== null) d.deleteLink(from.id, li);
    else if (op === 11) { if (n > 4 && pick(2) === 0) d.deleteSequence(any, pick(2) === 0 ? other : ''); else d.setStart(any); }
    d.seal();
    if (d.text() === texts[texts.length - 1]) continue;
    texts.push(d.text());
    kinds.set(d.undoLabel, (kinds.get(d.undoLabel) ?? 0) + 1);
  }
  const mix: string[] = [];
  for (const k of kinds.keys()) mix.push(`${kinds.get(k) ?? 0} ${k}`);
  console.log(`50 operations: ${mix.join(', ')}`);
  let accepted = texts.length === 51;
  for (let k = 1; k < texts.length; k++) if (!plays(texts[k])) accepted = false;
  check('every state on the way is a file the player accepts, in canonical form', accepted);
  let back = true;
  for (let k = 49; k >= 0; k--) { d.undo(); if (d.text() !== texts[k]) back = false; }
  check('50 undos give back every earlier file, byte for byte', back && !d.canUndo);
  let forth = true;
  for (let k = 1; k <= 50; k++) { d.redo(); if (d.text() !== texts[k]) forth = false; }
  check('50 redos give back every later file, byte for byte', forth && !d.canRedo);
  d.undo(); d.undo();
  d.addSequence(0, 0);
  check('an edit after an undo drops what was undone', !d.canRedo && d.canUndo);
}
if (failed) exit(1);
