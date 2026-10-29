// zinc:audio in the browser: the native side of plugins/audio/native/audio.spec.ts over Web Audio (docs/targets/web.md, "Plugins"). index.ts runs unchanged.
// A sound decodes with decodeAudioData (asynchronously: a play() before it is ready starts when it is), a voice is an AudioBufferSourceNode
// with its own gain and stereo pan, a stream schedules the blocks it is given one after the other. The context starts after the first click or key
// of the page (the autoplay policy); what the program plays before that starts then.
const Z = globalThis.__zincWeb;
let ctx = null, master = null, lastError = '';
const sounds = new Map(), voices = new Map(), streams = new Map();
let nextSound = 0, nextVoice = 1, nextStream = 0;

function context() {
  if (ctx) return ctx;
  Z.require('audio', 'Web Audio');
  const C = globalThis.AudioContext || globalThis.webkitAudioContext;
  ctx = new C({ latencyHint: 'interactive' });
  master = ctx.createGain();
  master.connect(ctx.destination);
  const resume = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
  resume();
  Z.onUserGesture(resume);
  return ctx;
}
const mk = (buffer) => { sounds.set(nextSound, { buffer, waiting: [], vol: 1, loop: false, rate: 1, pan: 0, ids: new Set() }); return nextSound++; };

function startVoice(s, id, vol, loop, rate, pan, offset, delay) {
  const c = context(), src = c.createBufferSource(), gain = c.createGain(), pn = c.createStereoPanner ? c.createStereoPanner() : null;
  src.buffer = s.buffer; src.loop = loop; src.playbackRate.value = rate; gain.gain.value = vol;
  src.connect(gain);
  if (pn) { pn.pan.value = pan; gain.connect(pn); pn.connect(master); } else gain.connect(master);
  const v = { src, gain, pn, sound: s, rate0: rate, playing: true };
  src.onended = () => { v.playing = false; s.ids.delete(id); };
  voices.set(id, v); s.ids.add(id);
  // the oldest of 32 gives way, as the native mixer does
  if (voices.size > 32) { for (const [k, o] of voices) { if (!o.playing) { voices.delete(k); continue; } try { o.src.stop(); } catch {} voices.delete(k); break; } }
  src.start(c.currentTime + Math.max(0, delay || 0), Math.max(0, offset || 0));
}
function begin(s, vol, loop, rate, pan, offset, delay) {
  const id = nextVoice++;
  if (s.buffer) startVoice(s, id, vol, loop, rate, pan, offset, delay);
  else s.waiting.push(() => startVoice(s, id, vol, loop, rate, pan, offset, delay));
  voices.set(id, voices.get(id) || { playing: true, pending: true, sound: s, rate0: rate });
  s.ids.add(id);
  return id;
}

Z.registerNative('Audio', {
  backend() { try { context(); return 'Web Audio'; } catch { return 'null'; } },
  error() { return lastError; },
  load(bytes) {
    try {
      const c = context(), id = mk(null), s = sounds.get(id);
      const ab = Uint8Array.from(bytes).buffer;
      c.decodeAudioData(ab).then((b) => { s.buffer = b; for (const f of s.waiting.splice(0)) f(); }, (e) => { s.failed = String(e && e.message || e); });
      return id;
    } catch (e) { lastError = String(e && e.message || e); return -1; }
  },
  tone(wave, hz, seconds) {
    try {
      const c = context(), rate = c.sampleRate, n = Math.max(1, Math.round(seconds * rate)), b = c.createBuffer(1, n, rate), d = b.getChannelData(0), fade = Math.min(n / 2, Math.round(0.005 * rate));
      for (let i = 0; i < n; i++) {
        const t = i / rate, ph = (hz * t) % 1;
        let v = wave === 0 ? Math.sin(2 * Math.PI * ph) : wave === 1 ? (ph < 0.5 ? 1 : -1) : wave === 2 ? 4 * Math.abs(ph - 0.5) - 1 : wave === 3 ? 2 * ph - 1 : Math.random() * 2 - 1;
        const e = i < fade ? i / fade : i > n - fade ? (n - i) / fade : 1;
        d[i] = v * 0.5 * e;
      }
      return mk(b);
    } catch (e) { lastError = String(e && e.message || e); return -1; }
  },
  pcm(samples, channels, rate) {
    try {
      const c = context(), n = Math.floor(samples.length / channels), b = c.createBuffer(channels, n, rate);
      for (let k = 0; k < channels; k++) { const d = b.getChannelData(k); for (let i = 0; i < n; i++) d[i] = samples[i * channels + k]; }
      return mk(b);
    } catch (e) { lastError = String(e && e.message || e); return -1; }
  },
  duration(h) { const s = sounds.get(h); return s && s.buffer ? s.buffer.duration : 0; },
  unload(h) { const s = sounds.get(h); if (!s) return; this.stop(h); sounds.delete(h); },
  play(h, vol, loop, rate, pan) { const s = sounds.get(h); if (!s) return false; begin(s, vol, loop, rate, pan, 0, 0); return true; },
  stop(h) { const s = sounds.get(h); if (!s) return; for (const id of [...s.ids]) this.voiceStop(id, 0); s.waiting.length = 0; },
  playing(h) { const s = sounds.get(h); if (!s) return false; for (const id of s.ids) if (voices.get(id) && voices.get(id).playing) return true; return false; },
  setVolume(h, v) { const s = sounds.get(h); if (!s) return; s.vol = v; for (const id of s.ids) { const o = voices.get(id); if (o && o.gain) o.gain.gain.value = v; } },
  setLoop(h, on) { const s = sounds.get(h); if (!s) return; s.loop = on; for (const id of s.ids) { const o = voices.get(id); if (o && o.src) o.src.loop = on; } },
  setRate(h, r) { const s = sounds.get(h); if (!s) return; s.rate = r; for (const id of s.ids) { const o = voices.get(id); if (o && o.src && o.rate0 !== 1) o.src.playbackRate.value = r; } },
  setPan(h, p) { const s = sounds.get(h); if (!s) return; s.pan = p; for (const id of s.ids) { const o = voices.get(id); if (o && o.pn) o.pn.pan.value = p; } },
  stopAll() { for (const id of [...voices.keys()]) this.voiceStop(id, 0); for (const s of sounds.values()) s.waiting.length = 0; },
  start(h, vol, loop, rate, pan, offset, delay) { const s = sounds.get(h); return s ? begin(s, vol, loop, rate, pan, offset, delay) : 0; },
  voiceStop(id, delay) {
    const o = voices.get(id);
    if (!o) return;
    if (o.src) { try { o.src.stop(context().currentTime + Math.max(0, delay || 0)); } catch {} } else { o.playing = false; o.sound.waiting.length = 0; }
    if (!delay) { o.playing = false; o.sound.ids.delete(id); }
  },
  voiceSet(id, vol, rate, pan) { const o = voices.get(id); if (!o || !o.src) return; o.gain.gain.value = vol; if (o.rate0 !== 1) o.src.playbackRate.value = rate; if (o.pn) o.pn.pan.value = pan; },
  voicePlaying(id) { const o = voices.get(id); return !!(o && o.playing); },
  channels(h) { const s = sounds.get(h); return s && s.buffer ? s.buffer.numberOfChannels : 0; },
  rate(h) { const s = sounds.get(h); return s && s.buffer ? s.buffer.sampleRate : 0; },
  samples(h, ch) { const s = sounds.get(h); return s && s.buffer && ch < s.buffer.numberOfChannels ? Array.from(s.buffer.getChannelData(ch)) : []; },
  time() { return ctx ? ctx.currentTime : 0; },
  streamOpen(channels, rate, primeMs, maxMs) {
    try {
      if (primeMs < 1 || maxMs < primeMs || maxMs > 1000) throw new Error('stream buffer requires 1 <= primeMs <= maxMs <= 1000');
      const c = context(), g = c.createGain();
      g.connect(master);
      streams.set(nextStream, { gain: g, channels, rate, prime: primeMs / 1000, max: maxMs / 1000, at: 0, buffered: 0, underruns: 0, dropped: 0 });
      return nextStream++;
    } catch (e) { lastError = String(e && e.message || e); return -1; }
  },
  streamWrite(h, samples) {
    const st = streams.get(h), c = context();
    if (!st) return 0;
    const n = Math.floor(samples.length / st.channels), b = c.createBuffer(st.channels, n, st.rate);
    for (let k = 0; k < st.channels; k++) { const d = b.getChannelData(k); for (let i = 0; i < n; i++) d[i] = samples[i * st.channels + k]; }
    const now = c.currentTime;
    if (st.at < now + 0.0005) { if (st.at > 0) st.underruns++; st.at = now + st.prime; }
    if (st.at - now > st.max) { st.dropped += n; return n; }
    const src = c.createBufferSource();
    src.buffer = b; src.connect(st.gain); src.start(st.at);
    st.at += b.duration;
    return n;
  },
  streamInfo(h) { const st = streams.get(h); return st && ctx ? [Math.max(0, st.at - ctx.currentTime), st.underruns, st.dropped] : [0, 0, 0]; },
  streamSetVolume(h, v) { const st = streams.get(h); if (st) st.gain.gain.value = v; },
  streamClose(h) { const st = streams.get(h); if (st) { st.gain.disconnect(); streams.delete(h); } },
  setMasterVolume(v) { context(); master.gain.value = v; },
  mix() { return []; },
}, ['audio']);
