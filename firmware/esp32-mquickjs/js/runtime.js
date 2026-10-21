// The board's event loop, its JavaScript half (main/main.c is the other, js/sim.js on the computer): timers, the events the firmware's
// modules queue (gpio edges, Wi-Fi, BLE...), and what keeps a program running. main.c calls __zincTurn(now) between frames and events and
// sleeps until the time it returns; a program without a frame, a timer or a listener has ended.
var __zincTime = 0, __zincTimers = [], __zincNextId = 1, __zincHandlers = {}, __zincHolds = 0;   // objects, not arrays: mquickjs has no holes in arrays
function __zincAdd(f, ms, every, args) {
  if (typeof f !== "function") throw new TypeError("setTimeout: the callback is not a function");
  var id = __zincNextId++;
  __zincTimers.push({ id: id, at: __zincTime + (ms > 0 ? ms : 0), every: every, f: f, args: args, dead: false });
  return id;
}
function setTimeout(f, ms) { return __zincAdd(f, ms, 0, Array.prototype.slice.call(arguments, 2)); }
function setInterval(f, ms) { return __zincAdd(f, ms, ms > 1 ? ms : 1, Array.prototype.slice.call(arguments, 2)); }
function clearTimeout(id) {
  for (var i = 0; i < __zincTimers.length; i++)
    if (__zincTimers[i].id === id) { __zincTimers[i].dead = true; __zincTimers.splice(i, 1); return; }
}
var clearInterval = clearTimeout;
function queueMicrotask(f) { __zincAdd(f, 0, 0, []); }
// a module that listens (gpio.watch, ble.advertise, wifi.start...) holds the program open while it does
function __zincHold(n) { __zincHolds += n; }
function __zincOn(kind, f) { __zincHandlers[kind] = f; }
function __zincEvent(kind, a, b, s) { var f = __zincHandlers[kind]; if (f) f(a, b, s); }
// runs the timers due at `now` (ms since boot); the ms until the next one, 1000 when only listeners hold the program, -1 when nothing does
function __zincTurn(now) {
  __zincTime = now;
  var due = [], i;
  for (i = 0; i < __zincTimers.length; i++) if (__zincTimers[i].at <= now) due.push(__zincTimers[i]);
  for (i = 0; i < due.length; i++) {
    var t = due[i];
    if (t.dead) continue;
    if (t.every) t.at = now + t.every; else clearTimeout(t.id);
    t.f.apply(null, t.args);
  }
  var next = -1;
  for (i = 0; i < __zincTimers.length; i++) {
    var w = __zincTimers[i].at - now;
    if (next < 0 || w < next) next = w > 0 ? w : 0;
  }
  return next >= 0 ? next : __zincHolds > 0 ? 1000 : -1;
}
