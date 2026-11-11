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

The runtime exports are deliberately **not re-exported from `zinc:platform` yet**.
A trial showed that importing only `SCREEN_W` retained the board initializer and
JSON parser in generated C++. ESM re-exports also evaluate the module eagerly.
A public, semantics-preserving way to opt into lazy runtime module bindings must
be designed before adding those exports; silently making a host query pure would
hide its observable work. Existing profile-only imports are unchanged.
`zinc doctor --target pi` selection also remains to be wired; use the explicit
existing `--profile rpi1` for this partial delivery.

## Evidence and pending checks

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
