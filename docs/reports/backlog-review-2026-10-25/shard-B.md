# Shard B: Raspberry Pi, three.js and SDK (m-25), NTC CHIP (m-24), simulator and Arduino (m-18)

62 tasks reviewed, none assigned to another session. Verdicts: 16 keep, 9 rewrite, 4 done-partly, 1 split, 7 merge, 3 drop, 21 park, 1 review-close, 0 done. Data: `shard-B.json`.

## Findings

- **No task is fully done**, but much Pi work shipped without a task and shrank several of them: KMS atomic planes and the page-flip (display-fbdev), hardware H.264 decode shown on a plane (ZN-557), V4L2 webcams on Linux (ZN-556), armhf/aarch64 graphics hosts cross-built from the Mac against a pinned sysroot (ZN-546), the 1080p Pi 3B+ render work (ZN-534), the Pi OS image and its builder app, `zinc agent`/`zinc device` (OTA, screen, deploy).
- **ZN-735 (Review)**: close as Done. The flip is the default on the Pi, measured, documented; follow-ups are already `later.md` lines.
- **The CHIP milestone (m-24) is mostly dead weight**: the owner has no CHIP or PocketCHIP rig. 12 tasks are parked, ZN-516 is dropped (`zinc agent`/`zinc device` replace a gadget deploy protocol), ZN-518/520/522/533 are merged into the generic Linux tasks (ZN-550, 558, 553, 555). Only ZN-512 (NEON flag on armv7-linux) and ZN-513 (capabilities rows, docs) survive as small, cheap items; armv7-linux itself exists (`src/tc/tc.cpp:195`).
- **Simulator (m-18)**: `zinc sim`, `board.json`, 14 chip models, scenarios and replay shipped (src/sim, tests t0 sim_*). The open tasks are the Atelier views (ZN-300/301/302, keep) and the Arduino/Wokwi extras. The Arduino direction that shipped is the reverse (Arduino core inside the mquickjs ESP32 firmware, esp32sim emulator), so ZN-308 (host core shim) is dropped, ZN-305/306/307 parked behind ZN-304, ZN-298/303 parked, ZN-309 dropped (spike report), ZN-310 merged into ZN-164. ZN-311 becomes a plain docs task for what exists.
- **Duplicates across shards**: ZN-543 into ZN-597 (native three.js accelerators); ZN-546 and ZN-310 into ZN-164 (size gates); ZN-334 (pinned sysroots, other shard) is probably already done by `tools/linux-sysroot` (bookworm lock) and should be checked by its reviewer; ZN-534 overlaps ZN-412.04 and ZN-585 (Pi numbers).
- **Nothing exists for**: GPIO on Linux (ZN-549; `hw.h` has only i2c-dev and spidev, `zinc:gpio` exists only in the ESP32 mquickjs firmware), PWM, board probe (`zinc:board`), thermal/throttle, Linux BLE/Wi-Fi, ZN_WEBGL_PROFILE=vc4, three r162, instancing emulation, shared EGL for WebGL on KMS, display-gl atomic planes.
- ZN-550 shrinks: `zinc:serial` is already POSIX termios and `hw.h` already has the Linux i2c/spi backends; only `zinc:i2c` and `zinc:spi` modules remain.
- ZN-559: `zinc pi setup` is superseded by the Pi OS image; keep only capabilities rows and permissions.

## The 10 that matter most

1. **ZN-549** GPIO v2 on Linux: the Pi's central maker feature, absent; unblocks 550, 551, 559.
2. **ZN-535** board probe (`zinc:board`, `has(cap)`): unblocks the whole SDK and testable on the Mac with a fake root.
3. **ZN-538** `ZN_WEBGL_PROFILE=vc4`: lets the Mac prove Pi WebGL limits; unblocks 539, 540, 542, 547.
4. **ZN-540** vendor three r162 as the WebGL1 tier.
5. **ZN-536 / ZN-537** WebGL on the KMS scanout and display-gl atomic planes (rewrite 537 to share the fbdev plane code): the path to real 3D on a Pi 3.
6. **ZN-550** (rewritten) `zinc:i2c` and `zinc:spi` modules: small, hardware already in `hw.h`.
7. **ZN-555** audio on the Pi: the plugin was never run on Linux; sound is a basic expectation for games and education.
8. **ZN-558** Wi-Fi and BLE on Linux (carries 520).
9. **ZN-300** Atelier board view: the most visible thing for makers on the Mac.
10. **ZN-311** (rewritten) docs for `zinc sim` and esp32sim: cheap, nothing documents a shipped feature.

## Surprises

- Task ZN-546 and ZN-132 (still Review elsewhere) overlap: the graphics host cross-build works and is documented in `docs/targets/linux.md`.
- `armv7-linux` uses `-mcpu=cortex_a8` without `+neon` and glibc 2.28, not the static musl the ZN-512 text assumes.
- Most Pi criteria need the Pi 3B+ rig (lane `cross`), so only 535, 538-540, 542, 547, 559 and the sim tasks can be proven on the Mac.
