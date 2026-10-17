// zinc:serial in the browser (docs/targets/web.md, "Plugins"): the native spec (native/serial.spec.ts) over Web Serial (Chromium only, secure context). index.ts runs unchanged.
// The spec is synchronous and Web Serial is not, so: list() answers from the ports the person already granted (navigator.serial.getPorts(), kept up to date by the
// connect and disconnect events) and, when there is none and the page has a user activation (a click in the last seconds), opens the browser's own chooser
// (requestPort) and lists the port once it is chosen; open() returns a handle at once and opens the port in the background (writes queue until it is open; a port that
// fails to open reads as gone: alive() is false and error() says why). Names are `web-serial:<n>` with the USB ids when there are some.
const Z = globalThis.__zincWeb;
const known = [];            // granted SerialPort objects, in the order they were seen
const handles = new Map();   // handle -> { port, rx, tx, ready, alive, writer, reader, failed }
let next = 1, lastError = '', asked = false;
const api = () => (Z.features.webserial ? globalThis.navigator.serial : null);
const nameOf = (i) => {
  const info = known[i].getInfo ? known[i].getInfo() : {};
  return 'web-serial:' + i + (info.usbVendorId !== undefined ? ' (usb ' + info.usbVendorId.toString(16) + ':' + (info.usbProductId || 0).toString(16) + ')' : '');
};
function remember(p) { if (!known.includes(p)) known.push(p); }
let wired = false;
function wire() {
  const s = api();
  if (!s || wired) return;
  wired = true;
  s.getPorts().then((ps) => ps.forEach(remember)).catch(() => {});
  s.addEventListener('connect', (e) => remember(e.target));
  s.addEventListener('disconnect', (e) => { for (const h of handles.values()) if (h.port === e.target) h.alive = false; const i = known.indexOf(e.target); if (i >= 0) known.splice(i, 1); });
}
function askUser() {
  const s = api(), ua = globalThis.navigator.userActivation;
  if (!s || asked) return;
  const go = () => { asked = true; s.requestPort().then(remember).catch(() => {}).finally(() => { asked = false; }); };
  if (!ua || ua.isActive) go(); else Z.onUserGesture(() => { if (!known.length) go(); });
}
async function pump(h) {
  try {
    await h.port.open({ baudRate: h.baud, dataBits: h.dataBits, stopBits: h.stopBits, parity: ['none', 'odd', 'even'][h.parity] });
    h.ready = true;
    h.writer = h.port.writable.getWriter();
    h.reader = h.port.readable.getReader();
    flush(h);
    for (;;) {
      const { value, done } = await h.reader.read();
      if (done) break;
      for (const b of value) h.rx.push(b);
    }
  } catch (e) { if (!h.ready) { h.failed = String((e && e.message) || e); lastError = h.failed; } }
  h.alive = false;
}
function flush(h) {
  if (!h.ready || !h.writer || h.tx.length === 0 || h.busy) return;
  const chunk = Uint8Array.from(h.tx.splice(0));
  h.busy = true;
  h.writer.write(chunk).catch(() => { h.alive = false; }).finally(() => { h.busy = false; flush(h); });
}
Z.registerNative('Serial', {
  list() {
    wire();
    if (!api()) return '';
    if (known.length === 0) askUser();
    return known.map((_, i) => nameOf(i)).join('\n');
  },
  open(path, baud, dataBits, parity, stopBits) {
    Z.require('webserial', 'Web Serial exists in Chromium browsers (Chrome, Edge, Opera) on https pages and localhost; Firefox and Safari have none');
    wire();
    const m = /^web-serial:(\d+)/.exec(path);
    const i = m ? parseInt(m[1], 10) : path === '' ? 0 : -1;
    if (i < 0 || i >= known.length) { lastError = 'no such port: ' + path + (known.length ? '' : ' (grant one: click, and choose it in the browser\'s list)'); if (!known.length) askUser(); return -1; }
    const h = { port: known[i], baud, dataBits, parity, stopBits, rx: [], tx: [], ready: false, alive: true, writer: null, reader: null, failed: '', busy: false };
    handles.set(next, h);
    pump(h);
    return next++;
  },
  error() { return lastError; },
  read(hd) { const h = handles.get(hd); if (!h) return []; flush(h); return h.rx.length ? h.rx.splice(0) : []; },
  alive(hd) { const h = handles.get(hd); return !!h && h.alive; },
  write(hd, data) { const h = handles.get(hd); if (!h || !h.alive) return false; for (const b of data) h.tx.push(b); flush(h); return true; },
  pending(hd) { const h = handles.get(hd); return h ? h.tx.length : 0; },
  setSignals(hd, dtr, rts) { const h = handles.get(hd); if (!h || !h.ready) return false; h.port.setSignals({ dataTerminalReady: !!dtr, requestToSend: !!rts }).catch(() => {}); return true; },
  close(hd) {
    const h = handles.get(hd);
    if (!h) return;
    handles.delete(hd);
    h.alive = false;
    (async () => { try { if (h.reader) { await h.reader.cancel(); h.reader.releaseLock(); } if (h.writer) { await h.writer.close().catch(() => {}); } await h.port.close(); } catch (e) { /* closing a port that went away */ } })();
  },
}, ['webserial']);
