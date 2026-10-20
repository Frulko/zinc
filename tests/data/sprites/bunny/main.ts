// zinc:gfx bunnymark (docs/reports/games/js-game-libraries.md 5.5, ZN-581): N sprites of a 26x37 runtime image bounce in an 800x600 window,
// one draw call each per frame; the program times its update and its draw calls and quits after FRAMES measured frames.
// MODE: image (drawImage, the report's bunnymark), tint (drawImageRect tinted, blended Add), turn (drawImageRect turning and tinted).
// A measure, not a test: N=20000 ZINC_PROFILE=1 ZINC_GL_STATS=1 on a built program gives the frame work and the GL replay's CPU and GPU time.
import { onFrame, clear, drawImage, drawImageRect, createImage, beginImage, endImage, rect, frame, quit, Blend } from 'zinc:gfx';
import { env } from 'zinc:sys';
const N: i32 = parseInt(env('N') === '' ? '2000' : env('N'));
const FRAMES: i32 = env('FRAMES') === '' ? 100 : parseInt(env('FRAMES'));
const MODE = env('MODE') === '' ? 'image' : env('MODE');
const W = 800, H = 600;
const img = createImage(26, 37);
beginImage(img); rect(0, 0, 26, 37, 0xeeeeee); rect(6, 6, 14, 14, 0xff6688); endImage();
const xs: number[] = [], ys: number[] = [], vxs: number[] = [], vys: number[] = [], tints: number[] = [];
let seed = 1;
function rnd(): number { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
for (let i = 0; i < N; i++) { xs.push(rnd() * W); ys.push(rnd() * H); vxs.push(rnd() * 10 - 5); vys.push(rnd() * 10 - 5); tints.push(Math.floor(rnd() * 0xffffff)); }
let tUpdate = 0, tDraw = 0, n = 0;
onFrame((dt: number) => {
  const a = performance.now();
  for (let i = 0; i < N; i++) {
    xs[i] += vxs[i]; ys[i] += vys[i]; vys[i] += 0.75;
    if (xs[i] > W) { vxs[i] = -vxs[i]; xs[i] = W; } else if (xs[i] < 0) { vxs[i] = -vxs[i]; xs[i] = 0; }
    if (ys[i] > H) { vys[i] = vys[i] * -0.85; ys[i] = H; } else if (ys[i] < 0) { vys[i] = 0; ys[i] = 0; }
  }
  const b = performance.now();
  clear(0x202030);
  if (MODE === 'tint') for (let i = 0; i < N; i++) drawImageRect(img, 0, 0, 26, 37, xs[i], ys[i] - 37, 26, 37, 255, 0, 0, tints[i], Blend.Add);
  else if (MODE === 'turn') for (let i = 0; i < N; i++) drawImageRect(img, 0, 0, 26, 37, xs[i], ys[i] - 37, 26, 37, 255, 0, xs[i] * 0.02, tints[i]);
  else for (let i = 0; i < N; i++) drawImage(img, xs[i], ys[i] - 37, 26, 37, 255, 0);
  const c = performance.now();
  if (frame() > 10) { tUpdate += b - a; tDraw += c - b; n++; }
  if (n === FRAMES) { console.log(`gfx bunnymark ${N} ${MODE}: update ${(tUpdate / n).toFixed(3)} ms, draw calls (record) ${(tDraw / n).toFixed(3)} ms per frame`); quit(); }
});
