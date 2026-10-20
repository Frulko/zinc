// zinc:camera's image drawn by zinc:gfx (tests/t1/webcam.sh): the fake camera at 80x60 drawn at 4x, so the screenshot shows its colour
// bars where the image is; then navigator.mediaDevices gives the same camera as a MediaStream.
import * as gfx from 'zinc:gfx';
import { Camera } from 'zinc:camera';

let cam: Camera | null = null;
Camera.open('', { width: 80, height: 60 }).then((c: Camera) => { cam = c; });
gfx.onFrame((_dt: number) => {
  gfx.clear(0x000000);
  if (cam !== null) gfx.drawImage((cam as Camera).image, 0, 0, 320, 240, 255, 0);
});

async function web(): Promise<void> {
  const before = await navigator.mediaDevices.enumerateDevices();
  console.log('enumerate ' + before.map((d: MediaDeviceInfo) => d.kind + ':' + d.label).join(','));
  const s = await navigator.mediaDevices.getUserMedia({ video: { width: 32, height: 24, facingMode: 'user' } });
  const t = s.getVideoTracks()[0];
  const st = t.getSettings();
  console.log(`stream ${s.active} ${t.kind} ${t.label} ${st.width}x${st.height} ${st.frameRate} ${t.image >= 0 ? 'image' : 'none'} audio ${s.getAudioTracks().length}`);
  t.stop();
  console.log(`stopped ${s.active} ${t.readyState}`);
  try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { console.log('audio ' + (e as DOMException).name); }
  try { await navigator.mediaDevices.getUserMedia({ video: { deviceId: 'nope' } }); } catch (e) { console.log('deviceId ' + (e as DOMException).name); }
}
web();
