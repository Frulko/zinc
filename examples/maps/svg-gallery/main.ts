// SVG gallery: sample documents rendered at runtime by zinc:svg at several sizes, plus one zooming continuously.
//   zinc run examples/maps/svg-gallery
import { onFrame, clear, drawText, font, rrect, width, height } from 'zinc:gfx';
import { Svg } from 'zinc:svg';
import { SAMPLES, NAMES } from './samples';

const docs: Svg[] = SAMPLES.map((s: string) => new Svg(s));
for (let i = 0; i < docs.length; i++) if (!docs[i].ok) console.error(`${NAMES[i]}: ${docs[i].error}`);
const W = width(), H = height();
const f12 = font('sans', 12), fb16 = font('sans-bold', 16);
let t = 0;

onFrame((dt: number) => {
  t += dt;
  clear(0xf1f5f9);
  drawText(fb16, 16, 10, 'zinc:svg — runtime vector rendering', 0x0f172a, 255, 0);
  // each sample at three sizes
  const rowH = (H - 40) / docs.length;
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i], y = 36 + i * rowH;
    drawText(f12, 16, y, `${NAMES[i]} · ${d.items()} shapes`, 0x475569, 255, 0);
    let x = 16;
    for (const s of [0.4, 0.7, 1.0]) {
      const h = (rowH - 26) * s, w = h * d.width / d.height;
      rrect(x - 2, y + 20 - 2, w + 4, h + 4, 4, 0xffffff, 255);
      d.draw(x, y + 20, w, h, 255);
      x += w + 16;
    }
  }
  // the compass, zooming in and out
  const z = 0.5 + 0.5 * Math.sin(t * 1.5), side = 60 + z * (Math.min(W * 0.4, H * 0.8) - 60);
  const cx = W * 0.8, cy = H / 2;
  docs[4].draw(cx - side / 2, cy - side / 2, side, side, 255);
});
