// QuickJS workload "sprite" of docs/reports/quickjs-aot-jit-and-ffi.md: 10,000 sprites move, bounce and write their 4 rotated corners into a
// vertex Array each frame. zinc profile bench/qjs/sprite.mjs --engine quickjs (a ZN_QJS_PROFILE build)
const frames = 60, W = 800, H = 600, N = 10000;
const sprites = [];
let seed = 1;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let k = 0; k < N; k++) sprites.push({ x: rand() * W, y: rand() * H, vx: rand() * 4 - 2, vy: rand() * 4 - 2, a: rand() * 6.28, va: rand() * 0.1 - 0.05, w: 16, h: 16 });
const verts = new Array(N * 8).fill(0);
function step(s) {
  s.x += s.vx; s.y += s.vy; s.a += s.va;
  if (s.x < 0 || s.x > W) s.vx = -s.vx;
  if (s.y < 0 || s.y > H) s.vy = -s.vy;
}
function corners(s, out, o) {
  const c = Math.cos(s.a), n = Math.sin(s.a), hw = s.w / 2, hh = s.h / 2;
  out[o] = s.x - hw * c + hh * n; out[o + 1] = s.y - hw * n - hh * c;
  out[o + 2] = s.x + hw * c + hh * n; out[o + 3] = s.y + hw * n - hh * c;
  out[o + 4] = s.x + hw * c - hh * n; out[o + 5] = s.y + hw * n + hh * c;
  out[o + 6] = s.x - hw * c - hh * n; out[o + 7] = s.y - hw * n + hh * c;
}
for (let f = 0; f < frames; f++) for (let k = 0; k < N; k++) { step(sprites[k]); corners(sprites[k], verts, k * 8); }
console.log('sprite: ' + frames + ' frames, x0 ' + verts[0].toFixed(3));
