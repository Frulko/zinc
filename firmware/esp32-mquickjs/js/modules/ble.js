// zinc:ble on the ESP32 (plugins/ble is the Mac's, with the same API; docs/plugins/ble.md; main/mod_ble.c, the network image): the board
// advertises the Nordic UART Service and the Mac connects; whole '\n'-ended messages arrive (the firmware cuts them). ZN_EV_BLE = 3:
// a = 1 open (b the link, the text the central's address), 2 closed, 3 a message, 4 a device seen (b its RSSI, the text
// "address\tname"), 5 the scan ended.
export var UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export class Device {
  constructor(id, name, rssi) { this.id = id; this.name = name; this.rssi = rssi; }
}
export class Link {
  constructor(handle, id, name, on) { this.id = id; this.name = name; this.handle = handle; this._on = on; this._live = true; }
  send(text) {
    if (!this._live) throw new Error("ble: " + (this.name || this.id) + ": the link is not open");
    __host_bleSend(this.handle, text + "\n");
  }
  close() {
    if (!this._live) return;
    __host_bleClose(this.handle);
    finish(this);
  }
}
var links = {}, advertising = null, onFound = null, found = {};
function finish(l) {
  if (!l._live) return;
  l._live = false;
  delete links[l.handle];
  __zincHold(-1);
  l._on[2](l);
}
function endScan() { if (onFound) { onFound = null; __zincHold(-1); } }
// '' when BLE can be used, 'wifi' when Wi-Fi has the radio (they do not fit together in the ESP32's memory)
export function state() { return __host_bleState(); }
export function advertise(name, onOpen, onMessage, onClose) {
  __host_bleAdvertise(name);
  if (!advertising) __zincHold(1);
  advertising = [onOpen, onMessage, onClose];
}
export function scan(onDevice, seconds) {
  __host_bleScan(seconds > 0 ? seconds : 0);
  if (!onFound) __zincHold(1);
  onFound = onDevice;
  found = {};
}
export function stopScan() { __host_bleStopScan(); endScan(); }
export function connect(id, onOpen, onMessage, onClose) {
  throw new Error("ble: connect: on the ESP32 the program is the peripheral (advertise()); the Mac or a phone connects to it");
}
export function stop() {
  __host_bleStop();
  endScan();
  if (advertising) { advertising = null; __zincHold(-1); }
  for (var h in links) finish(links[h]);
}
__zincOn(3, function (a, b, s) {
  var l = links[b];
  if (a === 1) {
    if (!advertising) return;
    l = new Link(b, s, "", advertising);
    links[b] = l;
    __zincHold(1);
    l._on[0](l);
  } else if (a === 2) { if (l) finish(l); }
  else if (a === 3) { if (l) l._on[1](l, s); }
  else if (a === 4) {
    if (!onFound) return;
    var f = s.split("\t");
    if (found[f[0]]) return;
    found[f[0]] = 1;
    onFound(new Device(f[0], f[1], b));
  } else if (a === 5) endScan();
});
