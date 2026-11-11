// Standalone upstream Howler, loaded exactly as a page's script tag; no sound device in the null-backend proof.
const script = document.createElement('script');
script.src = __host_sysEnv('WEBENV_HOWLER');
script.onerror = () => { throw new Error('Howler script failed'); };
script.onload = () => {
  Howler.autoUnlock = false;
  Howler.autoSuspend = false;
  const samples = 2400, bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const text = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true); view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(0.8 * 32767 * Math.sin(i * 2 * Math.PI * 440 / 48000)), true);
  const source = 'data:audio/wav;base64,' + btoa(String.fromCharCode(...bytes));
  const sound = new Howl({ src: [source], format: ['wav'], preload: true,
    onloaderror: (id, err) => { throw new Error('Howler decode: ' + err); },
    onload: () => {
      if (!sound._webAudio) throw new Error('Howler did not select Web Audio');
      console.log('howler loaded', sound.duration().toFixed(3), 'Web Audio');
      const base = Howler.ctx.currentTime;
      let id;
      const steps = [
        [0.1, () => { console.log('howler play'); sound.volume(0.5); id = sound.play(); }],
        [0.3, () => { console.log('howler loop'); sound.volume(1); sound.loop(true); id = sound.play(); }],
        [0.6, () => sound.stop(id)],
        [0.8, () => { console.log('howler fade'); id = sound.play(); sound.fade(1, 0, 200, id); }],
        [1.1, () => { if (sound.volume(id) !== 0) throw new Error('fade endpoint'); sound.stop(id); }],
        [1.3, () => { console.log('howler pan left'); sound.volume(1); sound.stereo(-1); id = sound.play(); }],
        [1.5, () => sound.stop(id)],
        [1.7, () => { console.log('howler pan right'); sound.stereo(1); id = sound.play(); }],
        [1.9, () => sound.stop(id)],
        [2.1, () => { sound.unload(); console.log('howler complete'); window.close(); }],
      ];
      function frame() {
        while (steps.length && Howler.ctx.currentTime - base >= steps[0][0]) steps.shift()[1]();
        if (steps.length) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
  });
};
document.head.appendChild(script);
