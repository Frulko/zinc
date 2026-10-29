# zinc:osc audit

## What it is
Open Sound Control 1.0 over UDP in pure Zinc on zinc:socket: typed messages, bundles, patterns. Talks to TouchOSC, Chataigne, QLab, Pd, Max, Ableton.

## Targets and status
Module name `zinc:osc/full`. plugin.json: macos, linux, windows, android, ios, rpi1, rmpp; `web` entry (needs websocket); `requires: ["net"]`. Verified macOS only per doc; QuickJS not yet; web needs a WebSocket-to-UDP relay that is not shipped. Tests: `tests/t0/osc.sh`, `tests/t1/osc_full.sh` (`tests/data/osc`). Example: `examples/osc` (also used by modules-showcase, iot-panel, video mapper).

## What the docs have
- [x] overview, quick start, complete API table, type and pattern notes, UDP caveats, runnable example with `OSC_DEMO=1`, tests named, permission note
- [ ] screenshot of examples/osc, tutorial, per-software setup, web section

## What is missing
1. A screenshot of the square in `examples/osc` (`OSC_DEMO=1 ZINC_SHOT=... zinc run examples/osc`).
2. A tutorial "Control a Zinc visual from TouchOSC/Chataigne" with the exact address and port setup on the phone side (there is `docs/img/chataigne.png`; reuse it).
3. A recipe page: send to Pd / SuperCollider / QLab, address conventions.
4. Troubleshooting: port taken, firewall, wrong LAN interface, `float` rounding, bundle time not honoured.
5. A web section: what the `web` entry does and the missing relay (later.md).
6. Rpi/rmpp run (hardware).

## Wrong or stale
- Support table lists macos (x86_64), linux/rpi1/rmpp "not run"; manifest also has windows, android, ios, web. The machine is now arm64: "verified on x86_64" is out of date.
- The "two modules, one protocol" paragraph (built-in `zinc:osc` plus `zinc:osc/full`) conflicts with later.md ZN-716, which says one `zinc:osc` replaced the built-in. Check which is true and fix.

## Suggested pages
Osc (API, generated) / Guide: OSC in Zinc / Steps: drive a shape from a phone / Recipes: Chataigne, TouchOSC, Pd / Notes: types, patterns, bundles, UDP limits / Example: examples/osc with screenshot.
