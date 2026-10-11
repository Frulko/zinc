# audio plugin (`zinc:audio`)

This plugin plays sound effects and music: a game rings a coin over its music, an app beeps.

- **Native.** [miniaudio](https://miniaud.io) 0.11.25 (public domain or MIT-0) is compiled into the program:
  `plugins/audio/vendor/`. It opens the default output, mixes up to 32 sounds at once and decodes WAV, FLAC, MP3 and
  Ogg Vorbis (the last through stb_vorbis 1.22). It adds about 0.55 MiB to a program that draws (550 KiB on the
  `game-2d` template, x86_64 macOS).
- **No output.** A headless or deterministic run (`ZINC_HEADLESS`, `ZINC_DETERMINISTIC`), `ZINC_AUDIO=null`, or a
  machine without a playback device gets the `null` backend: every call works and nothing is heard. Sound never stops a
  program.
- **Test.** `next/tests/t1/audio.sh` (`next/tests/golden/audio/`).

| target | status | output |
|---|---|---|
| macos | supported, verified on x86_64 | Core Audio, the default device (the frameworks are loaded at run time: nothing to link) |
| linux | in the manifest, not built or run yet | miniaudio picks PulseAudio, ALSA or JACK at run time (`dlopen`), so no development package is needed |
| anywhere else, and where the native code cannot be built | silent | the stand-in written in Zinc, `native/audio.sim.ts` |

```ts
import { load, tone, setVolume } from 'zinc:audio';

const coin = load('coin.wav');        // assets/coin.wav: WAV, FLAC, MP3 or OGG, decoded now
const music = load('theme.ogg');
music.loop = true;
music.volume = 0.4;
music.play();

coin.play();                          // over the music; a second play() overlaps the first
tone(880, 0.1).play();                // a beep without a file: 880 Hz for 0.1 s
const hit = load('bumper.wav');
hit.rate = 1.2; hit.pan = -0.6;       // a little higher, on the left (a pinball bumper on the left side)
hit.play();
setVolume(0.8);                       // the whole mix
```

## API

| API | |
|---|---|
| `load(name): Sound` | A file of the project's `assets/`, decoded into memory. A missing or unreadable file gives a silent `Sound` (`ok` is false, `error` says why) and one warning on the error output; it does not throw. |
| `decode(bytes: u8[], name?): Sound` | The same from the bytes of a file (downloaded, generated). |
| `tone(hz, seconds, wave = 'sine'): Sound` | A generated sound: `'sine'`, `'square'`, `'triangle'`, `'sawtooth'` or `'noise'` (white, the same every run), up to 60 s and 20 kHz, peak 0.5, with a 5 ms fade at both ends so it does not click. |
| `sound.play()` | Starts the sound from its beginning. Each call is a new voice: a sound that already plays goes on. |
| `sound.stop()` | Stops every voice of the sound. |
| `sound.playing` | True while a voice of the sound plays. |
| `sound.volume` | 1 is the level of the file (the default), 0 silence, above 1 amplifies. Applies to the voices that play now and to the next ones. |
| `sound.loop` | A looping sound starts again at its end, without a gap, until `stop()`. |
| `sound.rate` | Playback rate: 1 as recorded (the default), 2 an octave higher and twice as fast, 0.5 an octave lower and twice as slow; 1/64 to 64. Set it before `play()`: a voice started at 1 keeps 1 (it is mixed sample for sample, without a resampler), a voice started at another rate follows later changes. |
| `sound.pan` | Stereo position: -1 left, 0 centre (the default), 1 right, as a balance (at -1 the right channel is silent, a mono sound included). Also moves the voices that play now. |
| `sound.duration`, `sound.ok`, `sound.error` | Length in seconds; whether it loaded; why not. |
| `sound.voice(volume, rate, pan, loop, offset = 0, delay = 0): Voice` | `play()` with its own volume, rate, pan and loop instead of the sound's, from `offset` seconds into the sound, heard after `delay` seconds of mix (to the sample: `delay` is how one sound follows another without a gap). It gives the instance back. |
| `voice.stop(delay = 0)`, `voice.set(volume, rate, pan)`, `voice.playing` | Stops that instance alone, now or after `delay` seconds of mix; changes it alone (the rate only if it started at another rate than 1); true until it ends, is stopped, or gives way as the oldest of 32. |
| `fromSamples(samples, channels = 1, rate = 48000): Sound` | A sound from samples the program computed: 1 is full scale, two channels are interleaved (left, right, left...), 8000 to 192000 frames per second. |
| `sound.channels`, `sound.sampleRate`, `sound.samples(channel)` | The sound as it is kept: its channels, its frames per second, the samples of one channel. |
| `sound.unload()` | Stops the sound and frees its samples. |
| `setVolume(v)`, `volume()` | Volume of the whole mix, 1 by default. |
| `stopAll()` | Stops every sound. |
| `backend()` | `'Core Audio'`, `'ALSA'`, `'PulseAudio'`... or `'null'`. Waits until the output is open (see below). |
| `time()` | Seconds of mix rendered so far, the clock `delay` counts on: a device moves it; on the `null` backend, `mix()` does. Never waits. |
| `SAMPLE_RATE` | Frames per second of the mix: 48000. |
| `mix(frames): number[]` | `null` backend only: the next `frames` frames of the mix, stereo and interleaved, 1 being full scale. `[]` when a device plays the mix. |

## In the web environment

A JavaScript program run on the web environment (`"web": true` in `zinc.json`) has `AudioContext` and the audio element
(`new Audio(url)`) on this module, loaded at its first sound: Phaser's sound manager, and code written for Web Audio,
play through it. `decodeAudioData` is `decode()`, a started `AudioBufferSourceNode` is a `Voice` (its `start(when)` and
`stop(when)` are exact, on `time()`, which is the context's `currentTime`), `createBuffer` is `fromSamples()`.
The graph is not rendered: once a frame each voice takes the product of the gains and the sum of the stereo pans on its
way to the destination, so a ramp moves in steps of a frame; filters, delays, 3D panners and analysers let the sound
through unchanged, an oscillator is silent, `loopStart` and `loopEnd` are not read, and `suspend()` mutes. In a headless
run `ZINC_AUDIO_LOG=1` prints each sound started and ended and when the mix held sound.

## Notes

- **Voices.** 32 voices play at once. When all are busy, a new `play()` replaces the oldest one-shot sound; a looping
  sound (the music) gives way only when every voice loops.
- **Memory.** A sound is decoded whole when it loads and kept as 32-bit float samples at the file's own rate and channel
  count: 8 bytes per stereo frame, 21 MiB per minute at 44.1 kHz. Effects are small; keep music short or mono until
  streaming exists (ZN-440). Up to 256 sounds are loaded at once: `unload()` the ones a level no longer needs.
- **Rates and channels.** The mix is 48 kHz stereo. A file at another rate is resampled while it plays (linear), mono
  plays on both speakers, and a device at another rate gets the mix converted by miniaudio. The mix is not limited:
  sounds that add up above full scale are clipped by the device, so leave headroom (`volume`) when many play together.
- **Opening the output** takes 0.1 to 0.5 s with Core Audio (measured on an Intel Mac). It starts in the background at
  the first `load()` or `tone()`, so load sounds as the program starts; a sound played before the device runs begins
  when it does. Only `backend()` and `mix()` wait for it.
- **Time on the `null` backend.** Nothing pulls the mix, so its time stands still: a sound stays `playing` until
  `stop()`, and only `mix()` moves it forward. That is what makes a headless run repeatable, and how a test checks what
  a game plays: `coin.play(); mix(480)` returns the first 10 ms of it.
- **Deterministic runs** use the stand-in, which decodes and mixes nothing: `duration` is 0 for a loaded file and
  `mix()` returns silence. `ZINC_NATIVE=real` keeps the native code (as `next/tests/t1/audio.sh` does).
- **Packed and fused apps.** A `.zapp` holds no native code: `zinc run app.zapp` builds or fetches the plugin where it
  runs. A fused executable meant for machines without Zinc should be packed with `ZINC_DETERMINISTIC=1` (silent) until
  fused apps carry their plugins; `zinc build` and `zinc export` link the plugin into the program.
- **The end of the program** stops the device: a command-line program that wants its beep heard waits for it
  (`setTimeout(() => {}, 200)`).
- **Formats.** WAV (PCM 8 to 32 bit, float, ADPCM), FLAC, MP3, Ogg Vorbis. Opus and AAC are not decoded.

Note: `mix(frames)` returns at most 480,000 frames per call (10 s at 48 kHz); ask again for more.
