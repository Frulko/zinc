// Starting scripts of the playground (the tabs above the editor).
export const NAMES: string[] = ['Orbits', 'Flow', 'Bars', 'Broken'];

export const SAMPLES: string[] = [
`// draw(t) runs every frame. The host exposes clear,
// color, rect, circle, ring, line, text, time, width
// and height; console.log goes to the console below.
const planets = 7;

function draw(t) {
  clear(11, 13, 20);
  const cx = width() / 2, cy = height() / 2;
  for (let i = 0; i < planets; i++) {
    const r = 34 + i * 24;
    const a = t * (1.1 - i * 0.12) + i * 0.9;
    color(120, 140, 255, 40);
    ring(cx, cy, r);
    color(255, 150 + i * 14, 90 + i * 22);
    circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4 + (i % 3) * 2);
  }
  color(255, 205, 90);
  circle(cx, cy, 14);
  color(255, 255, 255, 200);
  text(14, 14, 'orbits ' + t.toFixed(1) + ' s');
}

console.log('ready:', planets, 'planets');
`,
`// A field of short lines following a moving flow.
const step = 22;

function angle(x, y, t) {
  return Math.sin(x * 0.012 + t) + Math.cos(y * 0.015 - t * 0.7);
}

function draw(t) {
  clear(8, 10, 16);
  for (let y = step / 2; y < height(); y += step) {
    for (let x = step / 2; x < width(); x += step) {
      const a = angle(x, y, t) * Math.PI;
      const k = (Math.sin(a) + 1) / 2;
      color(80 + k * 175, 120 + k * 60, 255 - k * 120);
      line(x, y, x + Math.cos(a) * 9, y + Math.sin(a) * 9, 2);
    }
  }
}
`,
`// Data from the host is plain JSON; so is what you log.
const data = [4, 8, 15, 16, 23, 42, 30, 12];
console.log({ n: data.length, max: Math.max(...data) });

function draw(t) {
  clear(250, 250, 252);
  const w = width() / data.length;
  data.forEach((v, i) => {
    const h = v / 42 * (height() - 80) * (0.6 + 0.4 * Math.sin(t * 2 + i));
    color(79, 70, 229, 200);
    rect(i * w + 8, height() - 40 - h, w - 16, h);
    color(24, 24, 27);
    text(i * w + w / 2 - 8, height() - 30, v);
  });
  text(16, 16, 'bars', 24);
}
`,
`// Errors point at their line (red gutter dot).
function draw(t) {
  clear(20, 12, 12);
  color(255, 120, 120);
  circle(width() / 2, height() / 2, 40 + Math.sin(t) * 10);
  if (t > 1) drawSomething(t);
}
`,
];
