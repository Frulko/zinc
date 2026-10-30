// The shell's side of tests/t0/shell_plugin.sh: starts the stand-in app (SH_APP) with zinc:shell, draws its image below a blue bar, saves
// the screen once the app's first frame is shown (SH_SHOT), sends it Home after its second frame (its answer to the scripted tap) and
// quits when it has ended.
import { onFrame, clear, rect, drawImage, width, height, capture, quit, pointerDown, pointerY } from 'zinc:gfx';
import * as shell from 'zinc:shell';
import * as sys from 'zinc:sys';

let frames = 0, shown = -1, shotSerial = -1, second = -1, homeAt = 0, done = -1;
let barPress = false, appPress = false;
shell.onExit((name: string, status: number) => {
  console.log(`exit ${name} ${status} image ${shell.image()} current '${shell.current()}' after home ${Date.now() - homeAt < 4500 ? 'in time' : 'late'}`);
  done = frames;
});
console.log(`started ${shell.start(sys.env('SH_APP'), 'standin') > 0 ? 'ok' : 'failed'}`);
onFrame((dt: number) => {
  frames++;
  const t0 = Date.now();
  while (Date.now() - t0 < 10) {}   // about 100 frames a second, so the scripted input (frames 250 to 305) comes after the app connected
  const bar = shell.barHeight(), W = width(), H = height();
  clear(0x202020);
  rect(0, 0, W, bar, 0x0000FF);
  const img = shell.image();
  if (img >= 0) drawImage(img, 0, bar, W, H - bar, 255, 0);
  if (pointerDown()) { if (pointerY() < bar) barPress = true; else if (img >= 0) appPress = true; }
  if (img >= 0 && shown < 0) shown = frames;
  if (shown > 0 && frames === shown + 2) {
    capture(sys.env('SH_SHOT'));
    shotSerial = shell.serial();
    console.log(`size ${W} ${H} bar ${bar} title ${shell.title()} current ${shell.current()} responding ${shell.responding()}`);
  }
  if (shotSerial >= 0 && second < 0 && shell.serial() > shotSerial) second = frames;
  if (second > 0 && homeAt === 0 && frames === second + 20) {   // the release of the tap and of buffer 0 have gone to the app meanwhile
    console.log(`second frame; bar press seen ${barPress}, app press seen ${appPress}`);
    homeAt = Date.now();
    shell.home();
    console.log(`home: image ${shell.image()} current '${shell.current()}'`);
  }
  if ((done >= 0 && frames > done + 1) || frames > 2000) { if (done < 0) console.log('timeout'); quit(); }
});
