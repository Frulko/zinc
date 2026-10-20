// zinc:camera against the fake camera (tests/t1/webcam.sh): the list, a camera opened at 64x48, frames with their index, the snapshot's
// size and a hash of its bytes (the same on every machine and engine: the pattern is a function of the frame index), the options, close.
import { devices, requestPermission, Camera } from 'zinc:camera';

function hash(b: u8[]): string {
  let h = 2166136261;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619) >>> 0;
  return '' + h;
}

async function main(): Promise<void> {
  console.log('permission ' + (await requestPermission()));
  const list = await devices();
  for (const d of list) console.log('device ' + d.id + ' | ' + d.name + ' | ' + d.position);
  const cam = await Camera.open(list[0].id, { width: 64, height: 48, fps: 30 });
  console.log(`open ${cam.width}x${cam.height} ${cam.fps} fps, image ${cam.image >= 0 ? 'yes' : 'none'}`);
  console.log('before ' + cam.snapshot().length + ' ' + hash(cam.snapshot()));
  const seen: number[] = [];
  await new Promise<void>((done: () => void) => {
    cam.onFrame((i: number) => {
      seen.push(i);
      if (i === 2) console.log('frame 2 ' + hash(cam.snapshot()));
      if (i === 5) { console.log('frame 5 ' + hash(cam.snapshot())); done(); }
    });
  });
  console.log('frames ' + seen.join(','));
  const px = cam.snapshot();
  console.log(`pixel 0 ${px[0]},${px[1]},${px[2]},${px[3]} pixel bar2 ${px[(20 * 64 + 20) * 4]},${px[(20 * 64 + 20) * 4 + 1]},${px[(20 * 64 + 20) * 4 + 2]}`);
  cam.setOption('mirror', 1);
  console.log('mirror ' + hash(cam.snapshot()));
  cam.setOption('mirror', 0); cam.setOption('brightness', 0.25); cam.setOption('contrast', 1.5);
  console.log('graded ' + hash(cam.snapshot()));
  cam.close();
  console.log('closed ' + cam.isOpen + ' ' + cam.snapshot().length);
  try { await Camera.open('no-such-camera'); } catch (e) { console.log('error ' + (e as Error).message.split(' (')[0]); }
}
main();
