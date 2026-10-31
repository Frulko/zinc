# microphone plugin (`zinc:microphone`)

Microphones: list them, open one at a sample rate and a channel count, receive the samples in blocks, read a level for a meter. Capture
goes through miniaudio (the copy `zinc:audio` vendors), so the same code runs on Core Audio, PulseAudio and ALSA. Sources:
`plugins/microphone/`. A call sends it with [webrtc](webrtc.md), its echo and noise taken away (below).

```ts
import { devices, requestPermission, Microphone } from 'zinc:microphone';

if (await requestPermission() !== 'granted') throw new Error('no microphone access');
const list = await devices();                                       // MicrophoneDevice[] { id, name }
const mic = await Microphone.open(list[0].id, { sampleRate: 48000, channels: 1 });
mic.onData((samples, frameIndex) => { /* about 20 ms of samples, -1..1 */ });
gfx.fillRect(0, 0, mic.level() * 300, 8, 0x22c55e);                 // a level meter, read each frame
mic.close();
```

| API | |
|---|---|
| `requestPermission(): Promise<'granted' \| 'denied' \| 'undetermined'>` | macOS asks the person once per app and resolves with the answer (`undetermined` after a minute without one); a background run (`ZINC_BACKGROUND=1`, every test) never asks and answers at once; elsewhere `granted`. `denied` too when zinc.json refuses `microphone` |
| `permissionStatus()` | the same status, without asking |
| `devices(): Promise<MicrophoneDevice[]>` | `{ id, name }`; the fake microphone when the machine has none; `[]` with `ZINC_FAKE_MICROPHONE=0` and no microphone. Rejects when zinc.json refuses `microphone` |
| `Microphone.open(id?, { sampleRate, channels }?)` | `''` or nothing opens the first microphone; defaults 48000 Hz, 1 channel (8000 to 192000 Hz, 1 or 2 channels: miniaudio converts what the device has). Rejects with the reason: no such microphone, access not asked (`call requestPermission() first`) or denied, in use |
| `sampleRate`, `channels`, `id` | the format of the samples |
| `onData(cb)` | each block as it arrives (about every 20 ms): `samples` (`number[]`, channels interleaved, -1..1) and the index of its first frame since open (`frameIndex / sampleRate` is its time) |
| `level()` | RMS of the last block, 0 to 1 |
| `frameIndex`, `isOpen` | frames received so far; false once closed |
| `close()` | stops the capture |
| `setProcessing({ echoCancellation, noiseSuppression, autoGainControl, reference, referenceRate })` | voice processing for a call, from the next block (the same keys in `Microphone.open`'s options): see below |

`navigator.mediaDevices` covers it too once the program imports the plugin: `enumerateDevices()` lists the microphones as `audioinput`,
`getUserMedia({ audio: true })` (or `{ audio: { sampleRate, channelCount, deviceId } }`, with or without `video`) gives a `MediaStream` whose
audio track holds the `Microphone` (`track.microphone as Microphone`); `track.stop()` closes it.

## Echo cancellation, noise suppression, gain control

A call without headphones: the far end comes out of the speakers and back into the microphone. `echoCancellation` takes it away, given what
the speakers played: `reference` is called before each block and returns the samples played since its last call, mono at `referenceRate`
(48000 by default); with zinc:audio playing the far end it is zinc:audio's `played`. `noiseSuppression` takes away steady noise (fans, hum),
`autoGainControl` levels the voice (a quiet one is raised up to 30 dB, a loud one brought down to about -24 dBFS).

```ts
import { played } from 'zinc:audio';
const mic = await Microphone.open('', { echoCancellation: true, noiseSuppression: true, autoGainControl: true, reference: played });
// or on a getUserMedia track: (track.microphone as Microphone).setProcessing({ ... })
```

It is SpeexDSP 1.2.1 (`vendor/speexdsp`, BSD-3-Clause): its echo canceller with a 250 ms filter (the speaker's latency, the room and the
microphone's latency together must stay under it), then its preprocessor (the echo left, the noise, the gain), on frames of 10 ms: the
processed blocks come 10 ms late, and two channels are processed as their mix. Measured (`tests/t0/voice_aec.sh`): a recorded voice in a
simulated room is cancelled by 25.8 dB after 6 s, and a near voice talking over it comes through 2.2 dB down. All off by default (browsers
turn them on); not in a run without native code. On the web the browser's own processing is used and `reference` is not called.

## Backends

| target | how | notes |
|---|---|---|
| macos | miniaudio on Core Audio; the privacy question through AVFoundation (`AVCaptureDevice` for audio) | built-in, USB and virtual (BlackHole, Loopback) inputs |
| linux, rpi1 | miniaudio on PulseAudio, else ALSA (loaded at run time, nothing to install to build) | written, not proven on a board yet; the user needs the `audio` group on a system without PulseAudio |
| sim, `ZINC_NATIVE=sim` | the fake microphone alone (`native/microphone.sim.ts`): the same samples | |
| ios | miniaudio on Core Audio through the audio session (play and record, the loudspeaker, Bluetooth headsets); the privacy question through AVFoundation | `zinc.json` `"permissions": ["microphone"]` writes `NSMicrophoneUsageDescription`; zinc:audio keeps playing while it captures |
| windows, android, wasm | not yet (error Z5005: the profile has `microphone` false) | |

The device fills a buffer on miniaudio's thread (one second at most: a program that stops reading loses the oldest samples); `index.ts`
takes what came in every 20 ms on the program's thread and runs the `onData` handlers. No callback runs on another thread.

## Permissions

- **zinc.json**: `"permissions": ["microphone"]`. Without it, in a project that declares permissions, `devices()` and `open()` warn while
  developing and fail in an exported app (`EACCES: microphone needs the permission "microphone" in zinc.json "permissions"`).
- **macOS privacy**: the system asks the person the first time an app asks (`requestPermission()`); the answer is kept in System Settings >
  Privacy & Security > Microphone. `open` never starts a capture without access: it fails with "call requestPermission() first", so a program
  never stops on a question it did not ask. Under `zinc run` the system asks for the terminal app that started it.
- **Exported apps**: with `microphone` in the permissions, `zinc export --target macos` writes `NSMicrophoneUsageDescription` ("<App> uses
  the microphone.") and the entitlement `com.apple.security.device.audio-input`; Android gets `android.permission.RECORD_AUDIO`.
- **`requires`**: the plugin needs the `microphone` capability (`targets/capabilities.json`): true on macos and sim, optional on linux and
  rpi1, false elsewhere.

## The fake microphone

"Zinc Fake Microphone" (`zinc:fake-microphone`) is a triangle wave of period 100 samples whose loudness steps every 20 ms block (0.05 to 0.5,
ten steps), plus noise of ±0.01: a function of the sample index only, so a session gives the same samples on every machine and engine. It
makes one block per poll. It is the only microphone with `ZINC_FAKE_MICROPHONE=1` (or `"plugins": { "microphone": { "fake": true } }`) and
in a deterministic run (`ZINC_DETERMINISTIC`, unless `ZINC_FAKE_MICROPHONE=0` or `ZINC_REALTIME`), and the one `devices()` gives when the
machine has none. `ZINC_FAKE_MICROPHONE=0` never lists it.

Tests: `tests/t1/microphone.sh` (interpreter, QuickJS, compiled, the permission checks; no real microphone is opened) and
`tests/t0/microphone_sim.sh` (the stand-in without native code), against `tests/golden/host/microphone_session.out`.
