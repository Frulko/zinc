// Museum table: the player. Everything it shows comes from assets/project.json (docs/museum-table-format.md): the cards of the current
// sequence on the light table, the buttons to the other sequences, the texts in the visitor's language.
//   zinc run examples/museum-table [-- --sequence <id>] [--lang <code>] [--log] [--stress <cards>] [--pins] [--time]
// --log prints the pose of every card that moved and the view and points of the 3D object, one line per change (the tests read it);
// --stress lays out that many cards, keeps them moving and prints the frame time; --time prints the time the 3D object takes to draw;
// --pins puts a red ball on every point of interest of the object (the test of their projection).
import { onFrame, width, height, clear, rect, rrect, border, drawImage, drawText, textWidth, imageWidth, imageHeight, wheel, pinch, pointerX, pointerY, modifiers, Mod } from 'zinc:gfx';
import { readText } from 'zinc:assets';
import { args, clock } from 'zinc:sys';
import { parseProject, Sequence, Item, Link, Colours } from './project';
import { Fingers, Finger } from './touch';
import { LightTable, Card } from './table';
import { ObjectView } from './viewer';
import { sans, bold, wrap, leading } from './type';
import { word } from './words';

/** Owner numbers of the fingers that are not on a card: the full view, a button. */
const OVERLAY: i32 = 1, BUTTON: i32 = 2, NOTHING: i32 = -1;

const project = parseProject(readText('project.json'));
let lang = project.languages[0];
let logging = false, stress: i32 = 0, pins = false, timing = false;
let sequence = project.sequence(project.start) ?? project.sequences[0];
{
  const a = args();
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--log') logging = true;
    else if (a[i] === '--pins') pins = true;
    else if (a[i] === '--time') timing = true;
    else if (a[i] === '--lang' && i + 1 < a.length) { const l = a[++i]; if (project.languages.indexOf(l) >= 0) lang = l; }
    else if (a[i] === '--sequence' && i + 1 < a.length) sequence = project.sequence(a[++i]) ?? sequence;
    else if (a[i] === '--stress' && i + 1 < a.length) stress = parseInt(a[++i], 10);
  }
}
const colours: Colours = project.theme;
const T = project.table;
const fingers = new Fingers();
const table = new LightTable(project, colours, lang);
/** The 3D object of the sequence, when it shows one. */
let viewer: ObjectView | null = null;

/** A button of the player, in table units: its box and what a touch does (`to`: a sequence, or '' for the language). */
class Button {
  x = 0; y = 0; w = 0; h = 56;
  label = '';
  to = '';
  /** The finger pressing it (0: none). */
  finger: i32 = 0;
  /** A box at least 150 by 76 units takes the touch (75 mm on a 43-inch table), whatever is drawn. */
  takes(px: number, py: number): boolean { return Math.abs(px - this.x) <= Math.max(this.w, 150) / 2 && Math.abs(py - this.y) <= Math.max(this.h, 76) / 2; }
}
let buttons: Button[] = [];
let opened = false;   // a sequence is laid out on the first frame: images exist once the frame loop runs

function layOut(): void {
  if (stress > 0) {   // the measure: the photographs again and again, until there are enough cards
    const many = new Sequence(), photos = project.media.filter((m) => m.kind === 'photo');
    many.id = 'stress'; many.title = sequence.title;
    for (let i: i32 = 0; i < stress && photos.length > 0; i++) {
      const it = new Item();
      it.media = photos[i % photos.length].id; it.width = 300;
      it.x = 200 + (i % 6) * 300; it.y = 180 + Math.floor(i / 6) * 180;
      many.items.push(it);
    }
    sequence = many;
  }
  table.open(sequence);
  viewer = null;
  for (const item of sequence.items) {
    const m = project.medium(item.media);
    // ponytail: OBJ models only, and one per sequence; a .glb or .gltf waits for zinc:3d to load it (ZN-658)
    if (m === null || m.kind !== 'model' || !m.file.toLowerCase().endsWith('.obj') || viewer !== null) continue;
    const v = new ObjectView(project, m, colours, lang, pins);
    v.x = item.x; v.y = item.y; v.w = item.width; v.h = item.height > 0 ? item.height : item.width;
    viewer = v;
  }
  buttons = [];
  for (const l of sequence.links) {
    if (l.on.length > 0) continue;   // ponytail: hotspots on an item, overlays and transitions come with the sequences task (ZN-650.05)
    const b = new Button();
    b.x = l.x; b.y = l.y; b.to = l.to;
    buttons.push(b);
  }
  if (project.languages.length > 1) {
    const b = new Button();
    b.w = 44 + 46 * project.languages.length; b.x = T.width - 48 - b.w / 2; b.y = 62;
    buttons.push(b);
  }
  label();
}
/** The words on the buttons, in the current language. */
function label(): void {
  let i: i32 = 0;
  for (const l of sequence.links) {
    if (l.on.length > 0) continue;
    const b = buttons[i++];
    b.label = project.say(l.label, lang);
    b.w = textWidth(sans(20), b.label, 0) + 64;
  }
}

let now = 0, frame: i32 = 0;
const said = new Map<i32, string>();   // the last line logged under each key
let spent = 0, elapsed = 0, counted: i32 = 0;

onFrame((dt: number) => {
  const started = clock();
  if (!opened) { opened = true; layOut(); }
  const W = width(), H = height(), k = Math.min(W / T.width, H / T.height), ox = (W - T.width * k) / 2, oy = (H - T.height * k) / 2;
  now += dt;
  fingers.update(dt, ox, oy, k);

  // who takes the fingers that landed: the full view when it is open, else a button, else the card under them
  for (const f of fingers.down) {
    if (!f.fresh) continue;
    if (table.opened !== null) { f.owner = OVERLAY; continue; }
    for (const b of buttons) if (b.finger === 0 && b.takes(f.x, f.y)) { f.owner = BUTTON; b.finger = f.id; break; }
  }
  const viewing: Card | null = table.opened;
  table.update(dt, fingers, now);
  const object: ObjectView | null = viewer;
  if (object !== null) object.update(dt, fingers);   // after the cards: one lying over the object takes its fingers
  for (const f of fingers.down) if (f.fresh && f.owner === 0) f.owner = NOTHING;
  for (const f of fingers.lifted) {
    if (f.owner === OVERLAY && viewing !== null) table.opened = null;
    if (f.owner !== BUTTON) continue;
    for (const b of buttons) {
      if (b.finger !== f.id) continue;
      b.finger = 0;
      if (b.takes(f.x, f.y)) press(b);
      break;
    }
  }
  // a desk without a touch screen: the wheel and the trackpad zoom the card under the pointer, with Shift the wheel turns it
  const notches = wheel(), spread = pinch();
  if (notches !== 0 || spread !== 1) {
    const turning = (modifiers() & Mod.Shift) !== 0, px = (pointerX() - ox) / k, py = (pointerY() - oy) / k;
    if (object !== null && object.inside(px, py) && table.cardAt(px, py) === null) object.closer(Math.pow(1.1, notches) * spread);
    else table.nudge(px, py, turning ? 1 : Math.pow(1.1, notches) * spread, turning ? notches * 0.09 : 0);
  }
  if (stress > 0) stir(now);

  clear(colours.background);
  if (object !== null) object.draw(ox, oy, k);
  drawHeading(ox, oy, k);
  table.draw(ox, oy, k);
  drawButtons(ox, oy, k);
  if (table.opened !== null) drawFullView(table.opened, ox, oy, k);
  for (const f of fingers.down) border(ox + (f.x - 30) * k, oy + (f.y - 30) * k, 60 * k, 60 * k, 30 * k, Math.max(1, 2 * k), colours.accent, 150);   // where the table feels a finger

  if (logging) for (const c of table.cards) {
    const p = c.pose;
    say(c.uid, `${c.media.id} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} scale=${p.scale.toFixed(4)} angle=${(p.angle * 180 / Math.PI).toFixed(2)} fingers=${c.held} face=${c.turn.toFixed(2)}`);
  }
  if (object !== null) {
    if (logging) {
      say(-1, `view yaw=${object.yaw.toFixed(2)} pitch=${object.pitch.toFixed(2)} distance=${object.reach.toFixed(3)} pan=${object.panX.toFixed(4)},${object.panY.toFixed(4)} light=${object.light} open=${object.opened?.id ?? '-'}`);
      for (let i: i32 = 0; i < object.media.points.length; i++) {
        object.locate(object.media.points[i].at);
        say(-2 - i, `point ${object.media.points[i].id} at ${object.px.toFixed(1)} ${object.py.toFixed(1)} ${object.pfacing ? 'facing' : 'behind'}`);
      }
    }
    if (timing && object.drawn === 120) {
      console.log(`the object is drawn in ${(object.spent / object.drawn).toFixed(2)} ms (${Math.round(object.w * k)} x ${Math.round(object.h * k)} pixels)`);
      object.spent = 0; object.drawn = 0;
    }
  }
  frame++;
  if (stress > 0) {
    spent += clock() - started; elapsed += dt; counted++;
    if (counted === 120) {
      console.log(`${table.cards.length} cards moving: ${(spent / counted).toFixed(2)} ms of the program per frame, ${(counted / elapsed).toFixed(1)} frames per second`);
      spent = 0; elapsed = 0; counted = 0;
    }
  }
});

/** Logs a line when it differs from the last one said under `key`. */
function say(key: i32, line: string): void {
  if (said.get(key) === line) return;
  said.set(key, line);
  console.log(`${frame} ${line}`);
}

function press(b: Button): void {
  if (b.to.length === 0) {
    lang = project.languages[(project.languages.indexOf(lang) + 1) % project.languages.length];
    table.setLanguage(lang);
    viewer?.setLanguage(lang);
    label();
    return;
  }
  sequence = project.sequence(b.to) ?? sequence;
  layOut();
}

/** The measure: every card wanders, turns and breathes by itself, as if a hand held it. */
function stir(t: number): void {
  for (let i: i32 = 0; i < table.cards.length; i++) {
    const c = table.cards[i], p = c.pose;
    p.x = T.width / 2 + Math.sin(t * 0.7 + i) * (T.width / 2 - 200);
    p.y = T.height / 2 + Math.cos(t * 0.9 + i * 1.7) * (T.height / 2 - 160);
    p.angle = t * 0.5 + i;
    p.scale = 1 + 0.1 * Math.sin(t + i);
    c.held = 1;
  }
}

/** The title and introduction of the sequence, written on the table itself: the cards slide over them. */
function drawHeading(ox: number, oy: number, k: number): void {
  const head = bold(30 * k), intro = sans(17 * k), x = Math.round(ox + 48 * k);
  let y = Math.round(oy + 34 * k);
  drawText(head, x, y, project.say(sequence.title, lang), colours.text, 255, 0);
  y += leading(head) + 2 * k;
  for (const line of wrap(intro, project.say(sequence.text, lang), 1160 * k, 2)) { drawText(intro, x, y, line, colours.muted, 255, 0); y += leading(intro); }
}

/** The buttons: upright for the main side of the table, over everything. */
function drawButtons(ox: number, oy: number, k: number): void {
  const f = sans(20 * k);
  for (const b of buttons) {
    const x = ox + (b.x - b.w / 2) * k, top = oy + (b.y - b.h / 2) * k, w = b.w * k, h = b.h * k, held = b.finger !== 0;
    rrect(x, top, w, h, h / 2, held ? colours.accent : colours.background, held ? 255 : 235);
    border(x, top, w, h, h / 2, Math.max(1, 1.5 * k), colours.accent, 255);
    const ty = top + (h - leading(f)) / 2 + k;
    if (b.to.length > 0) { drawText(f, x + (w - textWidth(f, b.label, 0)) / 2, ty, b.label, held ? colours.background : colours.text, 255, 0); continue; }
    // the language button: every language, the current one bright
    let tx = x + 26 * k;
    for (const code of project.languages) {
      drawText(f, tx, ty, code.toUpperCase(), code === lang ? (held ? colours.background : colours.accent) : colours.muted, 255, 0);
      tx += 46 * k;
    }
  }
}

/** The full view a double tap opens: the picture as large as the table allows, and its notice beside it. Any touch closes it. */
function drawFullView(c: Card, ox: number, oy: number, k: number): void {
  const m = c.media;
  rrect(0, 0, width(), height(), 0, colours.background, 236);   // the table dims behind
  const boxW = 1040 * k, boxH = 900 * k, iw = imageWidth(c.picture), ih = imageHeight(c.picture), fit = Math.min(boxW / iw, boxH / ih);
  const w = iw * fit, h = ih * fit, x = ox + 70 * k + (boxW - w) / 2, y = oy + 90 * k + (boxH - h) / 2;
  rrect(x - 10 * k, y - 10 * k, w + 20 * k, h + 20 * k, 3 * k, colours.paper, 255);
  drawImage(c.picture, x, y, w, h, 255, 0);

  const tx = ox + 1180 * k, tw = 670 * k, head = bold(36 * k), who = sans(22 * k), small = sans(16 * k), body = sans(20 * k);
  let ty = oy + 110 * k;
  for (const line of wrap(head, project.say(m.title, lang), tw, 4)) { drawText(head, tx, ty, line, colours.text, 255, 0); ty += leading(head); }
  ty += 10 * k;
  if (m.creator.length > 0) { drawText(who, tx, ty, m.creator, colours.text, 255, 0); ty += leading(who); }
  const facts = [project.say(m.date, lang), project.say(m.medium, lang)].filter((s: string) => s.length > 0).join(', ');
  for (const line of wrap(small, facts, tw, 2)) { drawText(small, tx, ty, line, colours.muted, 255, 0); ty += leading(small); }
  ty += 16 * k;
  rect(tx, ty, 56 * k, Math.max(1, 2 * k), colours.accent);
  ty += 22 * k;
  for (const line of wrap(body, project.say(m.description, lang), tw, 14)) { drawText(body, tx, ty, line, colours.text, 255, 0); ty += leading(body) + 2 * k; }
  ty = oy + 990 * k - 3 * leading(small);
  const credit = [m.credit.institution, m.credit.accession, m.credit.line, m.credit.licence].filter((s: string) => s.length > 0).join(' · ');
  for (const line of wrap(small, credit, tw, 3)) { drawText(small, tx, ty, line, colours.muted, 255, 0); ty += leading(small); }
  const hint = word('close', lang);
  drawText(small, ox + (T.width - 48) * k - textWidth(small, hint, 0), oy + 1030 * k, hint, colours.muted, 255, 0);
}
