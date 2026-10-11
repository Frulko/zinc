// Web Audio and the audio element of the web environment (ZN-573), on zinc:audio's mixer without an output: tests/t1/webenv_audio.sh runs
// this with ZINC_AUDIO_LOG=1, so the lines `audio ...` say what the mixer was asked and when its mix held sound; the output is page.out.
const ctx = new AudioContext();
const say = (...a) => console.log(ctx.currentTime.toFixed(3), ...a);
console.log('state', ctx.state, 'rate', ctx.sampleRate, 'wav', document.createElement('audio').canPlayType('audio/wav'), 'ogg', new Audio().canPlayType('audio/ogg; codecs="vorbis"'),
  'opus', JSON.stringify(new Audio().canPlayType('audio/ogg; codecs="opus"')), 'video', JSON.stringify(document.createElement('video').canPlayType('video/mp4')));

// a sound the program makes: 0.2 s of 440 Hz at 0.8
const tone = ctx.createBuffer(1, 9600, 48000);
tone.getChannelData(0).set(Float32Array.from({ length: 9600 }, (_, i) => 0.8 * Math.sin(i * 2 * Math.PI * 440 / 48000)));
const master = ctx.createGain();
master.connect(ctx.destination);
function play(buffer, gain, name, set = () => {}) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffer;
  src.connect(g); g.connect(master);
  g.gain.value = gain;
  src.onended = e => say(name, 'ended', e.target === src);
  set(src, g);
  return src;
}

let blip = null;
const steps = [
  [0.1, () => play(tone, 0.5, 'half').start()],                                   // peak 0.40, 0.2 s
  [0.5, () => { const s = play(tone, 1, 'loop', s => { s.loop = true; }); s.start(); s.stop(ctx.currentTime + 0.5); }],   // 0.5 s of it
  [1.2, () => play(tone, 1, 'late').start(1.5)],                                  // starts at 1.5 to the sample
  [1.9, () => { const s = play(tone, 1, 'never'); s.start(ctx.currentTime + 1); s.stop(); }],   // stopped before it starts: no sound
  [2.0, () => { const s = play(tone, 1, 'fade', (s, g) => g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1)); s.start(); }],   // silent after 0.1 s
  [2.4, () => play(blip, 1, 'file', s => { s.playbackRate.value = 2; }).start()],   // a decoded file, twice as fast
  [2.6, () => { master.gain.value = 0; play(tone, 1, 'muted').start(); }],        // the gain further down the way
  [2.9, () => { master.gain.value = 1; ctx.suspend().then(() => { say('state', ctx.state); play(tone, 1, 'suspended').start(); }); }],
  [3.2, () => { ctx.resume(); const a = new Audio('../../audio/assets/blip.flac'); a.volume = 0.5; a.onended = () => { say('element ended', a.ended, a.paused); done = true; }; a.play().then(() => say('element plays', a.duration.toFixed(3))); }],
];
let done = false;
function frame() {
  while (steps.length && ctx.currentTime >= steps[0][0]) steps.shift()[1]();
  if (done) return window.close();
  requestAnimationFrame(frame);
}
fetch('../../audio/assets/blip.ogg').then(r => r.arrayBuffer()).then(bytes => ctx.decodeAudioData(bytes)).then(b => {
  blip = b;
  say('decoded', b.duration.toFixed(3), b.numberOfChannels, b.sampleRate, b.length, 'peak', Math.max(...b.getChannelData(0)).toFixed(2));
  return ctx.decodeAudioData(new ArrayBuffer(16)).catch(e => say('not a sound:', e.name));
}).then(() => requestAnimationFrame(frame));
