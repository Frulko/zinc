// A window that animates, is hidden (as covered: nothing of it shows) and is shown again (tests/t1/covered_window.sh, ZN-1000).
// Each phase prints its frames per second and the longest wait between two frames.
import { onFrame, clear, rect } from 'zinc:gfx';
import * as system from 'zinc:system';
import * as window from 'zinc:system/window';

const t0 = performance.now();
let last = t0, frames = 0, maxGap = 0, phase = 'start', phaseAt = t0, x = 0;
function enter(name: string, now: number): void {
  if (phase !== 'start') {
    const s = (now - phaseAt) / 1000;
    console.log(phase + ' ' + (frames / s).toFixed(1) + ' fps, max gap ' + maxGap.toFixed(0) + ' ms');
  }
  phase = name; phaseAt = now; frames = 0; maxGap = 0;
}
onFrame((dt: number) => {
  const now = performance.now();
  const gap = now - last; last = now;
  frames++; if (gap > maxGap) maxGap = gap;
  x = (x + 3) % 360;
  clear(0x203040); rect(x, 100, 40, 40, 0xffcc00);
  const t = (now - t0) / 1000;
  if (phase === 'start' && t > 0.3) { window.setAlwaysOnTop(true); window.setPosition(40, 60); enter('visible', now); }   // above the other apps' windows, without the focus
  else if (phase === 'visible' && t > 1.3) { window.hide(); enter('hidden', now); }
  else if (phase === 'hidden' && t > 3.3) { window.show(); enter('shown', now); }   // ZINC_BACKGROUND: ordered in without taking the focus
  else if (phase === 'shown' && t > 4.5) { enter('end', now); system.quit(0); }
});
