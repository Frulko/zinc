# GPIO lines

`zinc:gpio` uses the same native module on the interpreter, AOT and QuickJS.
`setup`, `write`, `read`, `watch` and `simulate` retain their signatures. Linux
uses GPIO character-device **v2** (kernel 5.10 or newer), without libgpiod or
sysfs fallback. macOS defaults to the software simulator; Linux never silently
falls back when hardware, permission, interrupt or debounce support is missing.
`ZINC_GPIO_SCRIPT="27:0@100,27:1@150"` explicitly selects simulation and keeps
the original scripted-input behavior. The ESP32 firmware's separate mquickjs
GPIO module is unchanged and does not supply the new `select`, `unwatch`,
`release`, drive/initial options or event sequence API; the shared C++ `hw.h` seam uses ESP-IDF.

```ts
import { select, setup, write, release } from 'zinc:gpio';
select(17, 'pinctrl-rp1', '17'); // label, local line offset; not gpiochip0
setup(17, 'out', 'none', 'push-pull', 1);
write(17, 0);
release(17);
```

`select(pin, chip, line)` maps a logical u8 pin to an exact chip label or device
path, and an offset string or exact kernel line name. Selection releases an old
request and cancels its callbacks. Empty chip selects an unambiguous Raspberry
Pi header controller by label (`pinctrl-bcm2835`, `pinctrl-bcm2711`,
`pinctrl-rp1`), with numeric pins used as local offsets. GPIO0/1 therefore work
on Pi 5 even when named `ID_SDA`/`ID_SCL`. Label discovery checks nodes 0–255;
an explicit device path has the same range in this version. Duplicate labels or
line names fail instead of choosing a controller. `select(17, 'sim', '17')`
selects simulation on every platform.

CHIP aliases require the caller's explicit controller selection:
`select(0, '<actual sunxi chip label>', 'CHIP:CSID0')` uses SoC-local offset 132;
CSID0–7 map to PE4–11. `select(1, '<actual expander label>', 'CHIP:XIO-P0')`
uses expander-local offset 0; XIO-P0–7 map to 0–7. These are separate
controllers. Discover their actual labels on the device; no legacy global XIO
base, assumed chip number or guessed runtime label is used.

`setup(pin, mode, pull, drive = 'push-pull', initial = 0)` supports `in`/`out`,
`none`/`up`/`down`/`keep` bias, and push-pull/open-drain/open-source outputs.
`none` explicitly disables bias; `keep` omits its configuration. Unsupported
hardware settings fail; accepted bias is not proof that a physical pull exists.
The initial output value is included in the Linux request/configuration, with
no request/release gap during reconfiguration. The request fd remains owned
until `release(pin)`. `read` can lazily request a default input; `write` requires
an output. `watch` may precede input setup, as in existing programs.

`watch(pin, 'rising' | 'falling' | 'both', debounceMs, callback)` replaces the
watcher. Linux disables edges, drains a bounded old queue, then enables the new
configuration and kernel debounce; unsupported debounce is an error. Edges carry
kernel monotonic `timestampMs`, the event's level, and `sequence` (gaps reveal
loss). Times are not wall-clock dates and need not share `performance.now()`'s
origin. At most 64 edges per pin are polled every 2 ms; overflow can lose events.
The simulator delivers edges as microtasks without a persistent polling timer,
with software debounce and a 64-event queue. ESP-IDF captures timestamps in an
ISR and uses a bounded FreeRTOS queue plus software edge filtering/debounce;
open-source drive is unsupported. Calls run in a normal FreeRTOS task, not an ISR
or an IPC callback. Interrupt teardown disables the pin, waits for
ESP IPC barriers on each CPU, then removes the handler before deleting/reusing
its queue; unavailable IPC on a multicore build reports failure and retains ownership. A partial ESP reconfiguration failure marks
the line failed: release it before reopening.

`unwatch(pin)` stops callbacks while retaining ownership; `release(pin)` stops
callbacks and releases the request. Both are idempotent. Queued callbacks and
old native poll generations cannot act after replacement/release. Release does
**not** promise an output-low electrical state. Explicit release before VM
teardown/reload is required: the native ABI's factory/static caches and allocator
state do not yet prove whole-VM concurrent ownership or automatic reload cleanup
(D316). Per-module calls and simulated state are mutex-protected; no VM code
runs in an interrupt or worker thread.

The exact T0 `tests/run --only gpio` exercises software simulation, stale
generations and Linux UAPI structures using intercepted system calls. It opens
no hardware and is **not** the kernel gpio-sim integration test. Linux ARM native
object cross-compilation is a compile proof, not execution. Real kernel gpio-sim,
Pi jumpers, CHIP controllers and ESP hardware/full firmware compilation remain
separate checks. The shared header compiles with installed ESP-IDF 6.1 headers
and Xtensa GCC 15.2 using an isolated default ESP32 configuration; this does not
prove interrupt behavior. GPIO0–39 board reservations belong to the selected ESP board,
not this generic header.

References: [kernel v2 GPIO ABI](https://www.kernel.org/doc/html/latest/userspace-api/gpio/chardev.html),
[configuration](https://www.kernel.org/doc/html/latest/userspace-api/gpio/gpio-v2-line-set-config-ioctl.html),
[edge events](https://www.kernel.org/doc/html/latest/userspace-api/gpio/gpio-v2-line-event-read.html),
[gpio-sim](https://www.kernel.org/doc/html/latest/admin-guide/gpio/gpio-sim.html),
[CHIP pin/controller evidence](hardware/ntc-chip.md),
[libgpiod licence](https://kernel.googlesource.com/pub/scm/libs/libgpiod/libgpiod/+/8da049f2d7eacac5a290af27a90a871685b35ee4/COPYING).
libgpiod is an independent testing oracle only: its LGPL implementation is neither
copied nor linked, and its v1/v2 distro ABI split adds no Zinc dependency.
