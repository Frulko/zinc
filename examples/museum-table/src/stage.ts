// A sequence on the table, as Klynt plays one: its media laid out where the project puts them, each there from its `at` to its `until`
// on the sequence's own clock; its title and introduction; its links, as buttons at the edge or as hotspots on a medium. The player
// (player.ts) owns the clock's meaning: what follows, what opens over what.
import { rrect, drawText, textWidth } from 'zinc:gfx';
import { Project, Sequence, Item, Media, Colours, LIGHTS } from './project';
import { Fingers } from './touch';
import { LightTable } from './table';
import { ObjectView } from './viewer';
import { Lookout } from './lookout';
import { Frame } from './frame';
import { Button, drawButton, setInRows, touching } from './button';
import { sans, bold, wrap, leading, reading, faint } from './type';
import { word } from './words';

/** The 3D views a player has made so far, by medium: a model or a panorama is loaded once, however often its sequence comes back. */
export class Views {
  viewers = new Map<string, ObjectView>();
  lookouts = new Map<string, Lookout>();
  /** Frees them all: the player that made them is done. */
  dispose(): void {
    for (const v of this.viewers.values()) v.dispose();
    for (const v of this.lookouts.values()) v.dispose();
    this.viewers.clear(); this.lookouts.clear();
  }
}

export class Stage {
  readonly sequence: Sequence;
  readonly table: LightTable;
  /** The 3D object and the panorama of the sequence, when it shows one. */
  viewer: ObjectView | null = null;
  lookout: Lookout | null = null;
  /** The links: buttons, and hotspots on the viewer or the panorama (the hotspots on a card are the card's); and the buttons of the
   *  object and of the panorama (`act`), at the bottom-left of their box. */
  buttons: Button[] = [];
  /** The medium whose audio description is being said ('' for none): its button offers to stop it. */
  described = '';
  private objectStrip: Button[] = [];
  private windowStrip: Button[] = [];
  /** The points of interest open at the last layout: a point that leads somewhere brings a button. */
  private pointed = '';
  /** The top of what lies at the visitor's edge, in the frame: the player's own buttons and, when the links are set in rows, those rows. */
  edge = 0;
  /** The top of the player's own buttons, and those buttons: what the links are laid out above and beside. */
  private floor = 0;
  private dock: Button[] = [];
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

  /** `pins`: the test balls of the object viewer. `views`: the 3D views of the player, which this sequence adds to. */
  constructor(project: Project, sequence: Sequence, colours: Colours, lang: string, frame: Frame, pins: boolean, views: Views) {
    this.project = project; this.sequence = sequence; this.colours = colours; this.lang = lang; this.frame = frame;
    this.table = new LightTable(project, colours, lang);
    this.table.open(sequence);
    for (const item of sequence.items) {
      const m = project.medium(item.media);
      if (m === null) continue;
      // ponytail: one model and one panorama per sequence (the first of each), and the same one cannot be on two open sequences at once
      if (m.kind === 'model' && this.viewer === null) {
        let v = views.viewers.get(m.id) ?? null;
        if (v === null) { v = new ObjectView(project, m, colours, lang, frame, pins); views.viewers.set(m.id, v); }
        v.setLanguage(lang); v.reset(false);
        v.x = item.x; v.y = item.y; v.w = item.width; v.h = item.height > 0 ? item.height : item.width;
        this.viewer = v; this.viewerItem = item;
      } else if (m.kind === 'panorama' && this.lookout === null) {
        let v = views.lookouts.get(m.id) ?? null;
        if (v === null) { v = new Lookout(project, m, colours, lang, frame); views.lookouts.set(m.id, v); }
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
    const object = this.viewer, window = this.lookout;
    if (object !== null) this.objectStrip = this.strip(object.media, ['light', 'reset']);
    if (window !== null) this.windowStrip = this.strip(window.media, []);
    this.floor = frame.h - 22 - 56 * reading();
    this.place();
  }

  /** The buttons under a view: its own, then the audio description when the medium has one, the way through its points of interest
   *  and, while a point that leads to a sequence is open, the way there: what the panel of a point offers, within the visitor's reach. */
  private strip(m: Media, own: string[]): Button[] {
    const acts = own.slice(), row: Button[] = [];
    if (m.audioDescription.size > 0) acts.push(`describe ${m.id}`);
    if (m.points.length > 0) { acts.push(`next ${m.id}`); acts.push(`follow ${m.id}`); }
    for (const act of acts) {
      const b = new Button();
      b.act = act; b.small = true;
      row.push(b); this.buttons.push(b);
    }
    return row;
  }

  /** The visitor reads at another size: the cards and the buttons take the size of their texts. */
  resize(): void { this.table.setLanguage(this.lang); this.layOut(); }

  setLanguage(lang: string): void {
    this.lang = lang;
    this.table.setLanguage(lang);
    this.viewer?.setLanguage(lang);
    this.lookout?.setLanguage(lang);
    this.place();
  }

  /** The visitor's frame has turned, or speaks another language: the buttons are laid out again and the object comes back to its place. */
  place(): void {
    this.viewer?.turned();
    this.layOut();
  }
  /** The player's own buttons have changed: their top in the frame and the buttons themselves, which the links keep clear of. */
  settle(floor: number, dock: Button[]): void {
    this.floor = floor; this.dock = dock;
    this.layOut();
  }
  /** A press on one of the buttons of a view (the audio description is the player's to say). */
  press(act: string): void {
    const v = this.viewer, p = this.lookout;
    if (v !== null && act === 'light') v.setLight(LIGHTS[(LIGHTS.indexOf(v.light) + 1) % LIGHTS.length]);
    else if (v !== null && act === 'reset') v.reset(true);
    else if (v !== null && act === `next ${v.media.id}`) v.nextPoint();
    else if (p !== null && act === `next ${p.media.id}`) p.nextPoint();
    else if (v !== null && act === `follow ${v.media.id}`) v.followed = v.opened?.to ?? '';
    else if (p !== null && act === `follow ${p.media.id}`) p.followed = p.opened?.to ?? '';
    this.layOut();
  }
  /** The sequence the open point of a view leads to, or null. */
  private ahead(media: string): Sequence | null {
    const v = this.viewer, p = this.lookout, open = v !== null && v.media.id === media ? v.opened : p !== null && p.media.id === media ? p.opened : null;
    return open !== null && open.to.length > 0 ? this.project.sequence(open.to) : null;
  }

  /** Puts the buttons where the visitor's frame has them and writes their labels. A link keeps the distance to the edge it was designed
   *  near and its place along it, and the buttons of a view lie at the bottom-left of its box. When the links do not fit there (at a
   *  short side of the table the frame is narrower than the design; a larger text makes every button wider; a label is longer in another
   *  language) every button of the sequence comes to the visitor's edge instead, in centred rows above the player's own: the links in
   *  the order they have along the edge, and above them the buttons of the views. */
  private layOut(): void {
    const F = this.frame, W = this.project.table.width, H = this.project.table.height, L = this.lang;
    const pills: Button[] = [];
    for (const b of this.buttons) {
      const l = b.link;
      if (l === null) continue;
      b.label = this.project.say(l.label, L);
      if (b.ring) {   // on its place of the view's box
        const v = this.viewer, onObject = v !== null && v.media.id === l.on, it = onObject ? this.viewerItem : this.lookoutItem;
        if (it === null) continue;
        const h = onObject ? (v?.h ?? 0) : (this.lookout?.h ?? 0);
        const tx = it.x + (l.x - 0.5) * it.width, ty = it.y + (l.y - 0.5) * h;
        b.x = F.x(tx, ty); b.y = F.y(tx, ty);
      } else {
        b.fit();
        b.x = l.x; b.y = l.y < H / 2 ? l.y : F.h - (H - l.y);
        pills.push(b);
      }
    }
    this.edge = this.floor;
    let fits = F.w >= W;
    for (let i = 0; fits && i < pills.length; i++) {
      const b = pills[i];
      if (b.x - b.w / 2 < 0 || b.x + b.w / 2 > F.w) fits = false;
      for (let j = 0; j < i; j++) if (touching(b, pills[j], 0)) fits = false;
      for (const d of this.dock) if (touching(b, d, 0)) fits = false;
    }
    if (!fits) {
      pills.sort((a: Button, b: Button) => (a.link?.x ?? 0) - (b.link?.x ?? 0));
      this.edge = setInRows(pills, F.w / 2, this.floor - 20 - 28 * reading(), F.w - 96, 16, true);
    }
    const v = this.viewer, p = this.lookout;
    this.pointed = `${v?.opened?.id ?? ''} ${p?.opened?.id ?? ''}`;
    for (const b of this.buttons) {
      if (b.link !== null) continue;
      const said = b.act === `describe ${this.described}`;
      if (b.act === 'light') b.label = `${word('light', L)} : ${word(v?.light ?? '', L)}`;
      else if (b.act.startsWith('describe ')) { b.label = word(said ? 'describe-stop' : 'describe', L); b.play = !said; }
      else if (b.act.startsWith('follow ')) { const to = this.ahead(b.act.slice(7)); b.label = to !== null ? `${this.project.say(to.title, L)} →` : ''; }
      else b.label = word(b.act.startsWith('next ') ? 'next-point' : b.act, L);
      b.fit();
    }
    const shown = (b: Button): boolean => !b.act.startsWith('follow ') || b.label.length > 0;
    const strips = this.objectStrip.concat(this.windowStrip).filter(shown);
    if (!fits && strips.length > 0) this.edge = setInRows(strips, F.w / 2, this.edge - 16 - 26 * reading(), F.w - 96, 18, true);
    else {
      if (v !== null) this.setStrip(this.objectStrip.filter(shown), v.box());
      if (p !== null) this.setStrip(this.windowStrip.filter(shown), p.box());
    }
  }
  /** The buttons of a view at the bottom-left of its box, in the frame, above what lies at the visitor's edge. */
  private setStrip(strip: Button[], box: number[]): void {
    setInRows(strip, box[0] + 28, Math.min(box[1] + box[3] - 18, this.edge - 10) - 26 * reading(), box[2] - 56, 18, false);
  }

  /** Whether an item or a link with these times is there now. */
  there(at: number, until: number): boolean { return LightTable.there(at, until, this.t); }
  /** The buttons offered now. */
  offered(): Button[] {
    if (this.quiet) return [];
    const vi = this.viewerItem, pi = this.lookoutItem, object = vi !== null && this.there(vi.at, vi.until), window = pi !== null && this.there(pi.at, pi.until);
    return this.buttons.filter((b: Button) => b.link !== null ? this.there(b.link.at, b.link.until)
      : (this.objectStrip.indexOf(b) >= 0 ? object : window) && (!b.act.startsWith('follow ') || b.label.length > 0));
  }

  /** One frame of a sequence that plays: its clock runs, its cards and views answer to their fingers. `now`: the player's clock. */
  update(dt: number, fingers: Fingers, now: number): void {
    this.t += dt;
    this.table.update(dt, fingers, now, this.t);
    // after the cards: one lying over a view takes its fingers
    const v = this.viewer, vi = this.viewerItem, p = this.lookout, pi = this.lookoutItem;
    if (v !== null && vi !== null && this.there(vi.at, vi.until)) v.update(dt, fingers);
    if (p !== null && pi !== null && this.there(pi.at, pi.until)) p.update(dt, fingers);
    if (this.pointed !== `${v?.opened?.id ?? ''} ${p?.opened?.id ?? ''}`) this.layOut();   // a point opened or closed under a finger
  }

  /** Draws the sequence; the table's origin is at (ox, oy) on the screen and one table unit is `k` pixels. `waiting`: another sequence is
   *  open over this one, which keeps its media and gives up its title and its buttons. */
  draw(ox: number, oy: number, k: number, waiting: boolean): void {
    const F = this.frame, v = this.viewer, vi = this.viewerItem, p = this.lookout, pi = this.lookoutItem;
    const object = v !== null && vi !== null && this.there(vi.at, vi.until), window = p !== null && pi !== null && this.there(pi.at, pi.until);
    if (v !== null && object) v.render(ox, oy, k);
    if (p !== null && window) p.render(ox, oy, k);
    const large = reading() > 1;   // a heading read at a larger size needs more than the strip the cards leave it: it lies over them
    if (!waiting) {
      F.on(ox, oy, k);
      if (v !== null && object) v.drawOver(ox, oy, k);
      if (p !== null && window) p.drawOver(k);
      if (!large) this.drawHeading(k);
      F.off();
    }
    this.table.draw(ox, oy, k);
    if (waiting) return;
    F.on(ox, oy, k);
    if (large) this.drawHeading(k);
    for (const b of this.offered()) drawButton(b, F, k, this.colours);
    F.off();
  }

  /** The title and introduction of the sequence, written on the table itself: the cards slide over them. Read at a larger size they
   *  are written over the cards instead, on a band of the table's colour. */
  private drawHeading(k: number): void {
    const F = this.frame, c = this.colours, s = reading(), head = bold(30 * k), intro = sans(17 * k), x = Math.round(F.ox + 48 * k);
    const title = this.project.say(this.sequence.title, this.lang), lines = wrap(intro, this.project.say(this.sequence.text, this.lang), Math.min(1160 * s, F.w - 96) * k, Math.round(2 * s));
    let y = Math.round(F.oy + 34 * k);
    if (s > 1) {
      let wide = textWidth(head, title, 0);
      for (const line of lines) wide = Math.max(wide, textWidth(intro, line, 0));
      rrect(x - 20 * k, y - 12 * k, wide + 40 * k, leading(head) + 2 * k + (lines[0].length > 0 ? lines.length * leading(intro) : 0) + 24 * k, 14 * k, c.background, faint(225));
    }
    drawText(head, x, y, title, c.text, 255, 0);
    y += leading(head) + 2 * k;
    for (const line of lines) { drawText(intro, x, y, line, c.muted, 255, 0); y += leading(intro); }
  }
}
