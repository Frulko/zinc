---
id: ZN-573
title: 'Web Audio facade: Howler and Kaplay, audio-thread assertion'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
updated_date: '2026-11-11 12:00'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-390
  - ZN-568
ordinal: 17900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Add the debug assertion (no QuickJS call or allocation on the audio thread) and a short Howler null-backend test; the 10-minute soak is a by-hand line; Kaplay with ZN-707.

**What is left (review 2026-10-25):** Vendor Howler and Kaplay in tools/test-lib, compare ZINC_AUDIO_LOG lines; add a debug assertion for no QuickJS call/allocation on the audio thread; the 10-minute soak is a by-hand line. Already there: plugins/audio; lib/std/webenv.js AudioContext facade; tests/t1/webenv_audio.sh, audio.sh.

One native graph (libzn_audio on miniaudio, decision D12; 128-frame quanta, sample-accurate AudioParam timelines) behind the typed zinc:audio of ZN-390 and a JS AudioContext covering what Howler, Phaser, Kaplay, LittleJS and three.js call: currentTime/state/resume/suspend, decodeAudioData (WAV, MP3, FLAC, Ogg Vorbis; codecs shared with ZN-440), AudioBufferSourceNode (loop, playbackRate, detune, onended), Gain, StereoPanner, Panner + Listener, BiquadFilter, Delay, Analyser, MediaElementSource; HTMLAudioElement with canPlayType (Howler needs it even for Web Audio); a null backend headless. The audio callback never enters QuickJS: commands on a bounded SPSC queue, events back through a ring buffer. Tone.js and p5.sound need almost the full spec: web-audio-api-rs as an optional plugin later. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Howler play/loop/fade/pan, Phaser's WebAudioSoundManager and Kaplay's play() work (null-backend tests compare rendered buffers with expected envelopes)
- [ ] #2 no QuickJS call and no allocation on the audio thread (debug assertion)
- [ ] #3 zero underruns in a 10-minute soak with 32 voices while the frame loop stalls 100 ms every second
- [x] #4 the game-2d template's sounds (ZN-390) play through the same engine
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 (parallel agent, commit 'feat(webenv): Web Audio and the audio element on zinc:audio').
Already there since ZN-390 (D70): the engine on miniaudio is the plugin plugins/audio (decode of WAV, FLAC, MP3, Ogg; a mixer of 32 voices; null backend). Not rebuilt as libzn_audio with 128-frame quanta and a command queue: the web facade drives that mixer.
Done here: (1) zinc:audio per voice: sound.voice(volume, rate, pan, loop, offset, delay) gives a Voice (stop(delay), set, playing), start and stop are exact on the mixer's clock (time()); fromSamples(), sound.channels/sampleRate/samples(); the mixer's clock now also moves over silence (miniaudio holds it while no sound is in the graph). (2) lib/std/webenv.js: AudioContext (currentTime = the mixer's clock, state, resume, suspend, close, decodeAudioData with callbacks or promise, createBuffer), AudioBufferSourceNode (start(when, offset, duration), stop(when), loop, playbackRate, detune, onended), GainNode, StereoPannerNode, AudioParam timelines (setValueAtTime, ramps, setTargetAtTime, cancel), HTMLAudioElement and new Audio() (canPlayType, src, play, pause, currentTime, volume, loop, muted, ended), createMediaElementSource. zinc:audio is loaded at the first AudioContext or Audio, with no new host function (native.module); without the plugin one line on stderr and silence.
Simplifications (ponytail comment in webenv.js): the graph is not rendered; once a frame a voice takes the product of the gains and the sum of the pans on its first way to the destination, so a ramp moves in steps of a frame; Panner, BiquadFilter, Delay, Convolver, Compressor, Analyser exist and let the sound through unchanged (the analyser reads silence); OscillatorNode is silent; loopStart/loopEnd not read; suspend() mutes, voices go on; the clock needs frames.
Proof: tests/t1/webenv_audio.sh PASS (page.out: gain 0.5 on a wave of 0.8 peaks at 0.40 in the rendered mix, start(1.5) is heard from 1.500, a loop cut at its stop time, a fade silent after 0.1 s, a muted gain and a suspended context give no sound, a decoded Ogg at rate 2 lasts 0.05 s, the element plays a FLAC; examples/js-phaser: two decodes, three catches and a crash each followed by sound in the mix). Also PASS: audio, webenv, webenv_phaser, webenv_pixi, webenv_p5, webenv_gamepad, example_js_phaser, example_js_pixi, example_js_p5, pinball3d_sound, shared_headers. Nobody listened: every run was headless on the null backend; a real run of examples/js-phaser on Core Audio is the first thing to do (build/zinc run examples/js-phaser).
Criterion 4 ticked: templates/game-2d imports zinc:audio, the mixer the web facade plays on (tests audio and webenv_audio PASS); the template is not runnable in place (placeholders in zinc.json), so no run of it here.
Open, criterion 1: Phaser's WebAudioSoundManager is proven; Howler and Kaplay are not vendored and were not run. Next step: add howler (MIT, howler.core.min.js) and kaplay (MIT) to tools/test-lib as p5 is, a page each beside tests/golden/webenv/audio/page.js, compare their ZINC_AUDIO_LOG lines (Howler's fade is a linearRamp on a gain, its loop is source.loop with start(0, seek, 86400): both paths exist). Pan is not visible in the log: the peak is of both channels; a per-channel peak in the log line would prove it.
Open, criterion 2: holds by construction (the device callback is pull() -> render(): ma_engine_read_pcm_frames and one atomic store; QuickJS is only on the main thread) but no debug assertion is written.
Open, criterion 3: the 10-minute soak with 32 voices needs a real device and a quiet machine (other trees were building); not run.
Decision to record: the Web Audio of the web environment is a facade over zinc:audio's voices (levels computed once a frame from the graph), not a rendered graph; a rendered graph (filters, analyser, oscillator, sample-accurate params) stays the optional plugin the task names (web-audio-api-rs). The QuickJS engine always runs a plugin's native code (it has no stand-in), so a web program that makes sound builds plugins/audio at its first run.
Review 2026-10-25: done-partly. Web Audio facade over zinc:audio voices works for Phaser; game-2d template plays through it. Left: Howler and Kaplay not run, no audio-thread assertion, no soak. Soak needs a quiet real device. Evidence: plugins/audio; lib/std/webenv.js AudioContext facade; tests/t1/webenv_audio.sh, audio.sh
Review 2026-11-07: done-partly. Facade works; Howler and Kaplay vendoring (ZN-707), the audio-thread assertion and the soak remain. Evidence: lib/std/webenv.js AudioContext facade; tests/t1/webenv_audio.sh; AC4 ticked

2026-11-11 worker (branch work/573), scoped completion; status Backlog, AC1/2/3 still open and AC4 retained:

- Added the plugin-local debug render phase (thread-local enum, one transition function, RAII restoration) around `render()`, shared by device `pull()` and headless `mix()`. All HostAudio control entries reject re-entry during render; existing counted engine and mapped-asset decoder malloc/realloc/free callbacks reject render-time use. Ordinary release builds with NDEBUG omit the checks. No DSP graph, queue, service, core allocator/QuickJS/HAL change or speed claim.
- Audited normal clip buffer refs, progressive PCM readers, file music's worker/ring, QOA data-source reads and mapped-asset decoder configuration. Existing engine and mapped-asset decoder callbacks already route to `counted`; no vendor modification/wiring change was needed. File music's system/default codec allocators run on its worker, not inside the guarded mix. Default allocator calls, platform codec internals, unrelated native/runtime allocations and QuickJS entry itself are outside this plugin-local boundary. Therefore the literal no-QuickJS/no-allocation AC2 is NOT ticked.
- Extended existing `audio_storage` production proof: normal tone/clip renders, progressive QOA render, file-music render and counted in-memory decoder render pass. A deliberately bad miniaudio data-source callback attempts malloc, realloc, free or HostAudio control re-entry during actual `render()`; each child catches SIGABRT and exits73, avoiding core files/CrashReporter. Early-return scope restoration is checked. No public test knob.
- Added unchanged standalone upstream Howler2.2.4 to the existing `tools/test-lib` external-cache mechanism, plus a seconds-long exact Web Audio compatibility T0 and page fixture. Actual Howl decode/play/loop/fade/stereo uses the production native null mixer, not a fixture shim. Rendered peaks: half gain .40/.40, loop .80/.80, fade .73/.73 then silence after ~.184s (the 200ms ramp begins one frame before the first render), left pan .80/0, right pan0/.80. Five starts/ends and complete callback path checked. This covers Howler's portion of AC1 only; earlier Phaser evidence remains, Kaplay has no existing small harness (ZN-707 explicitly deferred it) and is not claimed.
- Research supplied by coordinator and verified primary distribution: https://github.com/goldfire/howler.js/ (MIT, full build includes stereo), https://registry.npmjs.org/howler/2.2.4 and https://miniaud.io/docs/manual/index.html (no device engine and allocation callbacks). Official archive `https://registry.npmjs.org/howler/-/howler-2.2.4.tgz` SHA256 `be9d8d09345954e246e932a057de0c9724475c8b58120dc690644432a0ba485f`; `package/dist/howler.js` SHA256 `81343a465947066ec1cd91a1ab88fe83591234159f4f55bcdf44073822c0bd9e`. Metadata/archive/license retained in `.logs/`; no copied vendor dependency.
- Proof commands (one at a time, bounded by absolute main `tools/work-run`, ZINC_ROOT this tree, headless/null): `tests/run --only audio_storage` PASS and `tests/run --only howler_audio` PASS; direct actual Howler page180frames PASS. Native proof compiled against existing common read-only archives; no engine source build. Common compiler SHA256 `d3095ef7c54b0ef624618c2fdd6130de84c3213481f6677f1fa5ad456bd08efd` (source418385788). Logs `.logs/audio-storage-run.log`, `.logs/howler-audio-run.log`, `.logs/howler.{out,err}`. Shell syntax, node page syntax and `git diff --check` pass. No source TypeScript touched; no checker run needed. No owned process remains. RSS/throughput not measured.
- Next implementation: add a small actual Kaplay play integration when its boot surface is available; a shared engine/QuickJS allocation boundary needs its own safe scope outside this plugin-owned change. No AC weakening, new task or changelog line (debug guard/internal compatibility proof only). Proposed later line: `ZN-573: extend the plugin-local render assertion to shared runtime/QuickJS and system allocator boundaries before claiming the complete callback invariant.` No new decision number; reuse external pinned-cache and existing miniaudio architecture. Usage: n/a (`tools/usage`).

Proposed tests (owner milestone only):
- Real-device 10-minute32-voice soak with100ms frame stalls each second: proves AC3 underruns, needs quiet device; 10min, RSS unmeasured. No existing dedicated command/fixture is claimed.
- `tests/run --only webenv_audio`: retained broader Web Audio and Phaser sound proof, seconds, RSS unmeasured; not run in this worker (T1).
- Physical Core Audio/other platform playback and mapped-asset compressed codec coverage: short real application playback, no audible/device proof performed here.

<!-- SECTION:NOTES:END -->
