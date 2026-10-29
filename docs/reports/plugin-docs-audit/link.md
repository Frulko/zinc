# zinc:link audit

## What it is
Two Zinc programs on one network find each other (DNS-SD), pair once with a 6-digit code and then exchange encrypted JSON and bytes, reconnecting by themselves. For phone remotes, notification relays, dev links.

## Targets and status
plugin.json: macos, linux, android, ios; `requires: ["net"]`. Proven: `tests/t1/link.sh` (two programs on a Mac), Mac and Nexus 7 2012 on 2026-10-17 (63 ms discovery, 0.4 s pairing). Also `notify_relay` tests. iOS declared (plist keys) but not stated verified. Native and interpreter only; QuickJS loads but its virtual-clock timers make it unusable. Across-networks (WebRTC) is a plan only (ZN-756).

## What the docs have
- [x] overview, advertiser and browser quick starts, full API table, protocol/security table, Android notes with measurements, "Proven" section, a plan page
- [x] runnable examples (`examples/notify-relay`, `examples/music` kiosk)
- [ ] screenshot of the pairing UI (notify-relay)
- [ ] step-by-step tutorial, commands, troubleshooting (multicast blocked, firewall), permission block

## What is missing
1. A screenshot or GIF of notify-relay pairing (code on one screen, entry on the other).
2. A 6-step tutorial "Pair two devices": advertise, openPairing, show code, browse, pair, send a message; with the commands to run both sides.
3. Troubleshooting: AP isolation / multicast blocked, "type this address" fallback, `ZNL1 closed`, wrong code limit, forgotten peer error text.
4. iOS section: `NSLocalNetworkUsageDescription`, Bonjour entry, what is verified (iOS run: hardware/owner).
5. Linux and Windows status line; Windows is not in the manifest.
6. A short "Not on QuickJS" workaround note with link to later.md.
7. The `net` permission block.

## Wrong or stale
- Doc: "Targets: macOS, Linux, Android"; manifest also has iOS.
- "Across networks (WebRTC): the plan" is correctly labelled but may confuse readers of the API table; the planned `relay` option is not in the API.

## Suggested pages
Link (API, generated) / Guide: pairing and channels / Steps: pair two devices / Notes: protocol and security, store file, Android multicast lock, iOS local network / Examples: notify-relay, music kiosk / Roadmap: across networks.
