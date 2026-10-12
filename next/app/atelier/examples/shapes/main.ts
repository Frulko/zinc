// Shapes: every drawing call takes a place, a size and a colour (0xRRGGBB). The last number of most calls is the
// opacity, 0 to 255.
import { onFrame, clear, rect, rrect, line, polygon, stroke, border, width, height } from 'zinc:gfx';

console.log('shapes: one frame, drawn again and again');

onFrame((dt: number) => {
  const w = width(), h = height(), u = Math.min(w, h) / 8;   // one unit: an eighth of the window
  clear(0xf3f1ec);
  rect(u, u, u * 2, u * 2, 0x5746e0);                                  // a square
  rrect(u * 2, u * 2, u * 2.5, u * 2.5, u * 0.5, 0xf27aa6, 200);       // a rounded one, a little transparent, over it
  rrect(w - u * 3.5, u, u * 2.5, u * 2.5, u * 1.25, 0x2f8f57, 255);    // a radius of half the size makes a disc
  polygon([w / 2, h - u * 4, w / 2 + u * 1.6, h - u, w / 2 - u * 1.6, h - u], 0xe8b06a, 255);   // points x, y, x, y...
  stroke([u, h - u * 2.5, u * 2, h - u * 1.2, u * 3, h - u * 2.5, u * 4, h - u * 1.2], 6, 0x1d1b18, 255, false);   // a thick open line
  border(w - u * 3.5, h - u * 3.5, u * 2.5, u * 2.5, 12, 3, 0x5746e0, 255);   // only the outline
  line(0, h / 2, w, h / 2, 0xbcb6ab);                                  // a hairline across
});
