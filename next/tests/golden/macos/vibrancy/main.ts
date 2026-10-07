import { onFrame, clear, rect } from 'zinc:gfx';
import * as system from 'zinc:system';
import * as window from 'zinc:system/window';
import * as fs from 'zinc:fs';

let frame = 0;
onFrame((dt: number) => {
  clear(0x000000);                 // the key colour: see-through in a transparent window
  rect(20, 20, 100, 60, 0xffcc00); // opaque yellow
  frame++;
  if (frame === 5) {
    window.setPosition(400, 500);
  }
  if (frame === 30) {
    const d = system.call('window.dump', {}) as { text: string };
    const line = d.text.split('\n').filter((l: string) => l.startsWith('windowNumber'))[0];
    fs.writeText('window-number.txt', line.slice(13));   // for the test script's screencapture -l
    console.log('DUMP ' + d.text.split('\n').filter((l: string) => l.startsWith('opaque') || l.startsWith('vibrancy')).join(' | '));
  }
  if (frame === 20) {
    const s = window.state();
    const main = window.displays()[0];
    // top-left screen coordinates of the window, for the screenshot
    console.log('RECT ' + Math.round(s.x) + ' ' + Math.round(main.h - s.y - s.h) + ' ' + Math.round(s.w) + ' ' + Math.round(s.h));
  }
  if (frame === 60) window.setVibrancy('sidebar');
  if (frame === 70) { const d = system.call('window.dump', {}) as { text: string }; console.log('DUMP ' + d.text.split('\n').filter((l: string) => l.startsWith('opaque') || l.startsWith('vibrancy')).join(' | ')); }
  if (frame === 200) system.quit(0);
});
