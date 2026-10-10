// The storyboard for the visitor: the map of the story, the picture the editor draws. Every sequence is a node at its storyboard position
// (x, y is the centre of a node 240 by 150 units) with a miniature of its table and its title; every link is an arrow, dashed when it opens
// its sequence over the other. The sequences already seen carry a mark, the links followed are in the accent colour, the current sequence
// is framed: a visitor sees where they have been, and a touch on a node goes there.
import { imageWidth, imageHeight, rrect, border, shadow, polygon, stroke, drawImage, drawText, textWidth } from 'zinc:gfx';
import { Project, Sequence, Colours } from './project';
import { Frame } from './frame';
import { sans, bold, wrap, leading } from './type';
import { word } from './words';
import { files } from './files';

const NODE_W = 240, NODE_H = 150;   // a node, in storyboard units
const STAGE_H = 96;                 // the miniature of the table inside it
const LARGEST = 1.7;                // a storyboard of few nodes is not blown up beyond this

/** What a miniature shows of an item: its box on the table and its picture (-1: a text panel; -2: a 3D object). */
class Thumb {
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  picture: i32 = -1;
}

export class Storyboard {
  /** Whether it is asked for, and how much of it is there (it fades in and out): 0 none, 1 all. */
  open = false;
  rise = 0;
  private project: Project;
  private colours: Colours;
  private frame: Frame;
  private thumbs = new Map<string, Thumb[]>();
  // where the storyboard lies in the frame: a storyboard unit is `z` frame units, its origin at (x0, y0)
  private z = 1;
  private x0 = 0;
  private y0 = 0;

  constructor(project: Project, colours: Colours, frame: Frame) {
    this.project = project; this.colours = colours; this.frame = frame;
    for (const s of project.sequences) {
      const list: Thumb[] = [];
      for (const it of s.items) {
        const m = project.medium(it.media);
        if (m === null || m.kind === 'audio') continue;
        const t = new Thumb();
        t.x = it.x; t.y = it.y; t.w = it.width;
        const file = m.kind === 'photo' || m.kind === 'panorama' ? m.file : m.kind === 'video' ? m.poster : '';
        if (file.length > 0) t.picture = files.picture(file);
        if (m.kind === 'model') t.picture = -2;
        t.h = it.height > 0 ? it.height : t.picture >= 0 ? t.w * imageHeight(t.picture) / imageWidth(t.picture) : t.w * 0.6;
        list.push(t);
      }
      this.thumbs.set(s.id, list);
    }
  }

  /** Fits the nodes in the frame, between the title above and the buttons at the visitor's edge. */
  private fit(): void {
    const F = this.frame, all = this.project.sequences;
    let left = 1e30, top = 1e30, right = -1e30, bottom = -1e30;
    for (const s of all) { left = Math.min(left, s.storyX); right = Math.max(right, s.storyX); top = Math.min(top, s.storyY); bottom = Math.max(bottom, s.storyY); }
    const w = right - left + NODE_W, h = bottom - top + NODE_H, roomW = F.w - 240, roomH = F.h - 370;
    this.z = Math.min(LARGEST, Math.min(roomW / w, roomH / h));
    this.x0 = F.w / 2 - (left + right) / 2 * this.z;
    this.y0 = 170 + roomH / 2 - (top + bottom) / 2 * this.z;
  }

  /** The sequence whose node is under a point of the frame, or null. */
  nodeAt(fx: number, fy: number): Sequence | null {
    this.fit();
    const all = this.project.sequences;
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      if (Math.abs(fx - (this.x0 + s.storyX * this.z)) <= NODE_W * this.z / 2 && Math.abs(fy - (this.y0 + s.storyY * this.z)) <= NODE_H * this.z / 2) return s;
    }
    return null;
  }

  update(dt: number): void {
    const to = this.open ? 1 : 0;
    if (this.rise !== to) this.rise = Math.abs(to - this.rise) < dt / 0.25 ? to : this.rise + (to > this.rise ? dt : -dt) / 0.25;
  }

  /** The way of an arrow from `a` to `b`, in storyboard units, from the edge of one node to the edge of the other: it bends to the right
   *  of its way, so the way back bends to the other side (the editor's rule, editor/storyboard.tsx). */
  private route(a: Sequence, b: Sequence): number[] {
    const dx = b.storyX - a.storyX, dy = b.storyY - a.storyY, len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const bend = 2 * (len < 500 ? 16 + len * 0.1 : len * 0.22), mx = (a.storyX + b.storyX) / 2 - dy / len * bend, my = (a.storyY + b.storyY) / 2 + dx / len * bend;
    const out: number[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, u = 1 - t, x = u * u * a.storyX + 2 * u * t * mx + t * t * b.storyX, y = u * u * a.storyY + 2 * u * t * my + t * t * b.storyY;
      if (this.within(x, y, a) || this.within(x, y, b)) continue;
      out.push(x); out.push(y);
    }
    return out;
  }
  private within(x: number, y: number, s: Sequence): boolean { return Math.abs(x - s.storyX) < NODE_W / 2 + 5 && Math.abs(y - s.storyY) < NODE_H / 2 + 5; }

  /** Draws the storyboard in the visitor's frame (which is on). `current`: the sequence on the table; `trail`: the sequences seen, in
   *  the order of the visit. */
  draw(k: number, lang: string, current: string, trail: string[]): void {
    if (this.rise <= 0) return;
    this.fit();
    const F = this.frame, c = this.colours, P = this.project, z = this.z * k, a = (alpha: number): i32 => Math.round(alpha * this.rise);
    const X = (x: number): number => F.ox + this.x0 * k + x * z, Y = (y: number): number => F.oy + this.y0 * k + y * z;
    rrect(F.ox, F.oy, F.w * k, F.h * k, 0, c.background, a(250));   // the table is almost gone: the map is read alone

    const head = bold(30 * k), hint = sans(17 * k);
    drawText(head, F.ox + 48 * k, F.oy + 34 * k, word('map', lang), c.text, a(255), 0);
    drawText(hint, F.ox + 48 * k, F.oy + 36 * k + leading(head), word('map-hint', lang), c.muted, a(255), 0);

    // the arrows, under the nodes: every link, every `next`, every point of interest that leads somewhere, once per pair of sequences
    const drawn = new Set<string>();
    for (const from of P.sequences) {
      const ways: string[] = [], over: boolean[] = [];
      for (const l of from.links) { ways.push(l.to); over.push(l.overlay); }
      ways.push(from.next); over.push(false);
      for (const it of from.items) { const m = P.medium(it.media); if (m !== null) for (const q of m.points) { ways.push(q.to); over.push(false); } }
      for (let i = 0; i < ways.length; i++) {
        const to = P.sequence(ways[i]), key = `${from.id} ${ways[i]}`;
        if (to === null || to === from || drawn.has(key)) continue;
        drawn.add(key);
        const pts = this.route(from, to), n = pts.length;
        if (n < 4) continue;
        for (let j = 0; j < n; j += 2) { pts[j] = X(pts[j]); pts[j + 1] = Y(pts[j + 1]); }
        let followed = false;
        for (let j = 1; j < trail.length; j++) if (trail[j - 1] === from.id && trail[j] === to.id) followed = true;
        const colour = followed ? c.accent : c.muted, wide = (followed ? 3 : 2) * Math.max(1, z), alpha = a(followed ? 255 : 170);
        if (over[i]) { for (let j = 0; j + 3 < n; j += 4) stroke([pts[j], pts[j + 1], pts[j + 2], pts[j + 3]], wide, colour, alpha, false); }
        else stroke(pts, wide, colour, alpha, false);
        // the head of the arrow
        const hx = pts[n - 2] - pts[n - 4], hy = pts[n - 1] - pts[n - 3], hl = Math.max(0.001, Math.sqrt(hx * hx + hy * hy)), ux = hx / hl, uy = hy / hl, size = 12 * Math.max(1, z);
        polygon([pts[n - 2], pts[n - 1], pts[n - 2] - ux * size - uy * size * 0.55, pts[n - 1] - uy * size + ux * size * 0.55,
          pts[n - 2] - ux * size + uy * size * 0.55, pts[n - 1] - uy * size - ux * size * 0.55], colour, alpha);
      }
    }

    const title = bold(15 * z), small = bold(13 * k), W = P.table.width, H = P.table.height, m = STAGE_H / H;   // m: table units to storyboard units
    for (const s of P.sequences) {
      const x = X(s.storyX - NODE_W / 2), y = Y(s.storyY - NODE_H / 2), w = NODE_W * z, h = NODE_H * z, here = s.id === current, seen = trail.indexOf(s.id) >= 0;
      shadow(x, y + 3 * z, w, h, 3 * z, 14 * z, 0x000000, a(150));
      rrect(x, y, w, h, 3 * z, c.paper, a(255));
      // the miniature: the table of the sequence, its media where they lie
      const sw = STAGE_H * W / H * z, sx = x + (w - sw) / 2, sy = y + 8 * z;
      rrect(x + 8 * z, sy, w - 16 * z, STAGE_H * z, 2 * z, c.background, a(255));
      for (const t of this.thumbs.get(s.id) ?? []) {
        const tx = sx + (t.x - t.w / 2) * m * z, ty = sy + (t.y - t.h / 2) * m * z, tw = t.w * m * z, th = t.h * m * z;
        if (t.picture >= 0) drawImage(t.picture, tx, ty, tw, th, a(255), 0);
        else if (t.picture === -1) rrect(tx, ty, tw, th, z, c.paper, a(235));
        else { rrect(tx + tw * 0.3, ty + th * 0.1, tw * 0.4, th * 0.8, tw * 0.12, c.text, a(60)); border(tx + tw * 0.3, ty + th * 0.1, tw * 0.4, th * 0.8, tw * 0.12, Math.max(1, z), c.accent, a(255)); }
      }
      let ty = y + (8 + STAGE_H + 6) * z;
      for (const line of wrap(title, P.say(s.title, lang), w - 20 * z, 2)) { drawText(title, x + 10 * z, ty, line, c.ink, a(255), 0); ty += leading(title); }
      if (here) {
        border(x - 4 * z, y - 4 * z, w + 8 * z, h + 8 * z, 6 * z, 3 * z, c.accent, a(255));
        const label = word('here', lang), lw = textWidth(small, label, 0) + 24 * k, lh = 28 * k;
        rrect(x + (w - lw) / 2, y + h + 12 * z, lw, lh, lh / 2, c.accent, a(255));
        drawText(small, x + (w - lw) / 2 + 12 * k, y + h + 12 * z + (lh - leading(small)) / 2 + k, label, c.background, a(255), 0);
      }
      if (seen) {   // a tick in a disc on the corner
        const r = 13 * z, cx = x + w - 4 * z, cy = y + 4 * z;
        rrect(cx - r, cy - r, 2 * r, 2 * r, r, c.accent, a(255));
        stroke([cx - 6 * z, cy, cx - 2 * z, cy + 4.5 * z, cx + 6 * z, cy - 4.5 * z], 2.6 * z, c.background, a(255), false);
      }
    }
  }
}
