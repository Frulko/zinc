# zinc:serial audit (score 4/5)

## What it is
Talk to an Arduino, ESP32, GPS or any USB serial device: list ports, open with baud and framing, read lines or bytes, write, DTR/RTS, unplug detection.

## Targets and status
- plugin.json: macos, linux, windows. Native: POSIX termios (`serial.host.cpp`); sim stand-in has one `'loopback'` port.
- Verified on a pseudo-terminal on x86_64 macOS; no real board, no real unplug. Linux not built; Windows not written. A browser variant exists (`plugins/serial/web`, Web Serial) but the doc never mentions it.

## What the docs have
- [x] overview, [x] quick start, [x] API table matches all exports (list, open, onLine/onData/onClose, write, writeBytes, pending, setSignals, isOpen/path/baud, close)
- [x] notes (baud, Arduino reset, one reader, dialout group, unplug), [x] test `tests/t1/serial.sh`
- [x] runnable example `examples/serial` with the Arduino sketch `arduino/plot`
- [ ] screenshot, [ ] numbered tutorial, [ ] wiring picture, [ ] web section

## What is missing
1. Screenshot of examples/serial plotting the wave: `ZINC_NATIVE=sim ZINC_SHOT=docs/img/serial-plot.png zinc run examples/serial`.
2. Tutorial "Plot a potentiometer": wire A0 to the middle pin, 5 V and GND on the sides (pins table), upload `plot.ino`, run. (hardware)
3. A "Web" section: Web Serial in Chrome, user gesture needed, `list()` behaviour in the browser (read `plugins/serial/web/`; targets/web.md lists it).
4. Windows status line and plan (COM ports, `\\.\COM3`).
5. Real unplug and real-board verification, tracked by backlog/later.md line 588 (Arduino, MIDI keyboard, PTP camera). (hardware)
6. Recipes: DMX at 250000 baud, MIDI 31250, a GPS NMEA parser with `onLine`.

## Wrong or stale
- "verified on x86_64" predates the M1 machine; recheck.
- No contradictions with the code found.

## Suggested pages
Overview; API reference (generated); Ports per platform (macOS/Linux/Windows/Web); Tutorial: plot a sensor from an Arduino; Recipes (GPS, DMX, MIDI); Troubleshooting (busy port, wrong baud, dialout); Example: serial.
