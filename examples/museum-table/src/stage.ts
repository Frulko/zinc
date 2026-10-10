// A sequence on the table, as Klynt plays one: its media laid out where the project puts them, each there from its `at` to its `until`
// on the sequence's own clock; its title and introduction; its links, as buttons at the edge or as hotspots on a medium. The player
// (main.ts) owns the clock's meaning: what follows, what opens over what.
import { rrect, border, polygon, drawText, textWidth } from 'zinc:gfx';
import { Project, Sequence, Item, Link, Colours } from './project';
import { Fingers } from './touch';
import { LightTable } from './table';
import { ObjectView } from './viewer';
import { Lookout } from './lookout';
import { Frame } from './frame';
import { sans, bold, wrap, leading } from './type';

/** Something a touch presses, in the visitor's frame: a link of the sequence, or one of the player's own controls (`act`). */
export class Button {
  x = 0;
  y = 0;
  w = 0;
  h = 56;
  label = '';
  link: Link | null = null;
  act = '';
  /** A hotspot on a model or a panorama: a ring instead of a pill, the label beside it. */
  ring = false;
  /** A triangle before the label: the button plays something. */
  play = false;
  /** The finger pressing it (0: none). */
  finger: i32 = 0;
  /** A box at least 150 by 76 units takes the touch (75 mm on a 43-inch table), whatever is drawn. */
  takes(px: number, py: number): boolean { return Math.abs(px - this.x) <= Math.max(this.w, 150) / 2 && Math.abs(py - this.y) <= Math.max(this.h, 76) / 2; }
}

/** The 3D views made so far, by medium: a model or a panorama is loaded once, however often its sequence comes back. */
const viewers = new Map<string, ObjectView>();
const lookouts = new Map<string, Lookout>();

export class Stage {
  readonly sequence: Sequence;
  readonly table: LightTable;
  /** The 3D object and the panorama of the sequence, when it shows one. */
  viewer: ObjectView | null = null;
  lookout: Lookout | null = null;
  /** The links: buttons, and hotspots on the viewer or the panorama (the hotspots on a card are the card's). */
  buttons: Button[] = [];
  /** Seconds since the sequence opened: its timeline. */
  t = 0;
  /** The sequence plays by itself (a presentation): its links are not offered. */
  quiet = false;
  private project: Project;
  private colours: Colours;
  private lang: string;
  private frame: Frame;
  private viewerItem: Item | null = null;
  private lookoutItem: Item | null = null;

  /** `pins`: the test balls of the object viewer. */
  constructor(project: Project, sequence: Sequence, colours: Colours, lang: string, frame: Frame, pins: boolean) {
    this.project = project; this.sequence = sequence; this.colours = colours; this.lang = lang; this.frame = frame;
    this.table = new LightTable(project, colours, lang);
    this.table.open(sequence);
    for (const item of sequence.items) {
      const m = project.medium(item.media);
      if (m === null) continue;
      // ponytail: one model and one panorama per sequence (the first of each), and the same one cannot be on two open sequences at once
      if (m.kind === 'model' && this.viewer === null) {
        let v = viewers.get(m.id) ?? null;
        if (v === null) { v = new ObjectView(project, m, colours, lang, frame, pins); viewers.set(m.id, v); }
        v.setLanguage(lang); v.reset(false);
        v.x = item.x; v.y = item.y; v.w = item.width; v.h = item.height > 0 ? item.height : item.width;
        this.viewer = v; this.viewerItem = item;
      } else if (m.kind === 'panorama' && this.lookout === null) {
        let v = lookouts.get(m.id) ?? null;
        if (v === null) { v = new Lookout(project, m, colours, lang, frame); lookouts.set(m.id, v); }
        v.setLanguage(lang); v.reset();
        v.x = item.x; v.y = item.y; v.w = item.width; v.h = item.height > 0 ? item.height : item.width / 2;
        this.lookout = v; this.lookoutItem = item;
      }
    }
    for (const l of sequence.links) {
      const on = l.on.length > 0 ? project.medium(l.on) : null;
      if (on !== null && on.kind !== 'model' && on.kind !== 'panorama') continue;   // on a card
      const b = new Button();
      b.link = l; b.ring = on !== null;
      if (b.ring) { b.w = 60; b.h = 60; }
      this.buttons.push(b);
    }
    this.place();
  }

  setLanguage(lang: string): void {
    this.lang = lang;
    this.table.setLanguage(lang);
    this.viewer?.setLanguage(lang);
    this.lookout?.setLanguage(lang);
    this.place();
  }

  /** Puts the buttons where the visitor's frame has them and writes their labels. A button keeps its distance to the edge it was designed
   *  near and its place along it, as a share of the frame's width: at a short side of the table the frame is narrower. */
  place(): void {
    const F = this.frame, W = this.project.table.width, H = this.project.table.height;
    this.viewer?.turned();
    for (const b of this.buttons) {
      const l = b.link;
      if (l === null) continue;
      b.label = this.project.say(l.label, this.lang);
      if (b.ring) {   // on its place of the view's box
        const v = this.viewer, onObject = v !== null && v.media.id === l.on, it = onObject ? this.viewerItem : this.lookoutItem;
        if (it === null) continue;
        const h = onObject ? (v?.h ?? 0) : (this.lookout?.h ?? 0);
        const tx = it.x + (l.x - 0.5) * it.width, ty = it.y + (l.y - 0.5) * h;
        b.x = F.x(tx, ty); b.y = F.y(tx, ty);
      } else {
        b.w = textWidth(sans(20), b.label, 0) + 64;
        b.x = l.x; b.y = l.y < H / 2 ? l.y : F.h - (H - l.y);
      }
    }
    if (F.w >= W) return;
    // at a short side of the table the frame is narrower than the design: the buttons are set in centred rows above the player's own,
    // in the order they have along the edge
    const row = this.buttons.filter((b: Button) => !b.ring).sort((a: Button, b: Button) => (a.link?.x ?? 0) - (b.link?.x ?? 0));
    let y = F.h - 126, from = 0;
    while (from < row.length) {
      let to = from, wide = 0;
      while (to < row.length && (to === from || wide + 16 + row[to].w <= F.w - 96)) { wide += (to > from ? 16 : 0) + row[to].w; to++; }
      let x = (F.w - wide) / 2;
      for (let i = from; i < to; i++) { row[i].x = x + row[i].w / 2; row[i].y = y; x += row[i].w + 16; }
      from = to; y -= 72;
    }
  }

  /** Whether an item or a link with these times is there now. */
  there(at: number, until: number): boolean { return LightTable.there(at, until, this.t); }
  /** The buttons offered now. */
  offered(): Button[] { return this.quiet ? [] : this.buttons.filter((b: Button) => b.link !== null && this.there(b.link.at, b.link.until)); }

  /** One frame of a sequence that plays: its clock runs, its cards and views answer to their fingers. `now`: the player's clock. */
  update(dt: number, fingers: Fingers, now: number): void {
    this.t += dt;
    this.table.update(dt, fingers, now, this.t);
    // after the cards: one lying over a view takes its fingers
    const v = this.viewer, vi = this.viewerItem, p = this.lookout, pi = this.lookoutItem;
    if (v !== null && vi !== null && this.there(vi.at, vi.until)) v.update(dt, fingers);
    if (p !== null && pi !== null && this.there(pi.at, pi.until)) p.update(dt, fingers);
  }

  /** Draws the sequence; the table's origin is at (ox, oy) on the screen and one table unit is `k` pixels. `waiting`: another sequence is
   *  open over this one, which keeps its media and gives up its title and its buttons. */
  draw(ox: number, oy: number, k: number, waiting: boolean): void {
    const F = this.frame, v = this.viewer, vi = this.viewerItem, p = this.lookout, pi = this.lookoutItem;
    const object = v !== null && vi !== null && this.there(vi.at, vi.until), window = p !== null && pi !== null && this.there(pi.at, pi.until);
    if (v !== null && object) v.render(ox, oy, k);
    if (p !== null && window) p.render(ox, oy, k);
    if (!waiting) {
      F.on(ox, oy, k);
      if (v !== null && object) v.drawOver(ox, oy, k);
      if (p !== null && window) p.drawOver(k);
      this.drawHeading(k);
      F.off();
    }
    this.table.draw(ox, oy, k);
    if (waiting) return;
    F.on(ox, oy, k);
    for (const b of this.offered()) drawButton(b, F, k, this.colours);
    F.off();
  }

  /** The title and introduction of the sequence, written on the table itself: the cards slide over them. */
  private drawHeading(k: number): void {
    const F = this.frame, c = this.colours, head = bold(30 * k), intro = sans(17 * k), x = Math.round(F.ox + 48 * k);
    let y = Math.round(F.oy + 34 * k);
    drawText(head, x, y, this.project.say(this.sequence.title, this.lang), c.text, 255, 0);
    y += leading(head) + 2 * k;
    for (const line of wrap(intro, this.project.say(this.sequence.text, this.lang), Math.min(1160, F.w - 96) * k, 2)) { drawText(intro, x, y, line, c.muted, 255, 0); y += leading(intro); }
  }
}

/** A button in the visitor's frame (which is on): a pill with its label, or the ring of a hotspot with its label beside it. */
export function drawButton(b: Button, F: Frame, k: number, c: Colours): void {
  const held = b.finger !== 0;
  if (b.ring) {
    const x = F.ox + b.x * k, y = F.oy + b.y * k, r = 15 * k, f = bold(15 * k), lw = textWidth(f, b.label, 0) + 24 * k, lh = 30 * k;
    rrect(x + r + 8 * k, y - lh / 2, lw, lh, lh / 2, c.background, 215);
    drawText(f, x + r + 20 * k, y - leading(f) / 2 + k, b.label, c.text, 255, 0);
    rrect(x - r, y - r, 2 * r, 2 * r, r, held ? c.accent : c.background, held ? 255 : 150);
    border(x - r, y - r, 2 * r, 2 * r, r, Math.max(1.5, 2.5 * k), c.accent, 255);
    rrect(x - 5 * k, y - 5 * k, 10 * k, 10 * k, 5 * k, held ? c.background : c.accent, 255);
    return;
  }
  const f = sans(20 * k), x = F.ox + (b.x - b.w / 2) * k, top = F.oy + (b.y - b.h / 2) * k, w = b.w * k, h = b.h * k;
  rrect(x, top, w, h, h / 2, held ? c.accent : c.background, held ? 255 : 235);
  border(x, top, w, h, h / 2, Math.max(1, 1.5 * k), c.accent, 255);
  const lead = b.play ? 26 * k : 0, tx = x + (w - textWidth(f, b.label, 0) - lead) / 2;
  if (b.play) polygon([tx, top + h / 2 - 9 * k, tx + 15 * k, top + h / 2, tx, top + h / 2 + 9 * k], held ? c.background : c.accent, 255);
  drawText(f, tx + lead, top + (h - leading(f)) / 2 + k, b.label, held ? c.background : c.text, 255, 0);
}
