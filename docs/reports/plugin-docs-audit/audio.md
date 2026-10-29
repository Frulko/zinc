# zinc:audio documentation audit

## What it is
Sound effects, music and generated tones for games and apps: load a WAV/FLAC/MP3/OGG, play it over others (32 voices), loop, pan, change rate; stream long files with `openMusic`; push raw samples with `stream`. Silent and safe when headless.

## Targets and status
plugin.json: macos, linux, ios, windows (miniaudio 0.11.25), web (`web/audio.js`). Doc table: macos "verified on x86_64", linux "not built or run yet", rest "silent stand-in". Console cores link it (backlog ZN-792/754: no psp/ps2 target).

## What the docs have
- [x] overview, [x] native/sim/null explanation, [x] example code (one block), [x] API table (complete: Sound, Voice, Music, AudioStream, backend/time/mix/SAMPLE_RATE all present)
- [x] Notes (voices, memory, formats, headless, packed apps), [x] web environment section, [x] tests named (`tests/t1/audio.sh`, `audio_music.sh`)
- [x] runnable use in examples (pinball3d, platformer, marble, fatty, templates/game-2d, ipod player) and a guide `docs/learn/06-sound.md`
- [ ] install/requirements per OS (none needed, but not said for Linux: needs a PulseAudio/ALSA device)
- [ ] screenshot or GIF (nothing visual; an audio plugin needs a waveform/mixer picture)
- [ ] step-by-step tutorial inside the plugin page (only `docs/learn/06-sound.md`, not linked from the page)
- [ ] commands a user types (`ZINC_AUDIO=null`, `ZINC_AUDIO_LOG=1` are mentioned in prose only)
- [ ] troubleshooting ("I hear nothing": backend() returns 'null', device busy, headless, deterministic stand-in)

## What is missing (priority)
1. Troubleshooting box: "I hear nothing" checklist (call `backend()`, `ZINC_AUDIO=null`, deterministic run uses the silent stand-in, ZINC_NATIVE=real).
2. A 5-step tutorial "Your first sound": add `assets/coin.wav`, `load`, `play`, a `tone()` beep, loop music with volume; link `docs/learn/06-sound.md`.
3. A tiny runnable example `examples/audio-basics` (or a section of `examples/midi`, backlog ZN-715) with a screenshot of buttons that trigger a coin, a tone, music.
4. Document the Windows and iOS targets and the real-device status (iOS uses `miniaudio.ios.m`; no status given). (owner) for iOS/Android verification.
5. Add a worked `AudioStream` example (a synth in 15 lines) and a `Music` player example (seek bar using `position/duration`).
6. Pointers from the page to the demos that use it (pinball3d, platformer) with screenshots from `docs/img/`.
7. Known limits as a table: formats vs targets (AAC/ALAC only via AudioToolbox on Apple), no Opus, no web Music (backlog ZN-853), `Music` position up to one block ahead.

## Wrong or stale
- "verified on x86_64" and "measured on an Intel Mac" (dev machine is an M1 Pro since 2026-10).
- "keep music short or mono until streaming exists (ZN-440)": `openMusic` (streaming) exists in the same page.
- Table omits windows and ios, which plugin.json lists; "the frameworks are loaded at run time: nothing to link" while plugin.json lists AudioToolbox/CoreFoundation frameworks.
- Opening note: "Opus and AAC are not decoded" is true for `load`, but `openMusic` decodes AAC/ALAC on Apple; say so in Formats.
- Mixed headings: the "Note: mix(frames) returns at most 480,000 frames" paragraph is dangling after the Notes list.

## Suggested pages (zinc doc)
- Audio: overview and quick start
- Audio: tutorial, your first sound (with assets)
- Audio: API reference (generated: Sound, Voice, Music, AudioStream, functions)
- Audio: music and long files (`openMusic`, seek, ended)
- Audio: synthesis and streaming (`tone`, `fromSamples`, `stream`, `mix`)
- Audio: testing without a speaker (null backend, `mix`, ZINC_AUDIO_LOG)
- Audio: troubleshooting and platform notes
- Audio: Web Audio on the web environment
