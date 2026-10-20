---
id: ZN-716
title: >-
  Plugin zinc:osc: Open Sound Control over UDP for stage and installation
  software
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-11 16:09'
updated_date: '2026-10-11 16:37'
labels:
  - plugin
  - size-S
milestone: m-9
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 send and receive OSC messages and bundles (int, float, string, blob, time tag) over zinc:socket UDP; address pattern matching
- [x] #2 a loopback test: every type sent is received equal; an example that moves a shape from an OSC message
- [x] #3 docs/plugins/osc.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
plugins/osc (module zinc:osc/full), written in Zinc on zinc:socket, no native code. Test: next/tests/t1/osc_full.sh PASS (interpreter and compiled; wire bytes checked against the OSC 1.0 example and Python struct). Example: examples/osc (OSC_DEMO=1 sends itself /shape/xy). Doc: docs/plugins/osc.md.

Decision to record (no number taken): the specifier. The engine already has a built-in zinc:osc (ZN-085: send/listen of numbers and strings, src/host/osc.cpp, used by examples/chataigne, iot-panel, plugins/mapping), and the resolver gives a host module before a plugin, so a plugin named zinc:osc is never reached in Next and would replace the built-in in the prototype (tsconfig paths). Options scored as RULES 4 (fit x3, perf x3, size x2, maint x2, licence x2, port x1, effort x1): A plugin under its own specifier zinc:osc/full beside the built-in: 4,4,5,3,5,5,5 = 60; B the plugin takes over zinc:osc (compat send/listen/close kept, built-in removed): 5,4,5,4,5,5,1 = 61 on paper but it changes the resolver (shared core), the synchronous listen() that throws when the port is taken (chataigne relies on it; zinc:socket binds through a promise), the permission messages and the prototype's module: not a size-S change in a parallel tree; C extend the built-in codec: 3,5,3,3,5,5,3 = 54, not a plugin and not on zinc:socket. Taken: A now, reversible (one field of plugin.json); B is the line for later. Revisit when the built-in is moved out of the engine.

Not proven: no other OSC software was on the wire (the bytes are checked against the specification and struct, not against TouchOSC or Chataigne); linux, rpi1, rmpp not run; QuickJS cannot load zinc:socket (type stripper stops at plugins/socket/index.ts:112), so neither this plugin.

Lines for later.md: ZN-716: one zinc:osc, the plugin taking over the built-in (compat send/listen/close on it, src/host/osc.cpp and its three host rows removed): two modules for one protocol confuse a first user. ZN-716: zinc:socket on QuickJS (stripper error at plugins/socket/index.ts:112), which also gives zinc:osc/full there. ZN-716: OSC over TCP/SLIP (OSC 1.1) with encode/decode on a zinc:socket stream, for software that speaks it. Cross-platform pass: next/tests/t1/osc_full.sh on Linux and Windows.
<!-- SECTION:NOTES:END -->
