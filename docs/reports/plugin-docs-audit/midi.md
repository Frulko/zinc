# zinc:midi documentation audit

## What it is
Send and receive MIDI: a keyboard or pad controls your program, your program plays a synthesizer, and virtual ports link it to music software on the same computer.

## Targets and status
plugin.json: macos (CoreMIDI), linux (ALSA), windows (WinMM), web (`webmidi`). Doc: macos verified through virtual ports only (no instrument), linux "not built or run", windows "not yet", else in-memory stand-in.

## What the docs have
- [x] overview, [x] "messages, not sound" explanation, [x] example, [x] API table (complete vs exports), [x] Notes (timing, plugging, names, virtual ports, sizes)
- [x] runnable example `examples/midi` (README: 12 lines, run commands)
- [x] test: `tests/t1/midi.sh`, web: `web_hw`
- [ ] screenshot of examples/midi (none); [ ] tutorial; [ ] troubleshooting; [ ] web section; [ ] real-device proof

## What is missing (priority)
1. Screenshot of `examples/midi`: `ZINC_SHOT=midi.png zinc run examples/midi` (the one-octave keyboard), added to the README and page.
2. Hear it: add a `zinc:audio` tone to the example (backlog ZN-715) and say so in the quick start, since "Zinc makes no sound" is the first-run trap.
3. Tutorial "Play a synth from your keyboard": virtual port, open GarageBand/MIDI Monitor, show note on/off; second tutorial "Read a controller" (knobs to a UI slider).
4. Real-device pass (hardware): a MIDI keyboard on macOS and Linux, `watchPorts` plug/unplug (backlog "real-device pass").
5. Cheat-sheet table: status bytes, note numbers to names, CC numbers (7 volume, 1 mod wheel, 64 sustain), clock 24 ppq.
6. Troubleshooting: no ports listed (IAC driver off, ALSA seq missing `libasound2-dev`), duplicate names, stuck notes (`allNotesOff`).
7. Document the web target (WebMIDI permission prompt, Chrome only).
8. Windows: say what plugin.json already builds (no virtual ports).

## Wrong or stale
- "verified on x86_64" (dev machine is M1 Pro now).
- Windows row says "not yet" but plugin.json has a `windows` target with winmm.
- The doc mentions no web support although plugin.json has `web`.
- Example comment shows `inputs()` output with hardware names: fine as illustration, but should say it is sample output.

## Suggested pages
- MIDI: overview and quick start
- MIDI: tutorial, play notes from your keyboard
- MIDI: tutorial, a controller to a UI
- MIDI: API reference (generated)
- MIDI: virtual ports and music software
- MIDI: message cheat-sheet
- MIDI: platform notes and troubleshooting
- MIDI: examples (midi keyboard with screenshot)
