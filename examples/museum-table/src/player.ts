// Museum table: the player. Everything it shows comes from a project (docs/museum-table-format.md). It plays the project the
// way Klynt's player plays a story: one sequence on the table at a time (stage.ts), with its timed media; links (buttons, hotspots on a
// medium, the button of a point of interest) lead to other sequences through a transition, or open one over the current sequence, which
// waits underneath; a sequence with a `next` gives way by itself at its end. The storyboard (storyboard.ts) is the map of the story: it
// shows where the visitor has been and a touch on a node goes there. A guided presentation plays a path of sequences by itself, each for
// its duration, with its narration (narration.ts) and subtitles; a touch pauses it.
// It is made for a table, with one or two visitors around it sharing one story: the texts, the panels and the buttons are laid out in the
// frame of the visitor (frame.ts) and turn to the side of the table of the last tap near an edge, while the cards stay free. When nobody
// touches the table the attract loop plays, then the visit is forgotten; nothing leads out of the player and no error is shown. A table
// that keeps statistics (stats.ts) counts what each visit saw, and shows the day's counts to the staff: two fingers held in two opposite
// corners.
// The player is a class given a project and, each frame, the rectangle of the window it has: the table's app (main.ts) gives it its whole
// window, the storyboard editor (../editor/preview.tsx) a pane of its own window, or a second window. It reads the touches and the mouse
// of the window being drawn and the files of the project through files.ts; whoever owns the window clears it.
import { rect, rrect, border, polygon, drawImage, drawText, textWidth, imageWidth, imageHeight, wheel, pinch, pointerX, pointerY, modifiers, Mod } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Project, Sequence, Item, Link, Media, Presentation, Colours, Table, Kiosk, spokenDescription } from './project';
import { Fingers, Finger } from './touch';
import { Card } from './table';
import { Stage, Views } from './stage';
import { Button, drawButton, setInRows, rowWidth } from './button';
import { Frame } from './frame';
import { Storyboard } from './storyboard';
import { Narration } from './narration';
import { sans, bold, wrap, leading, setReading, reading, faint, clipped } from './type';
import { word } from './words';
import { Statistics, Counts } from './stats';

/** Owner numbers of the fingers that are not on a card or a view: the full view, a button, the storyboard. */
const FULL: i32 = 1, BUTTON: i32 = 2, BOARD: i32 = 5, STAFF: i32 = 6, NOTHING: i32 = -1;
/** The staff's gesture: two fingers this close to two opposite corners (table units), held this many seconds. */
const CORNER = 40, HOLD = 3;
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
  /** Prints where every control is, each time one moves: the side the visitor is at, the text size, the place of each control on the
   *  table, and how many texts did not fit where they are written (the tests check a visitor's reach, and that nothing is clipped). */
  checking = false;
  /** Puts a red ball on every point of interest of the object (the test of their projection). Set before the first frame. */
  pins = false;
  /** Prints the time the 3D object takes to draw. */
  timing = false;
  /** Lays out that many cards, keeps them moving and prints the frame time. Set before the first frame. */
  stress: i32 = 0;
  /** The last fault ('' for none): what `frame` caught, for whoever shows the player to an author instead of a visitor. */
  fault = '';
  /** What counts the visits, on a table that keeps statistics (null: nothing is counted). Set before the first frame. */
  counting: Statistics | null = null;

  /** The colours the whole player draws with: those of the theme, or of the high contrast. */
  private colours = new Colours();
  /** The visitor's settings, kept for the visit: the text size (which of the project's `textSizes`) and the high contrast. */
  private size: i32 = 0;
  private contrast = false;
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
  /** The 3D views made so far: the visit's, and the attract loop's own, so that the loop leaves an object and a panorama as the visitor
   *  turned them (the model and the image are then loaded twice: once for each). */
  private views = new Views();
  private shows = new Views();

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
  /** The medium whose audio description is being said instead ('' for none). */
  private described = '';
  /** The card seen in full at the last frame, and where its picture is on the screen: [x, y, w, h]. */
  private viewed: Card | null = null;
  private picture: number[] = [];
  /** The boxes of the subtitle and of the full view's credit as drawn at the last frame, in frame units ([] for none). */
  private caption: number[] = [];
  private credit: number[] = [];
  /** The sequences whose narration this visit has heard: outside a presentation a narration is not said twice to the same visitor. */
  private heard = new Set<string>();
  /** Whether a visitor has touched the table: the narration of the first sequence waits for them. */
  private visiting = false;
  /** Seconds since a hand was on the table; whether the attract loop plays; the visit set aside under it until the reset. */
  private idle = 0;
  private attracting = false;
  private session: Stage[] | null = null;
  /** The staff's summary: the seconds their gesture has been held, the counts of the day while they are shown, and the points of
   *  interest open at the last frame (the object's, the panorama's), which are counted as they open. */
  private gesture = 0;
  private summary: Counts | null = null;
  private pointed: string[] = ['', ''];

  /** The player's own controls, in the visitor's frame. */
  private languages = new Button();
  private map = new Button();
  private resume = new Button();
  private leave = new Button();
  private shut = new Button();
  private letters = new Button();
  private tones = new Button();
  private teller = new Button();
  /** A project with more than two guided visits has one button for them all, which opens their list. */
  private tours = new Button();
  private listing = false;
  private dock: Button[] = [];
  /** The top of those controls, in the frame. */
  private floor = 0;

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
    this.wear();
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
    this.read();
    try { this.advance(dt, x, y, w, h); this.paint(x, y, w, h); this.faults = 0; } catch (e) { this.failed(e.message); }
    setReading(1, false);
  }
  /** The two halves of `frame`, for a host that draws at another moment than it counts time (a canvas of zinc:ui). */
  update(dt: number, x: number, y: number, w: number, h: number): void {
    this.read();
    try { this.advance(dt, x, y, w, h); } catch (e) { this.failed(e.message); }
    setReading(1, false);
  }
  draw(x: number, y: number, w: number, h: number): void {
    if (this.stack.length === 0) return;   // nothing is laid out before the first update
    this.read();
    try { this.paint(x, y, w, h); this.faults = 0; } catch (e) { this.failed(e.message); }
    setReading(1, false);
  }
  /** The player is done: its narration stops and what it holds in the 3D renderer is freed. */
  close(): void {
    const v = this.voice;
    if (v !== null) v.stop();
    this.voice = null;
    this.show([]);
    this.views.dispose(); this.shows.dispose();
  }
  /** The host changes the language, as the visitor's button does. */
  setLanguage(lang: string): void {
    this.read();
    this.speak(lang);
    setReading(1, false);
  }

  /** What is laid out and drawn from now on is at the visitor's text size and contrast (type.ts), until the player hands back. */
  private read(): void { setReading(this.project.accessibility.textSizes[this.size], this.contrast); }
  /** Puts on the colours of the theme, or those of the high contrast: every part of the player draws with this one object. */
  private wear(): void {
    const c = this.colours, from: Colours = this.contrast ? this.project.accessibility.highContrast : this.project.theme;
    c.background = from.background; c.paper = from.paper; c.ink = from.ink; c.text = from.text; c.muted = from.muted; c.accent = from.accent;
  }

  /** Every text changes, and the narration starts again in the new language. */
  private speak(lang: string): void {
    if (lang === this.lang || this.project.languages.indexOf(lang) < 0) return;
    this.lang = lang;
    for (const s of this.stack) s.setLanguage(lang);
    this.layOutDock();
    this.tell(`language ${lang}`);
    const told = this.described;
    if (told.length > 0) { this.hush(); this.describe(this.project.medium(told)); }
    else if (this.voice !== null && this.stack.length > 0) this.narrate(this.top().sequence);   // and its subtitles with it
  }

  private failed(why: string): void {
    this.faults++;
    this.fault = why;
    console.error(`museum-table: ${why}`);
    this.change = null; this.tour = null; this.paused = false; this.attracting = false; this.session = null; this.voice = null; this.cue = '';
    for (const s of this.stack) s.table.rest();
    this.stack = [];
    this.first = this.faults < 3 ? this.home : new Sequence();
  }

  private top(): Stage { return this.stack[this.stack.length - 1]; }
  /** Puts these sequences on the table. The ones that leave it, or now wait under another, rest: their films stop. */
  private show(stack: Stage[]): void {
    const top: Stage | null = stack.length > 0 ? stack[stack.length - 1] : null;
    for (const s of this.stack) if (s !== top) { s.table.rest(); this.hear(s); }
    this.stack = stack;
  }
  /** Tells the story what happened to the films of a sequence. */
  private hear(s: Stage): void {
    for (const line of s.table.news) this.tell(line);
    s.table.news = [];
  }

  /** One line of the story log. */
  private tell(what: string): void { if (this.telling) console.log(`${this.count} ${what}`); }
  /** Logs a line when it differs from the last one said under `key`. */
  private say(key: i32, line: string): void {
    if (this.said.get(key) === line) return;
    this.said.set(key, line);
    console.log(`${this.count} ${line}`);
  }

  private stage(s: Sequence): Stage {
    const made = new Stage(this.project, s, this.colours, this.lang, this.F, this.pins, this.attracting ? this.shows : this.views);
    made.settle(this.floor, this.dock);
    return made;
  }

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
    if (this.visiting && !this.attracting) this.counting?.note('sequence', s.id);
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
  /** Stops the narration, or the audio description being said. */
  private hush(): void {
    const v = this.voice;
    if (v === null) return;
    v.stop();
    this.voice = null; this.cue = '';
    this.tell(this.described.length > 0 ? 'description stop' : 'narration stop');
    this.silence();
  }
  /** No audio description is being said any more: its button offers it again. */
  private silence(): void {
    if (this.described.length === 0) return;
    this.described = '';
    this.layOutDock();
  }
  /** Says the audio description of a medium in the visitor's language, with its subtitles, in place of the narration; asked again
   *  while it is said, stops it. */
  private describe(m: Media | null): void {
    const again = m !== null && m.id === this.described;
    this.hush();
    const said = m !== null && !again ? spokenDescription(this.project, m) : null;
    if (m === null || said === null) return;
    const v = new Narration(this.project, said, this.lang);
    v.play();
    this.voice = v; this.spoken = 0; this.described = m.id;
    this.counting?.note('description', m.id);
    this.tell(`description ${m.id} ${v.file.length > 0 ? v.file : '(subtitles only)'}`);
    this.layOutDock();
  }

  /** Starts a guided presentation at its first sequence. */
  private present(p: Presentation): void {
    this.showBoard(false);
    this.tour = p; this.step = 0; this.played = 0; this.paused = false;
    this.tell(`presentation ${p.id} start`);
    this.counting?.note('presentation', p.id);
    this.layOutDock();
    this.go(p.path[0], 'fade', false);
  }
  /** Ends the presentation (`why`: end, stop): the visitor stays where it stopped. */
  private endTour(why: string): void {
    const t = this.tour;
    if (t === null) return;
    this.tour = null; this.paused = false;
    this.tell(`presentation ${t.id} ${why}`);
    if (why === 'end') this.counting?.note('presentation-ended', t.id);
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
    if (transition === 'none') { this.show(c.after); this.arrived(s); this.layOutDock(); return; }
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
    this.show([this.stage(this.project.sequence(p.path[0]) ?? this.home)]);
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
    if (kept !== null) { this.show(kept); this.layOutDock(); }
    else { this.show([this.stage(this.home)]); this.layOutDock(); this.arrived(this.home); }
  }
  /** Nobody has touched the table for the time the project gives: the visit is over and everything goes back to the start. */
  private reset(): void {
    if (this.visiting) this.tell('visit end');
    this.counting?.end(this.lang);
    this.summary = null; this.listing = false;
    this.size = 0; this.contrast = false;
    this.wear(); this.read();
    this.lang = this.project.languages[0];
    this.trail = []; this.heard.clear(); this.visiting = false; this.session = null;
    this.F.side = 0;
    const m = this.board;
    if (m !== null) m.open = false;
    if (this.attracting) { for (const s of this.stack) { s.setLanguage(this.lang); s.place(); } }
    else { this.endTour('stop'); this.hush(); this.change = null; this.show([this.stage(this.home)]); }
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

  /** Puts the player's controls in the visitor's frame, at the edge the visitor stands at: what leads somewhere on the left, the
   *  visitor's settings on the right, in one row when both fit and else the settings at the edge and the rest in rows above. The sequences
   *  on the table then lay their own buttons out above and beside them. */
  private layOutDock(): void {
    const project = this.project, lang = this.lang, F = this.F, stack = this.stack, board = this.board;
    const map = this.map, shut = this.shut, resume = this.resume, leave = this.leave, languages = this.languages;
    const left: Button[] = [], right: Button[] = [], s = reading(), h = 56 * s, y = F.h - 22 - h / 2;
    this.dock = [];
    this.floor = y - h / 2;
    if (!this.attracting) {   // the attract loop offers one thing: touch the table
      const over = stack.length > 1 ? stack[1] : null, full = stack.length > 0 ? this.top().table.opened : null;
      if (full === null && over !== null && this.tour === null) {   // an overlay that has no link back to its sequence gets a way to close: no dead end on a kiosk
        let back = false;
        for (const l of over.sequence.links) if (l.to === stack[0].sequence.id) back = true;
        if (!back) { shut.act = 'close'; shut.label = word('shut', lang); left.push(shut); }
      }
      if (full !== null) {   // a picture seen in full: a way to close it and, when it has one, its audio description
        const teller = this.teller, said = this.described === full.media.id;
        shut.act = 'full-close'; shut.label = word('shut', lang); left.push(shut);
        if (full.media.audioDescription.size > 0) {
          teller.act = `describe ${full.media.id}`; teller.play = !said; teller.label = word(said ? 'describe-stop' : 'describe', lang);
          left.push(teller);
        }
      } else if (this.tour !== null) {   // a presentation: nothing to press while it plays (a touch pauses it), two buttons once it is paused
        if (this.paused) {
          resume.act = 'resume'; resume.play = true; resume.label = word('resume', lang);
          leave.act = 'leave'; leave.label = word('leave', lang);
          left.push(resume); left.push(leave);
        }
      } else {
        if (project.sequences.length > 1) {
          map.act = 'storyboard';
          map.label = word(board !== null && board.open ? 'map-close' : 'map-button', lang);
          left.push(map);
        }
        if (project.presentations.length > 2) {   // one button for them all: a touch opens their list
          const tours = this.tours;
          tours.act = 'tours'; tours.play = true; tours.label = word('tours', lang);
          left.push(tours);
        } else for (const p of project.presentations) left.push(this.offer(p));
      }
      for (const b of left) b.fit();
      // the visitor's settings: the text size (a letter for each size the project offers), the high contrast, the language
      const sizes = project.accessibility.textSizes, letters = this.letters, tones = this.tones;
      if (sizes.length > 1) { letters.act = 'text'; letters.w = (44 + 34 * Math.min(sizes.length, 4)) * s; letters.h = h; right.push(letters); }
      tones.act = 'contrast'; tones.w = 118 * s; tones.h = h; right.push(tones);
      if (project.languages.length > 1) {
        languages.act = 'language';
        languages.w = (44 + 46 * project.languages.length) * s; languages.h = h;
        right.push(languages);
      }
      const room = F.w - 96, wide = rowWidth(right, 16), apart = right.length > 0 && rowWidth(left, 16) + 32 + wide > room;
      setInRows(right, F.w - 48 - wide, y, room, 16, false);
      if (left.length > 0) this.floor = setInRows(left, 48, apart ? y - h - 16 : y, room, 16, false);
      this.dock = left.concat(right);
      const tours = this.tours;
      if (this.listing && left.indexOf(tours) >= 0) {   // the guided visits one above the other over their button, the first on top
        let top = tours.y - tours.h / 2;
        for (let i = project.presentations.length - 1; i >= 0; i--) {
          const b = this.offer(project.presentations[i]);
          b.fit();
          b.x = tours.x - tours.w / 2 + b.w / 2; b.y = top - 12 - b.h / 2;
          top = b.y - b.h / 2;
          this.dock.push(b);
        }
      } else this.listing = false;
    }
    // under the storyboard the sequence keeps its layout: the map's own button is not in the way of its links
    if (board !== null && board.open) return;
    for (const on of stack) { on.described = this.described; on.settle(this.floor, this.dock); }
  }

  /** The button of a guided visit. */
  private offer(p: Presentation): Button {
    const b = new Button();
    b.act = `present ${p.id}`; b.play = true; b.label = this.project.say(p.title, this.lang);
    return b;
  }

  /** The visitor's settings have changed: the colours are put on, and everything written is laid out again at the text size. */
  private restyle(): void {
    this.wear(); this.read();
    for (const on of this.stack) on.resize();
    const kept = this.session;
    if (kept !== null) for (const on of kept) on.resize();
    this.layOutDock();
  }

  private press(b: Button): void {
    const l = b.link, project = this.project, board = this.board;
    if (b.act === 'tours') { this.listing = !this.listing; this.layOutDock(); this.tell(`presentations ${this.listing ? 'open' : 'close'}`); return; }
    if (this.listing) { this.listing = false; this.layOutDock(); }
    if (l !== null) { this.follow(l); return; }
    if (b.act === 'language') this.speak(project.languages[(project.languages.indexOf(this.lang) + 1) % project.languages.length]);
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
    } else if (b.act === 'text') {
      const sizes = project.accessibility.textSizes;
      this.size = (this.size + 1) % sizes.length;
      this.restyle();
      this.tell(`text size ${sizes[this.size]}`);
    } else if (b.act === 'contrast') {
      this.contrast = !this.contrast;
      this.restyle();
      this.tell(`contrast ${this.contrast ? 'on' : 'off'}`);
    } else if (b.act === 'full-close') this.top().table.opened = null;
    else if (b.act.startsWith('describe ')) this.describe(project.medium(b.act.slice(9)));
    else {   // a button of the object or of the panorama
      const on = this.top(), v = on.viewer;
      on.press(b.act);
      if (b.act.startsWith('next ')) {
        const open = v !== null && b.act === `next ${v.media.id}` ? v.opened : on.lookout?.opened ?? null;
        this.tell(`point ${open !== null ? open.id : '-'} of ${b.act.slice(5)}`);
      }
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
      this.counting?.begin(this.top().sequence.id);
      if (this.tour === null && !this.heard.has(this.top().sequence.id)) this.narrate(this.top().sequence);
    }
    this.staff(dt);
    const stats = this.counting;
    if (stats !== null && this.visiting && !this.attracting) {   // the time counts up to the last touch, or while a presentation is watched
      stats.pass(dt, this.top().sequence.id);
      if (fingers.down.length > 0 || (this.tour !== null && !this.paused)) stats.touched();
    }
    if (K.resetAfter > 0 && this.idle >= K.resetAfter && (this.visiting || this.session !== null || F.side !== 0)) this.reset();
    if (!this.attracting && K.attractAfter > 0 && this.idle >= K.attractAfter) {
      for (const p of project.presentations) if (p.id === K.attract) { this.attract(p); break; }
    }
    // a tap, or a press on a button, near an edge: the texts turn to that edge once this frame's touches are dealt with
    let turn: i32 = -1;
    for (const f of fingers.lifted) {
      if (f.owner === STAFF || !(f.tapped || f.owner === BUTTON)) continue;
      if (Math.min(Math.min(f.x, T.width - f.x), Math.min(f.y, T.height - f.y)) <= this.TURN) turn = F.nearest(f.x, f.y);
    }
    const speaking = this.voice;
    if (speaking !== null) {
      this.spoken += dt;
      const text = speaking.at(this.spoken);
      if (text !== this.cue) { this.cue = text; if (text.length > 0) this.tell(`subtitle ${text}`); }
      if (this.spoken > speaking.length + 0.5) { this.voice = null; this.cue = ''; this.tell(this.described.length > 0 ? 'description end' : 'narration end'); this.silence(); }
    }

    const c = this.change, plan = this.board;
    plan?.update(dt);
    if (c !== null) {   // nothing answers to a touch while the table changes
      for (const f of fingers.down) if (f.fresh) f.owner = NOTHING;
      c.p += dt / (c.kind === 'slide' ? SLIDE : FADE);
      if (c.p >= 0.5 && this.stack !== c.after) { this.show(c.after); this.arrived(this.top().sequence); this.layOutDock(); }
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
      // who takes the fingers that landed: a button (with a picture in full, one of the player's own), else the full view, which any
      // touch closes, else the card or the view under them
      for (const f of fingers.down) {
        if (!f.fresh || f.owner !== 0) continue;
        const fx = F.x(f.x, f.y), fy = F.y(f.x, f.y), full = on.table.opened !== null;
        for (const b of full ? this.dock : this.dock.concat(on.offered())) if (b.finger === 0 && b.takes(fx, fy)) { f.owner = BUTTON; b.finger = f.id; break; }
        if (full && f.owner === 0) f.owner = FULL;
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

    // a picture came in full, or went: its buttons with it, and its audio description stops
    const full = this.top().table.opened, was = this.viewed;
    if (full !== was) {
      this.viewed = full; this.picture = [];
      if (full !== null) this.counting?.note('medium', full.media.id);
      if (was !== null && was.media.id === this.described) this.hush(); else this.layOutDock();
    }
    if (turn >= 0) this.turnTo(turn);
    this.hear(this.top());
    const thing = this.top().viewer, window = this.top().lookout;
    this.point(0, thing !== null && thing.opened !== null ? `${thing.media.id}/${thing.opened.id}` : '');
    this.point(1, window !== null && window.opened !== null ? `${window.media.id}/${window.opened.id}` : '');
  }

  /** Counts a point of interest when it opens: `at` is the one open now in the object (slot 0) or the panorama (1), '' for none. */
  private point(slot: i32, at: string): void {
    if (at === this.pointed[slot]) return;
    this.pointed[slot] = at;
    if (at.length > 0) this.counting?.note('point', at);
  }

  /** The staff's summary of the day. Two fingers held in two opposite corners open it: nothing of those touches is counted as a visit.
   *  The next touch closes it and leaves the table as new. */
  private staff(dt: number): void {
    const stats = this.counting, T = this.T, down = this.fingers.down;
    if (stats === null) return;
    if (this.summary !== null) {
      for (const f of down) if (f.fresh) f.owner = STAFF;
      for (const f of this.fingers.lifted) if (f.owner === STAFF) { this.tell('summary close'); this.reset(); return; }
      return;
    }
    const corner = (f: Finger): boolean => Math.min(f.x, T.width - f.x) <= CORNER && Math.min(f.y, T.height - f.y) <= CORNER;
    const both = down.length === 2 && corner(down[0]) && corner(down[1]) && Math.abs(down[0].x - down[1].x) > T.width / 2 && Math.abs(down[0].y - down[1].y) > T.height / 2;
    this.gesture = both ? this.gesture + dt : 0;
    if (this.gesture < HOLD) return;
    this.gesture = 0;
    stats.drop();
    this.summary = stats.today();
    this.tell('summary open');
  }

  /** Draws the frame, over the table's colour which the owner of the window has put there. */
  private paint(x: number, y: number, w: number, h: number): void {
    this.lay(x, y, w, h);
    const k = this.k, ox = this.ox, oy = this.oy, F = this.F, stack = this.stack, fingers = this.fingers, plan = this.board;
    clipped();
    if (this.contrast) this.veil(255);   // whoever owns the window cleared it with the colour of the theme
    for (const s of stack) s.quiet = this.tour !== null && !this.paused;
    const moving = this.change;
    if (moving === null) this.drawStack(stack, ox, oy, k, 1, 0);
    else this.drawChange(moving, ox, oy, k);
    const full = this.top().table.opened;
    F.on(ox, oy, k);
    this.credit = [];
    if (full !== null) this.drawFullView(full, k);
    plan?.draw(k, this.lang, this.top().sequence.id, this.trail);
    this.drawSubtitle(k);
    this.drawTour(k);
    this.drawDock(k);
    const counts = this.summary, stats = this.counting;
    if (counts !== null && stats !== null) this.drawSummary(counts, stats.day, k);
    F.off();
    this.drawEdges(ox, oy, k);
    for (const f of fingers.down) border(ox + (f.x - 30) * k, oy + (f.y - 30) * k, 60 * k, 60 * k, 30 * k, Math.max(1, 2 * k), this.colours.accent, 150);   // where the table feels a finger

    if (this.logging) this.report();
    if (this.checking) this.check();
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

  /** Where every control is, when one has moved: what a touch can press now, with its place on the table; and how many of them, the
   *  credit of a full view among them, the subtitle lies on. */
  private check(): void {
    const F = this.F, on = this.top(), plan = this.board, parts: string[] = [], s = this.caption, credit = this.credit;
    const under = (x: number, y: number, w: number, h: number): i32 => s.length === 4 && x < s[0] + s[2] && x + w > s[0] && y < s[1] + s[3] && y + h > s[1] ? 1 : 0;
    let over: i32 = credit.length === 4 ? under(credit[0], credit[1], credit[2], credit[3]) : 0;
    for (const b of this.dock) over += under(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    const at = (name: string, fx: number, fy: number): void => { parts.push(`${name.replaceAll(' ', ':')}@${Math.round(F.tableX(fx, fy))},${Math.round(F.tableY(fx, fy))}`); };
    for (const b of this.dock) at(b.act, b.x, b.y);
    if (plan !== null && plan.open) {
      for (const s of this.project.sequences) { const n = plan.nodeOf(s); at(`node ${s.id}`, n[0], n[1]); }
    } else if (on.table.opened === null) {
      for (const b of on.offered()) {
        const l = b.link;
        at(l !== null ? `${b.ring ? 'spot' : 'link'} ${l.to}` : b.act, b.x, b.y);
        if (!b.ring) over += under(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      }
      const v = on.viewer, p = on.lookout;
      if (v !== null && v.linkBox.length === 4) at('panel', v.linkBox[0] + v.linkBox[2] / 2, v.linkBox[1] + v.linkBox[3] / 2);
      if (p !== null && p.linkBox.length === 4) at('panel', p.linkBox[0] + p.linkBox[2] / 2, p.linkBox[1] + p.linkBox[3] / 2);
    }
    this.say(-900, `controls ${F.name} size ${reading()} cut ${clipped()} ${parts.join(' ')} over=${over}`);
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

  /** What the narration is saying, at the visitor's edge above the buttons: one line, or two of about the same length. It keeps clear
   *  of the buttons of the sequence: above the highest one it would lie on. */
  private drawSubtitle(k: number): void {
    const cue = this.cue, F = this.F, colours = this.colours, on = this.top(), plan = this.board, box = this.picture, onPicture = box.length === 4;
    this.caption = [];
    if (cue.length === 0) return;
    // with a picture seen in full the subtitle lies over the foot of the picture, as on a film: its notice stays whole
    const f = sans(24 * k), room = onPicture ? box[2] - 80 * k : Math.min(1200 * reading(), F.w - 160) * k, full = textWidth(f, cue, 0);
    const lines = full <= room ? [cue] : wrap(f, cue, Math.min(room, full * 0.56), 0);
    const left = (wide: number): number => onPicture ? box[0] + (box[2] - wide) / 2 : F.ox + (F.w * k - wide) / 2;
    let w = 0;
    for (const line of lines) w = Math.max(w, textWidth(f, line, 0));
    const h = lines.length * leading(f) + 20 * k, x = left(w);
    const mapped = plan !== null && plan.open;   // under the storyboard the buttons of the sequence are not there: only the player's own
    let bottom = (mapped ? this.floor : on.edge) - 8;
    if (!onPicture && !mapped) for (let pass = 0; pass < 4; pass++) for (const b of on.offered()) {
      if (b.ring || Math.abs(b.x - F.w / 2) >= (w / k + 52 + b.w) / 2 + 8) continue;
      if (b.y + b.h / 2 + 8 > bottom - h / k && b.y - b.h / 2 - 8 < bottom) bottom = b.y - b.h / 2 - 8;
    }
    const y = onPicture ? box[1] + box[3] - 16 * k - h : F.oy + bottom * k - h;
    rrect(x - 26 * k, y, w + 52 * k, h, 14 * k, colours.background, faint(225));
    for (let i = 0; i < lines.length; i++) drawText(f, left(textWidth(f, lines[i], 0)), y + 10 * k + i * leading(f), lines[i], colours.text, 255, 0);
    this.caption = [(x - F.ox) / k - 26, (y - F.oy) / k, w / k + 52, h / k];
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
    const s = reading(), f = sans(20 * k), where = `${step + 1}/${n} · ${word('pause-hint', this.lang)}`, whole = `${this.project.say(t.title, this.lang)} · ${where}`;
    const label = textWidth(f, whole, 0) <= (F.w - 186) * k ? whole : where, w = textWidth(f, label, 0) + 90 * k, bh = 56 * k * s;
    const x = F.ox + 48 * k, y0 = F.oy + (F.h - 22 - 28 * s) * k - bh / 2;
    rrect(x, y0, w, bh, bh / 2, colours.background, 235);
    polygon([x + 30 * k, y0 + bh / 2 - 9 * k, x + 45 * k, y0 + bh / 2, x + 30 * k, y0 + bh / 2 + 9 * k], colours.accent, 255);
    drawText(f, x + 58 * k, y0 + (bh - leading(f)) / 2 + k, label, colours.muted, 255, 0);
  }

  /** The player's controls, over everything, in the visitor's frame (which is on). */
  private drawDock(k: number): void {
    const F = this.F, colours = this.colours;
    for (const b of this.dock) {
      if (b !== this.languages && b !== this.letters && b !== this.tones) { drawButton(b, F, k, colours); continue; }
      const s = reading(), x = F.ox + (b.x - b.w / 2) * k, y = F.oy + (b.y - b.h / 2) * k, w = b.w * k, h = b.h * k, held = b.finger !== 0;
      const bright = held ? colours.background : colours.accent;
      rrect(x, y, w, h, h / 2, held ? colours.accent : colours.background, held ? 255 : faint(235));
      border(x, y, w, h, h / 2, Math.max(1, 1.5 * k), colours.accent, 255);
      if (b === this.languages) {   // every language, the current one bright
        const f = sans(20 * k);
        let tx = x + 26 * k * s;
        for (const code of this.project.languages) {
          drawText(f, tx, y + (h - leading(f)) / 2 + k, code.toUpperCase(), code === this.lang ? bright : colours.muted, 255, 0);
          tx += 46 * k * s;
        }
      } else if (b === this.letters) {   // a letter at each size the project offers, on one baseline, the visitor's size bright
        const n: i32 = Math.min(this.project.accessibility.textSizes.length, 4), base = y + h / 2 + 0.36 * (15 + 6 * (n - 1)) * k * s;
        for (let i: i32 = 0; i < n; i++) {
          const px = (15 + 6 * i) * k, f = bold(px), mid = x + (22 + 34 * (i + 0.5)) * k * s;
          drawText(f, mid - textWidth(f, 'A', 0) / 2, base - 0.97 * px * s, 'A', i === Math.min(this.size, n - 1) ? bright : colours.muted, 255, 0);
        }
      } else {   // the sign of contrast: a disc, half of it full
        const cx = x + w / 2, cy = y + h / 2, r = 14 * k * s, ink = held ? colours.background : colours.text, half: number[] = [];
        for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 + Math.PI * i / 12; half.push(cx + r * Math.cos(a)); half.push(cy - r * Math.sin(a)); }
        polygon(half, ink, 255);
        border(cx - r, cy - r, 2 * r, 2 * r, r, Math.max(1.5, 2 * k), ink, 255);
      }
    }
  }

  /** The counts of a day, for the staff, over everything, in the visitor's frame (which is on) and at the designed text size: the visits
   *  and how long they lasted, when and in which language, each sequence opened, what was looked at closely, the presentations. */
  private drawSummary(c: Counts, day: string, k: number): void {
    const F = this.F, colours = this.colours, project = this.project, L = this.lang, rows: string[] = [];
    const row = (label: string, value: string): void => { rows.push(label); rows.push(value); };
    const time = (seconds: number): string => `${Math.floor(seconds / 60)} min ${Math.round(seconds) % 60} s`;
    const each = (what: string, unit: string): string => c.ids(what).map((id: string) => `${id}${unit} ${c.count(what, id)}`).join(' · ');
    const visits = c.count('session', '');
    row(word('stats-visits', L), `${visits}`);
    row(word('stats-length', L), visits > 0 ? time(c.seconds('session', '') / visits) : '');
    row(word('stats-hours', L), each('hour', ' h :'));
    row(word('stats-languages', L), each('language', ''));
    for (const s of project.sequences) if (c.count('sequence', s.id) > 0) row(project.say(s.title, L), `${c.count('sequence', s.id)} × · ${time(c.seconds('sequence', s.id))}`);
    row(word('stats-media', L), each('medium', ''));
    row(word('stats-descriptions', L), each('description', ''));
    row(word('stats-points', L), each('point', ''));
    for (const p of project.presentations) row(project.say(p.title, L), `${c.count('presentation', p.id)} × · ${word('stats-ended', L)} ${c.count('presentation-ended', p.id)} ×`);
    setReading(1, this.contrast);
    const head = bold(30 * k), f = sans(20 * k), small = sans(16 * k), step = leading(f) + 8 * k, w = Math.min(1240, F.w - 96) * k, h = 150 * k + rows.length / 2 * step;
    const x = F.ox + (F.w * k - w) / 2, y = F.oy + (F.h * k - h) / 2;
    rrect(F.ox, F.oy, F.w * k, F.h * k, 0, colours.background, 236);
    rrect(x, y, w, h, 18 * k, colours.background, 255);
    border(x, y, w, h, 18 * k, Math.max(1, 1.5 * k), colours.accent, 255);
    drawText(head, x + 40 * k, y + 32 * k, `${word('stats', L)} · ${day}`, colours.text, 255, 0);
    let ty = y + 32 * k + leading(head) + 18 * k;
    for (let i = 0; i < rows.length; i += 2) {
      drawText(f, x + 40 * k, ty, wrap(f, rows[i], w * 0.45 - 60 * k, 1)[0], colours.muted, 255, 0);
      drawText(f, x + w * 0.45, ty, wrap(f, rows[i + 1].length > 0 ? rows[i + 1] : '–', w * 0.55 - 40 * k, 1)[0], colours.text, 255, 0);
      ty += step;
    }
    drawText(small, x + 40 * k, y + h - 24 * k - leading(small), word('stats-close', L), colours.muted, 255, 0);
    this.read();
  }

  /** What is written at the edges the visitor is not at, each turned to its own side: during the attract loop the invitation, at every
   *  edge; else a mark that says a touch there turns the table to that side. They are for whoever comes to those edges, who has asked for
   *  no text size: they keep the designed one. */
  private drawEdges(ox: number, oy: number, k: number): void {
    const attracting = this.attracting, edge = this.edge, colours = this.colours;
    const label = word(attracting ? 'begin' : 'turn', this.lang);
    setReading(1, this.contrast);
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
    this.read();
  }

  /** The full view a double tap opens, in the visitor's frame (which is on): the picture as large as the table allows and its notice, beside
   *  it at a long side of the table, under it at a short side. The notice takes more of the table as its text grows, the picture the
   *  rest. Any touch beside the visitor's buttons closes it, and so does the first of them. */
  private drawFullView(c: Card, k: number): void {
    const F = this.F, colours = this.colours, project = this.project, lang = this.lang, s = reading();
    const m = c.media, wide = F.w >= F.h, X = (x: number): number => F.ox + x * k, Y = (y: number): number => F.oy + y * k;
    rrect(X(0), Y(0), F.w * k, F.h * k, 0, colours.background, faint(236));   // the table dims behind
    const column = wide ? Math.min(670 * s, F.w - 760) : F.w - 140, high = wide ? 900 : 1000 / s;
    const boxW = (wide ? F.w - 210 - column : column) * k, boxH = high * k, iw = imageWidth(c.picture), ih = imageHeight(c.picture), fit = Math.min(boxW / iw, boxH / ih);
    const w = iw * fit, h = ih * fit, x = X(70) + (boxW - w) / 2, y = Y(90) + (boxH - h) / 2;
    rrect(x - 10 * k, y - 10 * k, w + 20 * k, h + 20 * k, 3 * k, colours.paper, 255);
    drawImage(c.picture, x, y, w, h, 255, 0);
    this.picture = [x, y, w, h];

    const tx = X(wide ? F.w - 70 - column : 70), tw = column * k, head = bold(36 * k), who = sans(22 * k), small = sans(16 * k), body = sans(20 * k);
    const credit = wrap(small, [m.credit.institution, m.credit.accession, m.credit.line, m.credit.licence].filter((part: string) => part.length > 0).join(' · '), tw, 3);
    const foot = Y(this.floor - 12) - 3 * leading(small);   // the credit, above the visitor's buttons
    let ty = Y(wide ? 110 : 140 + high);
    for (const line of wrap(head, project.say(m.title, lang), tw, 4)) { drawText(head, tx, ty, line, colours.text, 255, 0); ty += leading(head); }
    ty += 10 * k;
    if (m.creator.length > 0) { drawText(who, tx, ty, m.creator, colours.text, 255, 0); ty += leading(who); }
    const facts = [project.say(m.date, lang), project.say(m.medium, lang)].filter((part: string) => part.length > 0).join(', ');
    for (const line of wrap(small, facts, tw, Math.round(2 * s))) { drawText(small, tx, ty, line, colours.muted, 255, 0); ty += leading(small); }
    ty += 16 * k;
    rect(tx, ty, 56 * k, Math.max(1, 2 * k), colours.accent);
    ty += 22 * k;
    const room = Math.max(1, Math.floor((foot - 16 * k - ty) / (leading(body) + 2 * k)));
    for (const line of wrap(body, project.say(m.description, lang), tw, room)) { drawText(body, tx, ty, line, colours.text, 255, 0); ty += leading(body) + 2 * k; }
    ty = foot;
    this.credit = [(tx - F.ox) / k, (foot - F.oy) / k, tw / k, credit.length * leading(small) / k];
    for (const line of credit) { drawText(small, tx, ty, line, colours.muted, 255, 0); ty += leading(small); }
  }
}
