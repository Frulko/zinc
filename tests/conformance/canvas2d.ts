// zinc:canvas (plugins/canvas2d): CSS colours, gradients, transforms, path and stroke geometry through the hit tests
// (fills, caps, joins, miter limit, dashes, arcs, curves), text metrics and a few drawn frames. Pixels are checked by
// screenshots of examples/canvas/sketch; this prints what the geometry decides.
import { CanvasRenderingContext2D, Canvas, parseColor } from 'zinc:canvas';
import { onFrame, quit } from 'zinc:gfx';

function f(v: number): string { return (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3); }
function hex(c: number): string {
  if (c < 0) return 'invalid';
  const d = '0123456789abcdef';
  let s = '';
  const rgb = c % 16777216;
  for (let i = 5; i >= 0; i--) s += d.at(Math.floor(rgb / Math.pow(16, i)) % 16);
  return `${s}/${Math.floor(c / 16777216)}`;
}
const css: string[] = ['#f80', '#ff8000cc', 'rgb(10, 20, 30)', 'rgba(255,0,0,0.5)', 'rgb(10% 50% 100% / 25%)', 'hsl(120, 100%, 25%)',
  'hsla(240,100%,50%,0.5)', 'rebeccapurple', 'Transparent', ' White ', 'nope', '#12345'];
for (const c of css) console.log('color', c, '->', hex(parseColor(c)));

const ctx = new CanvasRenderingContext2D();
function hits(label: string, pts: number[], stroke: boolean, rule: string): void {
  let out = '';
  for (let i = 0; i + 1 < pts.length; i += 2) out += (stroke ? ctx.isPointInStroke(pts[i], pts[i + 1]) : ctx.isPointInPath(pts[i], pts[i + 1], rule)) ? '1' : '0';
  console.log(label, out);
}
function contours(c: number[]): i32 { let n: i32 = 0; for (let i = 0; i < c.length; i += 1 + c[i] * 2) n++; return n; }

function geometry(): void {
  ctx.begin(10, 20, 200, 100);
  console.log('canvas', ctx.canvas.width, ctx.canvas.height);
  // transforms
  ctx.save();
  ctx.translate(10, 5); ctx.rotate(Math.PI / 2); ctx.scale(2, 3);
  const m = ctx.getTransform();
  console.log('transform', f(m.a), f(m.b), f(m.c), f(m.d), f(m.e), f(m.f));
  ctx.beginPath(); ctx.rect(0, 0, 10, 5);  // -> x in [-5, 10], y in [5, 25] on the canvas
  hits('rotated rect (0,10) (-4,6) (5,10) (-4,24) (-6,10)', [0, 10, -4, 6, 5, 10, -4, 24, -6, 10], false, 'nonzero');
  ctx.restore();
  const r = ctx.getTransform();
  console.log('restored', f(r.a), f(r.e));
  // star: nonzero fills the centre, even-odd does not
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 4 / 5; if (i === 0) ctx.moveTo(50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40); else ctx.lineTo(50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40); }
  ctx.closePath();
  hits('star nonzero centre/tip/outside', [50, 50, 50, 15, 90, 90], false, 'nonzero');
  hits('star evenodd centre/tip/outside', [50, 50, 50, 15, 90, 90], false, 'evenodd');
  // arcs, ellipses, curves, rounded rectangles
  ctx.beginPath(); ctx.arc(100, 50, 30, 0, Math.PI * 2);
  hits('circle centre/inside edge/outside', [100, 50, 129, 50, 100, 81], false, 'nonzero');
  ctx.beginPath(); ctx.moveTo(100, 50); ctx.arc(100, 50, 30, 0, Math.PI / 2); ctx.closePath();
  hits('quarter pie (115,65) (85,65) (115,35)', [115, 65, 85, 65, 115, 35], false, 'nonzero');
  ctx.beginPath(); ctx.moveTo(100, 50); ctx.arc(100, 50, 30, 0, Math.PI / 2, true); ctx.closePath();
  hits('three quarter pie, anticlockwise', [115, 65, 85, 65, 115, 35], false, 'nonzero');
  ctx.beginPath(); ctx.ellipse(50, 50, 40, 10, Math.PI / 2, 0, Math.PI * 2);
  hits('rotated ellipse (50,85) (85,50)', [50, 85, 85, 50], false, 'nonzero');
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(50, 100, 100, 0); ctx.closePath();
  hits('quadratic (50,40) (50,60)', [50, 40, 50, 60], false, 'nonzero');
  ctx.beginPath(); ctx.moveTo(0, 50); ctx.bezierCurveTo(0, 0, 100, 0, 100, 50); ctx.closePath();
  hits('bezier (50,20) (50,5)', [50, 20, 50, 5], false, 'nonzero');
  ctx.beginPath(); ctx.roundRect(0, 0, 100, 50, 20);
  hits('round rect corner/edge/centre', [2, 2, 50, 1, 50, 25], false, 'nonzero');
  // strokes: caps, joins, miter limit, dashes
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(100, 50);
  for (const cap of ['butt', 'square', 'round']) {
    ctx.lineCap = cap;
    hits(`cap ${cap} (50,54) (50,56) (-3,50) (-4,46)`, [50, 54, 50, 56, -3, 50, -4, 46], true, '');
  }
  ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(50, 0); ctx.lineTo(100, 100);  // sharp apex at (50, 0)
  for (const join of ['miter', 'bevel', 'round']) {
    ctx.lineJoin = join;
    hits(`join ${join} tip (50,-9) (50,-4)`, [50, -9, 50, -4], true, '');
  }
  ctx.lineJoin = 'miter'; ctx.miterLimit = 2;
  hits('miter limit 2 tip (50,-9)', [50, -9], true, '');
  ctx.miterLimit = 10;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(100, 10);
  console.log('dash', ctx.getLineDash().join(','), 'pieces', contours(ctx.strokeContours()));
  hits('dash on/off/on (5,10) (12,10) (17,10)', [5, 10, 12, 10, 17, 10], true, '');
  ctx.lineDashOffset = 5;
  hits('dash offset 5 (4,10) (7,10)', [4, 10, 7, 10], true, '');
  ctx.setLineDash([3]);
  console.log('odd dash list', ctx.getLineDash().join(','));
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(50, 50, 20, 0, Math.PI * 2); ctx.closePath();
  console.log('closed circle stroke pieces > 20:', contours(ctx.strokeContours()) > 20);
  // gradients
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
  g.addColorStop(1, 'blue'); g.addColorStop(0, 'white'); g.addColorStop(0.5, 'rgba(255, 0, 0, 0.5)'); g.addColorStop(0.5, 'lime');
  let st = '';
  for (let i = 0; i < g.stops.length; i += 3) st += ` ${f(g.stops[i])}:${hex(g.stops[i + 2] * 16777216 + g.stops[i + 1])}`;
  console.log('gradient stops', g.kind, st);
  ctx.fillStyle = 'red';
  ctx.fillGradient = g;
  ctx.fillStyle = '#00f';
  console.log('fillStyle clears the gradient', ctx.fillGradient === null, ctx.fillStyle);
  // text
  ctx.font = 'bold 20px sans-serif';
  const t = ctx.measureText('Hello, canvas');
  console.log('measureText', f(t.width), f(t.actualBoundingBoxAscent), t.width > 100);
  ctx.font = '12px monospace';
  console.log('monospace width', f(ctx.measureText('abc').width));
  ctx.end();
}
geometry();

// ---------------------------------------------------------------- drawing
const off = new Canvas(32, 16);
const octx = off.getContext('2d');
console.log('offscreen', off.width, off.height, octx.canvas.width, octx.canvas.height);
let frames = 0;
onFrame((dt: number) => {
  octx.begin();
  octx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  octx.fillRect(0, 0, 32, 16);
  octx.clearRect(0, 0, 4, 4);
  octx.end();
  ctx.begin(0, 0, 160, 120);
  ctx.save();
  ctx.beginPath(); ctx.rect(10, 10, 100, 60); ctx.clip();
  const lg = ctx.createLinearGradient(0, 0, 160, 120);
  lg.addColorStop(0, '#fff'); lg.addColorStop(1, 'rgba(0,0,255,0)');
  ctx.fillGradient = lg;
  ctx.fillRect(0, 0, 160, 120);
  ctx.restore();
  ctx.strokeStyle = 'orange'; ctx.lineWidth = 3; ctx.setLineDash([4, 2]);
  ctx.strokeRect(20, 20, 50, 30);
  ctx.setLineDash([]);
  ctx.fillStyle = 'white'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`frame ${frames}`, 80, 100);
  ctx.drawImage(off.image, 120, 10);
  ctx.drawImage(off.image, 0, 0, 16, 8, 120, 40, 32, 16);
  ctx.end();
  frames++;
  if (frames === 3) { console.log('drew', frames, 'frames'); off.dispose(); quit(); }
});
