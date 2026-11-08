// ZN-1042, run by tests/t0/webenv_canvas_fidelity.sh: a pattern under a scale is filtered over four pixels as a browser does, its own
// transform (CanvasPattern.setTransform) places it, drawImage made larger samples the nearest pixel or four, and a script element waits for
// the data: pictures the script before it is loading (Phaser's blend-mode probe).
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const channel = (ctx, sx, sy, w, h, k = 0) => Array.from(ctx.getImageData(sx, sy, w, h).data.filter((_, i) => i % 4 === k)).join(' ');
const row = (ctx, y, w, k = 0) => channel(ctx, 0, y, w, 1, k);
const pair = canvas(2, 1), p2 = pair.getContext('2d');   // black, white
p2.fillStyle = '#000'; p2.fillRect(0, 0, 1, 1); p2.fillStyle = '#fff'; p2.fillRect(1, 0, 1, 1);

let c = canvas(8, 4), x = c.getContext('2d');
x.scale(4, 4); x.fillStyle = x.createPattern(pair, 'repeat'); x.fillRect(0, 0, 2, 1);
console.log('pattern x4 bilinear:', row(x, 1, 8));

const shifted = (m, smooth = false) => {
  const k = canvas(4, 1).getContext('2d'), p = k.createPattern(pair, 'repeat');
  if (m) p.setTransform(m);
  k.imageSmoothingEnabled = smooth; k.fillStyle = p; k.fillRect(0, 0, 4, 1);
  return row(k, 0, 4) + ' / alpha ' + row(k, 0, 4, 3);
};
console.log('pattern identity:', shifted(null));
console.log('pattern moved by 1:', shifted({ a: 1, b: 0, c: 0, d: 1, e: 1, f: 0 }));
console.log('pattern scaled by 2:', shifted({ a: 2, d: 2 }));
console.log('pattern not invertible:', shifted({ a: 0, d: 0 }));

const quad = canvas(2, 2), q = quad.getContext('2d');
[['#f00', 0, 0], ['#0f0', 1, 0], ['#00f', 0, 1], ['#fff', 1, 1]].forEach(([s, i, j]) => { q.fillStyle = s; q.fillRect(i, j, 1, 1); });
c = canvas(8, 8); x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(quad, 0, 0, 8, 8);
console.log('drawImage x4 nearest, red:', [0, 3, 4, 7].map(y => row(x, y, 8)).join(' | '));
console.log('drawImage x4 nearest, blue:', [0, 3, 4, 7].map(y => row(x, y, 8, 2)).join(' | '));
c = canvas(8, 1); x = c.getContext('2d'); x.drawImage(pair, 0, 0, 8, 1);
console.log('drawImage x4 bilinear across:', row(x, 0, 8));
const tall = canvas(1, 2), t = tall.getContext('2d');
t.fillStyle = '#000'; t.fillRect(0, 0, 1, 1); t.fillStyle = '#fff'; t.fillRect(0, 1, 1, 1);
c = canvas(1, 8); x = c.getContext('2d'); x.drawImage(tall, 0, 0, 1, 8);
console.log('drawImage x4 bilinear down:', channel(x, 0, 0, 1, 8));

for (const src of ['probe.js', 'answer.js']) { const s = document.createElement('script'); s.src = src; s.async = false; document.head.appendChild(s); }
