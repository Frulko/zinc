---
id: ZN-550
title: 'zinc:i2c and zinc:spi modules over hw.h'
status: Review
assignee: []
created_date: '2026-10-09 07:46'
updated_date: '2026-11-12 01:10'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-126
  - ZN-535
ordinal: 50200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Modules zinc:i2c (I2C_RDWR + SMBus fallback, scan) and zinc:spi (modes, speed, full duplex); i2c-stub and sim tests; spidev loopback on the Pi. Serial is done.

Module APIs over hw.h: i2c (I2C_RDWR with SMBus fallback, bus enumeration, scan), spi (spidev modes, speed, full duplex) and serial (termios, baud, parity, flow control, /dev/serial0 resolution). The existing sim chip models are reused. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 i2c-stub test (SMBus path) and hw.h sim tests green
- [ ] #2 spidev loopback (MOSI-MISO jumper) passes on the Pi 3B+
- [x] #3 pty-pair serial test passes on the host
- [ ] #4 display-ssd1306 and display-ws2812 frames unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. hw.h already has Linux i2c-dev and spidev backends plus sim models (runtime/include/hw.h:3-4), and zinc:serial is POSIX termios (plugins/serial/native/serial.host.cpp). Left: user-facing zinc:i2c and zinc:spi modules, bus scan, SMBus fallback. Carries ZN-518 (CHIP bus table). Evidence: runtime/include/hw.h:3; plugins/serial/native/serial.host.cpp:1
Review 2026-10-25: merged ZN-518 here (Buses on the CHIP: I2C, SPI2 overlay, PWM0, UART). Carry over: CHIP buses: board defaults for hw.h are the same work as the zinc:i2c/spi modules; carry the CHIP bus table and the spi2 overlay doc over. ZN-550 is open and gives zinc:i2c/spi over hw.h; carry over the CHIP bus table (TWI2 /dev/i2c-2 shared with XIO at 0x38, TWI1), the spi2 DT overlay, PWM0 via /sys/class/pwm (not in 550) and the CHIP-03 EEPROM criterion, labelled needs-board.

2026-11-12 worker implementation, branch work/550-buses (base c3434e352):

- Added public zinc:i2c list/open/write/readRegister/close and explicit-policy scan, and zinc:spi list/open/write/transfer/close. Both enumerate without device I/O, require explicit hardware paths, reject invalid sizes/address/mode/speed and expose errors. Eight generational public slots retire before wrap; stale objects cannot drive replacement devices. Serial source/API unchanged.
- Shared hw.h now tracks occupancy explicitly instead of fd0/sentinels, closes fd0 and ESP device handles, supports eight independent SPI opens, and retains existing driver signatures. SPI restores per-handle mode and transmits requested speed/8-bit words in one ioctl segment for write and duplex. Another process touching the same spidev configuration can still race mode changes; documented exclusive peripheral ownership.
- I2C capability query selects I2C_RDWR repeated-start reads (requires return2), otherwise exact byte/byte-data/fixed I2C-block SMBus shapes <=32 bytes. No retry fallback after a failed bus transaction and no variable-length SMBus block substitution. Scans require quick-write or receive-byte policy; docs explain both can damage/state-change devices, skip reserved/kernel-owned addresses and never use SLAVE_FORCE.
- Explicit native path 'sim' reuses existing C++ QMI8658 model and explicit SPI loopback. No duplicated TS chip model, automatic physical probe, loader workaround, overlay application or privileged setup. Auto/default native selection and ZINC_NATIVE=real both work. Native-only model requires a native host build; ZINC_NATIVE=sim/no-native behavior is not redefined.
- QMI8658 shared model now rejects out-of-range and overflowing register reads before indexing its register array; regression covers reg255/count1 and reg0x5f/count2. Existing display/sensor callers and three-field model aggregates remain source-compatible; model duplex callback is appended/default-null. Existing raw driver writes retain their size behavior; public modules bound their writes.
- Host slots, model and bus operations use a mutex; error text is thread-local and factory rc is initialized only once. Direct two-thread host regression (30 cycles each) proves shared ownership, generation rejection and per-thread errors using preallocated immortal caller strings. It does NOT prove the entire native ABI/runtime is thread-safe: generated native_gen thunks retain static argument scratch arrays (e.g. static kv1 in t_write/t_transfer), and runtime/zrt.cpp has shared allocator/live_objects globals. No production workaround was added. No actual current public fixture failed on this seam. Generated thunks also expose no shutdown hook: explicit close/reopen is proven, but unclosed devices surviving an in-process VM reload are an inherited cleanup limitation; resetting a global singleton at factory invocation would invalidate other worker VMs and was not added.

Proof (all through absolute tools/work-run, bounded/headless, one pending command):
- .logs/550/t0-final.log: tests/run --only buses PASS. Includes raw shim pool/restart/close2/fd0, existing model register roundtrip/bounds, Linux UAPI intercepted syscall transaction shape/SMBus/no retry/interleaved SPI config and direct native-host concurrency. Linux header shim uses the already installed pinned Zig UAPI; no physical device accesses. Missing Linux UAPI headers produce an explicit SKIP instead of a false shim pass.
- .logs/550/check-final.log, public-interp-final.log, public-quickjs-final.log, public-aot-final-build.log and public-aot-final.log: exact final public fixture check/interpreter/QuickJS/AOT passes. Fixture tests actual public APIs, two devices simultaneously, model roundtrip, duplex, stale after reopen, double-close, invalid address/mode/policy/model reads. Default auto mode is used (ZINC_NATIVE unset, deterministic0); public-auto.log also records auto selection earlier.
- .logs/550/serial-pty.log: existing tests/data/serial/fake_board.py against existing board.ts, host interpreter, all seven protocol checks ok and exit0. Exact output equals existing board.out. This proves AC3; no T1 runner/suite was started.
- .logs/550/linux-native-final-build.log and linux-spi-final-build.log: pinned Zig0.15.2 -target aarch64-linux-gnu compiles both final native sources warning-free to objects. Objects only; no Linux execution or link proof. Earlier -fsyntax-only attempts hit Zig FileNotFound/unused-command-line behavior; ordinary -c passed, no source workaround.
- Read-only common zinc source476b26695, SHA5e8b14a10357dfaac305025b929ea47aac34fa0180306e0b59d7c0dd515a87c5; ZINC_ROOT points at this worktree. No engine rebuild, main-tree edit, physical bus probe, SSH/setup, install, modprobe, QEMU, owner display/RT/HAL edit or push. No owned process remains. .logs/550/provenance.json records exact file hashes/artifact hashes and proof commands.

Status Review, AC3 checked only. AC1 remains unchecked because its actual i2c-stub SMBus half is not proven (sim/shim passes do not substitute for it); AC2 requires Pi MOSI-MISO hardware loopback; AC4 requires the owner-selected complete unchanged display-frame proof. CHIP table and SPI2/CSI conflict documented, but CHIP-03 EEPROM and overlay functionality are not proven on a board.

Research: delegated bus550_research completed before implementation; verified Linux primary docs https://www.kernel.org/doc/html/latest/i2c/dev-interface.html (combined transactions/capabilities), https://www.kernel.org/doc/html/latest/i2c/functionality.html, https://docs.kernel.org/spi/spidev.html (one-segment full duplex/config), https://cdn.kernel.org/doc/html/latest/i2c/i2c-stub.html, https://kernel.googlesource.com/pub/scm/utils/i2c-tools/i2c-tools/+/refs/tags/v4.3/tools/i2cdetect.8 (unsafe probes), https://docs.getchip.cc/chip and https://docs.getchip.cc/dip (CHIP/DIP buses; chip page fetch403 on later recheck). Existing kernel UAPI is sufficient; no dependency vendored.

Proposed decision (no D number allocated): expose only register-read and write I2C shapes we can preserve across I2C/SMBus/model backends; require explicit scan policy, never protocol-retry side effects; explicit native simulator path and generation-based public handles. Revisit if a device requires generic combined/raw reads or ten-bit addresses.

Proposed later line: ZN-550: audit generated native thunk static argument-array caches and zrt global allocator/error counters across concurrent worker VMs; add a minimal two-VM same-native write/transfer overlap regression before claiming native ABI concurrency, and audit generated module shutdown ownership so VM reload cleans up unclosed native resources without closing another VM's devices. Concrete evidence: src/frontend/native_gen.cpp emits static argument Array scratch and ZnModule init/poll without shutdown; runtime/zrt.cpp defines live_objects and allocator globals. Proposed minimal reload regression: an embedder registers the same module, opens eight sim devices without closing, runs zn_native_shutdown, registers it again and attempts another open; record retained handles and then define per-VM ownership before changing cleanup. Unclosed handles can survive reload until process exit; callers must use Device.close() in finally.

Proposed tests (owner picks):
- Owner-prepared Linux i2c-stub: invoke zinc:i2c open(actual stub path, configured address), write([reg,value]), readRegister(reg,1), readRegister(reg,2); verify advertised SMBus byte-data and fixed I2C-block behavior. ~5s, memory unmeasured; no stub/module setup authorized here.
- Pi3B+ with owner-prepared unused spidev and MOSI-MISO jumper: public transfer([0,255,85,170]) at mode0/1MHz equals input, then independent close/reopen. ~5s, memory unmeasured; strict SSH and no player takeover.
- tests/run --only hw_shim and tests/run --only chip_models, followed by owner-selected full display-ssd1306/display-ws2812 unchanged-frame comparison. ~5-30s, memory unmeasured; not started (existing T1/full-frame milestone).
- Existing tests/run --only serial across compiled/simulator paths if selected; host interpreted pty proof already passes. ~10s, memory unmeasured.
- CHIP-03 EEPROM register read with documented image/path and confirmed bus ownership, SPI2 overlay/camera conflict validation on an actual CHIP; ~5s per smoke, memory unmeasured, owner-prepared hardware only.

Cache reach follow-up before integration: added runtime/include/hw.h to BOTH existing global native-header lists in src/tc/plugin_build.cpp (content key and stamp inputs), so bare includes in legacy display/sensor plugins cannot retain an old bus shim. Production diff is only those two list additions; no general include parser or engine rebuild. New tests/t0/buses_cache.sh compiles the actual changed TC source against read-only common support archives and exercises buildPlugin/pluginUpToDate on a display-style source with bare #include "hw.h". A copied engine header and isolated ZINC_HOME prove first library returns21, unchanged stamp/cache hits, header-only edit rejects stamp, rebuilt library has a different content-key path and returns42, then stable hits resume. .logs/550/cache-t0.log PASS (~4.7s indicative, not a performance claim); .logs/550/cache-proof.log holds full manual feature proof. Baseline 84f9abbcb TC source reproduced the stale-stamp assertion in a separate temporary cache (.logs/550/cache-before-check.log and cache-before-proof.log); no global cache or real driver cache was modified. Exact current TC source compiles -Wall -Wextra -Werror. Test and source are mapped to buses_cache in tests/affected.json.

No performance numbers/quiet memory claim. usage: n/a.
<!-- SECTION:NOTES:END -->
