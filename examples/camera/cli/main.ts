// Headless camera session: detect, open, read and change settings, capture to ./captures.
// No camera here? ZINC_FAKE_CAMERA=1 zinc run examples/camera/cli (sim: always the fake camera).
import * as camera from 'zinc:gphoto2';

async function main(): Promise<void> {
  const cams = await camera.detect();
  console.log('cameras:', cams.length);
  if (cams.length === 0) return;
  console.log('model:', await camera.open(cams[0].model, cams[0].port));
  const ws = await camera.config();
  for (const w of ws) console.log(`${w.path} = ${w.value}${w.readonly ? ' (ro)' : ''} [${w.choices.length} choices]`);
  await camera.set('iso', '800');
  console.log('iso now', await camera.get('iso'));
  try { await camera.set('iso', '12'); } catch (e) { console.log('rejected:', e.message); }
  camera.onFileAdded((p: string) => { console.log('file added:', p); });
  await camera.trigger();
  console.log('captured:', await camera.capture('captures'));
  await camera.close();
}
main();
