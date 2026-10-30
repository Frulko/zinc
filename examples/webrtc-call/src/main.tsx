// webrtc-call: a video call on zinc:webrtc (audio and video tracks), zinc:camera, zinc:microphone and zinc:audio, in the React model. See
// README.md.
//   build/zinc run examples/webrtc-call
// Keys: M mutes, V stops the video, C picks the next camera, S the stats, L the ultra low data mode, Enter calls, Esc hangs up then quits.
// Test hooks: CALL_DEMO=1 runs the scripted session (call, the ultra low data mode, mute, video off, a camera switch, screen sharing, the stats, hang up, quit), CALL_LOG=1 prints
// what happens (tests/t1/webrtc_call.sh), CALL_MODE=room starts on the room tab, CALL_SIGNAL=ws://host:port the signalling server,
// ZINC_SCHEME=dark the dark scheme.
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { env } from 'zinc:sys';
import App from './App';
import { call } from './call';

ui.onKey((e: ui.KeyEvent): void => {
  if (e.primary || e.alt) return;
  const c = call, k = e.key;
  if (k === 'Escape') { if (c.stage === 'live' || c.stage === 'connecting') c.hangUp(); else { c.close(); quit(); } }
  else if (k === 'Enter') c.start();
  else if (k === 'm') c.toggleMic();
  else if (k === 'v') c.toggleCamera();
  else if (k === 'c') { if (c.cameras.length > 0) c.pickCamera((c.which + 1) % c.cameras.length); }
  else if (k === 's') c.toggleStats();
  else if (k === 'l') c.toggleLowData();
  else if (k === 'd') c.toggleShare();
  else return;
  e.preventDefault();
});

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
// The scripted session, in real time with the fake camera and microphone: a call in this window, the picture back, mute and unmute, video
// off and on, the camera picked again, the screen shared (the fake screen with ZINC_FAKE_SCREEN=1) and back, the stats, hang up, quit.
async function script(): Promise<void> {
  const c = call;
  await c.start();
  await until(() => c.stage === 'live' && c.peerFrames() >= 30);
  c.log(`picture back: ${c.peerImage() >= 0 ? 'image' : 'no image (headless)'}, frames ${c.peerFrames() >= 30 ? 'flowing' : 'stopped'}`);
  await until(() => c.numbers.fps > 0 && c.numbers.rttMs >= 0 && c.numbers.sendKbps > 0 && c.numbers.recvKbps > 0);
  const n = c.numbers;
  c.log(`stats ${n.width}x${n.height} ${n.codec === 'VP8' || n.codec === 'H264' ? 'codec' : 'no codec'} audio ${n.audio} ${n.sendKbps > 0 && n.recvKbps > 0 ? 'bit rates' : 'no bit rates'}`);
  // the ultra low data mode: the microphone's bit rate measured over the seconds that follow (stderr: the numbers themselves)
  await c.toggleLowData();
  await new Promise<void>((done: () => void) => { setTimeout(() => done(), 4000); });
  const low = c.numbers;
  c.log(`low data: audio ${low.audioKbps >= 6 && low.audioKbps <= 12 ? '6 to 12' : 'NOT 6 to 12'} kbit/s, quality ${c.quality.last.quality === 'unknown' ? 'unknown' : 'measured'}`);
  console.error(`low data: audio ${low.audioKbps.toFixed(1)} kbit/s, all out ${low.sendKbps.toFixed(1)} kbit/s, video ${low.width}x${low.height} ${low.fps} fps; before: audio ${n.audioKbps.toFixed(1)}, all out ${n.sendKbps.toFixed(1)} kbit/s`);
  await c.toggleLowData();
  c.toggleMic();
  c.toggleCamera();
  const f = c.peerFrames();
  await until(() => c.peerFrames() > f + 10);
  c.toggleMic();
  c.toggleCamera();
  await c.pickCamera(0);
  await c.toggleShare();
  await until(() => c.peerWidth() > 640);
  c.log(`screen back: ${c.peerWidth()}x${c.peerHeight()}`);
  await c.toggleShare();
  c.toggleStats(); c.toggleStats();
  c.toggleSpeaker(); c.toggleSpeaker();
  c.hangUp();
  c.log(`ended: ${c.stage}`);
  c.close();
  quit();
}
// CALL_DEMO=shot: in a call until the picture and the numbers are there, then quit (the last frame is what ZINC_SHOT saves)
async function shot(): Promise<void> {
  await call.start();
  await until(() => call.stage === 'live' && call.peerFrames() >= 60 && call.numbers.fps > 0 && call.numbers.rttMs >= 0);
  setTimeout(() => quit(), 100);
}
if (env('CALL_DEMO') === '1') script();
else if (env('CALL_DEMO') === 'shot') shot();
else if (env('CALL_AUTOCALL') === '1') call.start();

render(App, 0x09090B, null);
