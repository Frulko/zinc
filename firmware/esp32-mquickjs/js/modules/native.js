// zinc:native on the ESP32 (main/zn_native.c; src/qjs/native_js.cpp is the computer's): requireNative('Qrcode') of a plugin's spec gives an
// object with one function per export of its native module, C on Zinc's native ABI that zinc built into the firmware. The arguments and the
// result are converted in C by the export's signature.
export var NativeModule = undefined;
export function requireNative(name) {
  var list = __host_nativeOpen(name).split("\n");   // the module's index, then "<export> <signature>" per export
  var m = +list[0], o = {};
  for (var i = 1; i < list.length; i++) o[list[i].split(" ")[0]] = bind(m, i - 1);
  return o;
}
function bind(m, x) {
  return function (a, b, c, d, e, f, g, h) { return __host_nativeCall(m, x, a, b, c, d, e, f, g, h); };
}
