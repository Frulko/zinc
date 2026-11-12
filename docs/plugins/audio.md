# audio plugin (`zinc:audio`)

This plugin plays sound effects and music: a game rings a coin over its music, an app beeps.

- **Native.** [miniaudio](https://miniaud.io) 0.11.26 (public domain or MIT-0) is compiled into the program:
  `plugins/audio/vendor/`. It opens the default output, mixes up to 32 sounds at once and decodes WAV, FLAC, MP3 and
  Ogg Vorbis (the last through stb_vorbis 1.22). It adds about 0.55 MiB to a program that draws (550 KiB on the
  `game-2d` template, x86_64 macOS).
- **No output.** A headless or deterministic run (`ZINC_HEADLESS`, `ZINC_DETERMINISTIC`), `ZINC_AUDIO=null`, or a
  machine without a playback device gets the `null` backend: every call works and nothing is heard. Sound never stops a
  program.
- **Test.** `tests/t1/audio.sh` (`tests/golden/audio/`).

| target | status | output |
|---|---|---|
| macos | supported, verified on x86_64 | Core Audio, the default device (the frameworks are loaded at run time: nothing to link) |
| linux | native implementation and manifest target present; actual Linux playback remains unverified | miniaudio opens the system default through its available backends; ALSA loads the OS `libasound.so.2` at run time |
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

## Linux outputs and Raspberry Pi I2S

Zinc opens the system default playback device. Select the intended output in the image's audio policy before
starting the app; Zinc has no device or backend selection API. `ZINC_AUDIO=null` requests silence; values such as
`alsa` or `hdmi` do not select an output. `backend()` reports the backend actually opened, or `null`.
Headless, deterministic, record and replay runs are silent even when a sound device exists.

For HDMI, preserve alsa-lib's named `hdmi:` or `sysdefault:` path in that policy. Its
[vc4-hdmi configuration](https://github.com/alsa-project/alsa-lib/blob/master/src/conf/cards/vc4-hdmi.conf)
converts ordinary PCM to IEC958 subframes; raw `hw:` access bypasses this conversion.

### Example: Raspberry Pi DAC+

Follow the [official audio HAT instructions](https://www.raspberrypi.com/documentation/accessories/audio.html)
for the exact board. This example is the Raspberry Pi DAC+, not a generic I2S overlay:

1. With power disconnected, fit the HAT to the 40-pin header. Boot the prepared image and check HAT detection
   with `grep -a . /proc/device-tree/hat/*`.
2. If detection fails after checking the connection, the image owner can edit `/boot/firmware/config.txt`
   (older images may use `/boot/config.txt`) and apply the manual fallback below, then reboot. Use the overlay
   matching the actual HAT; DAC Pro, Codec Zero and DigiAMP+ require their own overlays.

   ```ini
   # Suppress the default HAT overlay, then select the DAC+ only:
   dtoverlay=
   dtoverlay=rpi-dacplus
   ```

3. Inspect `cat /proc/asound/cards` and `aplay -L` on the prepared image. Select the HAT in the desktop audio
   settings, or have the image owner configure the ALSA default using the card's reported name/ID. Do not
   assume card 0. On a console-only image without PulseAudio/PipeWire, an owner-managed `~/.asoundrc` can route
   the default PCM through ALSA's [conversion plugin](https://www.alsa-project.org/alsa-doc/alsa-lib/pcm_plugins.html)
   to `sysdefault:CARD=<CARD_ID>`; replace the placeholder with that reported ID. Keep the existing routing
   configuration rather than overwriting it blindly. For example, this playback-only stanza uses the named card:

   ```conf
   pcm.!default {
       type plug
       slave.pcm "sysdefault:CARD=<CARD_ID>"
   }
   ```

   The Raspberry Pi guidance discourages `~/.asoundrc`
   on the desktop because it can interfere with the audio server's view of devices.
4. In a selected hardware check, run the app with its normal clock/output settings and verify a non-`null`
   `backend()` plus audible output or an independent capture. A null-mixer test does not prove I2S playback.

These are image-owner setup instructions, not actions performed by Zinc. DAC+ playback and PocketCHIP
speaker/headphone routing have not been proven here. PocketCHIP uses the kernel's `sun4i-codec` route and mixer
policy; use the installed image's named card and documented controls, never guessed card numbers or unmute commands.

### Fully static builds

Normal Linux audio uses [miniaudio](https://miniaud.io/docs/manual/index.html) with dynamically loaded OS backends, including alsa-lib. For a fully static
flavour whose libc/runtime cannot load those libraries, the supported policy is silent/null audio: deploy with
`ZINC_AUDIO=null` explicitly. This is a support decision, not evidence that a particular static binary was built or run. A static executable and a
runtime unable to load shared libraries are different constraints; inspect the produced target before making
claims about either.

No tinyalsa backend is implemented or vendored. Although [TinyALSA](https://github.com/tinyalsa/tinyalsa)
is BSD-3-Clause, its PCM/mixer interface does not replace alsa-lib's card policy or HDMI conversion. Revisit a
custom miniaudio backend when audible output is required on a prepared static target, with format negotiation,
buffer-underrun (XRUN) recovery and real route/playback tests. No new dependency is needed for the current Linux backend.

## API

| API | |
|---|---|
| `load(name): Sound` | A file of the project's `assets/` (WAV, FLAC, MP3, Ogg Vorbis, or the QOA an `"as": "audio"` rule makes of it at pack time), decoded into memory. A missing or unreadable file gives a silent `Sound` (`ok` is false, `error` says why) and one warning on the error output; it does not throw. |
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
| `voice.stop(delay = 0, fade = 0)`, `voice.set(volume, rate, pan)`, `voice.playing` | Stops that instance alone, now or after `delay` seconds of mix; with `fade`, it fades to silence over `fade` seconds from then and stops when the fade ends (`voice.stop(0, 2)`: out over two seconds), applied by the mixer to the sample, not stepped per frame; changes it alone (the rate only if it started at another rate than 1); true until it ends, is stopped, or gives way as the oldest of 32. |
| `voice.pause()`, `voice.resume()` | Holds that instance where it is, silent, and lets it go on from there: the time it stays held does not count, so a clip held for a second ends a second later (`playing` stays true meanwhile). An instance already stopping (a `delay` or a `fade`) is not held, and `stop()` ends a held one at once. A held instance gives way to a 33rd only after the one-shots. The cut is immediate, as `alSourcePause` is. `tests/t0/audio_fade.sh`. |
| `voice.loopPart(from, to)` | A looping instance repeats `from` to `to` seconds into its sound instead of the whole of it (`to` not after `from`: the whole). |
| `openMusic(path): Music` | A file on disk played as it is read, a few seconds ahead, never decoded whole: a song, an audiobook, a podcast of an hour. AAC, ALAC, MP3, WAV and AIFF on macOS and iOS (AudioToolbox), WAV, FLAC, MP3 and Ogg Vorbis elsewhere. The file opens in the background (a sleeping disk takes a second): `ready` says when; `play()` asked before plays once it is open. Four are open at most. |
| `music.play()`, `pause()`, `seek(seconds)`, `close()` | Play from where it is (from the start once it ended), pause, move, stop and close the file. When the reader falls behind (a disk waking up) the music is silent for a moment instead of stopping the mix. |
| `loadMusic(name): Music` | A music of the project's assets streamed with almost no memory: read in place from its pack (or the assets directory) and decoded on the mixer's thread as the mix asks for it, never whole. WAV (PCM and IMA ADPCM), FLAC, MP3, Ogg Vorbis, and QOA (what an `"as": "audio"` rule of the asset build writes, a fifth of PCM); ready at once. What it holds, whatever the length of the track (`music.memory`, measured): 4.6 KB for a WAV (IMA ADPCM or PCM), 24 KB for a stereo QOA (one decoded frame), 17 KB for FLAC, 37 KB for MP3, 230 KB for Ogg Vorbis (stb_vorbis's tables): music on a small board is an IMA ADPCM WAV. The asset build and `writePack` store sound files as they are, so they can be read in place; the pack cannot be unmounted while a music reads it. `tests/t0/audio_stream_pack.sh`. |
| `music.loop` | At its end it starts again from its beginning without a gap (the decoder seeks inside the read that reached the end; the resampler runs on across it). A WAV, FLAC or Ogg Vorbis file loops to the sample; an MP3 carries its encoder's padding. |
| `music.memory` | Bytes it has held at most: for `loadMusic`, its decoder and its place in the mix (the file's bytes are read in place, not counted); for `openMusic`, its 2 s read-ahead buffer (768 KB). |
| `music.position`, `duration`, `playing`, `ended`, `ready`, `error`, `volume` | Seconds played (the frames the mixer took: up to 10 ms ahead of what is heard) and the file's length; whether it plays, reached its end, is open; why it is silent (`''` while all is well). `tests/t1/audio_music.sh`. |
| `fromSamples(samples, channels = 1, rate = 48000): Sound` | A sound from samples the program computed: 1 is full scale, two channels are interleaved (left, right, left...), 8000 to 192000 frames per second. |
| `sound.channels`, `sound.sampleRate`, `sound.samples(channel)` | The sound as it is kept: its channels, its frames per second, the samples of one channel. |
| `sound.unload()` | Stops the sound and frees its samples. |
| `setVolume(v)`, `volume()` | Volume of the whole mix, 1 by default. |
| `stopAll()` | Stops every sound. |
| `suspend(on)` | `true` holds the whole mix where it is: no sound, `time()` stands still, every `delay` and stop time waits; `false` goes on from there. |
| `backend()` | `'Core Audio'`, `'ALSA'`, `'PulseAudio'`... or `'null'`. Waits until the output is open (see below). |
| `time()` | Seconds of mix rendered so far, the clock `delay` counts on: a device moves it; on the `null` backend, `mix()` does. Never waits. |
| `SAMPLE_RATE` | Frames per second of the mix: 48000. |
| `mix(frames): number[]` | `null` backend only: the next `frames` frames of the mix, stereo and interleaved, 1 being full scale. `[]` when a device plays the mix. |
| `stream(channels = 1, rate = 48000): AudioStream` | Samples played as they are written: the peer's audio of a call (zinc:webrtc's `RemoteAudio.onData`), a synthesizer, an emulator. `write(samples)` appends (channels interleaved); it starts once 60 ms are buffered, plays silence and waits for 60 ms again when it runs dry (`underruns`), and drops what is beyond 180 ms when the writer runs ahead of the device (`dropped`), so the delay stays short when two clocks drift. `buffered` (seconds), `volume`, `close()`. A second at most is kept. |

`played(): number[]` gives what the output device played since the last call, mono at 48 kHz (a second at most; the first call starts
keeping it and returns `[]`; `[]` headless): the reference of a microphone's echo canceller (`reference: played` in zinc:microphone).

## In the web environment

A JavaScript program run on the web environment (`"web": true` in `zinc.json`) has `AudioContext` and the audio element
(`new Audio(url)`) on this module, loaded at its first sound: Phaser's sound manager, and code written for Web Audio,
play through it. `decodeAudioData` is `decode()`, a started `AudioBufferSourceNode` is a `Voice` (its `start(when)` and
`stop(when)` are exact, on `time()`, which is the context's `currentTime`), `createBuffer` is `fromSamples()`.
The graph is not rendered: once a frame each voice takes the product of the gains and the sum of the stereo pans on its
way to the destination, so a ramp moves in steps of a frame; filters, delays, 3D panners and analysers let the sound
through unchanged. An `OscillatorNode` (sine, square, sawtooth, triangle or a `PeriodicWave`) is one period of its wave looped,
which follows its `frequency` and `detune` within six octaves; `loopStart` and `loopEnd` set the part a loop repeats;
`suspend()` holds the whole mix (`currentTime` stands still) until `resume()`. In a headless run `ZINC_AUDIO_LOG=1` prints
each sound started and ended and when the mix held sound, with the peak of each channel. At the first run the plugin is
built (a line says so while it compiles); when it cannot be, one line says why and the program goes on in silence.

## Notes

- **Voices.** 32 voices play at once. When all are busy, a new `play()` replaces the oldest one-shot sound; a looping
  sound (the music) gives way only when every voice loops.
- **Memory.** A sound is decoded whole when it loads and kept at the file's own rate and channel
  count. Native 16-bit sources (16-bit WAV and QOA) use 4 bytes per stereo frame, about 10 MiB per minute at 44.1 kHz.
  Other sources, including higher-precision WAV, FLAC, MP3 and Vorbis, keep the existing 32-bit float conversion, as do
  `tone()` and `fromSamples()`. Effects are small. A long compressed file (256 KB or more, not WAV) is decoded on a background thread:
  `load()` returns at once, `play()` works at once and the sound plays as it is decoded (silence only if playback outruns the decoder); for music that
  should not stay in memory, use `loadMusic()` (an asset) or `openMusic()` (a file on disk). Up to 256 sounds are loaded at once: `unload()` the ones a level no longer needs.
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
  `mix()` returns silence. `ZINC_NATIVE=real` keeps the native code (as `tests/t1/audio.sh` does).
- **Packed and fused apps.** A `.zapp` holds no native code: `zinc run app.zapp` builds or fetches the plugin where it
  runs. A fused executable meant for machines without Zinc should be packed with `ZINC_DETERMINISTIC=1` (silent) until
  fused apps carry their plugins; `zinc build` and `zinc export` link the plugin into the program.
- **The end of the program** stops the device: a command-line program that wants its beep heard waits for it
  (`setTimeout(() => {}, 200)`).
- **Formats.** WAV (PCM 8 to 32 bit, float, ADPCM), FLAC, MP3, Ogg Vorbis. Ogg Opus is optional (below); AAC files use AudioToolbox through `openMusic` on Apple systems.

Note: `mix(frames)` returns at most 480,000 frames per call (10 s at 48 kHz); ask again for more.

### Optional Ogg Opus

Set `"plugins": { "audio": { "opus": true } }` in `zinc.json` to enable Ogg Opus for `load`, `decode`, `loadMusic` and `openMusic` on native desktop targets. The default is off. Web playback uses the browser's codecs. Apple file playback still tries AudioToolbox first, then the configured miniaudio decoder.

The backend is miniaudio 0.11.26's libopus adapter, libopusfile 0.12, libogg 1.3.6 and the existing WebRTC libopus 1.6.1 source pin, built without DRED, deep PLC or SIMD. The baseline codec symbols have an audio-only prefix, so they cannot replace WebRTC's DRED/deep-PLC build. There is no HTTP/URL decoder. Disabled programs do not link the codec, although a cold plugin build still compiles the vendor archive. Installed option builds retain the shared Opus source tree.

`music.memory` is a lower bound for Opus: it excludes libopusfile/libopus internal allocations and is **not** an Opus resident-memory measurement. The under-64-KB streaming claim applies to the previously measured IMA ADPCM path, not Opus. A native combined archive check preserves WebRTC DRED and encode/decode while playing Opus; Pi decode CPU and actual network playback remain proposed checks; no hardware performance claim is made. Chained Opus streams may allocate while decoding on the mixer; this change makes no allocation-free render claim (the wider render invariant remains open in ZN-573).
