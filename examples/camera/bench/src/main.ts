// camera-bench: live view throughput of zinc:gphoto2. Preview JPEGs (1024x683 from the fake camera) are decoded on
// the plugin's worker and drawn at the top left of a 1024x683 window, in two phases of 4 s each:
//   1. 1:1 — the box equals the frame size (DCT scale 1/1, no resampling);
//   2. fitted to 736x532 — the remote app's live view box (DCT 6/8 + bilinear scaling).
// One line per second reports camera / shown fps, decode time and UI frames; the app quits after 8 s.
// ZINC_FAKE_CAMERA=max removes the fake camera's 30 fps pacing.
import { onFrame, clear, drawImage, imageWidth, imageHeight, quit } from 'zinc:gfx';
import * as camera from 'zinc:gphoto2';

const PHASE_SECONDS = 4;
const FULL_BOX: i32[] = [1024, 683];
const FITTED_BOX: i32[] = [736, 532];

let elapsed = 0;          // seconds since the first frame
let nextReport = 1;       // second at which the next line is printed
let uiFrames = 0;         // frames drawn since the last report

async function startLiveView(): Promise<void> {
  const cams = await camera.detect();
  if (cams.length === 0) {
    console.log('no camera');
    quit();
    return;
  }
  await camera.open(cams[0].model, cams[0].port);
  camera.setViewSize(FULL_BOX[0], FULL_BOX[1]);
  camera.startLiveView();
}

/** "t=3s 1024x683: camera 30.0 fps, shown 30.0 fps, decode 3.10 ms, ui 60 frames/s" */
function report(image: i32): void {
  const size = image >= 0 ? `${imageWidth(image)}x${imageHeight(image)}` : '0x0';
  console.log(`t=${nextReport}s ${size}: camera ${camera.cameraFps().toFixed(1)} fps, shown ${camera.shownFps().toFixed(1)} fps, ` +
    `decode ${camera.decodeMs().toFixed(2)} ms, ui ${uiFrames} frames/s`);
}

onFrame((dt: number) => {
  clear(0);
  const image = camera.liveImage();
  if (image >= 0) drawImage(image, 0, 0, imageWidth(image), imageHeight(image), 255, 0);
  elapsed += dt;
  uiFrames++;
  if (elapsed < nextReport) return;
  if (nextReport === PHASE_SECONDS) camera.setViewSize(FITTED_BOX[0], FITTED_BOX[1]);   // second phase
  report(image);
  nextReport++;
  uiFrames = 0;
  if (nextReport > 2 * PHASE_SECONDS) quit();
});

startLiveView();
