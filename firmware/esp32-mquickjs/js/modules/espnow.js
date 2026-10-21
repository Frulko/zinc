// zinc:espnow on the ESP32 (lib/modules.d.ts; main/mod_espnow.c, the network image): packets between boards with no access point.
// ZN_EV_ESPNOW = 4: a = 0 received (b the RSSI, the text the sender's 17-character address then the data), 1 sent, 2 not acknowledged.
export var BROADCAST = "ff:ff:ff:ff:ff:ff";
var onPacket = null, sends = {};
export function start(onReceive, options) {
  if (!onPacket) __zincHold(1);
  onPacket = onReceive;
  __host_espnowStart((options && options.channel) || 0);
}
export function send(to, data, onSent) {
  var id = __host_espnowSend(to, "" + data);
  if (onSent) { sends[id] = onSent; __zincHold(1); }
}
export function address() { return __host_espnowAddress(); }
export function stop() {
  __host_espnowStop();
  if (onPacket) { onPacket = null; __zincHold(-1); }
}
__zincOn(4, function (a, b, s) {
  if (a === 0) { if (onPacket) onPacket({ from: s.slice(0, 17), data: s.slice(17), rssi: b }); return; }
  var cb = sends[b];
  if (!cb) return;
  delete sends[b];
  __zincHold(-1);
  cb(a === 1);
});
