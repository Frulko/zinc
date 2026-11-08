// ZN-1043, run by tests/t0/webenv_audio_silent.sh: a page that makes sound where the audio plugin cannot be built goes on in silence
const ctx = new AudioContext(), o = ctx.createOscillator();
o.connect(ctx.destination);
o.start();
o.stop(ctx.currentTime + 0.1);
console.log('after the sound', ctx.state);
