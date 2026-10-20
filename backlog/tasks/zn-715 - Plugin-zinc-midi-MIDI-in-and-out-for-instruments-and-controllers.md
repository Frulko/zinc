---
id: ZN-715
title: 'Plugin zinc:midi: MIDI in and out for instruments and controllers'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-11 16:09'
updated_date: '2026-10-11 16:50'
labels:
  - plugin
  - size-M
milestone: m-9
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 list ports, open one, receive and send notes, control changes and clock, hot-plug events; a proven vendored library (licence and pinned version), no code of our own for the platform APIs
- [x] #2 a virtual port test on the Mac: a message sent is received byte for byte; an example that plays a note from a key
- [x] #3 docs/plugins/midi.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
plugins/midi (zinc:midi): RtMidi 6.0.0 vendored in plugins/midi/vendor (RtMidi.h, RtMidi.cpp, LICENSE unmodified, hashes in PIN, row in third_party/README.md), native/midi.host.cpp a handle table over it with no platform call of our own, the stand-in midi.sim.ts with in-memory virtual ports, index.ts (inputs, outputs, openInput, openOutput, createInput, createOutput, watchPorts, onNote, onControl, onClock, onMessage, noteOn, noteOff, control, clock, start, stop, send, allNotesOff). Test: tests/t1/midi.sh PASS (CoreMIDI virtual ports: 12 messages byte for byte with a 303-byte system exclusive, both directions, the lists changing as ports come and go; interpreted, compiled, the stand-in; examples/midi plays notes from scripted keys). Doc: docs/plugins/midi.md.

Decision to record (no number taken): the library. Scored as RULES 4 (fit x3, perf x3, size x2, maint x2, licence x2, port x1, effort x1): RtMidi 6.0.0 (MIT, two files, CoreMIDI, ALSA, JACK, WinMM, virtual ports, its own receive queue): 5,5,5,4,5,4,5 = 67; libremidi (BSD-2-Clause, a C++20 rewrite of RtMidi with native hot-plug observers and MIDI 2, many headers and backends): 5,5,3,4,5,5,2 = 60; PortMidi (MIT-style, C, device list fixed at start, virtual ports only in its recent versions): 3,5,4,3,5,4,3 = 54. Hot-plug: RtMidi has no notification, but its port lists are those of the moment (it runs the CoreMIDI run loop in getPortCount), so watchPorts compares them every 500 ms. Plugins compile without exceptions and RtMidi throws: the plugin's targets add -fexceptions and midi.host.cpp sets RtMidi's error callback, so nothing is thrown after construction. Revisit for libremidi if sub-millisecond timestamps, MIDI 2 or immediate hot-plug events are asked.

Not proven: no instrument was attached (virtual ports of this process only; another program as the peer was not tried); a hardware port being unplugged while open; Linux not built (ALSA, libasound2-dev); QuickJS not run; the latency of the 2 ms timer was not measured.

Lines for later.md: ZN-715: try zinc:midi with a real keyboard and with GarageBand on 'Zinc keys' (examples/midi), nothing but virtual ports of the test itself was on the wire. ZN-715: wake the loop from RtMidi's callback instead of the 2 ms timer, and give each message its timestamp, if a performance needs it (measure with a loopback first). ZN-715: a Windows build of zinc:midi (RtMidi WinMM has no virtual ports: createInput and createOutput must say so). ZN-715: a sound for examples/midi through zinc:audio tones so a first run is heard without other software. Cross-platform pass: tests/t1/midi.sh on Linux (ALSA sequencer, snd-seq loaded).
<!-- SECTION:NOTES:END -->
