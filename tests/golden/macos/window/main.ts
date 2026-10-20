import { onFrame, clear, rect } from 'zinc:gfx';
import * as system from 'zinc:system';
import * as window from 'zinc:system/window';

let frame = 0;
onFrame((dt: number) => {
  clear(0x203040); rect(10, 10, 100, 60, 0xffcc00);
  frame++;
  if (frame === 5) {
    window.setTitle('Window selftest'); window.setOpacity(0.9); window.setAlwaysOnTop(true);
    window.setTitleBar('overlay'); window.setTrafficLights(20, 22);
    window.setSize(500, 400);
  }
  if (frame === 20) {
    const d = system.call('window.dump', {}) as { text: string };
    console.log('after setup and a resize:\n' + d.text);
    const s = window.state();
    console.log('state size', s.w, s.h, 'fullscreen', s.fullscreen);
    window.setSize(640, 420);   // AppKit resets the buttons on a resize: they must come back
  }
  if (frame === 40) {
    const d = system.call('window.dump', {}) as { text: string };
    console.log('after another resize:\n' + d.text);
    window.setFullscreen(true);
  }
  if (frame === 150) {
    const d = system.call('window.dump', {}) as { text: string };
    console.log('in fullscreen: ' + d.text.split('\n').filter((l: string) => l.startsWith('fullscreen') || l.startsWith('close')).join(' | '));
    window.setFullscreen(false);
  }
  if (frame === 260) {
    const d = system.call('window.dump', {}) as { text: string };
    console.log('after leaving fullscreen: ' + d.text.split('\n').filter((l: string) => l.startsWith('fullscreen') || l.startsWith('close')).join(' | '));
    system.quit(0);
  }
});
