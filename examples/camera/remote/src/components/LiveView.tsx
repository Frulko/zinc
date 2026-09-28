// The live view: a dark rounded canvas showing the latest decoded preview frame, with a caption when it is off.
import { rrect, drawImage, imageWidth, imageHeight } from 'zinc:gfx';
import * as camera from 'zinc:gphoto2';
import { live, model } from '../state';

const RADIUS = 12;

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
  const image = camera.liveImage();
  if (live() && image >= 0) drawFitted(image, x, y, w, h);
}

export function LiveView(): i32 {
  return <Canvas class="grow items-center justify-center" onDraw={drawLiveView}>
    {!live() && <Text class="text-sm text-zinc-400">{model() === '' ? 'No camera connected' : 'Live view is off'}</Text>}
  </Canvas>;
}
