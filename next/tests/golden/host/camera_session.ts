// A fake-camera session (ZN-110, ZINC_FAKE_CAMERA=1): connect, capture, download and live view, every step through a promise settled by the plugin's worker.
import * as camera from 'zinc:gphoto2';
import { onFrame, quit } from 'zinc:gfx';

let live = 0, done = false;
async function session(): Promise<void> {
  const cams = await camera.detect();
  console.log('cameras', cams.length, cams[0].model);
  console.log('open', await camera.open(cams[0].model, cams[0].port));
  const path = await camera.capture('captures');
  console.log('captured', path);
  const file = await camera.download(path, 'captures');
  console.log('downloaded', file);
  camera.startLiveView();
  setTimeout(() => { done = true; }, 300);
}
session();
onFrame((dt: number) => {
  if (camera.liveImage() >= 0) live++;
  if (done) { console.log('live view frames', live > 0 ? 'yes' : 'no'); camera.stopLiveView(); quit(); }
});
