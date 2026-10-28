// zinc:gphoto2 in the browser (docs/targets/web.md, "Plugins"): the native spec (native/gphoto2.spec.ts) over WebUSB (Chromium only, secure context), speaking PTP itself.
// index.ts runs unchanged. This is the basic camera-control subset of PTP (ISO 15740) that every still-image camera answers, not libgphoto2: the existing WebAssembly port of
// libgphoto2 (npm `web-gphoto2`, LGPL, Emscripten with Asyncify, about 5 MB, needs cross-origin isolation) covers more models and vendor extensions and is the next step for
// them; this one is 300 lines, needs no wasm and no headers, and does:
//   detect, open, close, summary (DeviceInfo), config / get / set (the standard device properties: battery, white balance, f-number, exposure time, ISO, image size...),
//   capture and trigger (InitiateCapture, then the ObjectAdded event), download (GetObject, as a blob: URL), thumbnail (GetThumb or the downloaded JPEG), file events.
// Not here: live view (it is a vendor command: Nikon 0x9203, Canon EOS 0x9153), vendor widgets (Nikon changeafarea...), PTP/IP. Asking for them answers an error event or an Error.
// detect() lists the cameras the person already allowed (getDevices) and, when there is none and the page has a user activation, opens the browser's chooser (requestDevice).
const Z = globalThis.__zincWeb, G = globalThis;
const RS = '\u001e', FS = '\u001f';
const PROPS = [[0x5001, 'battery', 'Battery level'], [0x5003, 'imagesize', 'Image size'], [0x5005, 'whitebalance', 'White balance'], [0x5007, 'f-number', 'F-number'],
  [0x500d, 'shutterspeed', 'Exposure time'], [0x500e, 'expprogram', 'Exposure program'], [0x500f, 'iso', 'ISO'], [0x5010, 'exposurebias', 'Exposure bias'], [0x5004, 'compression', 'Compression']];
let dev = null, iface = null, epIn = 0, epOut = 0, epEvt = 0, tid = 1, model = '', info = null, pollOn = false, eventCb = null;
const blobs = new Map();   // blob: URL -> bytes
const descs = new Map();   // property name -> { code, type, current, form, ... }

const u16 = (v, o) => v.getUint16(o, true), u32 = (v, o) => v.getUint32(o, true);
function container(type, code, t, params, payload) {
  const len = 12 + params.length * 4 + (payload ? payload.length : 0);
  const b = new Uint8Array(len), v = new DataView(b.buffer);
  v.setUint32(0, len, true); v.setUint16(4, type, true); v.setUint16(6, code, true); v.setUint32(8, t, true);
  params.forEach((p, i) => v.setUint32(12 + i * 4, p >>> 0, true));
  if (payload) b.set(payload, 12 + params.length * 4);
  return b;
}
async function readFrom(ep, size) {
  const r = await dev.transferIn(ep, size);
  if (r.status === 'stall') { await dev.clearHalt('in', ep); throw new Error('the camera stalled'); }
  return new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
}
/** One PTP transaction: command, optional data out, optional data in, response. Resolves { code, params, data }. */
async function ptp(code, params = [], dataOut = null) {
  const t = tid++;
  await dev.transferOut(epOut, container(1, code, t, params));
  if (dataOut) await dev.transferOut(epOut, container(2, code, t, [], dataOut));
  let data = new Uint8Array(0);
  for (;;) {
    let chunk = await readFrom(epIn, 65536);
    for (;;) {
      if (chunk.length < 12) { chunk = await readFrom(epIn, 65536); continue; }
      const v = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength), len = u32(v, 0), type = u16(v, 4);
      if (type === 2) {   // data: the rest of the container follows in more packets
        const out = new Uint8Array(len - 12);
        let got = Math.min(chunk.length - 12, out.length);
        out.set(chunk.subarray(12, 12 + got), 0);
        while (got < out.length) { const c = await readFrom(epIn, 65536); const n = Math.min(c.length, out.length - got); out.set(c.subarray(0, n), got); got += n; }
        data = out;
        break;
      }
      if (type === 3) {
        const params2 = [];
        for (let o = 12; o + 4 <= len; o += 4) params2.push(u32(v, o));
        const rc = u16(v, 6);
        if (rc !== 0x2001) throw new Error('PTP response 0x' + rc.toString(16) + ' to 0x' + code.toString(16));
        return { code: rc, params: params2, data };
      }
      break;
    }
  }
}
function str(v, o) {   // a PTP string: a count of UTF-16 units (with the terminator), then the units
  const n = v.getUint8(o);
  let s = '';
  for (let i = 0; i < n - 1; i++) s += String.fromCharCode(u16(v, o + 1 + i * 2));
  return [s, o + 1 + n * 2];
}
function parseInfo(data) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;   // standard version u16, vendor extension id u32, vendor version u16
  let r;
  [r, o] = str(v, o);                                           // vendor extension description
  o += 2;                                                       // functional mode
  for (let k = 0; k < 5; k++) o += 4 + u32(v, o) * 2;   // operations, events, device properties, capture formats, image formats (arrays of u16)
  let manufacturer, modelName, version, serial;
  [manufacturer, o] = str(v, o); [modelName, o] = str(v, o); [version, o] = str(v, o); [serial, o] = str(v, o);
  return { manufacturer, model: modelName, version, serial };
}
const SIZES = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 8, 8: 8 };
function readVal(v, o, type) {
  switch (type) {
    case 1: return [v.getInt8(o), o + 1]; case 2: return [v.getUint8(o), o + 1];
    case 3: return [v.getInt16(o, true), o + 2]; case 4: return [v.getUint16(o, true), o + 2];
    case 5: return [v.getInt32(o, true), o + 4]; case 6: return [v.getUint32(o, true), o + 4];
    case 0xffff: return str(v, o);
    default: return [0, o + (SIZES[type] || 0)];
  }
}
function parseDesc(data) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const code = u16(v, 0), type = u16(v, 2), rw = v.getUint8(4);
  let o = 5, def, cur;
  [def, o] = readVal(v, o, type); [cur, o] = readVal(v, o, type);
  const form = v.getUint8(o++);
  const d = { code, type, writable: rw === 1, current: cur, form, min: 0, max: 0, step: 0, choices: [] };
  if (form === 1) { [d.min, o] = readVal(v, o, type); [d.max, o] = readVal(v, o, type); [d.step, o] = readVal(v, o, type); }
  else if (form === 2) { const n = u16(v, o); o += 2; for (let i = 0; i < n; i++) { let x; [x, o] = readVal(v, o, type); d.choices.push(x); } }
  return d;
}
function encodeVal(type, value) {
  const n = SIZES[type] || 2, b = new Uint8Array(n), v = new DataView(b.buffer);
  const x = Number(value);
  if (n === 1) v.setUint8(0, x & 255); else if (n === 2) v.setUint16(0, x & 0xffff, true); else v.setUint32(0, x >>> 0, true);
  return b;
}
function need() { Z.require('webusb', 'WebUSB exists in Chromium browsers (Chrome, Edge, Opera) on https pages and localhost; Firefox and Safari have none'); }
const nameOf = (d) => (d.productName || 'USB camera ' + d.vendorId.toString(16) + ':' + d.productId.toString(16));
const portOf = (d) => 'usb:' + d.vendorId.toString(16) + ':' + d.productId.toString(16) + (d.serialNumber ? ':' + d.serialNumber : '');
const isCamera = (d) => (d.configurations || []).some((c) => c.interfaces.some((i) => i.alternates.some((a) => a.interfaceClass === 6)));
async function cameras() {
  const usb = G.navigator.usb;
  let list = (await usb.getDevices()).filter((d) => isCamera(d) || !d.configurations || d.configurations.length === 0);
  const ua = G.navigator.userActivation;
  if (list.length === 0 && (!ua || ua.isActive)) { try { list = [await usb.requestDevice({ filters: [{ classCode: 6 }] })]; } catch (e) { /* the person closed the chooser */ } }
  return list;
}
async function pollEvents() {
  if (pollOn || !dev) return;
  pollOn = true;
  try {
    while (dev && epEvt) {
      const c = await readFrom(epEvt, 64);
      if (c.length >= 16) {
        const v = new DataView(c.buffer, c.byteOffset, c.byteLength);
        if (u16(v, 6) === 0x4002) { const path = 'ptp:' + u32(v, 12); events.push(path); if (eventCb) eventCb('file', path); }
      }
    }
  } catch (e) { if (dev && eventCb) eventCb('error', String((e && e.message) || e)); }
  pollOn = false;
}
const events = [];
async function waitForObject(ms) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (events.length) return events.shift(); await new Promise((r) => setTimeout(r, 20)); }
  throw new Error('the camera did not report a new picture');
}
async function getObject(path) {
  const h = parseInt(String(path).replace(/^ptp:/, ''), 10);
  const r = await ptp(0x1009, [h]);
  const url = G.URL.createObjectURL(new G.Blob([r.data], { type: 'image/jpeg' }));
  blobs.set(url, r.data);
  return url;
}
const widgets = async () => {
  const out = [];
  for (const [code, name, label] of PROPS) {
    try {
      const d = parseDesc((await ptp(0x1014, [code])).data);
      descs.set(name, d);
      out.push([`/main/other/${name}`, label, d.form === 2 ? 'radio' : d.form === 1 ? 'range' : 'text', d.writable ? '0' : '1', String(d.current), String(d.min), String(d.max), String(d.step), ...d.choices.map(String)].join(FS));
    } catch (e) { /* the camera has no such property */ }
  }
  return out.join(RS);
};
Z.registerNative('Gphoto2', {
  async detect() { need(); return (await cameras()).map((d) => ({ model: nameOf(d), port: portOf(d) })); },
  async open(m, port) {
    need();
    const list = await cameras();
    const d = list.find((x) => (m === '' || nameOf(x) === m) && (port === '' || portOf(x) === port)) || list[0];
    if (!d) throw new Error('no camera found (allow one in the browser\'s USB chooser)');
    await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);
    const itf = d.configuration.interfaces.find((i) => i.alternates.some((a) => a.interfaceClass === 6));
    if (!itf) throw new Error('this USB device has no still-image (PTP) interface');
    await d.claimInterface(itf.interfaceNumber);
    const alt = itf.alternates.find((a) => a.interfaceClass === 6);
    for (const e of alt.endpoints) { if (e.type === 'bulk' && e.direction === 'in') epIn = e.endpointNumber; else if (e.type === 'bulk') epOut = e.endpointNumber; else if (e.type === 'interrupt') epEvt = e.endpointNumber; }
    dev = d; iface = itf.interfaceNumber; tid = 1; events.length = 0;
    await ptp(0x1002, [1]).catch((e) => { if (!/0x201e/.test(String(e))) throw e; });   // OpenSession (0x201e: already open)
    info = parseInfo((await ptp(0x1001)).data);
    model = info.model || nameOf(d);
    pollEvents();
    return model;
  },
  async close() {
    if (!dev) return '';
    const d = dev; dev = null;
    try { await d.releaseInterface(iface); await d.close(); } catch (e) { /* unplugged */ }
    return '';
  },
  async summary() { if (!info) throw new Error('no camera is open'); return `Manufacturer: ${info.manufacturer}\nModel: ${info.model}\nVersion: ${info.version}\nSerial number: ${info.serial}\nBackend: WebUSB, PTP`; },
  async config() { if (!dev) throw new Error('no camera is open'); return widgets(); },
  async get(name) {
    if (!dev) throw new Error('no camera is open');
    const key = name.split('/').pop();
    const p = PROPS.find((x) => x[1] === key);
    if (!p) throw new Error('no such setting: ' + name);
    const d = parseDesc((await ptp(0x1014, [p[0]])).data);
    return String(d.current);
  },
  async set(name, value) {
    if (!dev) throw new Error('no camera is open');
    const key = name.split('/').pop();
    const p = PROPS.find((x) => x[1] === key);
    if (!p) throw new Error('this camera setting is not in the web backend: ' + name + ' (vendor settings need libgphoto2)');
    const d = descs.get(key) || parseDesc((await ptp(0x1014, [p[0]])).data);
    await ptp(0x1016, [p[0]], encodeVal(d.type, value));
    return '';
  },
  async capture(dir) {
    if (!dev) throw new Error('no camera is open');
    events.length = 0;
    await ptp(0x100e, [0, 0]);
    const path = await waitForObject(15000);
    return dir !== '' ? await getObject(path) : path;
  },
  async trigger() { if (!dev) throw new Error('no camera is open'); await ptp(0x100e, [0, 0]); return ''; },
  async download(path, dir) { if (!dev) throw new Error('no camera is open'); return getObject(path); },
  async thumbnail(path, w, h) {
    let bytes = blobs.get(path);
    if (!bytes && dev && /^ptp:/.test(path)) bytes = (await ptp(0x100a, [parseInt(path.slice(4), 10)])).data;
    if (!bytes) throw new Error('no such picture: ' + path);
    return String(G.__host_gfxImageFromBytes(Array.from(bytes)));
  },
  onEvent(cb) { eventCb = cb; },
  liveView(on) { if (on && eventCb) eventCb('error', 'live view is a vendor command (Nikon, Canon) that the web backend does not speak yet'); },
  setViewSize() {}, liveImage() { return -1; }, cameraFps() { return 0; }, shownFps() { return 0; }, decodeMs() { return 0; }, liveWidth() { return 0; }, liveHeight() { return 0; },
}, ['webusb']);
