# SPI

`zinc:spi` lists Linux `/dev/spidev*` paths without contacting peripherals.
Open an explicit path, speed in Hz and SPI mode (0 through 3):

```ts
import { open } from 'zinc:spi';
const device = open('/dev/spidev0.0', 1000000, 0);
try {
  const received = device.transfer([0x9f, 0, 0, 0]);
  console.log(received);
} finally { device.close(); }
```

`open(path, hz = 1000000, mode = 0)` sets a positive speed and mode.
`write(bytes)` sends bytes; `transfer(bytes)` sends and receives the same
number of bytes in **one full-duplex chip-select segment**, using
`SPI_IOC_MESSAGE(1)`. Transfers contain 1 through 65535 bytes; the kernel or
controller can impose a smaller limit. Failures throw. Opening/configuring
spidev does not prove that a peripheral is connected or responds correctly.
Calls are synchronous, so keep them out of a rendering callback. Each transfer
uses the handle's requested speed, restores its mode and explicitly uses 8-bit
words. Linux shares device configuration across opens; another process using
the same node can still race a mode change. Reserve the peripheral for your app.

Eight independent devices may be open. `close()` is idempotent, and an old
object cannot operate a newly opened slot. Native simulation uses explicit
`open('sim')`, a byte-for-byte full-duplex loopback; it makes no claim about
a physical peripheral. Use `ZINC_NATIVE=real` to load it. Existing write-only
chip models cannot silently simulate full-duplex responses.

On a Pi, a real loopback check requires a MOSI-to-MISO jumper and an enabled,
otherwise unused spidev controller. Do not short power pins or take a device
from its existing driver. Hardware setup and a physical loopback are separate
from the in-process simulation.

CHIP SPI2 needs the image's SPI2 device-tree overlay and conflicts with the
CSI pins. Enabling it can disable the camera. Kernel bindings and images vary;
inspect the installed overlay and enumerate paths after an owner-prepared
setup. `/dev/spidev2.0` is not guaranteed to exist. Zinc does not install or
apply overlays. PWM0 (`/sys/class/pwm`) and UART configuration are outside these
bus modules; `zinc:serial` is unchanged.

References: [Linux spidev](https://docs.kernel.org/spi/spidev.html),
[CHIP DIP pin map](https://docs.getchip.cc/dip).

Close devices explicitly in `finally`: automatic cleanup of unclosed devices
on an in-process VM reload is not currently provided. Unclosed handles can
survive a reload until the process exits.
