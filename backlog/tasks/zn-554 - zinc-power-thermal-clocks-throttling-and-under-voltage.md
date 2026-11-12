---
id: ZN-554
title: 'zinc:power: thermal, clocks, throttling and under-voltage'
status: Review
assignee: []
created_date: '2026-10-09 07:46'
updated_date: '2026-11-12 01:07'
labels:
  - rpi
  - sdk
  - size-S
milestone: m-25
dependencies:
  - ZN-535
ordinal: 52300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Temperatures from thermal zones, current and maximum CPU clock, throttled flags from the firmware mailbox (/dev/vcio GET_THROTTLED) with the hwmon in0_lcrit_alarm fallback, Pi 5 power button and fan state. Events on change; zinc doctor uses them. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 values match vcgencmd on the Pi 3B+
- [ ] #2 a QEMU raspi3b run degrades to unknown without errors
- [ ] #3 an under-voltage event is reported with a weak supply on the rig (manual check)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)
2026-11-12 worker implementation: one read-only `platform/power.h` snapshot shared by `device('power')`, public `zinc:power` and both doctor formats. Thermal types and nonzero zones retained; requested/hardware/policy clock MHz distinct; validated GET_THROTTLED current and latched flags; separate rpi_volt recent sampled alarm; pwmfan RPM/duty; KEY_POWER capability and read-only EVIOCGKEY sampled state. Null preserves unavailable/malformed/denied readings. No plugin, daemon, hardware setup or writes. Callback sampler starts on first subscription, stops on last, resets baseline/generation on restart, skips removed subscriptions, and logs listener failures without blocking others.

Research (delegated primary-source findings, verified hwmon registration by coordinator): https://docs.kernel.org/5.15/driver-api/thermal/sysfs-api.html ; https://www.kernel.org/doc/html/latest/admin-guide/pm/cpufreq.html ; https://github.com/raspberrypi/firmware/wiki/Mailbox-property-interface ; https://raw.githubusercontent.com/raspberrypi/linux/rpi-6.12.y/drivers/hwmon/raspberrypi-hwmon.c ; https://docs.kernel.org/hwmon/pwm-fan.html . Decision: existing sys device bridge + header-only OS snapshot + lazy VM timer; no dependency or native-thread callbacks. Input capability word fixtures use the running platform's native kernel word width. Sampling can miss quick button presses; firmware history may be cleared by other clients; hwmon alarm is not current under-voltage.

Proof: exact T0 `tests/run --only power` PASS (native malformed/empty/nonzero thermal, negative Celsius, kHz, hardware vs policy, shuffled hwmon, alarm0/1/invalid, fan0 vs absent, KEY_POWER metadata, mailbox response validation). `zinc check tests/data/power/snapshot.ts` PASS. Own `tools/build zinc` PASS; existing unrelated assets/third-party/duplicate-library warnings remain. Public empty-root and fixture snapshot (43.21 C, requested600 MHz, other values null) pass interpreter/QuickJS/native AOT. Event fixture passes all three: `events 1 0 1` after no-change tick, change, unsubscribe-other during callback, double unsubscribe, listener throw, restart and final unsubscribe. Durable logs `.logs/power-{t0,check,build-final,interp,qjs,native,events,values-interp,values-quickjs,values-native,doctor}.log`; docs/report `docs/reports/zinc-next-power.md`. Event reproduction: `build/zinc build tests/data/power/events.ts -o .logs/power-events-native`, then bounded `python3 tests/data/power/events.py` (~18s, memory unmeasured). No performance measurement claimed.

Review, no AC ticked: actual Pi3B+ comparison, actual QEMU run and weak-supply rig were not performed. No SSH/install/reboot/player takeover attempted (coordinator reports current authentication unavailable). Fixture unknown is software proof, not QEMU proof. Linux-only probe compiles warning-free to an aarch64-linux-gnu object with the existing pinned Zig (C++20, -Wall -Wextra -Werror); Linux ioctl execution/hardware behavior remains unproven on this Mac. No owned processes left.

Proposed tests: actual Pi3B+ read-only snapshot vs vcgencmd (bounded10s, memory unmeasured); actual Pi5 fan/button sampled state and permission denial (bounded10s, memory unmeasured); owner-selected manual weak-supply voltage event rig; Actual Linux/Pi probe and ioctl smoke (bounded10s run, memory unmeasured). QEMU AC awaits owner's hardware-policy resolution; no emulator launched. Proposed later line: ZN-554: prove thermal/clock/mailbox/fan/button readings on the actual Pi and record weak-supply rig results; sampled buttons can miss short presses. Followup: doctor label now reads Power (observed hardware). Linux compile proof `.logs/power-linux-compile.log`, object SHA256 5b21acc1c46fdee1e057d9c8530c15be5418f36bf601def2ac2c0eb644e56bcc. Usage: n/a.

Coordinator root integration: combined build and exact power pass; actual fixture values/scalar checks agree on all3, all3 event lifecycle outputs events1/0/1 and human doctor pass. Raw JSON key order differs under existing D209 checked-return limitation (docs/guide/12-js-engines.md:104–108; typed D179 schema copy vs unconverted QuickJS return). Preserve raw proof and compare parsed values; no payload/schema/caller workaround. Rootproof/summary .logs/integration-2026-11-11/power554-{root-proof.log,summary.json}; archive72 fullsource/logs/artifacts. Hardware/QEMU criteria stay unchecked.
<!-- SECTION:NOTES:END -->
