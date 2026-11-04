// Quill's scribble.c and vanishing_trail.c: the pen straight to the Pen waveform.
import { Ink } from 'zinc:ink';
import { rect, stroke, penCount, penX, penY, penPressure, penFlags, PenFlag } from 'zinc:gfx';
import { Demo } from './demo';

const page = new Ink();
page.width = 5;

export const scribble: Demo = {
  title: 'Encre',
  about: 'Écris au Marker : pression, gomme au dos du stylet. La latence la plus basse possible sur cette dalle.',
  start: () => { page.clear(); },
  tick: (_dt: number) => false,
  draw: (x: i32, y: i32, w: i32, h: i32) => { page.draw(x, y, w, h); },
};

// The trail: each segment lives TRAIL_SECONDS, then goes, by partial updates only.
const TRAIL_SECONDS = 1.2;
class Segment { x0 = 0; y0 = 0; x1 = 0; y1 = 0; width = 0; age = 0; }
let segments: Segment[] = [];
let lastX = -1, lastY = -1;

function feedPen(x: i32, y: i32): void {
  for (let i = 0; i < penCount(); i++) {
    if ((penFlags(i) & PenFlag.Down) === 0) { lastX = -1; continue; }
    const px = penX(i) - x, py = penY(i) - y;
    if (lastX >= 0) {
      const s = new Segment();
      s.x0 = lastX; s.y0 = lastY; s.x1 = px; s.y1 = py; s.width = 3 + penPressure(i) * 6;
      segments.push(s);
    }
    lastX = px; lastY = py;
  }
}

export const trail: Demo = {
  title: 'Trace fugace',
  about: "Dessine : l'encre disparaît derrière le stylet, sans jamais rafraîchir l'écran entier.",
  start: () => { segments = []; lastX = -1; },
  tick: (dt: number) => {
    if (segments.length === 0) return false;
    for (let i = 0; i < segments.length; i++) segments[i].age += dt;
    while (segments.length > 0 && segments[0].age > TRAIL_SECONDS) segments.shift();
    return true;
  },
  draw: (x: i32, y: i32, w: i32, h: i32) => {
    feedPen(x, y);
    rect(x, y, w, h, 0xffffff);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      stroke([x + s.x0, y + s.y0, x + s.x1, y + s.y1], s.width, 0x000000, 255, false);
    }
  },
};
