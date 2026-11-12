---
id: ZN-549
title: 'GPIO chardev v2 backend in hw.h and the real zinc:gpio'
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-081
  - ZN-126
  - ZN-535
ordinal: 51500
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Do the sim backend and zinc:gpio API with a sim test; Linux chardev backend written, verified in the cross pass.

hw.h gains GPIO over the Linux GPIO uAPI v2: chip by label, line requests, bias, drive, edge events with kernel timestamps, kernel debounce, an explicit release policy. Linux, esp32 and sim backends. zinc:gpio (ZN-081) uses it on Linux targets. libgpiod is a test oracle only; the task notes record why (Bookworm v1 vs Trixie v2 ABI, LGPL). (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)

Also carries, since the backlog review of 2026-10-10: ZN-517 (zinc:gpio on Linux: GPIO v2 chardev, named lines, CHIP board table).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a gpio-sim test in the Linux CI image covers request, set/get, bias, edges and debounce
- [ ] #2 the same test passes on the Pi 3B+ with a jumpered pin pair
- [x] #3 the Pi 5 label pinctrl-rp1 resolves through the probe table
- [x] #4 no LGPL code linked
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. GPIO uAPI v2 in hw.h; the sim backend and zinc:gpio API are Mac-provable, Linux backend needs a board. Evidence: runtime/include/hw.h


2026-11-12 implementation (isolated work/549-gpio, base 73b2e9f5e):

- Replaced the obsolete frontend-only simulated builtin with the normal GPIO native plugin; the existing generic plugin resolver now supplies the same module on interpreter/AOT/QuickJS. Original setup/write/read/watch/simulate and watch-before-setup behavior remain. Added chip/line selection, drive/initial output, unwatch/release and sequence numbers; simulation uses microtasks without a persistent polling timer. Explicit release is required before VM teardown/reload (D316 factory/static-cache/allocator ownership limits are unchanged).
- hw.h owns the shared backend: retained Linux chardev-v2 request fd, full configuration/initial values, bias none vs keep, open-drain/source, read/write masks, named lines, Pi label probe table including pinctrl-rp1 and numeric GPIO0/1 offsets, bounded nonblocking EINTR/EAGAIN event reads, kernel timestamps/identity/sequence, kernel debounce, explicit release. No sysfs or silent Linux simulation fallback. Header stays in hw.h, already hashed by both plugin-cache lists.
- CHIP:CSID0..7 maps to SoC-local PE4..11 offsets132..139; CHIP:XIO-P0..7 maps to expander-local0..7. Both require an explicitly selected controller; no legacy global XIO base, guessed expander label or gpiochip number. Source: docs/reports/hardware/ntc-chip.md and its device-tree reference.
- Native calls/model/errors are serialized/thread-local; watcher generations reject stale pollers and queued callbacks. State transitions cover ownership, initialization, watcher and ESP interrupt registration. ESP uses vendor GPIO/FreeRTOS ISR queues, disables interrupts and waits for IPC barriers before handler removal/context reuse; failure retains failed ownership rather than freeing a live queue. The low-level ESP header compiles, but no ISR/electrical execution is claimed. Existing ESP mquickjs firmware remains unchanged and does not provide new desktop select/unwatch/release/drive/initial/sequence APIs; this task's public backend routing is Linux/desktop as its description specifies.
- No LGPL code copied or linked. Direct v2 UAPI selected over libgpiod linkage (Bookworm v1 vs Trixie v2 ABI and LGPL packaging surface); libgpiod remains an independent oracle only. Weighted fit/perf/size/maintainability/licence/portability/effort scores (weights3/3/2/2/2/1/1): direct5/5/5/4/5/3/4=65, separately loaded libgpiod4/5/3/5/3/3/4=56, legacy sysfs2/2/5/2/5/2/3=41. Revisit if GPIO needs batch-line transactions or a supported new kernel ABI.
- Primary research: https://www.kernel.org/doc/html/latest/userspace-api/gpio/chardev.html ; https://www.kernel.org/doc/html/latest/userspace-api/gpio/gpio-v2-line-set-config-ioctl.html ; https://www.kernel.org/doc/html/latest/userspace-api/gpio/gpio-v2-line-event-read.html ; https://www.kernel.org/doc/html/latest/admin-guide/gpio/gpio-sim.html ; https://github.com/raspberrypi/linux/blob/rpi-6.18.y/drivers/pinctrl/pinctrl-rp1.c ; https://kernel.googlesource.com/pub/scm/libs/libgpiod/libgpiod/+/8da049f2d7eacac5a290af27a90a871685b35ee4/COPYING . Full delegated research is archived in .logs/research-549-gpio-v2.txt.

Proof (all heavy commands queued/bounded by absolute tools/work-run; no suite, CI, privileged setup, physical probes, SDK install or firmware build):

- tools/build zinc succeeded; build/zinc SHA256 70255a4e7ac1f9f9db37256045e60200a2ec3cbb27754066f6da06d630490b90. Only existing external V8-header unused-parameter and duplicate-link warnings; no changed-source warning. Full .logs/gpio-build.log.
- tests/run --only gpio PASS: software state/debounce at timestamp0/overflow, actual Linux UAPI headers with intercepted open/ioctl/read/fcntl/close, exact flags/masks/initial values, label on gpiochip7, duplicate rejection, request/config failure, EINTR/EAGAIN, release ownership, public/native stale-generation and restart checks. .logs/gpio-t0.log and runner log. This is NOT kernel gpio-sim or a physical test.
- tests/run --only buses PASS after the header change; .logs/gpio-buses.log. Existing I2C/SPI semantics and explicit close remain.
- zinc check tests/data/gpio/public.ts and examples/esp32-gpio PASS. Actual public feature tests/data/gpio/public.ts PASS interpreter, compiled AOT (--native), QuickJS; exact paths .logs/gpio-public-{interp,aot,qjs}.log. Original tests/golden/host/gpio.ts unchanged, scripted inputs and frozen output byte-identical all3 (.logs/gpio-original-{interp,aot,qjs}.out); .logs/gpio-feature-proof.sh records exact commands.
- Actual native GPIO object cross-compiled arm-linux-gnueabihf using installed pinned Zig0.15.2, -Wall/-Wextra/-Werror, ELF ARM EABI5. .logs/gpio-cross-proof.sh/.log, object .logs/gpio-native/gpio-arm-linux.o SHA256 ac12540a3e1daf98b866a97dda4726aa9773c19b3606a43d2a1ec574f19e34f4. Compile only, no Linux execution claim.
- Actual installed ESP-IDF6.1 headers + Xtensa GCC15.2 compile hw.h GPIO object with -std=c++20 -Wall/-Wextra/-Werror, generated default ESP32 config solely under .logs/gpio-esp. Exact reproducible .logs/gpio-esp-compile.py, .logs/gpio-esp/command.json, sdkconfig/header, object gpio-esp32.o SHA256 dce188cf30c220f556f235e97c63b346eb11c2b56db2ee9f1dfb6f4c7307e4c0. Initial scratch include-path/libc-spec attempts are logged; IDF6.1 defaults to picolibc and required its --specs=picolibc.specs. No SDK files modified. No full firmware link/run or interrupt behavior claim.
- git diff --check clean. Final sequential feature/cross/ESP/buses recipe .logs/gpio-verify-final.sh/.log. No owned process remains.

Status: Backlog, AC3/4 checked on exact probe-table/source/link-boundary proof. AC1 remains open: no literal Linux CI gpio-sim image integration fixture/configfs setup was added or executed. AC2 remains open: no Pi3B+ jumper test executed. A syscall shim does not meet either criterion. Next work on this same task: write the prepared-kernel integration harness, then prove it in the literal CI image and on the Pi jumper. Hardware/CI-image access and integration harness remain required; do not mark Done on Mac proof.

Proposed decisions/later:
- Record the direct-UAPI choice and explicit-release/native-ABI limitation above; no new decision number allocated in worker.
- Cross-platform pass: ZN-549: prove real kernel gpio-sim (including bias/edges/debounce), Pi3B+ jumper and CHIP SoC/PCF8574A behavior; exact runtime chip labels/interrupt/debounce support and ESP board reservations/ISR teardown remain unproven.

Proposed tests:
- In an owner-prepared Linux CI gpio-sim image, add/execute the literal kernel integration fixture (request/set/get/bias/edges/debounce), using configured labels/line names and sysfs pull control as its stimulus; no modprobe/configfs mutation from this session. ~10–15s, memory unmeasured. AC1 remains open until this exists and passes.
- On Pi3B+ with owner-chosen safe jumper pair, bounded actual public zinc:gpio select/setup/write/read/watch/debounce/release proof against the same kernel-integration assertions, with libgpiod CLI as optional independent oracle. ~10–15s, memory unmeasured; no pin guessed or probed here. AC2 remains open.
- Prepared CHIP gpio-sim named XIO-P0/CSID0 then real-controller checks, and ESP configured-firmware ISR edge/overflow/unwatch/reconfigure-failure/close-reopen test. ~10–15s each, memory unmeasured.
- Owner-selected full existing host T0/CI and native ABI concurrent-argument/allocator and unclosed-handle VM reload ownership checks; not selected here. Existing D316 limits remain.


Usage: tools/usage reported `usage: n/a` (.logs/gpio-usage.log).

2026-11-12 prepared-kernel integration harness (work/549-kernel-harness):

- Added tools/check-gpio-sim.py, actual public tests/data/gpio/kernel.ts and explicit opt-in tests/t1/gpio_kernel.sh. The runner owns a unique configfs device, validates its mount/returned identities/contained sysfs paths, uses the real Linux chardev backend and clears deterministic/script/frame overrides. It performs no module loading, mounting, installation, permission change or physical GPIO action. Native/core sources and plugins are unchanged; no engine build.
- The fixture covers initial output, set/get with independent sysfs observation, exclusive requests/release, observable pull-up/down, both edge identities/kernel timestamp/sequence, filtered short pulse and stable debounce reads/edges, unwatch and release. No syscall interception, gpio.simulate, fake native backend or metadata-only debounce assertion.
- Bounded child output/deadline/kill/reap precedes owned-only reverse cleanup. Failure to reap keeps the owned device explicitly RETAINED with PID/path instead of deleting it beneath a live child; cleanup failures report the path. The runner does not claim cleanup after SIGKILL of the runner itself.
- Delegated primary research: https://docs.kernel.org/admin-guide/gpio/gpio-sim.html ; https://docs.kernel.org/userspace-api/gpio/gpio-v2-get-line-ioctl.html ; https://docs.kernel.org/userspace-api/gpio/gpio-v2-line-event-read.html . Kernel selftest/libgpiod tests were protocol references only; no GPL/LGPL implementation copied or linked. Full research retained in .logs/gpio-kernel/research-549-harness-next.txt.
- Written-software gap is removed, but AC1/2 remain unchecked and status Backlog: the literal prepared Linux CI image and Pi safe-jumper test were NOT run. A gpio-sim sysfs pull is not a Pi output stimulus. No kernel/configfs/sysfs/device write or probe occurred during authoring.

Proof: tests/run --only gpio_kernel_tool PASS (pure validation/owned cleanup/failure/retained child and bounded self-child output/deadline checks plus opt-in refusal); zinc check tests/data/gpio/kernel.ts PASS against the clean common aafdbfbbd binary, SHA256 8194f0139052b0de0faabe5587d7e5c051aec62bc93ee62ab23d3a89a23d91f4. No native build, T1, suite, CI, hardware or timing/performance run. Logs/provenance .logs/gpio-kernel/.

Proposed tests: in an owner-prepared Linux gpio-sim image, ZINC_GPIO_KERNEL_TEST=1 ZINC=/absolute/linux/zinc timeout 30 tests/run --only gpio_kernel (actual chardev request/set/get/bias/edge/debounce/release and owned cleanup, ~10–15 s, memory unmeasured); separately selected Pi3B+ safe jumper stimulus with the same public assertions (not yet supplied/run). AC1/2 stay open until those literal proofs. No new task.

Proposed later line: ZN-549: execute the written gpio_kernel harness in the prepared Linux image; Pi jumper stimulus remains separate, and forced/unreapable-child teardown requires the reported owner cleanup.

Usage: tools/usage reported usage: n/a.

<!-- SECTION:NOTES:END -->
