// Two figures of https://skills.wheresryan.sh/anatomy (the npm package anatomy-figures 0.1.0, MIT), downloaded and drawn by Zinc's Canvas 2D:
// no webview, no DOM. A click or a key shows the next one.   Run it:  zinc run examples/js-anatomy
// ponytail: a still drawing. Only <path> and <circle> are read, and five rules stand for the figure's stylesheet; <use>, gradients, clips and
// the figure's own script (what makes it move) are left out. Playing them live needs an SVG tree with CSS in the web environment (ZN-727).
const FIGURES = { watch: 'chunk-BDGZEXME.js', turbofan: 'chunk-GPUBZAXN.js' }, names = Object.keys(FIGURES);
const SHADE = ['#dcdcd9', '#e5e5e2', '#ededea', '#f4f4f1'], TONE = { hi: '#18181a', mid: '#6a6a6a', lo: '#a8a8a8', faint: '#d0d0d0', lit: '#e5484d' };
const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
canvas.width = innerWidth; canvas.height = innerHeight; document.body.appendChild(canvas);

async function show(name) {
  const t0 = performance.now();
  const text = await (await fetch('https://unpkg.com/anatomy-figures@0.1.0/dist/chunks/' + FIGURES[name])).text();
  const svg = text.slice(text.indexOf('<svg'), text.lastIndexOf('</svg>')), [, , w, h] = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
  const t1 = performance.now(), k = Math.min(canvas.width / w, canvas.height / h);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fbfbfa'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, (canvas.width - w * k) / 2, (canvas.height - h * k) / 2); ctx.lineWidth = 0.6;
  let shapes = 0;
  for (const [, tag, attrs] of svg.matchAll(/<(path|circle)\b([^>]*?)\/?>/g)) {
    const a = {}; for (const [, key, value] of attrs.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) a[key] = value;
    const c = a.class || '', r = +a.r, x = +a.cx, y = +a.cy;
    const d = tag === 'circle' ? `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z` : a.d;
    if (!d) continue;
    const path = new Path2D(d); shapes++;
    if (/iso-(line|edge|crease|bevel)/.test(c)) { ctx.strokeStyle = TONE[a['data-tone']] || TONE.lo; ctx.stroke(path); }
    else { ctx.fillStyle = c.includes('iso-top') ? '#ffffff' : c.includes('iso-shade') ? SHADE[a['data-shade'] & 3] : c.includes('iso-halo') ? '#ecece8' : '#fbfbfa'; ctx.fill(path); }
  }
  console.log(`${name}: ${shapes} shapes, download ${(t1 - t0).toFixed(0)} ms, draw ${(performance.now() - t1).toFixed(0)} ms`);
}
let at = 0;
const next = () => show(names[at++ % names.length]).catch(e => console.error('js-anatomy: ' + e.message));
addEventListener('pointerdown', next); addEventListener('keydown', next);
next();
