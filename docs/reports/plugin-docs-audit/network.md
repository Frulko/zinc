# zinc:network audit

## What it is
Tells a program how the machine is connected (interfaces, state, IPv4, Wi-Fi joined) and lists, joins and forgets Wi-Fi networks through NetworkManager's `nmcli`. For makers building a Pi settings screen.

## Targets and status
plugin.json: linux, macos, windows, rpi1; `requires: ["process"]`. Real Wi-Fi control only where `nmcli` exists (Pi OS, Debian, Ubuntu, Fedora); elsewhere addresses only and `NOT_MANAGED`. Proven by `tests/t0/network_plugin.sh` against the `image/player/dev/bin/nmcli` stand-in. Not proven on a real Pi in the docs (hardware).

## What the docs have
- [x] overview, requirements (permission `process`), quick start, API table (all 4 functions, 4 classes, 3 parsers), example code, the test, polkit note
- [ ] runnable example in examples/ (only consumers: `image/player` Wi-Fi page, `app/sidecar-screen`)
- [ ] screenshot / GIF
- [ ] tutorial
- [ ] commands a user types
- [ ] troubleshooting (partly: polkit, password visible in argv)

## What is missing
1. A screenshot of the player's Wi-Fi settings page (`image/player/src/pages/settings/wifi-section.ts`, ZINC_SHOT=... with the nmcli stand-in).
2. A 5-step tutorial "A Wi-Fi picker": list, show signal bars, join with a password, handle the error string, forget. Link to image/player as the full version.
3. A tiny `examples/wifi-picker` (it would run on a Mac with the stand-in `PATH`).
4. Troubleshooting table: `NOT_MANAGED`, "Secrets were required", polkit denial as non-root, rescan taking seconds, hidden networks not listed.
5. The `NetworkStatus` and `NetworkInterface` members written as a typed list (`managed`, `interfaces`, `wifiNetwork` are there; the `hasConnected(kind)` semantics need an example).
6. Real Raspberry Pi verification note (hardware).

## Wrong or stale
- Doc does not list the rpi1 target that plugin.json declares; doc says macOS/Windows answer `NOT_MANAGED`, fine, but a support table is absent.
- Doc has no `zinc lint` target line; windows listed in manifest but never tested.

## Suggested pages
Network (API, generated) / Guide: Wi-Fi settings screen / Steps: join a network from a program / Notes: NetworkManager, polkit and permissions / Example: image/player Wi-Fi page / Testing with the nmcli stand-in.
