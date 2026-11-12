# Runtime board inventory

`zinc:board` exports `BOARD`, `SOC`, `RAM_MB`, `REVISION`, and `has(name)`.
The inventory is sampled once when this explicit module is evaluated, through
`zinc:sys device('board')`; interpreter, AOT and QuickJS use the same host probe.
An AOT program queries its execution host, never the build machine.

On Linux the probe reads `/proc/device-tree` (falling back to
`/sys/firmware/devicetree/base`), including big-endian `system/linux,revision`,
NUL-separated `compatible`, and HAT product/vendor strings. `/proc/cpuinfo`
provides a revision fallback. Old sequential revisions use the published table;
new revisions decode board type, CPU and RAM fields independently of manufacturer
and flags. Model strings from the device tree take precedence. Code `0015` has
two published RAM capacities, so it uses `MemTotal`, as do unknown revisions.
Desktop identity and memory reuse the existing device-info host record; unknown
values remain an empty string or zero.

`has()` reports observed hardware, independently of the profile's capability
constants. It accepts `gpio`, `i2c`, `spi`, `pwm`, `hwdec-h264`, `drm`, `audio`,
`wifi`, `ble`, and `camera`; unknown names return false. GPIO labels, DRM driver
names and successful V4L2 driver queries are also present in the raw JSON record.
GPIO chips are discovered by their labels, including RP1, without a fixed chip
number. Bus nodes, PWM classes, ALSA cards, `wlan0` and `hci0` are observations,
not guarantees of access permission or of successful operations. Bluetooth
controller presence does not prove that a particular LE operation will succeed.
A V4L2 decoder must open, answer `VIDIOC_QUERYCAP`, support M2M and enumerate H.264
on its compressed input queue; a `video10` filename alone never enables it.
Capture-only devices are reported as cameras, not decoders.
Missing or unreadable files return unknown/false, without throwing.

`zinc doctor --details` shows the board inventory alongside the selected profile;
`--profile rpi1` selects the existing Pi profile, without pretending it changes
the observed host. There is currently no distinct Pi 3/5 profile. The short doctor
report also labels the hardware inventory as observed.

For deterministic fixtures, `ZINC_BOARD_ROOT=/absolute/tree` prefixes all `/proc`,
`/sys` and `/dev` reads. V4L2 ioctl probing is disabled in such a tree: regular
fixture files cannot prove a decoder. The existing `ZINC_SIM_STATE` seam also
accepts `board.revision` (hex), optional `board.model`/`board.soc`, and
`board.<capability>=0|1`; revision supplies RAM and default identity. It returns
only the configured simulation, not the physical host's capabilities.

## Generated runtime export groups

`zinc:platform` also exposes `BOARD`, `SOC`, `RAM_MB`, `REVISION` and `has()`.
These names form a runtime export group in the generated-module catalog, backed
by the existing `zinc:board` module. This is an explicit contract of generated
modules, not an optimisation of ordinary TypeScript modules.

A named value import or re-export requesting any group member selects the full
generated module. Namespace imports, star re-exports and JavaScript dynamic
imports conservatively select the full namespace. Escaped JavaScript module or
export names also conservatively retain the full namespace. The group uses ordinary eager
dependency evaluation: `zinc:board` samples once before the requesting importer
runs. Importing `zinc:board` directly shares that same snapshot. Activation does
not retroactively change the evaluation of an earlier profile-only importer.

Profile-only imports and bare `import 'zinc:platform'` select a generated profile
module without a board dependency. Supported type-only imports add no runtime
work. D181 still rejects type-only imports of values such as `BOARD` and `has`;
use a value import for those names. The private `/profile` and `/runtime` module
keys are implementation details. Ordinary effectful TypeScript barrels retain
their normal dependency evaluation; the host query and JSON parsing are never
marked pure, and no build-machine identity is embedded in an AOT program.

`zinc doctor --target pi` (also `--target=pi`) selects the existing `rpi1` frontend
profile. This is a profile alias, not a CPU cross-build target or a claim about
the observed board; the same report still probes the execution host. An explicit
`--profile` conflicts with this alias. Missing and unknown targets are errors.

## Evidence and pending checks

`tests/t0/generated_runtime_exports.sh` covers the group contract, aliases,
transitive/star re-exports, type-only star exports, ordinary barrel effects,
JavaScript quoted imports and dynamic namespace identity, import-map overrides,
and zero-query C++/bundled-JS output. The profile-only generated C++ is
byte-identical to the pre-change binary for the same source fixture.

`tests/t0/board.sh` compiles the standalone probe, checks every revision in the
published table (plus future bit-field combinations), and drives root fixtures
for Pi 1–5, 500 and CM5, missing files, NUL strings, HATs and node observations.
It does not substitute fixtures for a QEMU or physical Pi run. QEMU is prohibited
by the current owner instruction. An actual Pi 3B+ doctor run remains required.

Sources, verified 2026-11-11:

- [Raspberry Pi revision encoding and published codes](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#raspberry-pi-revision-codes): decode fields rather than accepting only a fixed revision list; memory code 7 is unknown.
- [Linux VIDIOC_QUERYCAP](https://www.kernel.org/doc/html/latest/userspace-api/media/v4l/vidioc-querycap.html): use `device_caps` when `V4L2_CAP_DEVICE_CAPS` is set.
- [Linux VIDIOC_ENUM_FMT](https://www.kernel.org/doc/html/latest/userspace-api/media/v4l/vidioc-enum-fmt.html): query the compressed input formats instead of identifying a decoder by device number.
- [Linux GPIO character-device API](https://www.kernel.org/doc/html/latest/userspace-api/gpio/chardev.html): chip numbers are not stable board identities.

Generated-module semantics references (2026-11-12):

- [ECMAScript module evaluation](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html#sec-moduleevaluation): ordinary dependencies retain their effects.
- [esbuild tree shaking](https://esbuild.github.io/api/#tree-shaking) and [Rollup module effects](https://rollupjs.org/configuration-options/#treeshake.modulesideeffects): dropping a binding does not generally permit dropping an effectful dependency.
- [LLVM function attributes](https://llvm.org/docs/LangRef.html#function-attributes): a probe that opens device nodes and issues ioctls cannot be declared pure to obtain a smaller program.
