# 0010 — Native modules: built-in `zinc:*` plus user specs

**Choice.** Built-in modules are declared in `lib/modules.d.ts` and implemented in `runtime/mod/<name>.cpp` (hosts)
and `sim/<name>.mjs`; functions map to `zrt::<name>::fn`, classes are host objects. Network I/O is non-blocking and
polled by the event loop (no threads). User modules follow NAT-01: `native/<name>.spec.ts` → generated
`zinc_native_<name>.h` → `native/<name>.<target>.cpp` / `.host.cpp`, and `native/<name>.sim.ts` for sim.
A table (`MODULE_TARGETS`) makes using a module on an unsupported target a `Z5003` error.
Ideas taken from the Spark engine notes: embedded assets (single-file binaries), telemetry message types
(`hello`, `perf_frame`, `log`, `metric`, `state_snapshot`, `expose`), server mode, OSC patching, systemd deployment.
