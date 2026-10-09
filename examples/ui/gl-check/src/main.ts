// gl-check: one scene per draw command kind, to compare the software and the GPU renderer of display-gl
// (scripts/pixel-diff.mjs). ZINC_SCENE=rects|gradients|borders|shadows|clip|text|images picks the scene.
//   ZINC_SCENE=text ZINC_RENDERER=gl ZINC_FRAMES=3 ZINC_SHOT=gl.bmp zinc run examples/ui/gl-check --display gl
import * as gfx from 'zinc:gfx';
import { env } from 'zinc:sys';

const scene = env('ZINC_SCENE');
const COLORS: u32[] = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0x8b5cf6, 0x111827];
const logo = gfx.createImage(64, 48);
const sans = gfx.font('sans', 14), sansBig = gfx.font('sans', 22), bold = gfx.font('sans-bold', 16), small = gfx.font('sans', 11);
const checker = gfx.image('checker.png');

function rects(): void {
  for (let i = 0; i < 6; i++) {
    gfx.rrect(16 + i * 76, 16, 64, 44, i * 5, COLORS[i], 255);          // radius 0 is the plain whole-pixel path
    gfx.rrect(16 + i * 76, 72, 64, 44, i * 5, COLORS[i], 128);
    gfx.rrect(16.5 + i * 76, 128.3, 64.7, 44.2, i * 5, COLORS[i], 255);  // fractional edges are anti-aliased
    gfx.rrect(16.5 + i * 76, 184.6, 64.7, 44.2, i * 5, COLORS[i], 90);
  }
  gfx.rect(16.4, 244.4, 100.3, 30.7, 0x0f172a);
  gfx.rect(130, 244, 100, 30, 0x0f172a);
  gfx.rrect(244, 244, 200, 90, 45, 0x14b8a6, 255);                       // radius clamped to half the height
  gfx.rrect(16, 290, 3, 3, 1, 0x000000, 255);
}
function gradients(): void {
  for (let i = 0; i < 3; i++) {
    gfx.gradient(16 + i * 150, 16, 130, 80, i * 12, 0x3b82f6, 0xec4899, true, 255);
    gfx.gradient(16 + i * 150, 110, 130, 80, i * 12, 0x10b981, 0xf59e0b, false, 255);
    gfx.gradient(16 + i * 150, 204, 130, 60, 10, 0xffffff, 0x000000, true, 160);
    gfx.gradient(16.5 + i * 150, 278.5, 130.6, 60.4, 10, 0x6366f1, 0x0ea5e9, false, 200);
  }
}
function borders(): void {
  for (let i = 0; i < 5; i++) {
    gfx.border(16 + i * 90, 16, 76, 60, i * 6, 1, COLORS[i], 255);
    gfx.border(16 + i * 90, 90, 76, 60, i * 6, 2, COLORS[i], 255);
    gfx.border(16 + i * 90, 164, 76, 60, i * 6, 3.5, COLORS[i], 255);
    gfx.border(16.5 + i * 90, 238.4, 76.3, 60.6, i * 6, 1, COLORS[i], 120);
  }
  gfx.rrect(20, 310, 200, 40, 12, 0xffffff, 255);
  gfx.border(20, 310, 200, 40, 12, 1, 0xd4d4d8, 255);
}
function shadows(): void {
  for (let i = 0; i < 4; i++) {
    gfx.shadow(30 + i * 110, 30, 80, 60, 8, 4 + i * 4, 0x000000, 90);
    gfx.rrect(30 + i * 110, 30, 80, 60, 8, 0xffffff, 255);
    gfx.shadow(30 + i * 110, 150, 80, 60, i * 10, 16, 0x1d4ed8, 140);
    gfx.rrect(30 + i * 110, 150, 80, 60, i * 10, 0xffffff, 255);
  }
  gfx.shadow(30, 260, 200, 60, 12, 24, 0x000000, 60);
  gfx.rrect(30, 260, 200, 60, 12, 0xffffff, 255);
}
function clips(): void {
  gfx.clip(16, 16, 120, 70);
  gfx.rect(0, 0, 400, 400, 0xfecaca);
  gfx.rrect(60, 40, 120, 80, 14, 0xef4444, 255);
  gfx.unclip();
  gfx.clip(160, 16, 140, 90, 18);                    // rounded clip: the corners are restored from the saved pixels
  gfx.gradient(150, 10, 170, 110, 0, 0x22c55e, 0x3b82f6, true, 255);
  gfx.rrect(200, 50, 120, 70, 0, 0xf59e0b, 255);
  gfx.unclip();
  gfx.clip(320, 16, 140, 140, 24);                   // nested, both rounded
  gfx.clip(340, 36, 100, 100, 12);
  gfx.rect(300, 0, 200, 200, 0x8b5cf6);
  gfx.unclip();
  gfx.rrect(310, 100, 160, 30, 8, 0x111827, 255);
  gfx.unclip();
  gfx.clip(16.5, 130.5, 130.2, 90.4);                // fractional clip: whole pixels
  gfx.rect(0, 0, 300, 300, 0xbae6fd);
  gfx.unclip();
  gfx.clip(160, 140, 200, 100, 30);
  gfx.rrect(150, 130, 100, 120, 0, 0xfb7185, 200);
  gfx.rrect(300, 130, 100, 120, 0, 0x34d399, 200);
  gfx.unclip();
}
function texts(): void {
  gfx.drawText(sans, 16, 16, 'Sans 14: The quick brown fox jumps over the lazy dog', 0x111827, 255, 0);
  gfx.drawText(sansBig, 16, 40, 'Sans 22 Ag', 0x111827, 255, 0);
  gfx.drawText(bold, 16, 76, 'Bold 16 — hamburgefonstiv 0123456789', 0x1d4ed8, 255, 0);
  gfx.drawText(small, 16, 100, 'small 11 text with tracking', 0x475569, 255, 1.5);
  gfx.drawText(sans, 16, 120, 'Accents: Éléphant çà été ← → ☂ € «ok»', 0x991b1b, 255, 0);
  gfx.drawText(sans, 16.4, 144.6, 'Fractional origin 16.4 / 144.6', 0x111827, 255, 0);
  gfx.drawText(sans, 16, 168, 'Half alpha', 0x111827, 128, 0);
  gfx.drawText(sansBig, 16, 190, 'Colour 0x16a34a', 0x16a34a, 255, 0);
  gfx.rect(16, 224, 200, 24, 0x0f172a);
  gfx.drawText(sans, 22, 228, 'Light on dark', 0xf8fafc, 255, 0);
  gfx.clip(230, 224, 60, 24);
  gfx.drawText(sans, 232, 228, 'Clipped text overflow', 0x111827, 255, 0);
  gfx.unclip();
  gfx.text(16, 264, 'GRID 8PX LEGACY', 0x111827, 1);
  gfx.text(16, 280, 'GRID x2', 0x7c3aed, 2);
}
function images(): void {
  gfx.beginImage(logo);
  gfx.gradient(0, 0, 64, 48, 0, 0xf97316, 0x2563eb, true, 255);
  gfx.rrect(8, 8, 24, 16, 4, 0xffffff, 255);
  gfx.border(2, 2, 60, 44, 6, 2, 0x111827, 255);
  gfx.endImage();
  gfx.drawImage(logo, 16, 16, 64, 48, 255, 0);                  // 1:1
  gfx.drawImage(logo, 96, 16, 128, 96, 255, 0);                 // upscaled 2x
  gfx.drawImage(logo, 240, 16, 40, 30, 255, 0);                 // downscaled
  gfx.drawImage(logo, 296, 16, 90, 68, 255, 12);                // rounded
  gfx.drawImage(logo, 400, 16, 64, 48, 120, 0);                 // half alpha
  gfx.drawImage(logo, 16.5, 130.5, 64, 48, 255, 0);             // fractional origin
  gfx.drawImage(checker, 16, 200, 16, 16, 255, 0);              // baked RGBA, 1:1
  gfx.drawImage(checker, 48, 200, 96, 96, 255, 0);              // baked, upscaled (bilinear)
  gfx.drawImage(checker, 160, 200, 80, 80, 200, 20);            // baked, rounded, alpha
  gfx.drawImage(checker, 260, 200, 10, 10, 255, 0);             // baked, downscaled
}

gfx.onFrame((dt: number) => {
  gfx.clear(0xf4f4f5);
  if (scene === 'gradients') gradients();
  else if (scene === 'borders') borders();
  else if (scene === 'shadows') shadows();
  else if (scene === 'clip') clips();
  else if (scene === 'text') texts();
  else if (scene === 'images') images();
  else rects();
});
