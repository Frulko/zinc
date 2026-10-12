// zinc:gfx under a matrix that only scales and moves (ZN-730): the box commands are recorded at their place and size on the screen, so
// they are the commands the program would have given directly. tests/t1/xform_plain.sh runs `matrix` and `direct` and compares the
// frames and the scene dumps. The numbers are sums of powers of two: the two ways give the same floats.
//   -- matrix | direct     the scene of the test
//   -- film-matrix | film-direct | film-turned [n]
//                          a 854x480 image that changes at every frame, drawn 500x281 n times (1): the cost of a film's picture
//                          (ZINC_PROFILE=1), under the matrix, directly, and under the same matrix turned by 2 degrees
import { onFrame, clear, rect, rrect, gradient, border, shadow, drawImage, drawImageRect, createImage, beginImage, endImage, setTransform, resetTransform } from 'zinc:gfx';
import { args } from 'zinc:sys';

const mode = args().length > 0 ? args()[0] : 'matrix', times = args().length > 1 ? parseInt(args()[1]) : 1;
const img = createImage(64, 32);
beginImage(img);
for (let i: i32 = 0; i < 8; i++) for (let j: i32 = 0; j < 4; j++) rect(i * 8, j * 8, 8, 8, ((i * 36) << 16) | ((j * 80) << 8) | ((i + j) % 2 === 0 ? 255 : 40));
endImage();

// The matrix x' = sx x + ex, y' = sy y + ey, or the same boxes worked out by the program.
let sx = 1, sy = 1, ex = 0, ey = 0;
function place(a: number, d: number, e: number, f: number): void {
  sx = a; sy = d; ex = e; ey = f;
  if (mode === 'matrix') setTransform(a, 0, 0, d, e, f);
}
const X = (x: number): number => mode === 'matrix' ? x : sx * x + ex;
const Y = (y: number): number => mode === 'matrix' ? y : sy * y + ey;
const W = (w: number): number => mode === 'matrix' ? w : sx * w;
const H = (h: number): number => mode === 'matrix' ? h : sy * h;

function scene(): void {
  const scales: number[] = [0.5, 0.75, 1, 1.5, 2.25];
  let left = 8;
  for (let i: i32 = 0; i < scales.length; i++) {
    const s = scales[i];
    place(s, s, left + 0.5, 6.25);
    shadow(X(6), Y(8), W(60), H(30), W(6), W(8), 0x000000, 150);
    rrect(X(6), Y(8), W(60), H(30), W(6), 0xffffff, 255);
    rect(X(10), Y(12), W(20), H(10), 0x1e3a8a);
    rrect(X(34), Y(12), W(28), H(10), W(4), 0xdb2777, 200);
    border(X(6), Y(46), W(60), H(30), W(8), W(3), 0x0f766e, 255);
    gradient(X(6), Y(84), W(60), H(24), W(5), 0x7c3aed, 0xf59e0b, false, 255);
    gradient(X(6), Y(112), W(60), H(24), 0, 0x7c3aed, 0xf59e0b, true, 180);
    drawImage(img, X(6), Y(142), W(64), H(32), 255, 0);
    drawImage(img, X(6), Y(178), W(64), H(32), 200, W(8));
    drawImageRect(img, 16, 8, 32, 16, X(6), Y(214), W(60), H(30), 255, 0, 0, 0xffffff, 0);
    left += 80 * s + 12;
  }
  place(2, 0.5, 20.5, 570);   // two scales: what has no radius, no width and no blur
  rect(X(4), Y(4), W(40), H(40), 0x16a34a);
  drawImage(img, X(50), Y(4), W(64), H(32), 255, 0);
  gradient(X(120), Y(4), W(40), H(40), 0, 0xea580c, 0x0ea5e9, false, 255);
  resetTransform();
}

const film = createImage(854, 480);
let n = 0;
onFrame((dt: number) => {
  clear(0xf1f5f9);
  if (mode === 'matrix' || mode === 'direct') { scene(); return; }
  beginImage(film);   // a new picture: stripes that move
  for (let i: i32 = 0; i < 14; i++) rect(i * 61, 0, 61, 480, (((i * 17 + n * 5) & 255) << 16) | (((i * 29) & 255) << 8) | ((n * 3) & 255));
  endImage();
  n++;
  const s = 500 / 854;
  for (let i: i32 = 0; i < times; i++) {
    if (mode === 'film-direct') drawImage(film, 150, 100, 854 * s, 480 * s, 255, 0);
    else {
      const t = mode === 'film-turned' ? 2 * Math.PI / 180 : 0;
      setTransform(Math.cos(t) * s, Math.sin(t) * s, -Math.sin(t) * s, Math.cos(t) * s, 400, 240);
      drawImage(film, -250 / s, -140 / s, 854, 480, 255, 0);
      resetTransform();
    }
  }
});
