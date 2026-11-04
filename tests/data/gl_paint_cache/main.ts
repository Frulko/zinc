import { onFrame, clear, clip, unclip, gradient, rrect, polygon, rect, border, drawText, font, setTransform, resetTransform } from 'zinc:gfx';
const face = font('sans', 14);
let frame = 0;
onFrame((dt: number): void => {
  frame++;
  clear(0xe2e8f0);
  clip(8.25, 8.75, 380, 298, 22);
  for (let i = 0; i < 3; i++) {
    const x = 22.25 + i * 97 + (frame >= 6 ? 11.5 : 0), y = 18.75 + i * 35;
    rrect(x - 3, y - 3, 136, 220, 14, 0xffffff, 255);
    border(x - 3, y - 3, 136, 220, 14, 1, 0x334155, 255);
    clip(x - 2, y - 2, 134, 218, 13);
    gradient(x, y, 130, 190, 0, frame >= 8 ? 0x2563eb : 0xf97316, 0x7c3aed, true, 255);
    rrect(x + 8, y + 12, 70, 70, 35, 0xffffff, 80);
    rrect(x + 30, y + 80, 90, 90, 45, 0xffffff, 65);
    polygon([x, y + 160, x + 30, y + 110, x + 60, y + 145, x + 95, y + 128, x + 130, y + 170, x + 130, y + 190, x, y + 190], 0x1c1917, 70);
    // A following sibling must still cover a cached group in paint order.
    rect(x + 12, y + 175, 24, 8, 0x00ff00);
    setTransform(0.96, 0, 0, 0.96, x, y + 195);
    drawText(face, 0, 0, frame >= 8 ? "changed" : "cached", 0x111827, 255, 1);
    resetTransform();
    unclip();
  }
  unclip();
  rect(frame % 12, 314, 1, 1, 0x000000);
});
