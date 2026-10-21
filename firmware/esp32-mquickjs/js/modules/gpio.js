// zinc:gpio on the ESP32 (lib/modules.d.ts; main/mod_gpio.c): the chip's pins. watch() edges come from an interrupt, debounced on the
// board, and arrive through the event loop (js/runtime.js). The pins of the panel, the touch and the flash are refused.
export class PinEdge {
  constructor(pin, value, timestampMs) { this.pin = pin; this.value = value; this.timestampMs = timestampMs; }
}
var EDGES = { rising: 0, falling: 1, both: 2 }, watchers = {};
export function setup(pin, mode, pull) {
  if (mode !== "in" && mode !== "out") throw new TypeError("zinc:gpio setup: mode is \"in\" or \"out\", not " + mode);
  __host_gpioSetup(pin, mode === "out" ? 1 : 0, pull === "up" ? 1 : pull === "down" ? 2 : 0);
}
export function write(pin, value) { __host_gpioWrite(pin, value ? 1 : 0); }
export function read(pin) { return __host_gpioRead(pin); }
export function watch(pin, edge, debounceMs, cb) {
  if (!(edge in EDGES)) throw new TypeError("zinc:gpio watch: edge is \"rising\", \"falling\" or \"both\", not " + edge);
  if (!watchers[pin]) __zincHold(1);
  watchers[pin] = cb;
  __host_gpioWatch(pin, EDGES[edge], debounceMs);
}
// the simulator's (macos, linux): a board's inputs are wired
export function simulate(pin, value) {}
__zincOn(1, function (a, t) {   // main/zn.h ZN_EV_GPIO: a = pin | value << 8, t = ms since boot
  var cb = watchers[a & 0xff];
  if (cb) cb(new PinEdge(a & 0xff, a >> 8, t));
});
