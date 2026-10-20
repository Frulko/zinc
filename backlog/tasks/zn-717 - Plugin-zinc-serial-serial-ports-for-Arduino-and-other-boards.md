---
id: ZN-717
title: 'Plugin zinc:serial: serial ports for Arduino and other boards'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-11 16:10'
updated_date: '2026-10-11 16:43'
labels:
  - plugin
  - size-M
milestone: m-9
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 list ports, open with baud rate and framing, read lines and bytes, write, close, unplug reported; a proven vendored library or the POSIX API behind one file per platform
- [x] #2 a pseudo-terminal test on the Mac: bytes written on one side are read on the other; an example that plots a value sent by a board
- [x] #3 docs/plugins/serial.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
plugins/serial (zinc:serial): POSIX termios in native/serial.host.cpp (macOS, Linux) behind native/serial.spec.ts, the stand-in serial.sim.ts with a 'loopback' port, index.ts polling the open ports every 5 ms (list, open(path, baud, '8N1'), onLine, onData, onClose(unplugged), write, writeBytes, pending, setSignals, close). Test: tests/t1/serial.sh PASS (pseudo-terminal held by tests/data/serial/fake_board.py: lines, every byte value both ways, 200,000 bytes queued, the other end closing reported as unplugged; interpreted and compiled; the stand-in; examples/serial). Example: examples/serial (plot, with arduino/plot/plot.ino). Doc: docs/plugins/serial.md.

Decision to record (no number taken): no library. Scored as RULES 4 (fit x3, perf x3, size x2, maint x2, licence x2, port x1, effort x1): POSIX termios in one file per platform: 5,5,5,4,5,3,4 = 66; libserialport 0.1.2 (sigrok): LGPL-3.0-or-later, not allowed in the tree, 4,5,3,4,1,5,3 = 51; wjwwood/serial 1.2.1 (MIT, C++, covers Windows, no release for years, blocking API with its own timeouts): 3,4,4,2,5,5,3 = 51; serialib (MIT, one file, blocking reads): 3,4,5,3,4,4,3 = 52. The criterion allows the POSIX API behind one file per platform. Revisit when the Windows file is written: if it grows past the POSIX one, weigh wjwwood/serial again.

Not proven: no board and no USB adapter was attached (a pseudo-terminal ignores the baud rate, the framing and DTR/RTS: setSignals answers false on it, and the IOSSIOSPEED path for non-standard rates on macOS was not run); a real unplug (ENXIO or a read of 0) was not seen, only the closed end of a pseudo-terminal; Linux not built; QuickJS not run.

Lines for later.md: ZN-717: try zinc:serial with a real Arduino and a USB adapter pulled out (baud, framing, DTR reset, unplug), the test only has a pseudo-terminal. ZN-717: serial.windows.cpp (CreateFile, DCB, overlapped reads, SetupAPI for the list) behind serial.spec.ts. ZN-717: non-standard baud rates on Linux (termios2, BOTHER). ZN-717: names for the ports (USB product and vendor through IOKit and sysfs) so a first user picks 'Arduino Uno' and not /dev/cu.usbmodem14101. ZN-717: the ports on the libuv loop instead of the 5 ms timer if the wake-ups show in resmon. Cross-platform pass: tests/t1/serial.sh on Linux (openpty there too).
<!-- SECTION:NOTES:END -->
