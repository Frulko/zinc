// The light table: the photographs and text panels of a sequence lie on it as cards, like prints. One finger drags a card, two fingers
// turn and zoom it, a released card glides on and eases back from the edges; a touch brings a card to the front, a touch on its folded
// corner turns it over to read the notice, a double tap asks for the full view. Every card answers to its own fingers, so several hands
// work at once. Positions are in table units. A card is there from its item's `at` to its `until` on the sequence's clock, and carries the
// hotspots of the sequence that are on its medium: a ring that moves with it and leads to another sequence.
import { image, imageWidth, imageHeight, rrect, border, shadow, polygon, drawImage, drawText, textWidth, setTransform, resetTransform } from 'zinc:gfx';
import { Project, Sequence, Media, Link, Colours } from './project';
import { Fingers, Finger, Pose, manipulate } from './touch';
import { sans, bold, wrap, leading } from './type';
import { word } from './words';

/** The owner number of the fingers on the first card; the next cards follow. */
export const CARD: i32 = 100;
const BORDER = 10, FOOT = 66;            // the paper around a picture and the caption strip under it (table units at scale 1)
const NARROWEST = 150, WIDEST = 1500;    // a card's width stays between these
const FOLD = 46;                         // the corner that turns a card over
const DOUBLE_TAP = 0.45;                 // seconds between the two taps
const INSET = 70;                        // a card's centre stays this far inside the table
const APPEAR = 0.4;                      // seconds a card takes to come and to go
const SPOT = 44;                         // a hotspot takes a tap this far from its centre (table units)

export class Card {
  /** The owner number of its fingers. */
  readonly uid: i32;
  readonly media: Media;
  pose = new Pose();
  /** Size at scale 1. */
  w = 0;
  h = 0;
  /** The picture it shows (-1: a text panel), its height on the card, and a line that replaces the creator (a medium not played yet). */
  picture: i32 = -1;
  pictureHeight = 0;
  note = '';
  /** Lines of a text panel. */
  lines: i32 = 0;
  /** Has a back to read. */
  turns = false;
  /** Speed kept when the last finger lifts: table units and radians per second. */
  vx = 0;
  vy = 0;
  va = 0;
  /** Fingers on it. */
  held: i32 = 0;
  /** The face asked for, and where the turn is: 0 front, 1 back. */
  back = false;
  turn = 0;
  lastTap = -10;
  /** When it is on the table, in seconds of the sequence (until 0: to the end), and how much of it is there now: 0 none, 1 all. */
  at = 0;
  until = 0;
  shown = 0;
  /** The hotspots on it. */
  spots: Link[] = [];
  constructor(uid: i32, media: Media) { this.uid = uid; this.media = media; }
}

export class LightTable {
  /** From the bottom of the pile to the top. */
  cards: Card[] = [];
  /** The card a double tap asked to see in full (the caller shows it and sets this back to null). */
  opened: Card | null = null;
  /** The hotspot a tap asked to follow (the caller follows it and sets this back to null). */
  followed: Link | null = null;
  /** The sequence's clock at the last update. */
  private clock = 0;
  private project: Project;
  private colours: Colours;
  private lang: string;
  private width: number;
  private height: number;

  constructor(project: Project, colours: Colours, lang: string) {
    this.project = project; this.colours = colours; this.lang = lang;
    this.width = project.table.width; this.height = project.table.height;
  }

  /** Lays out the cards of `sequence` as designed. */
  open(sequence: Sequence): void {
    this.cards = [];
    this.opened = null;
    for (let i: i32 = 0; i < sequence.items.length; i++) {
      const item = sequence.items[i], m = this.project.medium(item.media);
      if (m === null || m.kind === 'model' || m.kind === 'panorama' || m.kind === 'audio') continue;   // these have their own views; a sound has no card
      const c = new Card(CARD + i, m);
      c.pose.x = item.x; c.pose.y = item.y; c.pose.angle = item.rotation * Math.PI / 180;
      c.w = item.width; c.at = item.at; c.until = item.until;
      c.shown = item.at > 0 ? 0 : 1;
      let first = true;   // a medium laid out twice has its hotspots on the first card
      for (const other of this.cards) if (other.media === m) first = false;
      if (first) for (const l of sequence.links) if (l.on === m.id) c.spots.push(l);
      const file = m.kind === 'video' ? m.poster : m.kind === 'text' ? '' : m.file;
      if (file.length > 0) c.picture = image(file);
      if (c.picture >= 0) {
        c.pictureHeight = (c.w - 2 * BORDER) * imageHeight(c.picture) / imageWidth(c.picture);
        c.h = BORDER + c.pictureHeight + FOOT;
        c.turns = m.kind === 'photo';
        // ponytail: a film shows its poster until it has its player (ZN-650.08)
        if (m.kind !== 'photo') c.note = 'film';
      } else this.measure(c);
      this.cards.push(c);
    }
  }

  /** The size of a text panel: it grows with its text, which is not as long in every language. */
  private measure(c: Card): void {
    const m = c.media, body = sans(16), pad = BORDER * 2;
    c.lines = wrap(body, this.project.say(m.kind === 'text' ? m.text : m.title, this.lang), c.w - 2 * pad, 0).length;
    c.h = pad + leading(bold(11)) + 8 + (c.lines + 0.5) * leading(body) + pad;
  }

  setLanguage(lang: string): void {
    this.lang = lang;
    for (const c of this.cards) if (c.picture < 0) this.measure(c);
  }
  setColours(colours: Colours): void { this.colours = colours; }

  /** The topmost card under (x, y), or null. */
  cardAt(x: number, y: number): Card | null {
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      if (c.shown < 0.5) continue;   // not there yet, or gone
      this.toCard(c, x, y);
      if (Math.abs(this.lx) <= c.w / 2 && Math.abs(this.ly) <= c.h / 2) return c;
    }
    return null;
  }
  private lx = 0;
  private ly = 0;
  /** (x, y) of the table in the card's own frame (its centre at 0, 0; its size w by h): into lx, ly. */
  private toCard(c: Card, x: number, y: number): void {
    const dx = x - c.pose.x, dy = y - c.pose.y, cos = Math.cos(c.pose.angle), sin = Math.sin(c.pose.angle);
    this.lx = (dx * cos + dy * sin) / c.pose.scale;
    this.ly = (dy * cos - dx * sin) / c.pose.scale;
  }
  private raise(c: Card): void {
    const i = this.cards.indexOf(c);
    if (i < 0 || i === this.cards.length - 1) return;
    this.cards.splice(i, 1);
    this.cards.push(c);
  }

  /** Whether something offered from `at` to `until` (0: to the end) is there at `t` seconds of the sequence. */
  static there(at: number, until: number, t: number): boolean { return t >= at && (until <= 0 || t < until); }

  /** One frame: cards come and go with the sequence's clock `t`, fingers that landed on a card take it, held cards follow their fingers,
   *  the others glide and settle. */
  update(dt: number, fingers: Fingers, now: number, t: number): void {
    this.clock = t;
    for (const c of this.cards) {
      const to = LightTable.there(c.at, c.until, t) ? 1 : 0;
      if (c.shown !== to) c.shown = Math.abs(to - c.shown) < dt / APPEAR ? to : c.shown + (to > c.shown ? dt : -dt) / APPEAR;
    }
    for (const f of fingers.down) {
      if (!f.fresh || f.owner !== 0) continue;
      const c = this.cardAt(f.x, f.y);
      if (c !== null) { f.owner = c.uid; this.raise(c); }
    }
    const follow = Math.min(1, 18 * dt), glide = Math.exp(-4 * dt), spin = Math.exp(-6 * dt), pull = 1 - Math.exp(-9 * dt);
    for (const c of this.cards) {
      const held = fingers.of(c.uid), p = c.pose;
      c.held = held.length;
      if (held.length > 0) {
        const x = p.x, y = p.y, a = p.angle;
        manipulate(p, held, NARROWEST / c.w, WIDEST / c.w);
        if (dt > 0) {   // the speed the card would leave with, smoothed over a few frames
          c.vx += ((p.x - x) / dt - c.vx) * follow;
          c.vy += ((p.y - y) / dt - c.vy) * follow;
          c.va += ((p.angle - a) / dt - c.va) * follow;
        }
      } else {
        p.x += c.vx * dt; p.y += c.vy * dt; p.angle += c.va * dt;
        c.vx *= glide; c.vy *= glide; c.va *= spin;
        if (Math.abs(c.vx) + Math.abs(c.vy) < 4) { c.vx = 0; c.vy = 0; }
        if (Math.abs(c.va) < 0.02) c.va = 0;
        // soft edges: a card pushed out comes back, without a wall to hit
        const inX = Math.min(this.width - INSET, Math.max(INSET, p.x)), inY = Math.min(this.height - INSET, Math.max(INSET, p.y));
        if (inX !== p.x) { p.x = Math.abs(inX - p.x) < 0.05 ? inX : p.x + (inX - p.x) * pull; c.vx *= spin; }
        if (inY !== p.y) { p.y = Math.abs(inY - p.y) < 0.05 ? inY : p.y + (inY - p.y) * pull; c.vy *= spin; }
      }
      const to = c.back ? 1 : 0;
      if (c.turn !== to) c.turn = Math.abs(to - c.turn) < 3.2 * dt ? to : c.turn + (to > c.turn ? 3.2 : -3.2) * dt;
    }
    for (const f of fingers.lifted) {
      if (!f.tapped) continue;
      for (const c of this.cards) if (c.uid === f.owner) { this.tapped(c, f, now); break; }
    }
  }

  private tapped(c: Card, f: Finger, now: number): void {
    c.vx = 0; c.vy = 0; c.va = 0;
    this.toCard(c, f.x, f.y);
    if (c.turns && this.lx > c.w / 2 - FOLD && this.ly > c.h / 2 - FOLD) { c.back = !c.back; c.lastTap = -10; return; }
    if (c.turn < 0.5) for (const l of c.spots) {
      if (!LightTable.there(l.at, l.until, this.clock)) continue;
      const dx = this.lx - this.spotX(c, l), dy = this.ly - this.spotY(c, l);
      if (Math.sqrt(dx * dx + dy * dy) * c.pose.scale <= SPOT) { this.followed = l; c.lastTap = -10; return; }
    }
    if (now - c.lastTap < DOUBLE_TAP && c.picture >= 0) { this.opened = c; c.lastTap = -10; }
    else c.lastTap = now;
  }

  /** Where a hotspot is in its card's own frame: its fractions are of the picture, or of the whole card when it shows none. */
  private spotX(c: Card, l: Link): number { return c.picture >= 0 ? -c.w / 2 + BORDER + l.x * (c.w - 2 * BORDER) : (l.x - 0.5) * c.w; }
  private spotY(c: Card, l: Link): number { return c.picture >= 0 ? -c.h / 2 + BORDER + l.y * c.pictureHeight : (l.y - 0.5) * c.h; }

  /** Zooms (factor) and turns (radians) the card under (x, y) about that point: the wheel and the trackpad of a desk without a touch screen. */
  nudge(x: number, y: number, factor: number, turn: number): void {
    const c = this.cardAt(x, y);
    if (c === null) return;
    const p = c.pose, grow = Math.min(WIDEST / c.w, Math.max(NARROWEST / c.w, p.scale * factor)) / p.scale;
    const dx = p.x - x, dy = p.y - y, cos = Math.cos(turn) * grow, sin = Math.sin(turn) * grow;
    p.x = x + dx * cos - dy * sin; p.y = y + dx * sin + dy * cos;
    p.scale *= grow; p.angle += turn;
    this.raise(c);
  }

  /** Draws the cards, bottom to top; the table's origin is at (ox, oy) on the screen and one table unit is `k` pixels. */
  draw(ox: number, oy: number, k: number): void {
    for (const c of this.cards) {
      if (c.shown <= 0) continue;
      this.fade = c.shown;
      this.drawCard(c, ox + c.pose.x * k, oy + c.pose.y * k, c.pose.scale * k);
    }
    resetTransform();
  }
  /** How much of the card being drawn is there, and an opacity (0 to 255) at that share. */
  private fade = 1;
  private a(alpha: i32): i32 { return Math.round(alpha * this.fade); }

  /** One card, its centre at (cx, cy) on the screen, at `d` pixels per table unit. Everything is drawn in pixels around the centre, through
   *  a matrix that only turns (and narrows the card while it turns over): the texts are set in the font of their size on screen, so they
   *  stay sharp at every zoom. */
  private drawCard(c: Card, cx: number, cy: number, d: number): void {
    const cos = Math.cos(c.pose.angle), sin = Math.sin(c.pose.angle), narrow = Math.max(0.02, Math.abs(Math.cos(Math.PI * c.turn)));
    setTransform(cos * narrow, sin * narrow, -sin, cos, cx, cy);
    const w = c.w * d, h = c.h * d, x = -w / 2, y = -h / 2;
    shadow(x, y + 3 * d, w, h, 2, 14 * d, 0x000000, this.a(150));
    if (c.turns) {   // a corner is folded: the one a touch turns the card over by
      const s = 26 * d;
      polygon([x, y, x + w, y, x + w, y + h - s, x + w - s, y + h, x, y + h], this.colours.paper, this.a(255));
      polygon([x + w - s, y + h, x + w, y + h - s, x + w - s, y + h - s], this.colours.ink, this.a(46));
    } else rrect(x, y, w, h, 2, this.colours.paper, this.a(255));
    if (c.turn >= 0.5) this.paintBack(c, d, x, y); else this.paintFront(c, d, x, y);
  }

  private paintFront(c: Card, d: number, left: number, top: number): void {
    const ink = this.colours.ink, m = c.media, title = this.project.say(m.title, this.lang);
    if (c.picture < 0) {   // a text panel
      const pad = BORDER * 2 * d, head = bold(11 * d), body = sans(16 * d);
      let y = top + pad;
      drawText(head, left + pad, y, title.toUpperCase(), ink, this.a(150), 0.6 * d);
      y += leading(head) + 8 * d;
      for (const line of wrap(body, this.project.say(m.kind === 'text' ? m.text : m.title, this.lang), c.w * d - 2 * pad, c.lines + 1)) {
        drawText(body, left + pad, y, line, ink, this.a(255), 0);
        y += leading(body);
      }
      return;
    }
    const x = left + BORDER * d, inner = (c.w - 2 * BORDER) * d, head = bold(15 * d), small = sans(12 * d);
    let y = top + BORDER * d;
    drawImage(c.picture, x, y, inner, c.pictureHeight * d, this.a(255), 0);
    y += c.pictureHeight * d + 8 * d;
    const lines = wrap(head, title, inner - (c.turns ? 22 * d : 0), 2);
    for (const line of lines) { drawText(head, x, y, line, ink, this.a(255), 0); y += leading(head); }
    const under = c.note.length > 0 ? word(c.note, this.lang) : m.creator;
    if (lines.length < 2 || under.length > 0) drawText(small, x, y + d, wrap(small, under, inner - 30 * d, 1)[0], ink, this.a(160), 0);
    this.paintSpots(c, d);
  }

  /** The hotspots: a ring on its place of the card and what it leads to, on the side where there is room. */
  private paintSpots(c: Card, d: number): void {
    const accent = this.colours.accent, f = bold(13 * d), r = 15 * d;
    for (const l of c.spots) {
      if (!LightTable.there(l.at, l.until, this.clock)) continue;
      const x = this.spotX(c, l) * d, y = this.spotY(c, l) * d, label = this.project.say(l.label, this.lang), lw = textWidth(f, label, 0) + 22 * d, lh = 28 * d;
      const lx = l.x > 0.6 ? x - r - 8 * d - lw : x + r + 8 * d;
      rrect(lx, y - lh / 2, lw, lh, lh / 2, this.colours.background, this.a(215));
      drawText(f, lx + 11 * d, y - leading(f) / 2 + d, label, this.colours.text, this.a(255), 0);
      rrect(x - r, y - r, 2 * r, 2 * r, r, this.colours.background, this.a(150));
      border(x - r, y - r, 2 * r, 2 * r, r, Math.max(1.5, 2.5 * d), accent, this.a(255));
      rrect(x - 5 * d, y - 5 * d, 10 * d, 10 * d, 5 * d, accent, this.a(255));
    }
  }

  /** The notice: what a museum label says, and where the picture comes from. */
  private paintBack(c: Card, d: number, left: number, top: number): void {
    const ink = this.colours.ink, m = c.media, P = this.project, L = this.lang;
    const pad = 18 * d, x = left + pad, inner = c.w * d - 2 * pad, bottom = top + c.h * d - pad;
    const head = bold(17 * d), line2 = sans(13 * d), small = sans(11 * d), body = sans(13 * d);
    let y = top + pad;
    for (const line of wrap(head, P.say(m.title, L), inner, 3)) { drawText(head, x, y, line, ink, this.a(255), 0); y += leading(head); }
    y += 3 * d;
    if (m.creator.length > 0) { drawText(line2, x, y, wrap(line2, m.creator, inner, 1)[0], ink, this.a(255), 0); y += leading(line2); }
    const facts = [P.say(m.date, L), P.say(m.medium, L)].filter((s: string) => s.length > 0).join(', ');
    for (const line of wrap(small, facts, inner, 2)) { drawText(small, x, y, line, ink, this.a(160), 0); y += leading(small); }
    y += 7 * d;
    rrect(x, y, 34 * d, Math.max(1, Math.round(1.5 * d)), 0, this.colours.accent, this.a(255));
    y += 9 * d;
    const credit = wrap(small, [m.credit.institution, m.credit.accession, m.credit.licence].filter((s: string) => s.length > 0).join(' · '), inner - 24 * d, 2);
    const room = Math.floor((bottom - credit.length * leading(small) - 6 * d - y) / leading(body));
    if (room > 0) for (const line of wrap(body, P.say(m.description, L), inner, room)) { drawText(body, x, y, line, ink, this.a(255), 0); y += leading(body); }
    y = bottom - credit.length * leading(small);
    for (const line of credit) { drawText(small, x, y, line, ink, this.a(160), 0); y += leading(small); }
  }
}
