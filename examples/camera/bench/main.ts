// Live view throughput: 1024x683 preview JPEGs decoded on the worker and presented in a 1024x683 window,
// 1:1 for 4 s (DCT scale 1/1, no resampling), then fitted to 736x532 for 4 s (DCT 6/8 + bilinear, the remote app's box).
// ZINC_FAKE_CAMERA=max zinc run examples/camera/bench   (fake camera without its 30 fps pacing)
import { onFrame, clear, drawImage, imageWidth, imageHeight, quit } from 'zinc:gfx';
import * as camera from 'zinc:gphoto2';

let t = 0, next = 1, frames = 0;
async function main(): Promise<void> {
  const cams = await camera.detect();
  if (cams.length === 0) { console.log('no camera'); quit(); return; }
  await camera.open(cams[0].model, cams[0].port);
  camera.setViewSize(1024, 683);
  camera.startLiveView();
}
onFrame((dt: number) => {
  clear(0);
  const img = camera.liveImage();
  if (img >= 0) drawImage(img, 0, 0, imageWidth(img), imageHeight(img), 255, 0);
  t += dt; frames++;
  if (t >= next) {
    if (next === 4) camera.setViewSize(736, 532);
    console.log(`t=${next}s ${img >= 0 ? imageWidth(img) : 0}x${img >= 0 ? imageHeight(img) : 0}: camera ${camera.cameraFps().toFixed(1)} fps, shown ${camera.shownFps().toFixed(1)} fps, decode ${camera.decodeMs().toFixed(2)} ms, ui ${frames} frames/s`);
    next++; frames = 0;
    if (next > 8) quit();
  }
});
main();
