// Paints a camera's newest frame, real or simulated (camera.ts).
import { rrect, gradient, drawImage, drawText, font } from 'zinc:gfx';
import { Camera } from './camera';

/** Draws the camera's newest frame into the box: its runtime image, or the simulated scene (a sky that moves with the frame index). */
export function drawPreview(cam: Camera, x: number, y: number, w: number, h: number, back: boolean): void {
  if (cam.image >= 0) { drawImage(cam.image as i32, x, y, w, h, 255, 16); return; }
  const t = cam.frameIndex / cam.fps;
  gradient(x, y, w, h, 16, back ? 0x0F766E : 0x6D28D9, back ? 0x1E3A8A : 0xE8492A, true, 255);
  for (let i = 0; i < 6; i++) {
    const r = 24 + i * 9, cx = x + w * (0.15 + 0.14 * i) + Math.sin(t * 0.9 + i) * 18, cy = y + h * 0.42 + Math.cos(t * 0.7 + i * 1.7) * h * 0.18;
    rrect(cx - r, cy - r, r * 2, r * 2, r, 0xFFFFFF, 26 + i * 6);
  }
  const f = font('sans', 13);
  drawText(f, x + 14, y + h - 26, `${back ? 'back' : 'front'} · simulated · frame ${Math.max(0, cam.frameIndex)}`, 0xFFFFFF, 220, 0);
}
