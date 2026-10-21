// The board on the computer, for the check zinc runs before it compiles a program for the mquickjs firmware: the host calls main/*.c
// define (the same names, arguments checked, doing nothing or answering as an idle board would), a finger that sweeps across the screen,
// input pins that change every half second, and the board's loop (main/main.c): FRAMES turns of 16 ms of simulated time, each running
// the due timers (js/runtime.js), a frame when the program has one, and the events of the turn. zinc reads the names below: a host call
// missing here is missing on the board too, and calling it throws.
var __simX = 120, __simY = 160, __simDown = false, __simTurn = 0, __simLater = setTimeout;   // the host's timer: the program's replaces it
var __simWatched = [], __simStore = {};
function __simNum(name, args, n) {
  for (var i = 0; i < n; i++) if (typeof args[i] !== "number" || args[i] !== args[i]) throw new TypeError(name + ": argument " + (i + 1) + " is " + args[i] + ", not a number");
}
function __simStr(name, s) { if (typeof s !== "string") throw new TypeError(name + ": " + s + " is not a string"); }
function __simPin(name, pin) {
  __simNum(name, [pin], 1);
  if (pin < 0 || pin > 39 || (pin >= 6 && pin <= 11) || (pin >= 28 && pin <= 31) || pin === 20 || pin === 24) throw new RangeError("zinc:gpio: no pin " + pin + " on the ESP32 (6 to 11 are the flash's)");
  if ([15, 13, 12, 14, 27, 25, 33, 32, 4, 2, 17, 16, 0, 21, 22].indexOf(pin) >= 0) throw new RangeError("zinc:gpio: pin " + pin + " is the board's (panel, backlight or touch)");
}
// zinc:gfx (main/main.c)
function __host_gfxWidth() { return 240; }
function __host_gfxHeight() { return 320; }
function __host_gfxPixelScale() { return 1; }
function __host_gfxClear(color) { __simNum("zinc:gfx clear", arguments, 1); }
function __host_gfxRect(x, y, w, h, color) { __simNum("zinc:gfx rect", arguments, 5); }
function __host_gfxRRect(x, y, w, h, r, color, alpha) { __simNum("zinc:gfx rrect", arguments, 7); }
function __host_gfxText(x, y, s, color, scale) { __simNum("zinc:gfx text", [x, y, color, scale], 4); }
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
// zinc:gpio (main/mod_gpio.c)
function __host_gpioSetup(pin, mode, pull) {
  __simPin("zinc:gpio setup", pin);
  if (mode === 1 && pin >= 34) throw new RangeError("zinc:gpio: pin " + pin + " is an input only (34 to 39)");
  if (pull && pin >= 34) throw new RangeError("zinc:gpio setup: pin " + pin + " has no internal pull resistor (34 to 39): wire one and use \"none\"");
}
function __host_gpioWrite(pin, v) { __simPin("zinc:gpio write", pin); }
function __host_gpioRead(pin) { __simPin("zinc:gpio read", pin); return __simTurn % 60 < 30 ? 1 : 0; }
function __host_gpioWatch(pin, edge, ms) { __simPin("zinc:gpio watch", pin); __simNum("zinc:gpio watch", [edge, ms], 2); __simWatched.push(pin); }
// zinc:storage (main/mod_storage.c)
function __host_storageGet(k) { __simStr("zinc:storage get", k); return __simStore[k] || ""; }
function __host_storageSet(k, v) { __simStr("zinc:storage set", k); __simStr("zinc:storage set", v); if (k.length > 15) throw new RangeError("zinc:storage: a key is 1 to 15 bytes on the ESP32 (NVS)"); __simStore[k] = v; }
function __host_storageRemove(k) { __simStr("zinc:storage remove", k); delete __simStore[k]; }
function __host_storageKeys() { return Object.keys(__simStore).join("\n"); }
// the loop of main/main.c, on simulated time
function __simLoop() {   // after the program has run: it set its timers, listeners and frame callback
  if (__simTurn++ >= FRAMES) return;
  var now = __simTurn * 16;
  __simDown = __simTurn % 120 < 60;
  __simX = Math.abs((__simTurn * 4) % 480 - 240);
  __simY = 280;
  if (__simTurn % 30 === 0) for (var i = 0; i < __simWatched.length; i++) __zincEvent(1, __simWatched[i] | (__simTurn % 60 < 30 ? 1 : 0) << 8, now);
  var wait = __zincTurn(now);
  if (typeof globalThis.__zincFrameCb === "function") globalThis.__zincFrameCb(1 / 60);
  else if (wait < 0) return;   // the program ended
  __simLater(__simLoop, 0);
}
__simLater(__simLoop, 0);
