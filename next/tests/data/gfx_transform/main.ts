// zinc:gfx setTransform (ZN-263.01): every box command at 0, 15, 45 and 90 degrees around its centre, then a scaled-then-rotated group,
// a transformed polygon and stroke. tests/t1/gfx_transform.sh compares the frame with its golden (software) and the GL replay with it.
import { onFrame, clear, rrect, rect, gradient, border, shadow, drawText, drawImage, font, createImage, beginImage, endImage, polygon, stroke, setTransform, resetTransform } from 'zinc:gfx';

const ANGLES: number[] = [0, 15, 45, 90];
const sans = font('sans', 14);
const img = createImage(16, 16);
beginImage(img);
rect(0, 0, 8, 8, 0xe63946); rect(8, 0, 8, 8, 0x2a9d8f); rect(0, 8, 8, 8, 0xf4a261); rect(8, 8, 8, 8, 0x457b9d);
endImage();

function around(cx: number, cy: number, deg: number, s: number): void {
  const r = deg * Math.PI / 180, c = Math.cos(r) * s, n = Math.sin(r) * s;
  setTransform(c, n, -n, c, cx - c * cx + n * cy, cy - n * cx - c * cy);
}

onFrame((dt: number) => {
  clear(0xf1f5f9);
  for (let i: i32 = 0; i < ANGLES.length; i++) {
    const x = 20 + i * 150, a = ANGLES[i];
    around(x + 50, 50, a, 1); rect(x + 10, 30, 80, 40, 0x1e3a8a);
    around(x + 50, 130, a, 1); rrect(x + 10, 110, 80, 40, 12, 0xdb2777, 255);
    around(x + 50, 210, a, 1); border(x + 10, 190, 80, 40, 10, 4, 0x0f766e, 255);
    around(x + 50, 290, a, 1); shadow(x + 15, 275, 70, 30, 8, 10, 0x000000, 140); rrect(x + 15, 275, 70, 30, 8, 0xffffff, 255);
    around(x + 50, 370, a, 1); gradient(x + 10, 350, 80, 40, 6, 0x7c3aed, 0xf59e0b, false, 255);
    around(x + 50, 450, a, 1); drawImage(img, x + 25, 425, 50, 50, 255, 0);
    around(x + 50, 530, a, 1); drawText(sans, x + 10, 520, 'Zinc ' + a.toString(), 0x111827, 255, 0);
  }
  // a group scaled by 1.5 then turned by 30 degrees around (700, 600)
  around(700, 600, 30, 1.5); rrect(670, 585, 60, 30, 6, 0x16a34a, 255); drawText(sans, 680, 590, 'group', 0xffffff, 255, 0);
  around(150, 620, 30, 1); polygon([110, 600, 190, 600, 150, 650], 0x9333ea, 255); stroke([210, 600, 290, 640, 330, 600], 4, 0xea580c, 255, false);
  resetTransform();
  rect(0, 680, 800, 2, 0x64748b);

});
