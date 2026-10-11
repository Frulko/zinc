// The light table: the photographs and text panels of a sequence lie on it as cards, like prints. One finger drags a card, two fingers
// turn and zoom it, a released card glides on and eases back from the edges; a touch brings a card to the front, a touch on its folded
// corner turns it over to read the notice, a double tap asks for the full view. Every card answers to its own fingers, so several hands
// work at once. Positions are in table units. A card is there from its item's `at` to its `until` on the sequence's clock, and carries the
// hotspots of the sequence that are on its medium: a ring that moves with it and leads to another sequence. A film (film.ts) plays in its
// card by itself while the card is there; a touch pauses it and starts it again.
import { imageWidth, imageHeight, rrect, border, shadow, polygon, drawImage, drawText, textWidth, setTransform, resetTransform } from 'zinc:gfx';
import { Project, Sequence, Media, Link, Colours } from './project';
import { Fingers, Finger, Pose, manipulate } from './touch';
import { sans, bold, wrap, leading, reading, faint } from './type';
import { files } from './files';
import { Film } from './film';

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
  /** The picture it shows (-1: none), its height on the card as designed (0: a text panel), and how much of that it has when its
   *  caption needs more room (1: all). */
  picture: i32 = -1;
  pictureHeight = 0;
  shrink = 1;
  /** The film it plays in place of its picture, which is the film's poster; and whether it was started since the card came. */
  film: Film | null = null;
  rolled = false;
  /** Lines of a text panel; under a picture, the lines its title and what is written under it may take. */
  lines: i32 = 0;
  under: i32 = 1;
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
  /** What happened to the films, one line of the story each (the caller tells them and empties this). */
  news: string[] = [];
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
      if (file.length > 0) c.picture = files.picture(file);
      if (c.picture >= 0) {
        c.pictureHeight = (c.w - 2 * BORDER) * imageHeight(c.picture) / imageWidth(c.picture);
        c.turns = m.kind === 'photo';
      }
      if (m.kind === 'video') {   // decoded at the size of its poster; without one, a dark screen
        if (c.picture < 0) c.pictureHeight = (c.w - 2 * BORDER) * 9 / 16;
        c.film = new Film(this.project, m, this.lang, c.picture >= 0 ? imageWidth(c.picture) : 1280, c.picture >= 0 ? imageHeight(c.picture) : 720);
      }
      this.measure(c);
      this.cards.push(c);
    }
  }

  /** The height of a card. A text panel grows with its text, which is not as long in every language. Under a picture the caption has
   *  room for two lines of title and one line under it; a longer title, or a larger text size, takes the room it needs from the
   *  picture (down to half of it), so that the card keeps its place among the others and nothing of its caption is cut. */
  private measure(c: Card): void {
    const m = c.media, body = sans(16), pad = BORDER * 2;
    if (c.pictureHeight === 0) {
      c.lines = wrap(body, this.project.say(m.kind === 'text' ? m.text : m.title, this.lang), c.w - 2 * pad, 0).length;
      c.h = pad + leading(bold(11)) + 8 + (c.lines + 0.5) * leading(body) + pad;
      return;
    }
    const head = bold(15), small = sans(12), inner = c.w - 2 * BORDER;
    c.lines = Math.max(2, wrap(head, this.project.say(m.title, this.lang), inner - (c.turns ? 22 : 0), 0).length);
    c.under = wrap(small, m.creator, inner - 30, 0).length;
    // the designed strip at the text size, and one line more for each line more than designed: exactly FOOT when nothing is longer
    const foot = FOOT * reading() + (c.lines - 2) * leading(head) + (c.under - 1) * leading(small);
    c.shrink = foot > FOOT ? Math.max(0.5, (c.pictureHeight + FOOT - foot) / c.pictureHeight) : 1;
    c.h = BORDER + c.pictureHeight * c.shrink + Math.max(FOOT, foot);
  }
  /** The language or the text size has changed: every card takes the height of its text. */
  setLanguage(lang: string): void {
    this.lang = lang;
    for (const c of this.cards) { c.film?.setLanguage(lang); this.measure(c); }
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
      const film = c.film;
      if (film === null) continue;
      // a film plays by itself while its card is there, from its beginning each time the card comes
      if (to === 1 && !c.rolled) { c.rolled = true; film.play(); this.news.push(`film ${c.media.id} play`); }
      else if (to === 0) this.halt(c);
      if (film.update(dt)) this.news.push(`film ${c.media.id} end`);
      const text = film.said();
      if (text !== film.cue) { film.cue = text; if (text.length > 0) this.news.push(`subtitle ${text}`); }
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

  /** The film of a card stops: the card went, or its sequence did. */
  private halt(c: Card): void {
    const film = c.film;
    if (film === null || !c.rolled) return;
    c.rolled = false;
    if (film.on) { film.stop(); this.news.push(`film ${c.media.id} stop`); }
  }
  /** The sequence is left, or waits under another: its films stop, and start again when it is back. */
  rest(): void { for (const c of this.cards) this.halt(c); }

  private tapped(c: Card, f: Finger, now: number): void {
    c.vx = 0; c.vy = 0; c.va = 0;
    this.toCard(c, f.x, f.y);
    if (c.turns && this.lx > c.w / 2 - FOLD && this.ly > c.h / 2 - FOLD) { c.back = !c.back; c.lastTap = -10; return; }
    if (c.turn < 0.5) for (const l of c.spots) {
      if (!LightTable.there(l.at, l.until, this.clock)) continue;
      const dx = this.lx - this.spotX(c, l), dy = this.ly - this.spotY(c, l);
      if (Math.sqrt(dx * dx + dy * dy) * c.pose.scale <= SPOT) { this.followed = l; c.lastTap = -10; return; }
    }
    const film = c.film;
    if (film !== null) {   // a touch pauses a film and starts it again; one that has ended plays again
      if (film.on) film.pause(!film.paused); else film.play();
      this.news.push(`film ${c.media.id} ${!film.paused ? 'play' : 'pause'}`);
      c.lastTap = -10;
    } else if (now - c.lastTap < DOUBLE_TAP && c.picture >= 0) { this.opened = c; c.lastTap = -10; }
    else c.lastTap = now;
  }

  /** Where a hotspot is in its card's own frame: its fractions are of the picture, or of the whole card when it shows none. */
  private spotX(c: Card, l: Link): number { return c.pictureHeight > 0 ? -c.w / 2 + BORDER + ((1 - c.shrink) / 2 + l.x * c.shrink) * (c.w - 2 * BORDER) : (l.x - 0.5) * c.w; }
  private spotY(c: Card, l: Link): number { return c.pictureHeight > 0 ? -c.h / 2 + BORDER + l.y * c.pictureHeight * c.shrink : (l.y - 0.5) * c.h; }

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
    if (c.pictureHeight === 0) {   // a text panel
      const pad = BORDER * 2 * d, head = bold(11 * d), body = sans(16 * d);
      let y = top + pad;
      drawText(head, left + pad, y, title.toUpperCase(), ink, this.a(faint(150)), 0.6 * d);
      y += leading(head) + 8 * d;
      for (const line of wrap(body, this.project.say(m.kind === 'text' ? m.text : m.title, this.lang), c.w * d - 2 * pad, c.lines + 1)) {
        drawText(body, left + pad, y, line, ink, this.a(255), 0);
        y += leading(body);
      }
      this.paintSpots(c, d);
      return;
    }
    const x = left + BORDER * d, inner = (c.w - 2 * BORDER) * d, head = bold(15 * d), small = sans(12 * d);
    let y = top + BORDER * d;
    const wide = inner * c.shrink, high = c.pictureHeight * d * c.shrink, px = x + (inner - wide) / 2;   // the picture, in the middle of the card's width
    const film = c.film, shot = film !== null ? film.image : -1;
    if (shot >= 0 || c.picture >= 0) drawImage(shot >= 0 ? shot : c.picture, px, y, wide, high, this.a(255), 0);
    else rrect(px, y, wide, high, 0, 0x000000, this.a(255));
    if (film !== null) this.paintFilm(film, d, px, y, wide, high);
    y += high + 8 * d;
    const lines = wrap(head, title, inner - (c.turns ? 22 * d : 0), c.lines);
    for (const line of lines) { drawText(head, x, y, line, ink, this.a(255), 0); y += leading(head); }
    const under = m.creator;
    if (lines.length < 2 || under.length > 0) for (const line of wrap(small, under, inner - 30 * d, c.under)) { drawText(small, x, y + d, line, ink, this.a(faint(160)), 0); y += leading(small); }
    this.paintSpots(c, d);
  }

  /** What a film shows over its picture: its timeline and what it says, at the foot; while it does not play, the sign a touch starts it by. */
  private paintFilm(film: Film, d: number, x: number, y: number, w: number, h: number): void {
    const colours = this.colours, bar = Math.max(2, 5 * d);
    if (film.on) {
      rrect(x, y + h - bar, w, bar, 0, colours.background, this.a(160));
      rrect(x, y + h - bar, w * Math.min(1, film.t / film.length), bar, 0, colours.accent, this.a(255));
      if (film.cue.length > 0) {
        const f = sans(22 * d), lines = wrap(f, film.cue, w - 80 * d, 0), high = lines.length * leading(f) + 16 * d;
        let wide = 0, ty = y + h - bar - 14 * d - high;
        for (const line of lines) wide = Math.max(wide, textWidth(f, line, 0));
        rrect(x + (w - wide) / 2 - 20 * d, ty, wide + 40 * d, high, 10 * d, colours.background, this.a(faint(225)));
        ty += 8 * d;
        for (const line of lines) { drawText(f, x + (w - textWidth(f, line, 0)) / 2, ty, line, colours.text, this.a(255), 0); ty += leading(f); }
      }
    }
    if (film.on && !film.paused) return;
    const r = Math.min(w, h) * 0.11, cx = x + w / 2, cy = y + h / 2;
    rrect(cx - r, cy - r, 2 * r, 2 * r, r, colours.background, this.a(faint(200)));
    border(cx - r, cy - r, 2 * r, 2 * r, r, Math.max(1, 2 * d), colours.accent, this.a(255));
    polygon([cx - r * 0.3, cy - r * 0.45, cx + r * 0.5, cy, cx - r * 0.3, cy + r * 0.45], colours.accent, this.a(255));
  }

  /** The hotspots: a ring on its place of the card and what it leads to, on the side where there is room. */
  private paintSpots(c: Card, d: number): void {
    const accent = this.colours.accent, f = bold(13 * d), r = 15 * d;
    for (const l of c.spots) {
      if (!LightTable.there(l.at, l.until, this.clock)) continue;
      const x = this.spotX(c, l) * d, y = this.spotY(c, l) * d, label = this.project.say(l.label, this.lang), lw = textWidth(f, label, 0) + 22 * d, lh = 28 * d * reading();
      const lx = l.x > 0.6 ? x - r - 8 * d - lw : x + r + 8 * d;
      rrect(lx, y - lh / 2, lw, lh, lh / 2, this.colours.background, this.a(faint(215)));
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
    for (const line of wrap(small, facts, inner, 2)) { drawText(small, x, y, line, ink, this.a(faint(160)), 0); y += leading(small); }
    y += 7 * d;
    rrect(x, y, 34 * d, Math.max(1, Math.round(1.5 * d)), 0, this.colours.accent, this.a(255));
    y += 9 * d;
    const credit = wrap(small, [m.credit.institution, m.credit.accession, m.credit.licence].filter((s: string) => s.length > 0).join(' · '), inner - 24 * d, 2);
    const room = Math.floor((bottom - credit.length * leading(small) - 6 * d - y) / leading(body));
    if (room > 0) for (const line of wrap(body, P.say(m.description, L), inner, room)) { drawText(body, x, y, line, ink, this.a(255), 0); y += leading(body); }
    y = bottom - credit.length * leading(small);
    for (const line of credit) { drawText(small, x, y, line, ink, this.a(faint(160)), 0); y += leading(small); }
  }
}
