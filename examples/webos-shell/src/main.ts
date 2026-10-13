// webos-shell: a launcher for Zinc programs on HP webOS 3 (README.md). Drawn with zinc:gfx alone: a gradient, pictures and text, which
// the tablet's GPU draws in a few milliseconds. The frame is kept while nothing changes.
import { onFrame, width, height, gradient, rrect, drawImage, imageFromBytes, font, drawText, textWidth, pointerX, pointerY, pointerDown, keep } from 'zinc:gfx';
import { exists, readText, readBytes } from 'zinc:fs';
import { isWebOS, launch } from 'zinc:webos';

class App { id: string = ''; title: string = ''; icon: i32 = -1; }

const ICON = 128, CELL_W = 208, CELL_H = 204, TOP = 132;
const titleFont = font('sans-bold', 34), labelFont = font('sans', 18), noteFont = font('sans', 15), letterFont = font('sans-bold', 56);
const TINTS: u32[] = [0x6366f1, 0x10b981, 0xf59e0b, 0xef4444, 0x0ea5e9, 0xa855f7];

// apps.txt beside the program: id <tab> title <tab> icon file, a line a program
function load(): App[] {
  const out: App[] = [];
  const text = exists('apps.txt') ? readText('apps.txt') : 'sample.fruits\tFruits\t\nsample.hero\tHero\t\nsample.kit\tUI kit\t\nsample.keys\tKeyboard\t';
  for (const line of text.split('\n')) {
    const f = line.split('\t');
    if (f.length < 2 || f[0] === '') continue;
    const a = new App();
    a.id = f[0]; a.title = f[1];
    if (f.length > 2 && f[2] !== '' && exists(f[2])) a.icon = imageFromBytes(readBytes(f[2]));
    out.push(a);
  }
  return out;
}
const apps = load();

let wasDown = false, pressed = -1, downX = 0, downY = 0, started = -1, startedFor = 0, dirty = 3;

/** The program whose icon holds the point, or -1. */
function hit(x: number, y: number, cols: i32, left: number): i32 {
  if (y < TOP || x < left) return -1;
  const c = Math.floor((x - left) / CELL_W) as i32, r = Math.floor((y - TOP) / CELL_H) as i32;
  if (c >= cols) return -1;
  const i = r * cols + c;
  if (i >= apps.length) return -1;
  const ix = left + c * CELL_W + (CELL_W - ICON) / 2, iy = TOP + r * CELL_H;
  return x >= ix - 12 && x < ix + ICON + 12 && y >= iy - 8 && y < iy + ICON + 44 ? i : -1;
}

onFrame((dt: number) => {
  const W = width(), H = height();
  const cols = Math.max(1, Math.floor((W - 96) / CELL_W)) as i32, left = (W - cols * CELL_W) / 2;
  const down = pointerDown(), x = pointerX(), y = pointerY();
  if (down && !wasDown) { pressed = hit(x, y, cols, left); downX = x; downY = y; dirty = 2; }
  if (down && pressed >= 0 && Math.abs(x - downX) + Math.abs(y - downY) > 24) { pressed = -1; dirty = 2; }   // the finger went away: no tap
  if (!down && wasDown) {
    if (pressed >= 0 && hit(x, y, cols, left) === pressed) {
      started = pressed; startedFor = 1.2;
      if (isWebOS()) launch(apps[pressed].id); else console.log('launch', apps[pressed].id);
    }
    pressed = -1; dirty = 2;
  }
  wasDown = down;
  if (startedFor > 0) { startedFor -= dt; dirty = 2; if (startedFor <= 0) started = -1; }
  if (dirty <= 0) { keep(); return; }
  dirty--;

  gradient(0, 0, W, H, 0, 0x0f172a, 0x1e293b, true, 255);
  drawText(titleFont, 48, 40, 'Zinc', 0xffffff, 255, 0);
  drawText(noteFont, 48 + textWidth(titleFont, 'Zinc', 0) + 14, 58, apps.length + ' programs', 0x94a3b8, 255, 0);
  for (let i = 0; i < apps.length; i++) {
    const a = apps[i];
    const ix = left + (i % cols) * CELL_W + (CELL_W - ICON) / 2, iy = TOP + Math.floor(i / cols) * CELL_H;
    const alpha: i32 = i === pressed ? 150 : 255;
    if (i === started) rrect(ix - 10, iy - 10, ICON + 20, ICON + 20, 34, 0xffffff, 60);
    if (a.icon >= 0) drawImage(a.icon, ix, iy, ICON, ICON, alpha, 26);
    else {
      rrect(ix, iy, ICON, ICON, 26, TINTS[i % TINTS.length], alpha);
      const letter = a.title.slice(0, 1);
      drawText(letterFont, ix + (ICON - textWidth(letterFont, letter, 0)) / 2, iy + 32, letter, 0xffffff, alpha, 0);
    }
    drawText(labelFont, ix + (ICON - textWidth(labelFont, a.title, 0)) / 2, iy + ICON + 12, a.title, 0xe2e8f0, alpha, 0);
  }
});
