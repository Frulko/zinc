// A panorama on the table: a window on a 360-degree image (panorama.ts). One finger looks around and the view keeps turning a little, two
// fingers change the field of view; the points of interest stay on their direction, a touch on one opens its panel and turns the view to
// it, and the panel's button leads to the sequence the point names.
import { image, rrect, border, drawText, textWidth } from 'zinc:gfx';
import { Project, Media, Point, Colours } from './project';
import { Fingers, Finger } from './touch';
import { PanoramaView } from './panorama';
import { Frame } from './frame';
import { drawPanel } from './panel';
import { sans, bold, leading } from './type';
import { word } from './words';

/** The owner number of the fingers on a panorama. */
export const LOOKOUT: i32 = 4;
const MARK = 44;   // a point of interest takes a touch this far from its centre (table units)

export class Lookout {
  readonly media: Media;
  readonly view: PanoramaView;
  /** The box of the window on the table: centre and size, in table units. */
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  /** The point of interest whose panel is open. */
  opened: Point | null = null;
  /** The sequence the button of a panel asked for ('' for none: the caller goes there and empties it). */
  followed = '';
  private project: Project;
  private colours: Colours;
  private lang: string;
  private frame: Frame;
  /** The box of the open panel's button, in frame units ([] without one). */
  private button: number[] = [];

  constructor(project: Project, media: Media, colours: Colours, lang: string, frame: Frame) {
    this.project = project; this.media = media; this.colours = colours; this.lang = lang; this.frame = frame;
    this.view = new PanoramaView(image(media.file), media.view);
  }

  setLanguage(lang: string): void { this.lang = lang; }
  setColours(colours: Colours): void { this.colours = colours; }
  /** Back to the view the project opens with, every panel closed. */
  reset(): void { this.view.set(this.media.view); this.opened = null; this.followed = ''; this.button = []; }
  inside(x: number, y: number): boolean { return Math.abs(x - this.x) <= this.w / 2 && Math.abs(y - this.y) <= this.h / 2; }

  /** Where a point of interest is on the table now: [x, y], or [] when it is behind the visitor or out of the window. */
  locate(p: Point): number[] {
    const s = this.view.project(p.at, this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
    return s.length === 2 && this.inside(s[0], s[1]) ? s : [];
  }

  /** One frame: the fingers that landed on the window and belong to nothing yet are its own. */
  update(dt: number, fingers: Fingers): void {
    for (const f of fingers.down) if (f.fresh && f.owner === 0 && this.inside(f.x, f.y)) f.owner = LOOKOUT;
    const held = fingers.of(LOOKOUT);
    if (held.length === 1) {
      const f = held[0], dx = f.x - f.px, dy = f.y - f.py;
      if (dx === 0 && dy === 0) this.view.hold(); else this.view.drag(dx, dy, this.h, dt);
    } else if (held.length >= 2) {
      const a = held[0], b = held[1];
      const was = Math.sqrt((b.px - a.px) * (b.px - a.px) + (b.py - a.py) * (b.py - a.py)), is = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
      if (was > 8 && is > 8) this.view.zoom(is / was);
      this.view.hold();
    }
    this.view.step(dt, held.length > 0);
    for (const f of fingers.lifted) if (f.owner === LOOKOUT && f.tapped) this.tapped(f);
  }

  private tapped(f: Finger): void {
    const o = this.opened, b = this.button, fx = this.frame.x(f.x, f.y), fy = this.frame.y(f.x, f.y);
    if (o !== null && b.length === 4 && fx >= b[0] && fx < b[0] + b[2] && fy >= b[1] && fy < b[1] + b[3]) { this.followed = o.to; return; }
    let best: Point | null = null, nearest = MARK;
    for (const p of this.media.points) {
      const s = this.locate(p);
      if (s.length === 0) continue;
      const d = Math.sqrt((s[0] - f.x) * (s[0] - f.x) + (s[1] - f.y) * (s[1] - f.y));
      if (d < nearest) { nearest = d; best = p; }
    }
    this.opened = best;   // a touch elsewhere closes the panel
    if (best !== null) this.view.glideTo(best.view, 0.6);
  }

  /** Draws the window; the table's origin is at (ox, oy) on the screen and one table unit is `k` pixels. */
  render(ox: number, oy: number, k: number): void {
    this.view.draw(Math.round(ox + (this.x - this.w / 2) * k), Math.round(oy + (this.y - this.h / 2) * k), Math.round(this.w * k), Math.round(this.h * k));
  }

  /** Draws what is written over the window, in the visitor's frame (which is on): the label, the points, the open panel. */
  drawOver(k: number): void {
    const F = this.frame, c = this.colours, L = this.lang, m = this.media, turned = F.side % 2 === 1;
    const bw = turned ? this.h : this.w, bh = turned ? this.w : this.h;
    const left = F.ox + (F.x(this.x, this.y) - bw / 2) * k, top = F.oy + (F.y(this.x, this.y) - bh / 2) * k;
    const head = bold(26 * k), small = sans(16 * k), label = bold(15 * k);

    // the label, on a dark band so that a bright sky does not hide it
    const title = this.project.say(m.title, L), credit = [m.creator, m.credit.institution, m.credit.licence].filter((s: string) => s.length > 0).join(' · ');
    const band = Math.max(textWidth(head, title, 0), textWidth(small, credit, 0)) + 40 * k;
    rrect(left + 16 * k, top + 16 * k, band, leading(head) + leading(small) + 22 * k, 8 * k, c.background, 190);
    drawText(head, left + 36 * k, top + 26 * k, title, c.text, 255, 0);
    drawText(small, left + 36 * k, top + 28 * k + leading(head), credit, c.muted, 255, 0);

    for (const p of m.points) {
      const s = this.locate(p);
      if (s.length === 0) continue;
      const x = F.ox + F.x(s[0], s[1]) * k, y = F.oy + F.y(s[0], s[1]) * k, open = p === this.opened, r = (open ? 17 : 14) * k;
      const name = this.project.say(p.title, L), lw = textWidth(label, name, 0) + 24 * k, lh = 30 * k;
      rrect(x + r + 8 * k, y - lh / 2, lw, lh, lh / 2, c.background, 215);
      drawText(label, x + r + 20 * k, y - leading(label) / 2 + k, name, c.text, 255, 0);
      rrect(x - r, y - r, 2 * r, 2 * r, r, c.background, 150);
      border(x - r, y - r, 2 * r, 2 * r, r, Math.max(1.5, 2.5 * k), c.accent, 255);
      rrect(x - 5 * k, y - 5 * k, 10 * k, 10 * k, 5 * k, open ? c.accent : c.text, 255);
    }

    const o = this.opened;
    this.button = [];
    if (o !== null) {
      const to = o.to.length > 0 ? this.project.sequence(o.to) : null, pw = 400 * k, px = left + bw * k - pw - 28 * k, py = top + 110 * k;
      const b = drawPanel(px, py, pw, k, this.project.say(o.title, L), this.project.say(o.text, L), to !== null ? this.project.say(to.title, L) : '', c);
      if (b.length === 4) this.button = [(b[0] - F.ox) / k, (b[1] - F.oy) / k, b[2] / k, b[3] / k];
    } else if (m.points.length > 0) {
      const hint = word('points', L), hw = textWidth(small, hint, 0) + 36 * k;
      rrect(left + bw * k - hw - 16 * k, top + 16 * k, hw, leading(small) + 20 * k, 8 * k, c.background, 190);
      drawText(small, left + bw * k - hw + 2 * k, top + 26 * k, hint, c.muted, 255, 0);
    }
  }
}
