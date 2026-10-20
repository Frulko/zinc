// More windows (ZN-663): the main window and a second one draw different frames and receive their own clicks; a line is printed for each
// click (where, in which window size) and when a window closes. tests/t1/windows.sh drives it with scripted input (ZINC_INPUT).
import { onFrame, openWindow, windowOpen, frame, clear, rect, rrect, width, height, pointerX, pointerY, buttonEventCount, buttonEventDown } from 'zinc:gfx';

let mainClicks: i32 = 0, sideClicks: i32 = 0, mainSeen = true, sideSeen = true, side: i32 = -1;
function clicks(): i32 { let n: i32 = 0; for (let i: i32 = 0; i < buttonEventCount(); i++) if (buttonEventDown(i)) n++; return n; }

onFrame((dt: number) => {
  const c = clicks();
  if (c > 0) { mainClicks += c; console.log(`frame ${frame()}: main click at ${pointerX()},${pointerY()} in ${width()}x${height()}`); }
  if (sideSeen && !windowOpen(side)) { sideSeen = false; console.log(`frame ${frame()}: the side window closed, the main one goes on`); }
  clear(0x203040);
  for (let i: i32 = 0; i < mainClicks; i++) rect(20 + i * 30, 20, 24, 24, 0xffcc00);
  rrect(20, 80, width() - 40, height() - 100, 12, 0x3a5a7a, 255);
});

side = openWindow('Side', 200, 120, (dt: number) => {
  const c = clicks();
  if (c > 0) { sideClicks += c; console.log(`frame ${frame()}: side click at ${pointerX()},${pointerY()} in ${width()}x${height()}`); }
  if (mainSeen && !windowOpen(0)) { mainSeen = false; console.log(`frame ${frame()}: the main window closed, the side one goes on`); }
  if (!mainSeen && frame() % 2 === 0) console.log(`frame ${frame()}: side drawn`);
  clear(0x402820);
  for (let i: i32 = 0; i < sideClicks; i++) rrect(10 + i * 24, 10, 18, 18, 9, 0x40e0a0, 255);
  rect(10, height() - 30, width() - 20, 20, 0xe06040);
});
console.log(`side window ${side}`);
