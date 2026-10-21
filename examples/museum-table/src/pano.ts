// The panorama viewer (ZN-650.09): a panorama medium of the project, full screen, with its points of interest, their cards and the
// sequences they lead to. Until the sequence player (ZN-650.05) embeds PanoramaView, it shows one medium and names the sequence a link
// would open. One finger looks around, a pinch or the wheel zooms, a tap on a point opens its card, a tap on the card's button follows it.
//   zinc run examples/museum-table/src/pano.ts -- [medium id] [language]
// Every look, zoom, opened point and followed link is printed on one line: the view log (tests/demo/museum_panorama.sh).
import { onFrame, clear, width, height, pointerDown, pointerX, pointerY, wheel, pinch, image, font, drawText, textWidth, rrect, border } from 'zinc:gfx';
import { readText } from 'zinc:assets';
import * as sys from 'zinc:sys';
import { parseProject, Media, Point, Project } from './project';
import { PanoramaView } from './panorama';

const project: Project = parseProject(readText('project.json'));
const args = sys.args();
let medium: Media | null = null;
for (const m of project.media) if (m.kind === 'panorama' && (args.length === 0 || m.id === args[0])) { medium = m; break; }
if (medium === null) throw new Error(args.length > 0 ? `no panorama "${args[0]}" in project.json` : 'no panorama in project.json');
const pano: Media = medium as Media;
const lang = args.length > 1 ? args[1] : project.languages[0];
const theme = project.theme;
const body = font(theme.font, 18), title = font(theme.titleFont, 22), small = font(theme.font, 15);
const view = new PanoramaView(image(pano.file), pano.view);

const r1 = (v: number): string => (Math.round(v * 10) / 10).toString();
function log(what: string): void { console.log(`${what}: yaw ${r1(view.yaw)}, pitch ${r1(view.pitch)}, fov ${r1(view.fov)}`); }

let open: Point | null = null;       // the point whose card is shown
let following = '';                  // the sequence a followed link would open
let down = false, dragged = false, settling = false;
let startX = 0, startY = 0, lastX = 0, lastY = 0, still = 0, zooming = 0;
const CARD_W = 420, BUTTON_H = 44;

/** The card of the open point: its box [x, y, w, h], and the button's when it leads somewhere. */
function cardBox(w: number, h: number): number[] { return [24, h - 260, CARD_W, 236]; }
function buttonBox(w: number, h: number): number[] { const c = cardBox(w, h); return [c[0] + 20, c[1] + c[3] - BUTTON_H - 18, CARD_W - 40, BUTTON_H]; }
function inside(b: number[], x: number, y: number): boolean { return x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]; }

function pointAt(x: number, y: number, w: number, h: number): Point | null {
  let best: Point | null = null, bestD = 30 * 30;
  for (const p of pano.points) {
    const s = view.project(p.at, 0, 0, w, h);
    if (s.length === 0) continue;
    const d = (s[0] - x) * (s[0] - x) + (s[1] - y) * (s[1] - y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function tap(x: number, y: number, w: number, h: number): void {
  const o = open;
  if (o !== null && o.to.length > 0 && inside(buttonBox(w, h), x, y)) {
    following = o.to;
    console.log(`link: ${o.id} -> ${o.to}`);
    return;
  }
  if (o !== null && inside(cardBox(w, h), x, y)) return;
  const p = pointAt(x, y, w, h);
  if (p !== null) {
    open = p; following = '';
    view.glideTo(p.view, 0.6);
    console.log(`open: ${p.id}`);
    settling = true;
    return;
  }
  if (o !== null) { open = null; following = ''; console.log('close'); }
}

/** Words of `s` in lines no wider than `maxW` with font `f`. */
function lines(f: i32, s: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line.length > 0 ? line + ' ' + word : word;
    if (line.length > 0 && textWidth(f, next, 0) > maxW) { out.push(line); line = word; } else line = next;
  }
  if (line.length > 0) out.push(line);
  return out;
}

onFrame((dt: number) => {
  const w = width(), h = height();
  // input: a tap, a drag (beyond 8 pixels), the wheel and a pinch
  const isDown = pointerDown(), px = pointerX(), py = pointerY();
  if (isDown && !down) { down = true; dragged = false; startX = px; startY = py; lastX = px; lastY = py; still = 0; }
  else if (isDown && down) {
    if (!dragged && Math.abs(px - startX) + Math.abs(py - startY) > 8) dragged = true;
    if (dragged) {
      if (px !== lastX || py !== lastY) { view.drag(px - lastX, py - lastY, h, dt); still = 0; } else if ((still += dt) > 0.08) view.hold();
    }
    lastX = px; lastY = py;
  } else if (!isDown && down) {
    down = false;
    if (dragged) settling = true; else tap(px, py, w, h);
  }
  const z = wheel() > 0 ? 1.1 : wheel() < 0 ? 1 / 1.1 : pinch();
  if (z !== 1) { view.zoom(z); zooming = 0.25; }
  else if (zooming > 0 && (zooming -= dt) <= 0) log('zoom');
  view.step(dt, down && dragged);
  if (settling && !down && !view.moving()) { settling = false; log('look'); }

  clear(theme.background);
  view.draw(0, 0, w, h);
  // the points of interest, on their direction
  for (const p of pano.points) {
    const s = view.project(p.at, 0, 0, w, h);
    if (s.length === 0) continue;
    const on = open !== null && (open as Point).id === p.id;
    rrect(s[0] - 13, s[1] - 13, 26, 26, 13, on ? theme.accent : theme.paper, 230);
    border(s[0] - 13, s[1] - 13, 26, 26, 13, 3, theme.accent, 255);
    const label = project.say(p.title, lang), lw = textWidth(small, label, 0);
    rrect(s[0] + 20, s[1] - 14, lw + 20, 28, 14, theme.background, 200);
    drawText(small, s[0] + 30, s[1] - 9, label, theme.text, 255, 0);
  }
  // the title of the medium and its credit, on a dark band so that a bright sky does not hide them
  const name = project.say(pano.title, lang), credit = `${pano.creator}, ${pano.credit.institution}, ${pano.credit.licence}`;
  rrect(12, 12, Math.max(textWidth(title, name, 0), textWidth(small, credit, 0)) + 24, 68, 12, theme.background, 170);
  drawText(title, 24, 20, name, theme.text, 255, 0);
  drawText(small, 24, 52, credit, theme.muted, 255, 0);
  // the card of the open point
  const o = open;
  if (o !== null) {
    const c = cardBox(w, h);
    rrect(c[0], c[1], c[2], c[3], 16, theme.paper, 245);
    drawText(title, c[0] + 20, c[1] + 18, project.say(o.title, lang), theme.ink, 255, 0);
    let y = c[1] + 56;
    for (const l of lines(body, project.say(o.text, lang), CARD_W - 40)) { drawText(body, c[0] + 20, y, l, theme.ink, 255, 0); y += 24; }
    if (o.to.length > 0) {
      const b = buttonBox(w, h), seq = project.sequence(o.to);
      rrect(b[0], b[1], b[2], b[3], 22, theme.accent, 255);
      const label = '→ ' + (seq !== null ? project.say(seq.title, lang) : o.to) + (following.length > 0 ? '  ✓' : '');
      drawText(body, b[0] + 18, b[1] + 11, label, theme.ink, 255, 0);
    }
  }
});
