// Museum table: the player. Everything it shows comes from assets/project.json (docs/museum-table-format.md). It plays the project the
// way Klynt's player plays a story: one sequence on the table at a time (stage.ts), with its timed media; links (buttons, hotspots on a
// medium, the button of a point of interest) lead to other sequences through a transition, or open one over the current sequence, which
// waits underneath; a sequence with a `next` gives way by itself at its end. The storyboard (storyboard.ts) is the map of the story: it
// shows where the visitor has been and a touch on a node goes there.
//   zinc run examples/museum-table [-- --sequence <id>] [--lang <code>] [--story] [--log] [--stress <cards>] [--pins] [--time]
// --story prints what happens to the story, one line per event: sequences, links, overlays, the storyboard, the language (the tests read it);
// --log prints the pose of every card that moved, and the view and points of the 3D object and of the panorama, one line per change;
// --stress lays out that many cards, keeps them moving and prints the frame time; --time prints the time the 3D object takes to draw;
// --pins puts a red ball on every point of interest of the object (the test of their projection).
import { onFrame, width, height, clear, rect, rrect, border, drawImage, drawText, textWidth, imageWidth, imageHeight, wheel, pinch, pointerX, pointerY, modifiers, Mod } from 'zinc:gfx';
import { readText } from 'zinc:assets';
import { args, clock } from 'zinc:sys';
import { parseProject, Sequence, Item, Link, Colours } from './project';
import { Fingers } from './touch';
import { Card } from './table';
import { Stage, Button, drawButton } from './stage';
import { Frame } from './frame';
import { Storyboard } from './storyboard';
import { sans, bold, wrap, leading } from './type';
import { word } from './words';

/** Owner numbers of the fingers that are not on a card or a view: the full view, a button, the storyboard. */
const FULL: i32 = 1, BUTTON: i32 = 2, BOARD: i32 = 5, NOTHING: i32 = -1;
/** Seconds a transition takes, and how dark the sequence underneath an overlay gets (0 to 255). */
const FADE = 0.5, SLIDE = 0.45, DIM = 205;

const project = parseProject(readText('project.json'));
let lang = project.languages[0];
let logging = false, telling = false, stress: i32 = 0, pins = false, timing = false;
let first = project.sequence(project.start) ?? project.sequences[0];
{
  const a = args();
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--log') logging = true;
    else if (a[i] === '--story') telling = true;
    else if (a[i] === '--pins') pins = true;
    else if (a[i] === '--time') timing = true;
    else if (a[i] === '--lang' && i + 1 < a.length) { const l = a[++i]; if (project.languages.indexOf(l) >= 0) lang = l; }
    else if (a[i] === '--sequence' && i + 1 < a.length) first = project.sequence(a[++i]) ?? first;
    else if (a[i] === '--stress' && i + 1 < a.length) stress = parseInt(a[++i], 10);
  }
}
const colours: Colours = project.theme;
const T = project.table;
const F = new Frame(T.width, T.height);
const fingers = new Fingers();

/** The sequences on the table: the one being visited and, when a link opened one over it, that one on top. */
let stack: Stage[] = [];
function top(): Stage { return stack[stack.length - 1]; }
/** The sequences seen, in the order of the visit. */
let trail: string[] = [];

/** A transition in progress: what was on the table, what will be, and how far along it is (0 to 1). */
class Change {
  kind = 'fade';
  p = 0;
  before: Stage[] = [];
  after: Stage[] = [];
}
let change: Change | null = null;

/** The storyboard, made with the first sequence. */
let board: Storyboard | null = null;

/** The player's own controls, in the visitor's frame. */
const languages = new Button(), map = new Button();
let dock: Button[] = [];

let now = 0, frame: i32 = 0;
const said = new Map<i32, string>();   // the last line logged under each key
let spent = 0, elapsed = 0, counted: i32 = 0;

/** One line of the story log. */
function tell(what: string): void { if (telling) console.log(`${frame} ${what}`); }
/** Logs a line when it differs from the last one said under `key`. */
function say(key: i32, line: string): void {
  if (said.get(key) === line) return;
  said.set(key, line);
  console.log(`${frame} ${line}`);
}

function stage(s: Sequence): Stage { return new Stage(project, s, colours, lang, F, pins); }

/** The measure: the photographs again and again, until there are enough cards. */
function crowd(): Sequence {
  const many = new Sequence(), photos = project.media.filter((m) => m.kind === 'photo');
  many.id = 'stress'; many.title = first.title;
  for (let i: i32 = 0; i < stress && photos.length > 0; i++) {
    const it = new Item();
    it.media = photos[i % photos.length].id; it.width = 300;
    it.x = 200 + (i % 6) * 300; it.y = 180 + Math.floor(i / 6) * 180;
    many.items.push(it);
  }
  return many;
}

/** The table is now showing `s` as its top sequence. */
function arrived(s: Sequence): void {
  if (trail.length === 0 || trail[trail.length - 1] !== s.id) trail.push(s.id);
  tell(`sequence ${s.id}`);
}

/** Goes to the sequence `id` through a transition (`fade`, `slide` or `none`). `overlay`: it opens over the current sequence, which waits
 *  underneath with its clock stopped. From an overlay, going to the sequence underneath closes the overlay: that sequence is found as
 *  it was left. */
function go(id: string, transition: string, overlay: boolean): void {
  const s = project.sequence(id);
  if (s === null || change !== null) return;
  const c = new Change();
  c.kind = transition; c.before = stack.slice();
  if (stack.length > 1 && stack[0].sequence === s) c.after = [stack[0]];
  else c.after = overlay ? [stack[0], stage(s)] : [stage(s)];   // ponytail: one overlay at a time; a second one takes the place of the first
  top().table.opened = null;
  for (const b of top().buttons) b.finger = 0;
  if (transition === 'none') { stack = c.after; arrived(s); return; }
  change = c;
}
function follow(l: Link): void {
  const from = top().sequence.id, back = stack.length > 1 && stack[0].sequence.id === l.to;
  tell(back ? `close ${from} -> ${l.to} ${l.transition}` : `${l.overlay ? 'overlay' : 'link'} ${from} -> ${l.to} ${l.transition}`);
  go(l.to, l.transition, l.overlay);
}

/** The button of a point of interest: a link without a place of its own, with a fade. */
function followPoint(to: string, point: string, medium: string): void {
  tell(`link ${top().sequence.id} -> ${to} fade (point ${point} of ${medium})`);
  go(to, 'fade', false);
}

/** Puts the player's controls in the visitor's frame: at the edge the visitor stands at. */
function layOutDock(): void {
  dock = [];
  if (project.sequences.length > 1) {
    map.act = 'storyboard';
    map.label = word(board !== null && board.open ? 'map-close' : 'map-button', lang);
    map.w = textWidth(sans(20), map.label, 0) + 64; map.x = 48 + map.w / 2; map.y = F.h - 50;
    dock.push(map);
  }
  if (project.languages.length > 1) {
    languages.act = 'language';
    languages.w = 44 + 46 * project.languages.length; languages.x = F.w - 48 - languages.w / 2; languages.y = F.h - 50;
    dock.push(languages);
  }
}

function press(b: Button): void {
  const l = b.link;
  if (l !== null) { follow(l); return; }
  if (b.act === 'language') {
    lang = project.languages[(project.languages.indexOf(lang) + 1) % project.languages.length];
    for (const s of stack) s.setLanguage(lang);
    layOutDock();
    tell(`language ${lang}`);
  } else if (b.act === 'storyboard') showBoard(board !== null && !board.open);
}

function showBoard(open: boolean): void {
  const m = board;
  if (m === null || m.open === open) return;
  m.open = open;
  top().table.opened = null;
  layOutDock();
  tell(open ? 'storyboard open' : 'storyboard close');
}
/** A touch on a node of the storyboard: the visitor goes there, from wherever they are. */
function jump(s: Sequence): void {
  showBoard(false);
  if (stack.length === 1 && top().sequence === s) return;
  tell(`jump ${top().sequence.id} -> ${s.id}`);
  go(s.id, 'fade', false);
}

/** The finger `id` lifted at (fx, fy) of the frame: the button it was pressing is pressed if the finger is still on it. */
function released(id: i32, fx: number, fy: number): void {
  for (const b of dock.concat(top().buttons)) {
    if (b.finger !== id) continue;
    b.finger = 0;
    if (b.takes(fx, fy)) press(b);
    return;
  }
}

/** How long the top sequence lasts before its `next` (0: it stays until the visitor moves on). */
function lasts(s: Sequence): number { return s.duration; }

onFrame((dt: number) => {
  const started = clock();
  if (stack.length === 0) {   // a sequence is laid out on the first frame: images exist once the frame loop runs
    stack = [stage(stress > 0 ? crowd() : first)];
    board = new Storyboard(project, colours, F);
    layOutDock();
    arrived(top().sequence);
  }
  const W = width(), H = height(), k = Math.min(W / T.width, H / T.height), ox = (W - T.width * k) / 2, oy = (H - T.height * k) / 2;
  now += dt;
  fingers.update(dt, ox, oy, k);

  const c = change, plan = board;
  plan?.update(dt);
  if (c !== null) {   // nothing answers to a touch while the table changes
    for (const f of fingers.down) if (f.fresh) f.owner = NOTHING;
    c.p += dt / (c.kind === 'slide' ? SLIDE : FADE);
    if (c.p >= 0.5 && stack !== c.after) { stack = c.after; arrived(top().sequence); }
    if (c.p >= 1) change = null;
  } else if (plan !== null && plan.open) {   // the storyboard is over the table: a touch on a node goes there, a touch beside it closes it
    for (const f of fingers.down) {
      if (!f.fresh) continue;
      f.owner = BOARD;
      for (const b of dock) if (b.finger === 0 && b.takes(F.x(f.x, f.y), F.y(f.x, f.y))) { f.owner = BUTTON; b.finger = f.id; break; }
    }
    for (const f of fingers.lifted) {
      if (f.owner === BOARD) {
        const node = plan.nodeAt(F.x(f.x, f.y), F.y(f.x, f.y));
        if (node !== null) jump(node); else showBoard(false);
      } else if (f.owner === BUTTON) released(f.id, F.x(f.x, f.y), F.y(f.x, f.y));
    }
  } else {
    const on = top();
    // who takes the fingers that landed: the full view when it is open, else a button, else the card or the view under them
    for (const f of fingers.down) {
      if (!f.fresh) continue;
      if (on.table.opened !== null) { f.owner = FULL; continue; }
      const fx = F.x(f.x, f.y), fy = F.y(f.x, f.y);
      for (const b of dock.concat(on.offered())) if (b.finger === 0 && b.takes(fx, fy)) { f.owner = BUTTON; b.finger = f.id; break; }
    }
    const viewing: Card | null = on.table.opened;
    on.update(dt, fingers, now);
    for (const f of fingers.down) if (f.fresh && f.owner === 0) f.owner = NOTHING;
    for (const f of fingers.lifted) {
      if (f.owner === FULL && viewing !== null) on.table.opened = null;
      if (f.owner === BUTTON) released(f.id, F.x(f.x, f.y), F.y(f.x, f.y));
    }
    // a hotspot on a card, the button of a panorama's point
    const spot = on.table.followed, window = on.lookout, thing = on.viewer;
    if (spot !== null) { on.table.followed = null; follow(spot); }
    else if (window !== null && window.followed.length > 0) { followPoint(window.followed, window.opened?.id ?? '-', window.media.id); window.followed = ''; }
    else if (thing !== null && thing.followed.length > 0) { followPoint(thing.followed, thing.opened?.id ?? '-', thing.media.id); thing.followed = ''; }
    // the end of a sequence that has a `next`: it gives way, once no hand is on the table
    const s = on.sequence, length = lasts(s);
    if (change === null && stack[stack.length - 1] === on && s.next.length > 0 && length > 0 && on.t >= length && fingers.down.length === 0) {
      tell(`next ${s.id} -> ${s.next}`);
      go(s.next, 'fade', false);
    }

    // a desk without a touch screen: the wheel and the trackpad zoom the card under the pointer, with Shift the wheel turns it
    const notches = wheel(), spread = pinch(), object = on.viewer;
    if (notches !== 0 || spread !== 1) {
      const turning = (modifiers() & Mod.Shift) !== 0, px = (pointerX() - ox) / k, py = (pointerY() - oy) / k;
      if (object !== null && object.inside(px, py) && on.table.cardAt(px, py) === null) object.closer(Math.pow(1.1, notches) * spread);
      else if (on.lookout !== null && on.lookout.inside(px, py) && on.table.cardAt(px, py) === null) on.lookout.view.zoom(Math.pow(1.1, notches) * spread);
      else on.table.nudge(px, py, turning ? 1 : Math.pow(1.1, notches) * spread, turning ? notches * 0.09 : 0);
    }
    if (stress > 0) stir(now);
  }

  clear(colours.background);
  const moving = change;
  if (moving === null) drawStack(stack, ox, oy, k, 1, 0);
  else drawChange(moving, ox, oy, k);
  const full = top().table.opened;
  if (full !== null) drawFullView(full, ox, oy, k);
  F.on(ox, oy, k);
  plan?.draw(k, lang, top().sequence.id, trail);
  drawDock(k);
  F.off();
  for (const f of fingers.down) border(ox + (f.x - 30) * k, oy + (f.y - 30) * k, 60 * k, 60 * k, 30 * k, Math.max(1, 2 * k), colours.accent, 150);   // where the table feels a finger

  if (logging) report();
  const object = top().viewer;
  if (timing && object !== null && object.drawn === 120) {
    console.log(`the object is drawn in ${(object.spent / object.drawn).toFixed(2)} ms (${Math.round(object.w * k)} x ${Math.round(object.h * k)} pixels)`);
    object.spent = 0; object.drawn = 0;
  }
  frame++;
  if (stress > 0) {
    spent += clock() - started; elapsed += dt; counted++;
    if (counted === 120) {
      console.log(`${top().table.cards.length} cards moving: ${(spent / counted).toFixed(2)} ms of the program per frame, ${(counted / elapsed).toFixed(1)} frames per second`);
      spent = 0; elapsed = 0; counted = 0;
    }
  }
});

/** The cards, the object and the panorama of the top sequence, a line for each that changed. */
function report(): void {
  const on = top(), object = on.viewer, window = on.lookout;
  for (const c of on.table.cards) {
    const p = c.pose;
    say(c.uid, `${c.media.id} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} scale=${p.scale.toFixed(4)} angle=${(p.angle * 180 / Math.PI).toFixed(2)} fingers=${c.held} face=${c.turn.toFixed(2)}`);
  }
  if (object !== null) {
    say(-1, `view yaw=${object.yaw.toFixed(2)} pitch=${object.pitch.toFixed(2)} distance=${object.reach.toFixed(3)} pan=${object.panX.toFixed(4)},${object.panY.toFixed(4)} light=${object.light} open=${object.opened?.id ?? '-'}`);
    for (let i: i32 = 0; i < object.media.points.length; i++) {
      object.locate(object.media.points[i].at);
      say(-2 - i, `point ${object.media.points[i].id} at ${object.px.toFixed(1)} ${object.py.toFixed(1)} ${object.pfacing ? 'facing' : 'behind'}`);
    }
  }
  if (window !== null) {
    say(-50, `look yaw=${window.view.yaw.toFixed(1)} pitch=${window.view.pitch.toFixed(1)} fov=${window.view.fov.toFixed(1)} open=${window.opened?.id ?? '-'}`);
    for (let i: i32 = 0; i < window.media.points.length; i++) {
      const at = window.locate(window.media.points[i]);
      say(-51 - i, `mark ${window.media.points[i].id} ${at.length === 2 ? `at ${Math.round(at[0])} ${Math.round(at[1])}` : 'out of sight'}`);
    }
  }
}

/** The measure: every card wanders, turns and breathes by itself, as if a hand held it. */
function stir(t: number): void {
  const cards = top().table.cards;
  for (let i: i32 = 0; i < cards.length; i++) {
    const c = cards[i], p = c.pose;
    p.x = T.width / 2 + Math.sin(t * 0.7 + i) * (T.width / 2 - 200);
    p.y = T.height / 2 + Math.cos(t * 0.9 + i * 1.7) * (T.height / 2 - 160);
    p.angle = t * 0.5 + i;
    p.scale = 1 + 0.1 * Math.sin(t + i);
    c.held = 1;
  }
}

/** Draws sequences one over the other: the first as it is, the next ones over a table dimmed by `dim` (0 to 1) and moved `shift` table
 *  widths to the right. */
function drawStack(stages: Stage[], ox: number, oy: number, k: number, dim: number, shift: number): void {
  for (let i = 0; i < stages.length; i++) {
    if (i > 0) rrect(0, 0, width(), height(), 0, colours.background, Math.round(DIM * dim));
    stages[i].draw(ox + (i > 0 ? shift * T.width * k : 0), oy, k, i < stages.length - 1);
  }
}

/** A transition. Fade: the table goes dark, changes, and comes back. Slide: the new sequence pushes the old one out to the left; an
 *  overlay comes in from the right over its sequence, and leaves the same way. */
function drawChange(c: Change, ox: number, oy: number, k: number): void {
  if (c.kind !== 'slide') {
    drawStack(c.p < 0.5 ? c.before : c.after, ox, oy, k, 1, 0);
    rrect(0, 0, width(), height(), 0, colours.background, Math.round(255 * (1 - Math.abs(1 - 2 * c.p))));
    return;
  }
  const e = c.p * c.p * (3 - 2 * c.p), wide = T.width * k;
  if (c.before[0] === c.after[0]) {   // the sequence underneath stays: only the overlay moves
    const opening = c.after.length > c.before.length;
    drawStack(opening ? c.after : c.before, ox, oy, k, opening ? e : 1 - e, opening ? 1 - e : e);
  } else {
    drawStack(c.before, ox - e * wide, oy, k, 1, 0);
    drawStack(c.after, ox + (1 - e) * wide, oy, k, 1, 0);
  }
}

/** The player's controls, over everything, in the visitor's frame (which is on). */
function drawDock(k: number): void {
  for (const b of dock) {
    if (b !== languages) { drawButton(b, F, k, colours); continue; }
    // the language button: every language, the current one bright
    const f = sans(20 * k), x = F.ox + (b.x - b.w / 2) * k, y = F.oy + (b.y - b.h / 2) * k, w = b.w * k, h = b.h * k, held = b.finger !== 0;
    rrect(x, y, w, h, h / 2, held ? colours.accent : colours.background, held ? 255 : 235);
    border(x, y, w, h, h / 2, Math.max(1, 1.5 * k), colours.accent, 255);
    let tx = x + 26 * k;
    for (const code of project.languages) {
      drawText(f, tx, y + (h - leading(f)) / 2 + k, code.toUpperCase(), code === lang ? (held ? colours.background : colours.accent) : colours.muted, 255, 0);
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
