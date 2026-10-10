// Museum table: the player. Everything it shows comes from a project (docs/museum-table-format.md). It plays the project the
// way Klynt's player plays a story: one sequence on the table at a time (stage.ts), with its timed media; links (buttons, hotspots on a
// medium, the button of a point of interest) lead to other sequences through a transition, or open one over the current sequence, which
// waits underneath; a sequence with a `next` gives way by itself at its end. The storyboard (storyboard.ts) is the map of the story: it
// shows where the visitor has been and a touch on a node goes there. A guided presentation plays a path of sequences by itself, each for
// its duration, with its narration (narration.ts) and subtitles; a touch pauses it.
// It is made for a table, with one or two visitors around it sharing one story: the texts, the panels and the buttons are laid out in the
// frame of the visitor (frame.ts) and turn to the side of the table of the last tap near an edge, while the cards stay free. When nobody
// touches the table the attract loop plays, then the visit is forgotten; nothing leads out of the player and no error is shown.
// The player is a class given a project and, each frame, the rectangle of the window it has: the table's app (main.ts) gives it its whole
// window, the storyboard editor (../editor/preview.tsx) a pane of its own window, or a second window. It reads the touches and the mouse
// of the window being drawn and the files of the project through files.ts; whoever owns the window clears it.
import { rect, rrect, border, polygon, drawImage, drawText, textWidth, imageWidth, imageHeight, wheel, pinch, pointerX, pointerY, modifiers, Mod } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Project, Sequence, Item, Link, Presentation, Colours, Table, Kiosk } from './project';
import { Fingers } from './touch';
import { Card } from './table';
import { Stage, Views, Button, drawButton } from './stage';
import { Frame } from './frame';
import { Storyboard } from './storyboard';
import { Narration } from './narration';
import { sans, bold, wrap, leading } from './type';
import { word } from './words';

/** Owner numbers of the fingers that are not on a card or a view: the full view, a button, the storyboard. */
const FULL: i32 = 1, BUTTON: i32 = 2, BOARD: i32 = 5, NOTHING: i32 = -1;
/** Seconds a transition takes, and how dark the sequence underneath an overlay gets (0 to 255). */
const FADE = 0.5, SLIDE = 0.45, DIM = 205;

/** A transition in progress: what was on the table, what will be, and how far along it is (0 to 1). */
class Change {
  kind = 'fade';
  p = 0;
  before: Stage[] = [];
  after: Stage[] = [];
}

export class Player {
  readonly project: Project;
  /** The visitor's language. */
  lang: string;
  /** Prints what happens to the story, one line per event: sequences, links, overlays, the storyboard, presentations, the narration
   *  clips asked for and the subtitles shown, the language, the side the texts turn to, the attract loop and the reset (the tests read it). */
  telling = false;
  /** Prints the pose of every card that moved, and the view and points of the 3D object and of the panorama, one line per change. */
  logging = false;
  /** Puts a red ball on every point of interest of the object (the test of their projection). Set before the first frame. */
  pins = false;
  /** Prints the time the 3D object takes to draw. */
  timing = false;
  /** Lays out that many cards, keeps them moving and prints the frame time. Set before the first frame. */
  stress: i32 = 0;
  /** The last fault ('' for none): what `frame` caught, for whoever shows the player to an author instead of a visitor. */
  fault = '';

  private colours: Colours;
  private T: Table;
  private K: Kiosk;
  private F: Frame;
  private edge: Frame;
  private fingers = new Fingers();
  /** A tap or a press closer to an edge than this turns the texts to that edge (table units): the strip a visitor stands at, 9 cm on a
   *  43-inch table. A wider strip turns the table under a visitor who touches a card lying a little further than its middle. */
  private TURN: number;
  /** The sequence a visit starts with, and comes back to; the one this player opens with. */
  private home: Sequence;
  private first: Sequence;
  /** The 3D views made so far. */
  private views = new Views();

  /** The sequences on the table: the one being visited and, when a link opened one over it, that one on top. */
  private stack: Stage[] = [];
  /** The sequences seen, in the order of the visit. */
  private trail: string[] = [];
  private change: Change | null = null;
  /** The storyboard, made with the first sequence. */
  private board: Storyboard | null = null;

  /** The guided presentation being played, the step it is at, the seconds this step has played, and whether a touch has paused it. */
  private tour: Presentation | null = null;
  private step: i32 = 0;
  private played = 0;
  private paused = false;
  /** The narration being said, the seconds since it began, and the subtitle on the table. */
  private voice: Narration | null = null;
  private spoken = 0;
  private cue = '';
  /** The sequences whose narration this visit has heard: outside a presentation a narration is not said twice to the same visitor. */
  private heard = new Set<string>();
  /** Whether a visitor has touched the table: the narration of the first sequence waits for them. */
  private visiting = false;
  /** Seconds since a hand was on the table; whether the attract loop plays; the visit set aside under it until the reset. */
  private idle = 0;
  private attracting = false;
  private session: Stage[] | null = null;

  /** The player's own controls, in the visitor's frame. */
  private languages = new Button();
  private map = new Button();
  private resume = new Button();
  private leave = new Button();
  private shut = new Button();
  private dock: Button[] = [];

  private now = 0;
  private count: i32 = 0;
  private said = new Map<i32, string>();   // the last line logged under each key
  private started = 0;
  private spent = 0;
  private elapsed = 0;
  private counted: i32 = 0;
  /** Faults in a row. */
  private faults: i32 = 0;
  // where the table is on the window this frame: its origin, the pixels of one table unit, and the rectangle the player was given
  private ox = 0;
  private oy = 0;
  private k = 1;
  private boxX = 0;
  private boxY = 0;
  private boxW = 0;
  private boxH = 0;
  private dt = 0;

  /** `first`: the id of the sequence to open with ('' or an unknown one: the project's start). `lang`: one of the project's languages. */
  constructor(project: Project, first: string, lang: string) {
    this.project = project;
    this.lang = project.languages.indexOf(lang) >= 0 ? lang : project.languages[0];
    this.colours = project.theme;
    this.T = project.table; this.K = project.kiosk;
    this.F = new Frame(this.T.width, this.T.height); this.edge = new Frame(this.T.width, this.T.height);
    this.TURN = Math.min(this.T.reach, 0.15 * Math.min(this.T.width, this.T.height));
    this.home = project.sequence(project.start) ?? project.sequences[0];
    this.first = project.sequence(first) ?? this.home;
  }

  /** The id of the sequence on the table ('' before the first frame). */
  get sequence(): string { return this.stack.length > 0 ? this.top().sequence.id : ''; }

  /** One frame of the visit in the rectangle (x, y, w, h) of the window being drawn: the table is as large as fits, in its middle. A fault
   *  (a medium that cannot be read, a bug) is logged for the staff and never shown to a visitor: the table goes back to its first
   *  sequence, and to a table with nothing on it when that sequence is the one at fault. */
  frame(dt: number, x: number, y: number, w: number, h: number): void {
    try { this.advance(dt, x, y, w, h); this.paint(x, y, w, h); this.faults = 0; } catch (e) { this.failed(e.message); }
  }
  /** The two halves of `frame`, for a host that draws at another moment than it counts time (a canvas of zinc:ui). */
  update(dt: number, x: number, y: number, w: number, h: number): void {
    try { this.advance(dt, x, y, w, h); } catch (e) { this.failed(e.message); }
  }
  draw(x: number, y: number, w: number, h: number): void {
    if (this.stack.length === 0) return;   // nothing is laid out before the first update
    try { this.paint(x, y, w, h); this.faults = 0; } catch (e) { this.failed(e.message); }
  }
  /** The player is done: its narration stops and what it holds in the 3D renderer is freed. */
  close(): void {
    const v = this.voice;
    if (v !== null) v.stop();
    this.voice = null;
    this.views.dispose();
  }
  /** The visitor's language button, or the host's: every text changes, and the narration starts again in the new language. */
  setLanguage(lang: string): void {
    if (lang === this.lang || this.project.languages.indexOf(lang) < 0) return;
    this.lang = lang;
    for (const s of this.stack) s.setLanguage(lang);
    this.layOutDock();
    this.tell(`language ${lang}`);
    if (this.voice !== null && this.stack.length > 0) this.narrate(this.top().sequence);   // and its subtitles with it
  }

  private failed(why: string): void {
    this.faults++;
    this.fault = why;
    console.error(`museum-table: ${why}`);
    this.change = null; this.tour = null; this.paused = false; this.attracting = false; this.session = null; this.voice = null; this.cue = '';
    this.stack = [];
    this.first = this.faults < 3 ? this.home : new Sequence();
  }

  private top(): Stage { return this.stack[this.stack.length - 1]; }

  /** One line of the story log. */
  private tell(what: string): void { if (this.telling) console.log(`${this.count} ${what}`); }
  /** Logs a line when it differs from the last one said under `key`. */
  private say(key: i32, line: string): void {
    if (this.said.get(key) === line) return;
    this.said.set(key, line);
    console.log(`${this.count} ${line}`);
  }

  private stage(s: Sequence): Stage { return new Stage(this.project, s, this.colours, this.lang, this.F, this.pins, this.views); }

  /** The measure: the photographs again and again, until there are enough cards. */
  private crowd(): Sequence {
    const many = new Sequence(), photos = this.project.media.filter((m) => m.kind === 'photo');
    many.id = 'stress'; many.title = this.first.title;
    for (let i: i32 = 0; i < this.stress && photos.length > 0; i++) {
      const it = new Item();
      it.media = photos[i % photos.length].id; it.width = 300;
      it.x = 200 + (i % 6) * 300; it.y = 180 + Math.floor(i / 6) * 180;
      many.items.push(it);
    }
    return many;
  }

  /** The table is now showing `s` as its top sequence. */
  private arrived(s: Sequence): void {
    if (!this.attracting && (this.trail.length === 0 || this.trail[this.trail.length - 1] !== s.id)) this.trail.push(s.id);
    this.tell(`sequence ${s.id}`);
    this.hush();
    const t = this.tour;
    if (t !== null) { this.played = 0; this.tell(`step ${this.step + 1}/${t.path.length} ${s.id}`); this.narrate(s); }
    else if (this.visiting && !this.heard.has(s.id)) this.narrate(s);
  }

  /** Says the narration of `s`, when it has one, in the visitor's language, from its beginning. */
  private narrate(s: Sequence): void {
    this.hush();
    const m = this.project.medium(s.narration);
    if (m === null) return;
    this.heard.add(s.id);
    const v = new Narration(this.project, m, this.lang);
    if (!this.attracting) v.play();   // the attract loop is read, not heard: an empty room is left in peace
    this.voice = v; this.spoken = 0;
    this.tell(`narration ${v.file}${this.attracting ? ' (subtitles only)' : ''}`);
  }
  /** Stops the narration. */
  private hush(): void {
    const v = this.voice;
    if (v === null) return;
    v.stop();
    this.voice = null; this.cue = '';
    this.tell('narration stop');
  }

  /** Starts a guided presentation at its first sequence. */
  private present(p: Presentation): void {
    this.showBoard(false);
    this.tour = p; this.step = 0; this.played = 0; this.paused = false;
    this.tell(`presentation ${p.id} start`);
    this.layOutDock();
    this.go(p.path[0], 'fade', false);
  }
  /** Ends the presentation (`why`: end, stop): the visitor stays where it stopped. */
  private endTour(why: string): void {
    const t = this.tour;
    if (t === null) return;
    this.tour = null; this.paused = false;
    this.tell(`presentation ${t.id} ${why}`);
    this.layOutDock();
  }
  /** How long a step of a presentation lasts: the sequence's duration, else its narration and a breath, else ten seconds. */
  private stepLength(s: Sequence): number {
    if (s.duration > 0) return s.duration;
    const v = this.voice;
    return v !== null && v.length > 0 ? v.length + 1 : 10;
  }

  /** Goes to the sequence `id` through a transition (`fade`, `slide` or `none`). `overlay`: it opens over the current sequence, which waits
   *  underneath with its clock stopped. From an overlay, going to the sequence underneath closes the overlay: that sequence is found as
   *  it was left. */
  private go(id: string, transition: string, overlay: boolean): void {
    const s = this.project.sequence(id), stack = this.stack;
    if (s === null || this.change !== null) return;
    const c = new Change();
    c.kind = transition; c.before = stack.slice();
    if (stack.length > 1 && stack[0].sequence === s) c.after = [stack[0]];
    else c.after = overlay ? [stack[0], this.stage(s)] : [this.stage(s)];   // ponytail: one overlay at a time; a second one takes the place of the first
    this.top().table.opened = null;
    for (const b of this.top().buttons) b.finger = 0;
    if (transition === 'none') { this.stack = c.after; this.arrived(s); this.layOutDock(); return; }
    this.change = c;
  }

  /** Turns the texts, the panels and the buttons to a side of the table. */
  private turnTo(side: i32): void {
    const F = this.F;
    if (side === F.side) return;
    F.side = side;
    for (const s of this.stack) s.place();
    const kept = this.session;
    if (kept !== null) for (const s of kept) s.place();
    this.layOutDock();
    this.tell(`side ${F.name}`);
  }

  /** The attract loop: the presentation the project names plays by itself, without sound, again and again, over the visit set aside. */
  private attract(p: Presentation): void {
    this.endTour('stop');
    this.showBoard(false);
    this.hush();
    this.tell('attract start');
    this.session = this.stack; this.change = null;
    this.attracting = true; this.tour = p; this.step = 0; this.played = 0; this.paused = false;
    this.stack = [this.stage(this.project.sequence(p.path[0]) ?? this.home)];
    this.layOutDock();
    this.arrived(this.top().sequence);
  }
  /** A touch ends the attract loop: the visitor finds the table as it was left, or as new after the reset. */
  private wake(): void {
    this.hush();
    this.attracting = false; this.tour = null; this.change = null;
    const kept = this.session;
    this.session = null;
    this.tell(kept !== null ? `attract stop: back to ${kept[kept.length - 1].sequence.id}` : 'attract stop');
    if (kept !== null) { this.stack = kept; this.layOutDock(); }
    else { this.stack = [this.stage(this.home)]; this.layOutDock(); this.arrived(this.home); }
  }
  /** Nobody has touched the table for the time the project gives: the visit is over and everything goes back to the start. */
  private reset(): void {
    if (this.visiting) this.tell('visit end');
    this.lang = this.project.languages[0];
    this.trail = []; this.heard.clear(); this.visiting = false; this.session = null;
    this.F.side = 0;
    const m = this.board;
    if (m !== null) m.open = false;
    if (this.attracting) { for (const s of this.stack) { s.setLanguage(this.lang); s.place(); } }
    else { this.endTour('stop'); this.hush(); this.change = null; this.stack = [this.stage(this.home)]; }
    this.layOutDock();
    this.tell(`reset: sequence ${this.attracting ? this.home.id : this.top().sequence.id}, language ${this.lang}, side ${this.F.name}, ${this.trail.length} seen`);
  }
  private follow(l: Link): void {
    this.endTour('stop');
    const stack = this.stack, from = this.top().sequence.id, back = stack.length > 1 && stack[0].sequence.id === l.to;
    this.tell(back ? `close ${from} -> ${l.to} ${l.transition}` : `${l.overlay ? 'overlay' : 'link'} ${from} -> ${l.to} ${l.transition}`);
    this.go(l.to, l.transition, l.overlay);
  }

  /** The button of a point of interest: a link without a place of its own, with a fade. */
  private followPoint(to: string, point: string, medium: string): void {
    this.endTour('stop');
    this.tell(`link ${this.top().sequence.id} -> ${to} fade (point ${point} of ${medium})`);
    this.go(to, 'fade', false);
  }

  /** Puts the player's controls in the visitor's frame: at the edge the visitor stands at. */
  private layOutDock(): void {
    const project = this.project, lang = this.lang, F = this.F, stack = this.stack, board = this.board;
    const map = this.map, shut = this.shut, resume = this.resume, leave = this.leave, languages = this.languages;
    const dock: Button[] = [];
    this.dock = dock;
    if (this.attracting) return;   // the attract loop offers one thing: touch the table
    const f = sans(20), y = F.h - 50;
    let x = 48;
    const over = stack.length > 1 ? stack[1] : null;
    if (over !== null && this.tour === null) {   // an overlay that has no link back to its sequence gets a way to close: no dead end on a kiosk
      let back = false;
      for (const l of over.sequence.links) if (l.to === stack[0].sequence.id) back = true;
      if (!back) {
        shut.act = 'close'; shut.label = word('shut', lang);
        shut.w = textWidth(f, shut.label, 0) + 64; shut.x = x + shut.w / 2; shut.y = y; x += shut.w + 16;
        dock.push(shut);
      }
    }
    if (this.tour !== null) {   // a presentation: nothing to press while it plays (a touch pauses it), two buttons once it is paused
      if (this.paused) {
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

  private press(b: Button): void {
    const l = b.link, project = this.project, board = this.board;
    if (l !== null) { this.follow(l); return; }
    if (b.act === 'language') this.setLanguage(project.languages[(project.languages.indexOf(this.lang) + 1) % project.languages.length]);
    else if (b.act === 'storyboard') this.showBoard(board !== null && !board.open);
    else if (b.act === 'resume') {
      // ponytail: zinc:audio cannot pause a clip or start it in the middle, so the step is played again from its beginning
      this.paused = false; this.played = 0;
      this.tell('presentation resume');
      this.layOutDock();
      this.narrate(this.top().sequence);
    } else if (b.act === 'leave') this.endTour('stop');
    else if (b.act === 'close') { this.tell(`close ${this.top().sequence.id} -> ${this.stack[0].sequence.id} fade`); this.go(this.stack[0].sequence.id, 'fade', false); }
    else if (b.act.startsWith('present ')) {
      for (const p of project.presentations) if (b.act === `present ${p.id}`) { this.present(p); break; }
    }
  }

  private showBoard(open: boolean): void {
    const m = this.board;
    if (m === null || m.open === open) return;
    m.open = open;
    this.top().table.opened = null;
    this.layOutDock();
    this.tell(open ? 'storyboard open' : 'storyboard close');
  }
  /** A touch on a node of the storyboard: the visitor goes there, from wherever they are. */
  private jump(s: Sequence): void {
    this.showBoard(false);
    if (this.stack.length === 1 && this.top().sequence === s) return;
    this.endTour('stop');
    this.tell(`jump ${this.top().sequence.id} -> ${s.id}`);
    this.go(s.id, 'fade', false);
  }

  /** The finger `id` lifted at (fx, fy) of the frame: the button it was pressing is pressed if the finger is still on it. */
  private released(id: i32, fx: number, fy: number): void {
    for (const b of this.dock.concat(this.top().buttons)) {
      if (b.finger !== id) continue;
      b.finger = 0;
      if (b.takes(fx, fy)) this.press(b);
      return;
    }
  }

  /** How long the top sequence lasts before its `next` (0: it stays until the visitor moves on). */
  private lasts(s: Sequence): number { return s.duration; }

  /** Where the table is in the rectangle the player has. */
  private lay(x: number, y: number, w: number, h: number): void {
    const T = this.T;
    this.k = Math.min(w / T.width, h / T.height);
    this.ox = x + (w - T.width * this.k) / 2; this.oy = y + (h - T.height * this.k) / 2;
    this.boxX = x; this.boxY = y; this.boxW = w; this.boxH = h;
  }

  /** The time and the touches of one frame. */
  private advance(dt: number, x: number, y: number, w: number, h: number): void {
    const project = this.project, T = this.T, K = this.K, F = this.F, fingers = this.fingers;
    this.started = clock();
    if (this.stack.length === 0) {   // a sequence is laid out on the first frame: images exist once the frame loop runs
      this.stack = [this.stage(this.stress > 0 ? this.crowd() : this.first)];
      this.board = new Storyboard(project, this.colours, F);
      this.layOutDock();
      this.arrived(this.top().sequence);
    }
    this.lay(x, y, w, h);
    const k = this.k, ox = this.ox, oy = this.oy;
    this.now += dt; this.dt = dt;
    fingers.update(dt, ox, oy, k, (x - ox) / k, (y - oy) / k, w / k, h / k);
    // nobody at the table: the attract loop after a while, then the visit is forgotten. A presentation a visitor watches is not idleness.
    if (fingers.down.length > 0) this.idle = 0; else if (this.attracting || this.tour === null || this.paused) this.idle += dt;
    if (this.attracting && fingers.down.length > 0) {
      for (const f of fingers.down) f.owner = NOTHING;
      this.wake();
    }
    if (!this.visiting && fingers.down.length > 0) {   // the first touch of a visit: the narration of the sequence on the table begins
      this.visiting = true;
      this.tell('visit start');
      if (this.tour === null && !this.heard.has(this.top().sequence.id)) this.narrate(this.top().sequence);
    }
    if (K.resetAfter > 0 && this.idle >= K.resetAfter && (this.visiting || this.session !== null || F.side !== 0)) this.reset();
    if (!this.attracting && K.attractAfter > 0 && this.idle >= K.attractAfter) {
      for (const p of project.presentations) if (p.id === K.attract) { this.attract(p); break; }
    }
    // a tap, or a press on a button, near an edge: the texts turn to that edge once this frame's touches are dealt with
    let turn: i32 = -1;
    for (const f of fingers.lifted) {
      if (!(f.tapped || f.owner === BUTTON)) continue;
      if (Math.min(Math.min(f.x, T.width - f.x), Math.min(f.y, T.height - f.y)) <= this.TURN) turn = F.nearest(f.x, f.y);
    }
    const speaking = this.voice;
    if (speaking !== null) {
      this.spoken += dt;
      const text = speaking.at(this.spoken);
      if (text !== this.cue) { this.cue = text; if (text.length > 0) this.tell(`subtitle ${text}`); }
      if (this.spoken > speaking.length + 0.5) { this.voice = null; this.cue = ''; this.tell('narration end'); }
    }

    const c = this.change, plan = this.board;
    plan?.update(dt);
    if (c !== null) {   // nothing answers to a touch while the table changes
      for (const f of fingers.down) if (f.fresh) f.owner = NOTHING;
      c.p += dt / (c.kind === 'slide' ? SLIDE : FADE);
      if (c.p >= 0.5 && this.stack !== c.after) { this.stack = c.after; this.arrived(this.top().sequence); this.layOutDock(); }
      if (c.p >= 1) this.change = null;
    } else if (this.tour !== null && !this.paused) {   // a presentation plays by itself: a touch pauses it, and does nothing else
      let touched = false;
      for (const f of fingers.down) if (f.fresh) { f.owner = NOTHING; touched = true; }
      const t = this.tour, on = this.top();
      on.update(dt, fingers, this.now);
      this.played += dt;
      if (touched) {
        this.paused = true;
        this.tell('presentation pause');
        this.hush();
        this.layOutDock();
      } else if (this.played >= this.stepLength(on.sequence)) {
        this.step++;
        if (this.step >= t.path.length && this.attracting) this.step = 0;   // the attract loop starts again
        if (this.step >= t.path.length) this.endTour('end');
        else this.go(t.path[this.step], 'fade', false);
      }
    } else if (plan !== null && plan.open) {   // the storyboard is over the table: a touch on a node goes there, a touch beside it closes it
      for (const f of fingers.down) {
        if (!f.fresh || f.owner !== 0) continue;
        f.owner = BOARD;
        for (const b of this.dock) if (b.finger === 0 && b.takes(F.x(f.x, f.y), F.y(f.x, f.y))) { f.owner = BUTTON; b.finger = f.id; break; }
      }
      for (const f of fingers.lifted) {
        if (f.owner === BOARD) {
          const node = plan.nodeAt(F.x(f.x, f.y), F.y(f.x, f.y));
          if (node !== null) this.jump(node); else this.showBoard(false);
        } else if (f.owner === BUTTON) this.released(f.id, F.x(f.x, f.y), F.y(f.x, f.y));
      }
    } else {
      const on = this.top();
      // who takes the fingers that landed: the full view when it is open, else a button, else the card or the view under them
      for (const f of fingers.down) {
        if (!f.fresh || f.owner !== 0) continue;
        if (on.table.opened !== null) { f.owner = FULL; continue; }
        const fx = F.x(f.x, f.y), fy = F.y(f.x, f.y);
        for (const b of this.dock.concat(on.offered())) if (b.finger === 0 && b.takes(fx, fy)) { f.owner = BUTTON; b.finger = f.id; break; }
      }
      const viewing: Card | null = on.table.opened;
      on.update(dt, fingers, this.now);
      for (const f of fingers.down) if (f.fresh && f.owner === 0) f.owner = NOTHING;
      for (const f of fingers.lifted) {
        if (f.owner === FULL && viewing !== null) on.table.opened = null;
        if (f.owner === BUTTON) this.released(f.id, F.x(f.x, f.y), F.y(f.x, f.y));
      }
      // a hotspot on a card, the button of a panorama's point
      const spot = on.table.followed, window = on.lookout, thing = on.viewer;
      if (spot !== null) { on.table.followed = null; this.follow(spot); }
      else if (window !== null && window.followed.length > 0) { this.followPoint(window.followed, window.opened?.id ?? '-', window.media.id); window.followed = ''; }
      else if (thing !== null && thing.followed.length > 0) { this.followPoint(thing.followed, thing.opened?.id ?? '-', thing.media.id); thing.followed = ''; }
      // the end of a sequence that has a `next`: it gives way, once no hand is on the table
      const s = on.sequence, length = this.lasts(s);
      if (this.tour === null && this.change === null && this.stack[this.stack.length - 1] === on && s.next.length > 0 && length > 0 && on.t >= length && fingers.down.length === 0) {
        this.tell(`next ${s.id} -> ${s.next}`);
        this.go(s.next, 'fade', false);
      }

      // a desk without a touch screen: the wheel and the trackpad zoom the card under the pointer, with Shift the wheel turns it
      const notches = wheel(), spread = pinch(), object = on.viewer;
      if (notches !== 0 || spread !== 1) {
        const turning = (modifiers() & Mod.Shift) !== 0, px = (pointerX() - ox) / k, py = (pointerY() - oy) / k;
        if (object !== null && object.inside(px, py) && on.table.cardAt(px, py) === null) object.closer(Math.pow(1.1, notches) * spread);
        else if (on.lookout !== null && on.lookout.inside(px, py) && on.table.cardAt(px, py) === null) on.lookout.view.zoom(Math.pow(1.1, notches) * spread);
        else on.table.nudge(px, py, turning ? 1 : Math.pow(1.1, notches) * spread, turning ? notches * 0.09 : 0);
      }
      if (this.stress > 0) this.stir(this.now);
    }

    if (turn >= 0) this.turnTo(turn);
  }

  /** Draws the frame, over the table's colour which the owner of the window has put there. */
  private paint(x: number, y: number, w: number, h: number): void {
    this.lay(x, y, w, h);
    const k = this.k, ox = this.ox, oy = this.oy, F = this.F, stack = this.stack, fingers = this.fingers, plan = this.board;
    for (const s of stack) s.quiet = this.tour !== null && !this.paused;
    const moving = this.change;
    if (moving === null) this.drawStack(stack, ox, oy, k, 1, 0);
    else this.drawChange(moving, ox, oy, k);
    const full = this.top().table.opened;
    F.on(ox, oy, k);
    if (full !== null) this.drawFullView(full, k);
    plan?.draw(k, this.lang, this.top().sequence.id, this.trail);
    this.drawSubtitle(k);
    this.drawTour(k);
    this.drawDock(k);
    F.off();
    this.drawEdges(ox, oy, k);
    for (const f of fingers.down) border(ox + (f.x - 30) * k, oy + (f.y - 30) * k, 60 * k, 60 * k, 30 * k, Math.max(1, 2 * k), this.colours.accent, 150);   // where the table feels a finger

    if (this.logging) this.report();
    const object = this.top().viewer;
    if (this.timing && object !== null && object.drawn === 120) {
      console.log(`the object is drawn in ${(object.spent / object.drawn).toFixed(2)} ms (${Math.round(object.w * k)} x ${Math.round(object.h * k)} pixels)`);
      object.spent = 0; object.drawn = 0;
    }
    this.count++;
    if (this.stress > 0) {
      this.spent += clock() - this.started; this.elapsed += this.dt; this.counted++;
      if (this.counted === 120) {
        console.log(`${this.top().table.cards.length} cards moving: ${(this.spent / this.counted).toFixed(2)} ms of the program per frame, ${(this.counted / this.elapsed).toFixed(1)} frames per second`);
        this.spent = 0; this.elapsed = 0; this.counted = 0;
      }
    }
  }

  /** The cards, the object and the panorama of the top sequence, a line for each that changed. */
  private report(): void {
    const on = this.top(), object = on.viewer, window = on.lookout;
    for (const c of on.table.cards) {
      const p = c.pose;
      this.say(c.uid, `${c.media.id} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} scale=${p.scale.toFixed(4)} angle=${(p.angle * 180 / Math.PI).toFixed(2)} fingers=${c.held} face=${c.turn.toFixed(2)}`);
    }
    if (object !== null) {
      this.say(-1, `view yaw=${object.yaw.toFixed(2)} pitch=${object.pitch.toFixed(2)} distance=${object.reach.toFixed(3)} pan=${object.panX.toFixed(4)},${object.panY.toFixed(4)} light=${object.light} open=${object.opened?.id ?? '-'}`);
      for (let i: i32 = 0; i < object.media.points.length; i++) {
        object.locate(object.media.points[i].at);
        this.say(-2 - i, `point ${object.media.points[i].id} at ${object.px.toFixed(1)} ${object.py.toFixed(1)} ${object.pfacing ? 'facing' : 'behind'}`);
      }
    }
    if (window !== null) {
      this.say(-50, `look yaw=${window.view.yaw.toFixed(1)} pitch=${window.view.pitch.toFixed(1)} fov=${window.view.fov.toFixed(1)} open=${window.opened?.id ?? '-'}`);
      for (let i: i32 = 0; i < window.media.points.length; i++) {
        const at = window.locate(window.media.points[i]);
        this.say(-51 - i, `mark ${window.media.points[i].id} ${at.length === 2 ? `at ${Math.round(at[0])} ${Math.round(at[1])}` : 'out of sight'}`);
      }
    }
  }

  /** The measure: every card wanders, turns and breathes by itself, as if a hand held it. */
  private stir(t: number): void {
    const cards = this.top().table.cards, T = this.T;
    for (let i: i32 = 0; i < cards.length; i++) {
      const c = cards[i], p = c.pose;
      p.x = T.width / 2 + Math.sin(t * 0.7 + i) * (T.width / 2 - 200);
      p.y = T.height / 2 + Math.cos(t * 0.9 + i * 1.7) * (T.height / 2 - 160);
      p.angle = t * 0.5 + i;
      p.scale = 1 + 0.1 * Math.sin(t + i);
      c.held = 1;
    }
  }

  /** Covers the player's rectangle with the table's colour, at an opacity of 0 to 255: what dims a sequence, and a fade. */
  private veil(alpha: i32): void { rrect(this.boxX, this.boxY, this.boxW, this.boxH, 0, this.colours.background, alpha); }

  /** Draws sequences one over the other: the first as it is, the next ones over a table dimmed by `dim` (0 to 1) and moved `shift` table
   *  widths to the right. */
  private drawStack(stages: Stage[], ox: number, oy: number, k: number, dim: number, shift: number): void {
    for (let i = 0; i < stages.length; i++) {
      if (i > 0) this.veil(Math.round(DIM * dim));
      stages[i].draw(ox + (i > 0 ? shift * this.T.width * k : 0), oy, k, i < stages.length - 1);
    }
  }

  /** A transition. Fade: the table goes dark, changes, and comes back. Slide: the new sequence pushes the old one out to the left; an
   *  overlay comes in from the right over its sequence, and leaves the same way. */
  private drawChange(c: Change, ox: number, oy: number, k: number): void {
    if (c.kind !== 'slide') {
      this.drawStack(c.p < 0.5 ? c.before : c.after, ox, oy, k, 1, 0);
      this.veil(Math.round(255 * (1 - Math.abs(1 - 2 * c.p))));
      return;
    }
    const e = c.p * c.p * (3 - 2 * c.p), wide = this.T.width * k;
    if (c.before[0] === c.after[0]) {   // the sequence underneath stays: only the overlay moves
      const opening = c.after.length > c.before.length;
      this.drawStack(opening ? c.after : c.before, ox, oy, k, opening ? e : 1 - e, opening ? 1 - e : e);
    } else {
      this.drawStack(c.before, ox - e * wide, oy, k, 1, 0);
      this.drawStack(c.after, ox + (1 - e) * wide, oy, k, 1, 0);
    }
  }

  /** What the narration is saying, at the visitor's edge above the buttons: one line, or two of about the same length. */
  private drawSubtitle(k: number): void {
    const cue = this.cue, F = this.F, colours = this.colours;
    if (cue.length === 0) return;
    const f = sans(24 * k), room = Math.min(1200, F.w - 160) * k, full = textWidth(f, cue, 0);
    const lines = full <= room ? [cue] : wrap(f, cue, Math.min(room, full * 0.56), 3);
    let w = 0;
    for (const line of lines) w = Math.max(w, textWidth(f, line, 0));
    const h = lines.length * leading(f) + 20 * k, x = F.ox + (F.w * k - w) / 2, y = F.oy + (F.h - (F.w < this.T.width ? 162 : 86)) * k - h;
    rrect(x - 26 * k, y, w + 52 * k, h, 14 * k, colours.background, 225);
    for (let i = 0; i < lines.length; i++) drawText(f, F.ox + (F.w * k - textWidth(f, lines[i], 0)) / 2, y + 10 * k + i * leading(f), lines[i], colours.text, 255, 0);
  }

  /** A presentation: its timeline at the visitor's edge, a segment for each step, and while it plays where it is and how to stop it. */
  private drawTour(k: number): void {
    const t = this.tour, F = this.F, colours = this.colours, step = this.step;
    if (t === null) return;
    const n = t.path.length, gap = 6 * k, left = F.ox + 48 * k, wide = (F.w - 96) * k, each = (wide - gap * (n - 1)) / n, y = F.oy + (F.h - 12) * k, h = Math.max(2, 4 * k);
    const length = this.change === null ? this.stepLength(this.top().sequence) : 0;
    for (let i = 0; i < n; i++) {
      const x = left + i * (each + gap), part = i < step ? 1 : i > step || length <= 0 ? 0 : Math.min(1, this.played / length);
      rrect(x, y, each, h, h / 2, colours.muted, 90);
      if (part > 0) rrect(x, y, Math.max(h, each * part), h, h / 2, colours.accent, 255);
    }
    if (this.paused || this.attracting) return;
    const f = sans(20 * k), label = `${this.project.say(t.title, this.lang)} · ${step + 1}/${n} · ${word('pause-hint', this.lang)}`, w = textWidth(f, label, 0) + 90 * k, bh = 56 * k;
    const x = F.ox + 48 * k, y0 = F.oy + (F.h - 50) * k - bh / 2;
    rrect(x, y0, w, bh, bh / 2, colours.background, 235);
    polygon([x + 30 * k, y0 + bh / 2 - 9 * k, x + 45 * k, y0 + bh / 2, x + 30 * k, y0 + bh / 2 + 9 * k], colours.accent, 255);
    drawText(f, x + 58 * k, y0 + (bh - leading(f)) / 2 + k, label, colours.muted, 255, 0);
  }

  /** The player's controls, over everything, in the visitor's frame (which is on). */
  private drawDock(k: number): void {
    const F = this.F, colours = this.colours;
    for (const b of this.dock) {
      if (b !== this.languages) { drawButton(b, F, k, colours); continue; }
      // the language button: every language, the current one bright
      const f = sans(20 * k), x = F.ox + (b.x - b.w / 2) * k, y = F.oy + (b.y - b.h / 2) * k, w = b.w * k, h = b.h * k, held = b.finger !== 0;
      rrect(x, y, w, h, h / 2, held ? colours.accent : colours.background, held ? 255 : 235);
      border(x, y, w, h, h / 2, Math.max(1, 1.5 * k), colours.accent, 255);
      let tx = x + 26 * k;
      for (const code of this.project.languages) {
        drawText(f, tx, y + (h - leading(f)) / 2 + k, code.toUpperCase(), code === this.lang ? (held ? colours.background : colours.accent) : colours.muted, 255, 0);
        tx += 46 * k;
      }
    }
  }

  /** What is written at the edges the visitor is not at, each turned to its own side: during the attract loop the invitation, at every
   *  edge; else a mark that says a touch there turns the table to that side. */
  private drawEdges(ox: number, oy: number, k: number): void {
    const attracting = this.attracting, edge = this.edge, colours = this.colours;
    const label = word(attracting ? 'begin' : 'turn', this.lang);
    for (let side: i32 = 0; side < 4; side++) {
      if (side === this.F.side && !attracting) continue;
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
  private drawFullView(c: Card, k: number): void {
    const F = this.F, colours = this.colours, project = this.project, lang = this.lang;
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
}
