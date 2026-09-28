// The live view: a dark rounded canvas showing the latest decoded preview frame, with a caption when it is off.
import { rrect, stroke, drawImage, imageWidth, imageHeight } from 'zinc:gfx';
import * as camera from 'zinc:gphoto2';
import { live, model } from '../state';
import { focusAt } from '../session';
import * as ui from 'zinc:ui';

const RADIUS = 12;
let boxW = 0, boxH = 0;  // size of the canvas at its last draw, to map clicks onto the frame
let mark = false, markX = 0, markY = 0;  // last focus point, drawn as a ring

/** Draws `image` as large as it fits in the box, centred, with rounded corners. */
export function drawFitted(image: i32, x: i32, y: i32, w: i32, h: i32): void {
  const iw = imageWidth(image), ih = imageHeight(image);
  if (iw <= 0 || ih <= 0) return;
  const scale = Math.min(w / iw, h / ih);
  const dw = Math.round(iw * scale), dh = Math.round(ih * scale);
  drawImage(image, x + Math.floor((w - dw) / 2), y + Math.floor((h - dh) / 2), dw, dh, 255, RADIUS);
}

/** Canvas callback: the plugin scales frames to the box on its worker, so drawing one is a plain copy. */
function drawLiveView(x: i32, y: i32, w: i32, h: i32): void {
  rrect(x, y, w, h, RADIUS, 0x09090b, 255);
  camera.setViewSize(w, h);
  boxW = w; boxH = h;
  const image = camera.liveImage();
  if (live() && image >= 0) drawFitted(image, x, y, w, h);
  if (live() && mark) {  // focus square, 24 px around the last click
    const cx = x + markX, cy = y + markY;
    stroke([cx - 24, cy - 24, cx + 24, cy - 24, cx + 24, cy + 24, cx - 24, cy + 24], 2, 0xfacc15, 255, true);
  }
}

/** Click on the live view: the frame is drawn fitted and centred, so undo that to get 0..1 frame coordinates. */
function clickToFocus(e: ui.PointerEvent): void {
  const image = camera.liveImage();
  if (!live() || image < 0 || boxW <= 0) return;
  const iw = imageWidth(image), ih = imageHeight(image);
  const scale = Math.min(boxW / iw, boxH / ih);
  const dw = iw * scale, dh = ih * scale;
  const ox = (boxW - dw) / 2, oy = (boxH - dh) / 2;
  const fx = (e.x - ox) / dw, fy = (e.y - oy) / dh;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;  // clicked the letterbox bars
  mark = true; markX = e.x; markY = e.y;
  focusAt(fx, fy);
}

export function LiveView(): i32 {
  return <Canvas class="grow items-center justify-center" onDraw={drawLiveView} onPointerDown={clickToFocus}>
    {!live() && <Text class="text-sm text-zinc-400">{model() === '' ? 'No camera connected' : 'Live view is off'}</Text>}
  </Canvas>;
}
