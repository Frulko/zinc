// zinc:wifi on the ESP32 (lib/modules.d.ts; main/mod_wifi.c, the network image): the station, the setup portal, the clock. The state
// changes arrive through the event loop (js/runtime.js, ZN_EV_WIFI = 2): a = the state, 100 for a scan's networks.
export class WifiInfo {
  constructor(f) {
    this.state = f[0]; this.ssid = f[1]; this.ip = f[2]; this.rssi = +f[3]; this.name = f[4]; this.portal = f[5]; this.message = f[6] || "";
  }
}
var listener = null, scans = [];
export function info() { return new WifiInfo(__host_wifiInfo().split("\t")); }
export function start(onChange, options) {
  var o = options || {};
  if (onChange) { if (!listener) __zincHold(1); listener = onChange; }
  __host_wifiStart(o.portal || "", o.timezone || "");
}
export function connect(ssid, password) { __host_wifiConnect("" + ssid, password ? "" + password : ""); }
export function forget() { __host_wifiForget(); }
export function stop() {
  __host_wifiStop();
  if (listener) { listener = null; __zincHold(-1); }
}
export function scan(cb) {
  scans.push(cb);
  __zincHold(1);
  if (scans.length === 1) __host_wifiScan();
}
export function clock() { return __host_wifiClock(); }
__zincOn(2, function (a, n, s) {
  if (a === 100) {
    var nets = [], lines = s ? s.split("\n") : [];
    for (var i = 0; i < lines.length; i++) { var f = lines[i].split("\t"); nets.push({ ssid: f[0], rssi: +f[1], secure: f[2] === "1" }); }
    var cbs = scans;
    scans = [];
    for (var k = 0; k < cbs.length; k++) { __zincHold(-1); cbs[k](nets); }
  } else if (listener) listener(info());
});
