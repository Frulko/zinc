# zinc:lan audit

## What it is
A polled-per-frame UDP (with broadcast) and TCP API for local multiplayer and device discovery, identical on desktop and on PSP, PS Vita and 3DS cores.

## Targets and status
plugin.json: macos, linux only; `requires: ["net"]`. Doc claims PSP, Vita, 3DS cores; emulator-tested (PPSSPP, Azahar, Vita3K, ZN-791), no real console (hardware). Tests: `tests/t0/lan.sh`, `tests/golden/host/lan.ts`, `tests/t1/lan_arena.sh`.

## What the docs have
- [x] overview, quick start, console table, emulator notes, runnable example (`examples/lan-arena` with README)
- [ ] API reference table (code sample only)
- [ ] screenshot of lan-arena, tutorial, troubleshooting, test named in doc

## What is missing
1. An API table: `up()` (1 / -1 / 0?), `address()`, `broadcastAddress()`, `error()`, `udp(port)`, `UdpSocket.send/receive/close?`, `Datagram` fields, `connect`, `TcpSocket.state/read/write/close`, `listen`, `TcpServer.accept`, constants `CONNECTING/OPEN/CLOSED`.
2. A screenshot of lan-arena (`ZINC_SHOT=... zinc run examples/lan-arena`, two instances).
3. A tutorial: "Find a host on the LAN with a broadcast" in 6 steps, then "Send positions 30 times a second".
4. Troubleshooting: router blocks broadcast, firewall, 1400-byte datagram limit, `up()` never reaching 1 on a console.
5. Name the tests (`lan`, `lan_arena`) in the doc.
6. Real console verification (hardware).

## Wrong or stale
- Doc says PSP/Vita/3DS targets; plugin.json lists only macos and linux (`zinc lint --target n3ds` warns, later.md ZN-792).
- The doc does not say that `lan-arena` has a `console/` folder.

## Suggested pages
Lan (API, generated) / Guide: networking in a game loop / Steps: discover a host by broadcast / Notes: consoles (PSP, Vita, 3DS bring-up table) / Example: lan-arena with screenshot / Testing in emulators.
