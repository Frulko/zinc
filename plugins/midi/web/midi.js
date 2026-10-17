// zinc:midi in the browser (docs/targets/web.md, "Plugins"): the native spec (native/midi.spec.ts) over Web MIDI (Chromium and Firefox 108+; Safari has none). index.ts runs unchanged.
// requestMIDIAccess is asynchronous and asks the person, so the first call of ports() starts it and answers an empty list; the lists fill in when the access is granted
// (programs that call watchPorts hear about it within half a second, others ask again). Messages are queued per open input and read() hands them over one by one; system
// exclusive is allowed (the browser asks for it with the access). Virtual ports cannot be made from a page: open(..., virtualPort = true) fails with a clear error.
const Z = globalThis.__zincWeb;
let access = null, asking = false, lastError = '';
const handles = new Map();   // handle -> { port, input, queue }
let next = 1;
function ask() {
  if (access || asking || !Z.features.webmidi) return;
  asking = true;
  globalThis.navigator.requestMIDIAccess({ sysex: true }).catch(() => globalThis.navigator.requestMIDIAccess({ sysex: false })).then((a) => { access = a; }).catch((e) => { lastError = String((e && e.message) || e); }).finally(() => { asking = false; });
}
const ports = (input) => (access ? [...(input ? access.inputs : access.outputs).values()] : []);
Z.registerNative('Midi', {
  ports(input) { ask(); return ports(input).map((p) => p.name).join('\n'); },
  open(input, name, virtualPort) {
    Z.require('webmidi', 'Web MIDI exists in Chromium browsers and Firefox 108+, not in Safari');
    if (virtualPort) { lastError = 'a web page cannot create virtual MIDI ports (use a port that exists)'; return -1; }
    ask();
    const all = ports(input), p = name === '' ? all[0] : all.find((x) => x.name === name);
    if (!access) { lastError = 'MIDI access is not granted yet (the browser asks the person; try again after it)'; return -1; }
    if (!p) { lastError = 'no MIDI ' + (input ? 'input' : 'output') + (name ? ' named ' + name : ''); return -1; }
    const h = { port: p, input, queue: [] };
    if (input) p.onmidimessage = (e) => h.queue.push(Array.from(e.data));
    else p.open().catch(() => {});
    handles.set(next, h);
    return next++;
  },
  error() { return lastError; },
  read(hd) { const h = handles.get(hd); return h && h.queue.length ? h.queue.shift() : []; },
  send(hd, bytes) { const h = handles.get(hd); if (!h || h.input) return false; try { h.port.send(Uint8Array.from(bytes)); return true; } catch (e) { return false; } },
  close(hd) { const h = handles.get(hd); if (!h) return; handles.delete(hd); if (h.input) h.port.onmidimessage = null; },
}, ['webmidi']);
