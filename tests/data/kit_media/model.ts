import { equal, ok } from 'zinc:assert';
import { MediaRect, ImageView, ImageViewport, fitImageRect, zoomOffset, imagePanLimit, normalizedCrop, cropHandle, CropHandle, moveCrop, resizeCrop, drawnCrop, mediaSlide } from '../../../lib/std/kit/media-model';
function near(a: number, b: number): void { ok(Math.abs(a - b) < 0.00001, String(a) + ' != ' + b); }
const fit = fitImageRect(800, 600, 1600, 900, 16, 72);
near(fit.width / fit.height, 1600 / 900); ok(fit.width <= 768.001 && fit.height <= 456.001, 'fit stays inside padded bounds');
near(zoomOffset(10, 20, 2), 0); equal(imagePanLimit(300, 500), 0);
const v = new ImageViewport(); v.set(new ImageView(), 800, 600, 1600, 900);
near(v.zoom, 0.5); near(v.cx, 800); near(v.cy, 450);
const point = v.cx + (300 - 400) / v.zoom, next = v.atZoom(1, 300, 200);
v.set(next, 800, 600, 1600, 900); near(v.cx + (300 - 400) / v.zoom, point);
const visible = v.visible(); ok(visible[6] <= 800.001 && visible[7] <= 600.001, 'visible quad clipped'); near(visible[2] * v.zoom, visible[6]);
const far = v.pan(100000, -100000); v.set(far, 800, 600, 1600, 900); near(v.cx, 400); near(v.cy, 600);
v.set(new ImageView(1000, -1000, 10000), 300, 200, 400, 300, 8); near(v.zoom, 8); ok(v.cx >= 0 && v.cy <= 300, 'zoom clamp');
const initial = normalizedCrop(new MediaRect(), 1200, 800); equal(initial.width, 800); equal(initial.x, 200);
const square = normalizedCrop(new MediaRect(900, 700, 300, 200), 1200, 800, 1); near(square.width, square.height); ok(square.x + square.width <= 1200.001 && square.y + square.height <= 800.001, 'square bounds');
const tiny = normalizedCrop(new MediaRect(0, 0, 1, 1), 7, 5, 16); near(tiny.width / tiny.height, 16); ok(tiny.width <= 7.001 && tiny.height <= 5.001, 'thin image bounds');
const start = new MediaRect(100, 100, 200, 200);
equal(cropHandle(start, 100, 100, 5), CropHandle.NorthWest); equal(cropHandle(start, 150, 150, 5), CropHandle.Move); equal(cropHandle(start, 500, 400, 5), CropHandle.Draw);
const west = resizeCrop(start, CropHandle.West, -1000, 0, 1000, 800); near(west.x, 0); near(west.x + west.width, 300);
for (let handle: i32 = CropHandle.North; handle <= CropHandle.NorthWest; handle++) for (const delta of [-1000, -50, 50, 1000]) {
 const c = resizeCrop(start, handle as CropHandle, delta, -delta, 1000, 800, 1.5);
 near(c.width / c.height, 1.5); ok(c.x >= -0.001 && c.y >= -0.001 && c.x + c.width <= 1000.001 && c.y + c.height <= 800.001, 'handle ' + handle + ' delta ' + delta + ' bounds');
}
const moved = moveCrop(start, 2000, -500, 1000, 800); equal(moved.x, 800); equal(moved.y, 0);
const drawn = drawnCrop(600, 500, 200, 100, 1000, 800, 1); equal(drawn.x, 200); equal(drawn.y, 100); equal(drawn.width, 400);
equal(mediaSlide(-1, 3, true), 2); equal(mediaSlide(3, 3), 2); equal(mediaSlide(4, 3, true), 1); equal(mediaSlide(3, 0), 0);
let rejected = false; try { mediaSlide(0, 257); } catch (error) { rejected = true; } ok(rejected);
console.log('media models: ok');
