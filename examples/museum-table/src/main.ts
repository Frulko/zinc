// Museum table: the player. Everything it shows comes from assets/project.json (docs/museum-table-format.md). It plays the project the
// way Klynt's player plays a story: one sequence on the table at a time (stage.ts), with its timed media; links (buttons, hotspots on a
// medium, the button of a point of interest) lead to other sequences through a transition, or open one over the current sequence, which
// waits underneath; a sequence with a `next` gives way by itself at its end. The storyboard (storyboard.ts) is the map of the story: it
// shows where the visitor has been and a touch on a node goes there. A guided presentation plays a path of sequences by itself, each for
// its duration, with its narration (narration.ts) and subtitles; a touch pauses it.
// It is made for a table, with one or two visitors around it sharing one story: the texts, the panels and the buttons are laid out in the
// frame of the visitor (frame.ts) and turn to the side of the table of the last tap near an edge, while the cards stay free. When nobody
// touches the table the attract loop plays, then the visit is forgotten; nothing leads out of the app and no error is shown.
//   zinc run examples/museum-table [-- --sequence <id>] [--lang <code>] [--story] [--log] [--stress <cards>] [--pins] [--time]
// --story prints what happens to the story, one line per event: sequences, links, overlays, the storyboard, presentations, the narration
// clips asked for and the subtitles shown, the language, the side the texts turn to, the attract loop and the reset (the tests read it);
// --log prints the pose of every card that moved, and the view and points of the 3D object and of the panorama, one line per change;
// --stress lays out that many cards, keeps them moving and prints the frame time; --time prints the time the 3D object takes to draw;
// --pins puts a red ball on every point of interest of the object (the test of their projection).
import { onFrame, width, height, clear, rect, rrect, border, polygon, drawImage, drawText, textWidth, imageWidth, imageHeight, wheel, pinch, pointerX, pointerY, modifiers, Mod, escapeByApp } from 'zinc:gfx';
import { readText } from 'zinc:assets';
import { args, clock } from 'zinc:sys';
import { parseProject, Project, Sequence, Item, Link, Presentation, Colours } from './project';
import { Fingers } from './touch';
import { Card } from './table';
import { Stage, Button, drawButton } from './stage';
import { Frame } from './frame';
import { Storyboard } from './storyboard';
import { Narration } from './narration';
import { sans, bold, wrap, leading } from './type';
import { word } from './words';

/** Owner numbers of the fingers that are not on a card or a view: the full view, a button, the storyboard. */
const FULL: i32 = 1, BUTTON: i32 = 2, BOARD: i32 = 5, NOTHING: i32 = -1;
/** Seconds a transition takes, and how dark the sequence underneath an overlay gets (0 to 255). */
const FADE = 0.5, SLIDE = 0.45, DIM = 205;

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
const T = project.table, K = project.kiosk;
const F = new Frame(T.width, T.height), edge = new Frame(T.width, T.height);
const fingers = new Fingers();
/** A tap or a press closer to an edge than this turns the texts to that edge (table units): the strip a visitor stands at, 9 cm on a
 *  43-inch table. A wider strip turns the table under a visitor who touches a card lying a little further than its middle. */
const TURN = Math.min(T.reach, 0.15 * Math.min(T.width, T.height));
/** The sequence a visit starts with, and comes back to. */
const home = project.sequence(project.start) ?? project.sequences[0];
if (K.fullscreen) escapeByApp(true);   // a kiosk: Escape leads nowhere (the window itself is made a kiosk by ZINC_KIOSK=1 or zinc.json)

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

/** The guided presentation being played, the step it is at, the seconds this step has played, and whether a touch has paused it. */
let tour: Presentation | null = null, step: i32 = 0, played = 0, paused = false;
/** The narration being said, the seconds since it began, and the subtitle on the table. */
let voice: Narration | null = null, spoken = 0, cue = '';
/** The sequences whose narration this visit has heard: outside a presentation a narration is not said twice to the same visitor. */
const heard = new Set<string>();
/** Whether a visitor has touched the table: the narration of the first sequence waits for them. */
let visiting = false;
/** Seconds since a hand was on the table; whether the attract loop plays; the visit set aside under it until the reset. */
let idle = 0, attracting = false;
let session: Stage[] | null = null;

/** The player's own controls, in the visitor's frame. */
const languages = new Button(), map = new Button(), resume = new Button(), leave = new Button(), shut = new Button();
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
  if (!attracting && (trail.length === 0 || trail[trail.length - 1] !== s.id)) trail.push(s.id);
  tell(`sequence ${s.id}`);
  hush();
  const t = tour;
  if (t !== null) { played = 0; tell(`step ${step + 1}/${t.path.length} ${s.id}`); narrate(s); }
  else if (visiting && !heard.has(s.id)) narrate(s);
}

/** Says the narration of `s`, when it has one, in the visitor's language, from its beginning. */
function narrate(s: Sequence): void {
  hush();
  const m = project.medium(s.narration);
  if (m === null) return;
  heard.add(s.id);
  const v = new Narration(project, m, lang);
  if (!attracting) v.play();   // the attract loop is read, not heard: an empty room is left in peace
  voice = v; spoken = 0;
  tell(`narration ${v.file}${attracting ? ' (subtitles only)' : ''}`);
}
/** Stops the narration. */
function hush(): void {
  const v = voice;
  if (v === null) return;
  v.stop();
  voice = null; cue = '';
  tell('narration stop');
}

/** Starts a guided presentation at its first sequence. */
function present(p: Presentation): void {
  showBoard(false);
  tour = p; step = 0; played = 0; paused = false;
  tell(`presentation ${p.id} start`);
  layOutDock();
  go(p.path[0], 'fade', false);
}
/** Ends the presentation (`why`: end, stop): the visitor stays where it stopped. */
function endTour(why: string): void {
  const t = tour;
  if (t === null) return;
  tour = null; paused = false;
  tell(`presentation ${t.id} ${why}`);
  layOutDock();
}
/** How long a step of a presentation lasts: the sequence's duration, else its narration and a breath, else ten seconds. */
function stepLength(s: Sequence): number {
  if (s.duration > 0) return s.duration;
  const v = voice;
  return v !== null && v.length > 0 ? v.length + 1 : 10;
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
  if (transition === 'none') { stack = c.after; arrived(s); layOutDock(); return; }
  change = c;
}

/** Turns the texts, the panels and the buttons to a side of the table. */
function turnTo(side: i32): void {
  if (side === F.side) return;
  F.side = side;
  for (const s of stack) s.place();
  const kept = session;
  if (kept !== null) for (const s of kept) s.place();
  layOutDock();
  tell(`side ${F.name}`);
}

/** The attract loop: the presentation the project names plays by itself, without sound, again and again, over the visit set aside. */
function attract(p: Presentation): void {
  endTour('stop');
  showBoard(false);
  hush();
  tell('attract start');
  session = stack; change = null;
  attracting = true; tour = p; step = 0; played = 0; paused = false;
  stack = [stage(project.sequence(p.path[0]) ?? home)];
  layOutDock();
  arrived(top().sequence);
}
/** A touch ends the attract loop: the visitor finds the table as it was left, or as new after the reset. */
function wake(): void {
  hush();
  attracting = false; tour = null; change = null;
  const kept = session;
  session = null;
  tell(kept !== null ? `attract stop: back to ${kept[kept.length - 1].sequence.id}` : 'attract stop');
  if (kept !== null) { stack = kept; layOutDock(); }
  else { stack = [stage(home)]; layOutDock(); arrived(home); }
}
/** Nobody has touched the table for the time the project gives: the visit is over and everything goes back to the start. */
function reset(): void {
  if (visiting) tell('visit end');
  lang = project.languages[0];
  trail = []; heard.clear(); visiting = false; session = null;
  F.side = 0;
  const m = board;
  if (m !== null) m.open = false;
  if (attracting) { for (const s of stack) { s.setLanguage(lang); s.place(); } }
  else { endTour('stop'); hush(); change = null; stack = [stage(home)]; }
  layOutDock();
  tell(`reset: sequence ${attracting ? home.id : top().sequence.id}, language ${lang}, side ${F.name}, ${trail.length} seen`);
}
function follow(l: Link): void {
  endTour('stop');
  const from = top().sequence.id, back = stack.length > 1 && stack[0].sequence.id === l.to;
  tell(back ? `close ${from} -> ${l.to} ${l.transition}` : `${l.overlay ? 'overlay' : 'link'} ${from} -> ${l.to} ${l.transition}`);
  go(l.to, l.transition, l.overlay);
}

/** The button of a point of interest: a link without a place of its own, with a fade. */
function followPoint(to: string, point: string, medium: string): void {
  endTour('stop');
  tell(`link ${top().sequence.id} -> ${to} fade (point ${point} of ${medium})`);
  go(to, 'fade', false);
}

/** Puts the player's controls in the visitor's frame: at the edge the visitor stands at. */
function layOutDock(): void {
  dock = [];
  if (attracting) return;   // the attract loop offers one thing: touch the table
  const f = sans(20), y = F.h - 50;
  let x = 48;
  const over = stack.length > 1 ? stack[1] : null;
  if (over !== null && tour === null) {   // an overlay that has no link back to its sequence gets a way to close: no dead end on a kiosk
    let back = false;
    for (const l of over.sequence.links) if (l.to === stack[0].sequence.id) back = true;
    if (!back) {
      shut.act = 'close'; shut.label = word('shut', lang);
      shut.w = textWidth(f, shut.label, 0) + 64; shut.x = x + shut.w / 2; shut.y = y; x += shut.w + 16;
      dock.push(shut);
    }
  }
  if (tour !== null) {   // a presentation: nothing to press while it plays (a touch pauses it), two buttons once it is paused
    if (paused) {
      resume.act = 'resume'; resume.play = true; resume.label = word('resume', lang);
      leave.act = 'leave'; leave.label = word('leave', lang);
      for (const b of [resume, leave]) { b.w = textWidth(f, b.label, 0) + 64 + (b.play ? 26 : 0); b.x = x + b.w / 2; b.y = y; x += b.w + 16; dock.push(b); }
    }
  } else {
    if (project.sequences.length > 1) {
      map.act = 'storyboard';
      map.label = word(board !== null && board.open ? 'map-close' : 'map-button', lang);
      map.w = textWidth(f, map.label, 0) + 64; map.x = x + map.w / 2; map.y = y; x += map.w + 16;
      dock.push(map);
    }
    for (const p of project.presentations) {   // ponytail: every presentation has its button in the row; many of them need a list
      const b = new Button();
      b.act = `present ${p.id}`; b.play = true; b.label = project.say(p.title, lang);
      b.w = textWidth(f, b.label, 0) + 90; b.x = x + b.w / 2; b.y = y; x += b.w + 16;
      dock.push(b);
    }
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
    if (voice !== null) narrate(top().sequence);   // the narration starts again in the new language, and its subtitles with it
  } else if (b.act === 'storyboard') showBoard(board !== null && !board.open);
  else if (b.act === 'resume') {
    // ponytail: zinc:audio cannot pause a clip or start it in the middle, so the step is played again from its beginning
    paused = false; played = 0;
    tell('presentation resume');
    layOutDock();
    narrate(top().sequence);
  } else if (b.act === 'leave') endTour('stop');
  else if (b.act === 'close') { tell(`close ${top().sequence.id} -> ${stack[0].sequence.id} fade`); go(stack[0].sequence.id, 'fade', false); }
  else if (b.act.startsWith('present ')) {
    for (const p of project.presentations) if (b.act === `present ${p.id}`) { present(p); break; }
  }
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
  endTour('stop');
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

/** Faults in a row, and the frame loop: a fault (a medium that cannot be read, a bug) is logged for the staff and never shown to a
 *  visitor. The table goes back to its first sequence, and to a table with nothing on it when that sequence is the one at fault. */
let faults: i32 = 0;
onFrame((dt: number) => {
  try { play(dt); faults = 0; } catch (e) {
    faults++;
    console.error(`museum-table: ${e.message}`);
    change = null; tour = null; paused = false; attracting = false; session = null; voice = null; cue = '';
    stack = [];
    first = faults < 3 ? home : new Sequence();
  }
});

function play(dt: number): void {
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
  // nobody at the table: the attract loop after a while, then the visit is forgotten. A presentation a visitor watches is not idleness.
  if (fingers.down.length > 0) idle = 0; else if (attracting || tour === null || paused) idle += dt;
  if (attracting && fingers.down.length > 0) {
    for (const f of fingers.down) f.owner = NOTHING;
    wake();
  }
  if (!visiting && fingers.down.length > 0) {   // the first touch of a visit: the narration of the sequence on the table begins
    visiting = true;
    tell('visit start');
    if (tour === null && !heard.has(top().sequence.id)) narrate(top().sequence);
  }
  if (K.resetAfter > 0 && idle >= K.resetAfter && (visiting || session !== null || F.side !== 0)) reset();
  if (!attracting && K.attractAfter > 0 && idle >= K.attractAfter) {
    for (const p of project.presentations) if (p.id === K.attract) { attract(p); break; }
  }
  // a tap, or a press on a button, near an edge: the texts turn to that edge once this frame's touches are dealt with
  let turn: i32 = -1;
  for (const f of fingers.lifted) {
    if (!(f.tapped || f.owner === BUTTON)) continue;
    if (Math.min(Math.min(f.x, T.width - f.x), Math.min(f.y, T.height - f.y)) <= TURN) turn = F.nearest(f.x, f.y);
  }
  const speaking = voice;
  if (speaking !== null) {
    spoken += dt;
    const text = speaking.at(spoken);
    if (text !== cue) { cue = text; if (text.length > 0) tell(`subtitle ${text}`); }
    if (spoken > speaking.length + 0.5) { voice = null; cue = ''; tell('narration end'); }
  }

  const c = change, plan = board;
  plan?.update(dt);
  if (c !== null) {   // nothing answers to a touch while the table changes
    for (const f of fingers.down) if (f.fresh) f.owner = NOTHING;
    c.p += dt / (c.kind === 'slide' ? SLIDE : FADE);
    if (c.p >= 0.5 && stack !== c.after) { stack = c.after; arrived(top().sequence); layOutDock(); }
    if (c.p >= 1) change = null;
  } else if (tour !== null && !paused) {   // a presentation plays by itself: a touch pauses it, and does nothing else
    let touched = false;
    for (const f of fingers.down) if (f.fresh) { f.owner = NOTHING; touched = true; }
    const t = tour, on = top();
    on.update(dt, fingers, now);
    played += dt;
    if (touched) {
      paused = true;
      tell('presentation pause');
      hush();
      layOutDock();
    } else if (played >= stepLength(on.sequence)) {
      step++;
      if (step >= t.path.length && attracting) step = 0;   // the attract loop starts again
      if (step >= t.path.length) endTour('end');
      else go(t.path[step], 'fade', false);
    }
  } else if (plan !== null && plan.open) {   // the storyboard is over the table: a touch on a node goes there, a touch beside it closes it
    for (const f of fingers.down) {
      if (!f.fresh || f.owner !== 0) continue;
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
      if (!f.fresh || f.owner !== 0) continue;
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
    if (tour === null && change === null && stack[stack.length - 1] === on && s.next.length > 0 && length > 0 && on.t >= length && fingers.down.length === 0) {
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

  if (turn >= 0) turnTo(turn);

  clear(colours.background);
  for (const s of stack) s.quiet = tour !== null && !paused;
  const moving = change;
  if (moving === null) drawStack(stack, ox, oy, k, 1, 0);
  else drawChange(moving, ox, oy, k);
  const full = top().table.opened;
  F.on(ox, oy, k);
  if (full !== null) drawFullView(full, k);
  plan?.draw(k, lang, top().sequence.id, trail);
  drawSubtitle(k);
  drawTour(k);
  drawDock(k);
  F.off();
  drawEdges(ox, oy, k);
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
}

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

/** What the narration is saying, at the visitor's edge above the buttons: one line, or two of about the same length. */
function drawSubtitle(k: number): void {
  if (cue.length === 0) return;
  const f = sans(24 * k), room = Math.min(1200, F.w - 160) * k, full = textWidth(f, cue, 0);
  const lines = full <= room ? [cue] : wrap(f, cue, Math.min(room, full * 0.56), 3);
  let w = 0;
  for (const line of lines) w = Math.max(w, textWidth(f, line, 0));
  const h = lines.length * leading(f) + 20 * k, x = F.ox + (F.w * k - w) / 2, y = F.oy + (F.h - (F.w < T.width ? 162 : 86)) * k - h;
  rrect(x - 26 * k, y, w + 52 * k, h, 14 * k, colours.background, 225);
  for (let i = 0; i < lines.length; i++) drawText(f, F.ox + (F.w * k - textWidth(f, lines[i], 0)) / 2, y + 10 * k + i * leading(f), lines[i], colours.text, 255, 0);
}

/** A presentation: its timeline at the visitor's edge, a segment for each step, and while it plays where it is and how to stop it. */
function drawTour(k: number): void {
  const t = tour;
  if (t === null) return;
  const n = t.path.length, gap = 6 * k, left = F.ox + 48 * k, wide = (F.w - 96) * k, each = (wide - gap * (n - 1)) / n, y = F.oy + (F.h - 12) * k, h = Math.max(2, 4 * k);
  const length = change === null ? stepLength(top().sequence) : 0;
  for (let i = 0; i < n; i++) {
    const x = left + i * (each + gap), part = i < step ? 1 : i > step || length <= 0 ? 0 : Math.min(1, played / length);
    rrect(x, y, each, h, h / 2, colours.muted, 90);
    if (part > 0) rrect(x, y, Math.max(h, each * part), h, h / 2, colours.accent, 255);
  }
  if (paused || attracting) return;
  const f = sans(20 * k), label = `${project.say(t.title, lang)} · ${step + 1}/${n} · ${word('pause-hint', lang)}`, w = textWidth(f, label, 0) + 90 * k, bh = 56 * k;
  const x = F.ox + 48 * k, y0 = F.oy + (F.h - 50) * k - bh / 2;
  rrect(x, y0, w, bh, bh / 2, colours.background, 235);
  polygon([x + 30 * k, y0 + bh / 2 - 9 * k, x + 45 * k, y0 + bh / 2, x + 30 * k, y0 + bh / 2 + 9 * k], colours.accent, 255);
  drawText(f, x + 58 * k, y0 + (bh - leading(f)) / 2 + k, label, colours.muted, 255, 0);
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

/** What is written at the edges the visitor is not at, each turned to its own side: during the attract loop the invitation, at every
 *  edge; else a mark that says a touch there turns the table to that side. */
function drawEdges(ox: number, oy: number, k: number): void {
  const label = word(attracting ? 'begin' : 'turn', lang);
  for (let side: i32 = 0; side < 4; side++) {
    if (side === F.side && !attracting) continue;
    edge.side = side;
    edge.on(ox, oy, k);
    const f = attracting ? sans(24 * k) : sans(15 * k), w = textWidth(f, label, 0) + (attracting ? 72 : 44) * k, h = (attracting ? 60 : 34) * k;
    const x = edge.ox + (edge.w * k - w) / 2, y = edge.oy + (edge.h - (attracting ? 56 : 26)) * k - h / 2;
    rrect(x, y, w, h, h / 2, colours.background, attracting ? 235 : 200);
    border(x, y, w, h, h / 2, Math.max(1, (attracting ? 2 : 1) * k), attracting ? colours.accent : colours.muted, attracting ? 255 : 150);
    drawText(f, x + (w - textWidth(f, label, 0)) / 2, y + (h - leading(f)) / 2 + k, label, attracting ? colours.text : colours.muted, 255, 0);
  }
  edge.off();
}

/** The full view a double tap opens, in the visitor's frame (which is on): the picture as large as the table allows and its notice, beside
 *  it at a long side of the table, under it at a short side. Any touch closes it. */
function drawFullView(c: Card, k: number): void {
  const m = c.media, wide = F.w >= F.h, X = (x: number): number => F.ox + x * k, Y = (y: number): number => F.oy + y * k;
  rrect(X(0), Y(0), F.w * k, F.h * k, 0, colours.background, 236);   // the table dims behind
  const boxW = (wide ? 1040 : F.w - 140) * k, boxH = (wide ? 900 : 1000) * k, iw = imageWidth(c.picture), ih = imageHeight(c.picture), fit = Math.min(boxW / iw, boxH / ih);
  const w = iw * fit, h = ih * fit, x = X(70) + (boxW - w) / 2, y = Y(90) + (boxH - h) / 2;
  rrect(x - 10 * k, y - 10 * k, w + 20 * k, h + 20 * k, 3 * k, colours.paper, 255);
  drawImage(c.picture, x, y, w, h, 255, 0);

  const tx = X(wide ? 1180 : 70), tw = (wide ? 670 : F.w - 140) * k, head = bold(36 * k), who = sans(22 * k), small = sans(16 * k), body = sans(20 * k);
  let ty = Y(wide ? 110 : 1140);
  for (const line of wrap(head, project.say(m.title, lang), tw, 4)) { drawText(head, tx, ty, line, colours.text, 255, 0); ty += leading(head); }
  ty += 10 * k;
  if (m.creator.length > 0) { drawText(who, tx, ty, m.creator, colours.text, 255, 0); ty += leading(who); }
  const facts = [project.say(m.date, lang), project.say(m.medium, lang)].filter((s: string) => s.length > 0).join(', ');
  for (const line of wrap(small, facts, tw, 2)) { drawText(small, tx, ty, line, colours.muted, 255, 0); ty += leading(small); }
  ty += 16 * k;
  rect(tx, ty, 56 * k, Math.max(1, 2 * k), colours.accent);
  ty += 22 * k;
  for (const line of wrap(body, project.say(m.description, lang), tw, 14)) { drawText(body, tx, ty, line, colours.text, 255, 0); ty += leading(body) + 2 * k; }
  ty = Y(F.h - 90) - 3 * leading(small);
  const credit = [m.credit.institution, m.credit.accession, m.credit.line, m.credit.licence].filter((s: string) => s.length > 0).join(' · ');
  for (const line of wrap(small, credit, tw, 3)) { drawText(small, tx, ty, line, colours.muted, 255, 0); ty += leading(small); }
  const hint = word('close', lang);
  drawText(small, X(F.w - 48) - textWidth(small, hint, 0), Y(F.h - 50), hint, colours.muted, 255, 0);
}
