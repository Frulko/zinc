// The board on the computer, for the check zinc runs before it compiles a program for the mquickjs firmware: the zinc:gfx host calls
// main/zn_stdlib.c defines (the same names, arguments checked, drawing nothing), a finger that sweeps across the screen so the touch
// paths run, and the frame loop, FRAMES frames. zinc reads the names below: a zinc:gfx call missing here is missing on the board too.
var __simX = 120, __simY = 160, __simDown = false;
function __simNum(name, args, n) {
  for (var i = 0; i < n; i++) if (typeof args[i] !== "number" || args[i] !== args[i]) throw new TypeError("zinc:gfx " + name + ": argument " + (i + 1) + " is " + args[i] + ", not a number");
}
function __host_gfxWidth() { return 240; }
function __host_gfxHeight() { return 320; }
function __host_gfxPixelScale() { return 1; }
function __host_gfxClear(color) { __simNum("clear", arguments, 1); }
function __host_gfxRect(x, y, w, h, color) { __simNum("rect", arguments, 5); }
function __host_gfxRRect(x, y, w, h, r, color, alpha) { __simNum("rrect", arguments, 7); }
function __host_gfxText(x, y, s, color, scale) { __simNum("text", [x, y, color, scale], 4); }
function __host_gfxImage(name) { return -1; }
function __host_gfxKeep() {}
function __host_gfxIsDown(b) { return false; }
function __host_gfxWasPressed(b) { return false; }
function __host_gfxPointerX() { return __simX; }
function __host_gfxPointerY() { return __simY; }
function __host_gfxPointerDown() { return __simDown; }
function __host_gfxTouchCount() { return __simDown ? 1 : 0; }
function __host_gfxTouchX(i) { return __simX; }
function __host_gfxTouchY(i) { return __simY; }
function __simFrame() {   // after the program has run: it set the frame callback (zinc:gfx onFrame)
  if (FRAMES-- <= 0 || typeof globalThis.__zincFrameCb !== "function") return;
  __simDown = FRAMES % 120 < 60;
  __simX = Math.abs((FRAMES * 4) % 480 - 240);
  __simY = 280;
  globalThis.__zincFrameCb(1 / 60);
  setTimeout(__simFrame, 0);
}
setTimeout(__simFrame, 0);
