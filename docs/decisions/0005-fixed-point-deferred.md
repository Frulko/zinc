# 0005 — Fixed-point profile deferred; `--profile ps1` uses f32

**Context.** The `ps1` profile uses `number` in Q20.12 (LNG-03, RT-04), bit-identical between native and sim.

**Choice.** Not implemented in this increment. `--profile ps1` (and `esp32`, `ps2`) compiles `number` as `f32` (`float` in C++,
`Math.fround` in sim), which already exercises the reduced-precision path, and sets the target resolution.

**Consequences.** `zinc run --profile ps1` shows a 320×240 f32 version, not the Q20.12 one. The fixed-point type needs a C++ value
class with operators and integer emulation in the sim shim.
