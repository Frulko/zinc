# 0003 — Number formatting through libc on hosted targets

**Context.** LNG-20 requires JS-identical number → string conversion (shortest round-trip). A freestanding Ryū port is a few
hundred lines.

**Choice.** `runtime/host.cpp` finds the shortest digit string with `snprintf("%.*e")` + `strtod` round-trip checks
(1–17 digits); `zrt.cpp` then applies the ECMAScript `Number::toString` layout rules. `parseFloat` and `toFixed` also use libc.

**Consequences.** Exact results on macOS and Linux (verified against Node on the examples). Slow and libc-dependent: PS1 and
ESP32 need the Ryū port before they can print numbers. `toFixed` rounds ties like printf (half-even on the exact binary value),
which can differ from JS on exact ties such as `(2.5).toFixed(0)`.
