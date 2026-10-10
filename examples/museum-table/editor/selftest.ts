// The editor's document without a window: one line per property, `FAILED:` and exit code 1 when one does not hold.
//   zinc run examples/museum-table/editor/selftest.ts -- examples/museum-table/assets/project.json
import { args, launchDir, exit } from 'zinc:sys';
import { readText } from 'zinc:fs';
import { parseProject, serializeProject } from '../src/project';
import { Doc, newProject, slug } from './doc';
import { complete, f, t, setUiLang, step, P_NO_TITLE, languageName } from './strings';

let failed = false;
function check(what: string, ok: boolean): void {
  console.log(`${ok ? 'ok' : 'FAILED'}: ${what}`);
  if (!ok) failed = true;
}
/** Whether the player accepts `text` and would write the same bytes. */
function plays(text: string): boolean {
  try { return serializeProject(parseProject(text)) === text; } catch (e) { console.log(`  refused: ${e.message}`); return false; }
}

setUiLang('en');
const english = f(P_NO_TITLE, 'Accueil', languageName('en')) + ' / ' + step('New link');
setUiLang('fr');
check('every text of the interface exists in English and in French', complete() && english === '"Accueil" has no title in English. / New link'
  && f(P_NO_TITLE, 'Accueil', languageName('en')) + ' / ' + step('New link') === '« Accueil » n’a pas de titre en English. / Nouveau lien' && t(P_NO_TITLE).length > 0);
check('titles become ids', slug('Le vase à décor') === 'le-vase-a-decor' && slug('Œuvres d’Édo !') === 'oeuvres-d-edo' && slug('  ') === '');

// zinc starts a project's program in the project's directory: a relative path is taken from where the command was typed
const given = args()[0];
const sample = readText(given.startsWith('/') ? given : `${launchDir()}/${given}`);
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
  const said = d.problems().filter(p => p.level === 'warning' && p.sequence === lost && p.kind === 'unreachable').length;
  check('a sequence no link leads to is a warning that names it', said === 1 && d.problems().filter(p => p.level === 'error').length === 0);
  // five buttons of one sequence: five places, all within reach of an edge
  for (let k = 0; k < 4; k++) d.addLink(a, lost);
  const places = new Set<string>();
  for (const l of d.project.sequences[0].links) places.add(`${l.x},${l.y}`);
  check('the buttons of a sequence get places of their own that the player accepts', places.size === d.project.sequences[0].links.length && plays(d.text()));
}

// ---- the media library and what lies on the table of a sequence
{
  const d = new Doc(newProject(), '');
  const a = d.addSequence(0, 0), b = d.addSequence(300, 0);
  const wave = d.addMedia('photo', 'photos/great-wave.jpg', 'La Grande Vague', 'https://www.metmuseum.org/art/collection/search/45434', 'CC0 1.0');
  const words = d.addText('Cartel', 'Hokusai, vers 1831');
  check('a file enters the library with its title, source and licence; a text with its words', wave === 'la-grande-vague' && words === 'cartel'
    && d.addMedia('photo', 'photos/x.jpg', 'Sans licence', 'https://example.org', '') === '' && d.addText('', 'x') === '' && d.project.media.length === 2 && plays(d.text()));
  const at = d.addItem(a, wave, 600, 400);
  d.addItem(a, words, 1500, 800);
  d.moveItem(a, at, 480.4, 340.6); d.resizeItem(a, at, 520, 0); d.setItemTimes(a, 1, 2, 2.2); d.rotateItem(a, at, -4);
  const placed = d.project.sequences[0].items;
  check('media are placed, moved, sized and timed on the table', placed.length === 2 && placed[0].x === 480 && placed[0].y === 341 && placed[0].width === 520 && placed[0].rotation === -4
    && placed[1].width === 420 && placed[1].at === 2 && placed[1].until === 2.5 && d.raiseItem(a, 0, 1) === 1 && placed[1].media === wave && plays(d.text()));
  // a hotspot on the photograph, and a button dragged to the middle of the table, where no seated visitor reaches it
  const spot = d.addHotspot(a, wave, b), button = d.addLink(a, b);
  d.moveLink(a, spot, 1.4, 0.257); d.moveLink(a, button, 960, 545);
  const ls = d.project.sequences[0].links;
  check('a hotspot stays on its item, a button within reach of an edge of the table', spot === 0 && ls[0].on === wave && ls[0].x === 1 && ls[0].y === 0.26
    && ls[1].x === 960 && ls[1].y === 560 && d.addHotspot(b, wave, a) === -1 && plays(d.text()));
  d.setLinkTimes(a, button, 3, 0); d.setLinkTarget(a, spot, a);
  check('a link is timed, and never leads to its own sequence', ls[1].at === 3 && ls[0].to === b && plays(d.text()));
  // the title of the photograph typed again: its id follows, and so does everything that names it
  const id = d.setMediaText(wave, 'title', 'fr', 'Sous la vague');
  d.setMediaText(id, 'title', 'en', 'Under the Wave'); d.setMediaText(id, 'description', 'fr', 'Estampe.'); d.setMediaCredit(id, 'creator', 'Katsushika Hokusai');
  d.setMediaCredit(id, 'licence', ''); d.setMediaText(id, 'title', 'fr', '');
  const m = d.project.media[0];
  check('the texts and the credit of a medium, in every language; what is required cannot be emptied', id === 'sous-la-vague' && placed[1].media === id && ls[0].on === id
    && m.title.get('en') === 'Under the Wave' && m.title.get('fr') === 'Sous la vague' && m.creator === 'Katsushika Hokusai' && m.credit.licence === 'CC0 1.0' && plays(d.text()));
  const before = d.text(), uses = d.mediaUses(id);
  d.removeMedia(id);
  check('removing a medium takes its item and its hotspot; undo brings them back', uses === 1 && d.project.media.length === 1 && placed.length === 2
    && d.project.sequences[0].items.length === 1 && d.project.sequences[0].links.length === 1 && plays(d.text()) && d.undo() === 'Remove media' && d.text() === before);
  d.removeItem(a, 1);
  check('taking an item off the table takes the hotspots on it', d.project.sequences[0].items.length === 1 && d.project.sequences[0].links.length === 1 && plays(d.text()));
  d.setSequenceText(a, 'fr', 'Edo, 1831.'); d.setSequenceDuration(a, 12.34);
  check('a sequence has an introduction and a duration', d.project.sequences[0].text.get('fr') === 'Edo, 1831.' && d.project.sequences[0].duration === 12.3 && plays(d.text()));
}

// ---- points of interest on a model and in a panorama, and how each is first seen
{
  const d = new Doc(newProject(), '');
  const a = d.addSequence(0, 0), b = d.addSequence(300, 0);
  const vase = d.addMedia('model', 'models/vase.obj', 'Vase', 'https://example.org/vase', 'CC0 1.0', 'models/vase.jpg');
  const garden = d.addMedia('panorama', 'panoramas/garden.jpg', 'Jardin', 'https://example.org/garden', 'CC0 1.0', 'ignored.jpg');
  d.addItem(a, vase, 600, 500); d.addItem(a, garden, 1300, 500);
  const first = d.addPoint(vase, [0.086049, 0.05, -0.000004], 89.6, 4.4, 1.604);
  const q = d.project.media[0].points[0];
  check('a point is put on a model, with the view it was placed from', first === 'point-1' && q.at[0] === 0.08605 && q.at[1] === 0.05 && q.at[2] === 0 && q.title.get('en') === 'Point 1'
    && q.view.yaw === 90 && q.view.pitch === 4 && q.view.distance === 1.6 && d.project.media[0].texture === 'models/vase.jpg' && d.project.media[1].texture === ''
    && d.addPoint('nothing', [0, 0, 1], 0, 0, 3) === '' && plays(d.text()));
  const named = d.setPointText(vase, first, 'title', 'fr', 'Le bleu de cobalt');
  d.setPointText(vase, named, 'title', 'en', 'Cobalt blue'); d.setPointText(vase, named, 'text', 'fr', 'Peint à l’oxyde de cobalt.'); d.setPointText(vase, named, 'title', 'fr', '');
  d.setPointView(vase, named, 200.2, -6.4, 1.899); d.setPointTarget(vase, named, b); d.setPointTarget(vase, named, 'nowhere');
  d.movePoint(vase, named, [-0.0246, -0.085, -0.0677]);
  check('it is named and described in every language, moved, given a view and a sequence to lead to', named === 'le-bleu-de-cobalt' && q.id === named && q.title.get('fr') === 'Le bleu de cobalt'
    && q.title.get('en') === 'Cobalt blue' && q.text.get('fr') === 'Peint à l’oxyde de cobalt.' && q.view.yaw === 200 && q.view.pitch === -6 && q.view.distance === 1.9 && q.to === b
    && q.at[0] === -0.0246 && q.at[2] === -0.0677 && d.problems().filter(p => p.kind === 'unreachable').length === 0 && plays(d.text()));
  const second = d.addPoint(garden, [0.70714, 0.1, -0.7], 44.6, 6.2, 60.4);
  d.setMediaView(garden, 10.4, 2, 79.6); d.setMediaView(vase, 20.4, 8, 3.204); d.setMediaLight(vase, 'raking'); d.setMediaLight(vase, 'neon'); d.setMediaLight(garden, 'flat');
  const g = d.project.media[1];
  check('a point in a panorama is a direction; a view and a lighting are kept as the file writes them', second === 'point-1' && g.points[0].at[0] === 0.7071 && g.points[0].view.fov === 60
    && g.points[0].view.yaw === 45 && g.view.yaw === 10 && g.view.fov === 80 && d.project.media[0].view.distance === 3.2 && d.project.media[0].light === 'raking' && g.light === 'studio'
    && plays(d.text()));
  // the sequence the point leads to is renamed, then deleted: the point follows, then keeps its text and loses its button
  const jardin = d.renameSequence(b, 'fr', 'Jardin');
  const followed = q.to === 'jardin' && jardin === 'jardin';
  d.deleteSequence(jardin, '');
  check('a point follows the sequence it leads to, and leads nowhere once it is deleted', followed && d.project.media[0].points[0].to === '' && plays(d.text()));
  const before = d.text();
  d.deletePoint(vase, named);
  check('a point is deleted, and undo brings it back; a medium is shown as the file has it', d.project.media[0].points.length === 0 && plays(d.text()) && d.undo() === 'Delete point of interest'
    && d.text() === before && d.mediaJsonOf(vase).startsWith('{\n  "id": "vase",\n  "kind": "model",') && d.mediaJsonOf(vase).indexOf('\n  "points": [\n    {\n      "id": "le-bleu-de-cobalt",') > 0
    && d.mediaJsonOf('nothing') === '');
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
    const media = d.project.media, mid = media.length > 0 ? media[pick(media.length)].id : '';
    const ii: i32 = from !== null && from.items.length > 0 ? pick(from.items.length) : -1;
    const op = n < 3 ? 0 : (tries * 7) % 29;   // every kind of operation in turn, on sequences, links, media, items and points picked at random
    const objects = media.filter(m => m.kind === 'model' || m.kind === 'panorama'), object = objects.length > 0 ? objects[pick(objects.length)] : null;
    const point = object !== null && object.points.length > 0 ? object.points[pick(object.points.length)].id : '';
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
    else if (op === 12) {
      const kind = ['photo', 'video', 'audio', 'model', 'panorama'][pick(5)];
      d.addMedia(kind, `files/m${step}.${kind === 'model' ? 'obj' : 'bin'}`, `Image ${step}`, 'https://example.org/source', 'CC0 1.0');
    }
    else if (op === 13) d.addText(`Texte ${step}`, `Mots ${step}`);
    else if (op === 14 || op === 15) d.addItem(any, mid, 100 + pick(1700), 100 + pick(800));
    else if (op === 16 && from !== null) d.moveItem(from.id, ii, pick(1920), pick(1080));
    else if (op === 17 && from !== null) d.resizeItem(from.id, ii, 200 + pick(600), pick(2) * 300);
    else if (op === 18 && from !== null) d.setItemTimes(from.id, ii, pick(10), pick(2) * (5 + pick(20)));
    else if (op === 19 && from !== null && ii >= 0) d.addHotspot(from.id, from.items[ii].media, other);
    else if (op === 20 && from !== null) d.moveLink(from.id, li, pick(1920), pick(1080));
    else if (op === 21) d.setMediaText(mid, pick(2) === 0 ? 'title' : 'description', pick(2) === 0 ? 'fr' : 'en', `Mots ${step}`);
    else if (op === 22 && from !== null) { if (pick(2) === 0) d.removeItem(from.id, ii); else d.raiseItem(from.id, ii, 1); }
    else if (op === 23 && media.length > 3) d.removeMedia(mid);
    else if (op === 24 && object !== null) d.addPoint(object.id, [pick(200) / 100 - 1, pick(200) / 100 - 1, pick(200) / 100 - 0.995], pick(360), pick(60) - 30, 2 + pick(3));
    else if (op === 25 && object !== null) d.setPointText(object.id, point, pick(2) === 0 ? 'title' : 'text', pick(2) === 0 ? 'fr' : 'en', `Point ${step}`);
    else if (op === 26 && object !== null) { if (pick(2) === 0) d.setPointView(object.id, point, pick(360), pick(60) - 30, 2 + pick(3)); else d.setPointTarget(object.id, point, pick(3) === 0 ? '' : other); }
    else if (op === 27 && object !== null) d.movePoint(object.id, point, [pick(200) / 100 - 1, pick(200) / 100 - 1, pick(200) / 100 - 0.995]);
    else if (op === 28 && object !== null) { if (pick(3) === 0) d.deletePoint(object.id, point); else d.setMediaView(object.id, pick(360), pick(40) - 20, 3 + pick(60)); }
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
