// Mocks of the hardware APIs for tests/t1/web_hw.sh, injected before the page's own scripts (Page.addScriptToEvaluateOnNewDocument): headless Chrome has no serial port, MIDI
// device, USB camera or OSC relay, so the web backends of zinc:serial, zinc:midi, zinc:gphoto2 and zinc:osc run against these stand-ins. They follow the shape of the real APIs
// (Web Serial streams, Web MIDI ports, WebUSB transfers carrying real PTP containers, a binary WebSocket); what they prove is the plugins' logic, not a device.
(() => {
  const def = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- Web Serial: one granted port that echoes what is written
  const ts = new TransformStream();
  const port = {
    opened: null,
    getInfo: () => ({ usbVendorId: 0x2341, usbProductId: 0x43 }),
    async open(o) { port.opened = o; port.readable = ts.readable; port.writable = ts.writable; },
    async setSignals(s) { port.signals = s; },
    async close() { port.opened = null; },
  };
  def('serial', { getPorts: async () => [port], requestPort: async () => port, addEventListener() {} });
  window.__serial = port;

  // ---- Web MIDI: an input and an output wired back to back
  const input = { name: 'Mock Keys', onmidimessage: null };
  const output = { name: 'Mock Synth', sent: [], open: async () => {}, send(b) { output.sent.push(Array.from(b)); if (input.onmidimessage) input.onmidimessage({ data: Uint8Array.from(b) }); } };
  def('requestMIDIAccess', async (o) => ({ inputs: new Map([['i1', input]]), outputs: new Map([['o1', output]]), sysexEnabled: !!(o && o.sysex) }));
  window.__midi = output;

  // ---- OSC relay: a WebSocket that gives every binary frame back
  class MockWS extends EventTarget {
    constructor(url) { super(); this.url = url; this.readyState = 0; this.binaryType = 'blob'; setTimeout(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }, 5); }
    send(d) { const copy = d.slice ? d.slice(0) : d; setTimeout(() => { const e = new Event('message'); e.data = copy.buffer ? copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) : copy; this.dispatchEvent(e); }, 5); }
    close() { this.readyState = 3; }
  }
  window.__RealWS = window.WebSocket;
  window.WebSocket = function (url, ...a) { return /^wss?:\/\/mock\//.test(url) ? new MockWS(url) : new window.__RealWS(url, ...a); };

  // ---- WebUSB: a PTP camera (OpenSession, GetDeviceInfo, GetDevicePropDesc, InitiateCapture + ObjectAdded, GetObject)
  const str = (s) => { const b = []; b.push(s.length + 1); for (const c of s) b.push(c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8); b.push(0, 0); return b; };
  const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const arr = (xs) => [...u32(xs.length), ...xs.flatMap(u16)];
  const cont = (type, code, tid, payload) => { const b = new Uint8Array(12 + payload.length), v = new DataView(b.buffer); v.setUint32(0, b.length, true); v.setUint16(4, type, true); v.setUint16(6, code, true); v.setUint32(8, tid, true); b.set(payload, 12); return b; };
  const info = Uint8Array.from([...u16(100), ...u32(6), ...u16(100), ...str('mock-ext'), ...u16(0), ...arr([0x1001, 0x1002, 0x100e]), ...arr([]), ...arr([0x500f]), ...arr([]), ...arr([]), ...str('Mock Co'), ...str('Mock Cam 1'), ...str('1.0'), ...str('SN123')]);
  const desc = {
    0x500f: Uint8Array.from([...u16(0x500f), ...u16(4), 1, ...u16(100), ...u16(400), 2, ...u16(3), ...u16(100), ...u16(400), ...u16(800)]),
    0x5001: Uint8Array.from([...u16(0x5001), ...u16(2), 0, 100, 87, 1, 0, 100, 1]),
  };
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 0xff, 0xd9]);
  const inQ = [], evQ = [];
  const dev = {
    vendorId: 0x04a9, productId: 0x3173, productName: 'Mock Cam 1', serialNumber: 'SN123', opened: false, configuration: null, claimed: -1, sent: [],
    configurations: [],
    async open() { dev.opened = true; },
    async selectConfiguration() { dev.configuration = dev.configurations[0]; },
    async claimInterface(n) { dev.claimed = n; }, async releaseInterface() { dev.claimed = -1; }, async close() { dev.opened = false; },
    async transferOut(ep, data) {
      const v = new DataView(data.buffer, data.byteOffset, data.byteLength), type = v.getUint16(4, true), code = v.getUint16(6, true), tid = v.getUint32(8, true);
      dev.sent.push(code);
      if (type === 2 && code === 0x1016) dev.setValue = Array.from(data.slice(12));   // the data phase of SetDevicePropValue ends the transaction
      if (type !== 1) { if (type === 2 && code === 0x1016) inQ.push(cont(3, 0x2001, tid, Uint8Array.from([]))); return { status: 'ok', bytesWritten: data.length }; }
      const ok = (extra = []) => inQ.push(cont(3, 0x2001, tid, Uint8Array.from(extra)));
      if (code === 0x1002) ok();
      else if (code === 0x1001) { inQ.push(cont(2, code, tid, info)); ok(); }
      else if (code === 0x1014) { const d = desc[v.getUint32(12, true)]; if (d) { inQ.push(cont(2, code, tid, d)); ok(); } else inQ.push(cont(3, 0x200a, tid, Uint8Array.from([]))); }
      else if (code === 0x100e) { ok(); evQ.push(cont(4, 0x4002, 0, Uint8Array.from(u32(7)))); }
      else if (code === 0x1016) { /* the response follows the data phase */ }
      else if (code === 0x1009) { inQ.push(cont(2, code, tid, jpeg)); ok(); }
      else inQ.push(cont(3, 0x2005, tid, Uint8Array.from([])));
      return { status: 'ok', bytesWritten: data.length };
    },
    async transferIn(ep) {
      const q = ep === 3 ? evQ : inQ;
      for (let i = 0; i < 500 && q.length === 0; i++) await sleep(10);
      if (q.length === 0) throw new Error('timeout');
      const b = q.shift();
      return { status: 'ok', data: new DataView(b.buffer, b.byteOffset, b.byteLength) };
    },
  };
  dev.configurations = [{ interfaces: [{ interfaceNumber: 0, alternates: [{ interfaceClass: 6, endpoints: [{ endpointNumber: 1, direction: 'out', type: 'bulk' }, { endpointNumber: 2, direction: 'in', type: 'bulk' }, { endpointNumber: 3, direction: 'in', type: 'interrupt' }] }] }] }];
  def('usb', { getDevices: async () => [dev], requestDevice: async () => dev });
  window.__usb = dev;
})();
