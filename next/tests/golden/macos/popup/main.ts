// A context menu opens where the program asks in its window (ZN, 2026-10-09: it used screen coordinates flipped against the main screen and showed
// at the top of the screen). The menu closes by itself (abortMs); its screen position must fall in the window's frame, near the top-left corner.
import { onFrame, clear } from 'zinc:gfx';
import * as system from 'zinc:system';

let frame = 0;
onFrame((dt: number) => {
  clear(0x203040);
  frame++;
  if (frame !== 5) return;
  const r = system.call('menu.popup', { template: [{ label: 'Alpha', id: 'a', type: 'normal' }], x: 10, y: 20, abortMs: 300 }) as { id: string | null; at: number[] };
  const w = system.call('window.state', {}) as { x: number; y: number; w: number; h: number };
  const dx = r.at[0] - w.x, fromTop = w.y + w.h - r.at[1];
  console.log('picked', r.id === null ? 'nothing' : r.id);
  console.log('inside the window', dx >= 0 && dx <= w.w && fromTop >= 0 && fromTop <= w.h);
  console.log('near its top-left corner', dx < 60 && fromTop < 120);
  system.quit(0);
});
