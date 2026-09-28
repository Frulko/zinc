// camera-cli: a headless camera session over zinc:gphoto2, one step at a time: detect, open, list the settings,
// change one, see a bad value rejected, fire the shutter, capture to ./captures, close.
// No camera here? ZINC_FAKE_CAMERA=1 (the sim target always uses the fake camera).
import * as camera from 'zinc:gphoto2';

const CAPTURES_DIR = 'captures';

function section(title: string): void {
  console.log('');
  console.log(`== ${title}`);
}

/** "/main/imgsettings/iso = Auto [8 choices]", with "(ro)" for read-only widgets. */
function describe(w: camera.Widget): string {
  const readonly = w.readonly ? ' (ro)' : '';
  return `${w.path} = ${w.value}${readonly} [${w.choices.length} choices]`;
}

/** Opens the first camera; false when none is plugged in. */
async function openFirstCamera(): Promise<boolean> {
  section('Detect');
  const cams = await camera.detect();
  console.log('cameras:', cams.length);
  if (cams.length === 0) return false;
  console.log('model:', await camera.open(cams[0].model, cams[0].port));
  return true;
}

async function listSettings(): Promise<void> {
  section('Settings');
  for (const w of await camera.config()) console.log(describe(w));
}

async function changeIso(): Promise<void> {
  section('Change a setting');
  await camera.set('iso', '800');
  console.log('iso now', await camera.get('iso'));
  // values outside the widget's choices are refused by the driver: the promise rejects with an Error
  try {
    await camera.set('iso', '12');
  } catch (e) {
    console.log('rejected:', e.message);
  }
}

async function shoot(): Promise<void> {
  section('Shoot');
  // trigger() fires the shutter without waiting: the new file arrives as an event
  camera.onFileAdded((path: string) => { console.log('file added:', path); });
  await camera.trigger();
  // capture() waits for the photo and downloads it
  console.log('captured:', await camera.capture(CAPTURES_DIR));
}

async function main(): Promise<void> {
  if (!(await openFirstCamera())) return;
  await listSettings();
  await changeIso();
  await shoot();
  await camera.close();
}

main();
