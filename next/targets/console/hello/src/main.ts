// The console hello (ZN-753): the first program a person runs on a console core (tools/console-demos) and the shot of the emulator tests
// (tests/t2/console_emulators.sh). Its line, then text and a moving square every frame until the console quits it (HOME, the PS button).
import { onFrame, clear, rect, text, width, height } from 'zinc:gfx';
import { platform } from 'zinc:sys';

const message = 'hello from zinc on ' + platform();
console.log(message);

let x = 0;
let vx = 120;
let frames: i32 = 0;
onFrame((dt: number) => {
  frames++;
  x += vx * dt;
  if (x < 0 || x > width() - 32) {
    vx = -vx;
    x = Math.max(0, Math.min(width() - 32, x));
  }
  clear(0x203060);
  text((width() - message.length * 16) / 2, height() / 2 - 48, message, 0xffffff, 2);
  rect(x, height() / 2, 32, 32, 0xffcc33);
  text(8, height() - 16, `frame ${frames}`, 0xa0b0d0, 1);
});
