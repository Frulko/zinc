# I2C

`zinc:i2c` lists Linux `/dev/i2c-*` adapters without opening them. Use an
explicit path and a non-reserved 7-bit address (0x08 through 0x77):

```ts
import { list, open } from 'zinc:i2c';
console.log(list());
const sensor = open('/dev/i2c-1', 0x6b);
try {
  const id = sensor.readRegister(0, 1);
  sensor.write([2, 64]);
  console.log(id[0]);
} finally { sensor.close(); }
```

`write(bytes)` sends one transaction, including any register/control byte.
`readRegister(register, count)` writes one register byte and reads `count`
bytes with a repeated start. Both throw on failure; transfers have 1 through
65535 bytes, and register numbers are 0 through 255. A closed object stays
closed even after another device opens. `close()` is idempotent. Eight devices
may be open simultaneously. Calls are synchronous and may wait for the kernel's
adapter timeout; keep them out of a rendering callback.

Linux queries `I2C_FUNCS` before using an adapter. Full I2C adapters use
`I2C_RDWR` for register reads. SMBus-only adapters use byte-data or fixed-length
I2C-block transactions only when the adapter advertises that exact operation.
The block payload limit is 32 bytes; unsupported shapes fail. SMBus variable
length block transactions add a wire length byte and are never substituted.
A failed transaction is never retried through another protocol.

`scan(path, policy)` requires either `'quick-write'` (SMBus Quick write) or
`'receive-byte'` (SMBus Receive Byte). **Neither policy is universally safe.**
Quick writes can corrupt EEPROMs, and receive-byte probes can lock write-only
chips or consume data. Check every attached device's datasheet before scanning.
Reserved addresses are skipped; addresses owned by a kernel driver are skipped
without forcing access. Listing paths is the safe way to discover adapters.
No scan runs implicitly during enumeration or open. Opening a Linux device
selects its address; it does not prove that a peripheral responds.

For a hardware-free native run, `open('sim', 0x6b)` uses Zinc's existing
QMI8658 chip model. `scan('sim', 'receive-byte')` reports 0x6b without hardware
I/O. Use `ZINC_NATIVE=real` to load this native model; no physical adapter or
compiler stand-in is selected by the `sim` path.

## CHIP buses

| CHIP interface | Linux path or discovery | Constraint |
| --- | --- | --- |
| TWI2 (I2C) | `/dev/i2c-2` on the documented image | Shared with XIO at 0x38 |
| TWI1 (I2C) | Enumerate the installed image | Check pin ownership before use |
| SPI2 | Enumerate after an installed SPI2 overlay | Shares CSI pins; see [SPI](spi.md) |
| PWM0 | `/sys/class/pwm` | Outside these modules |
| UART | `zinc:serial` with an explicit port path | Existing serial API is unchanged |

CHIP's exposed TWI2 is `/dev/i2c-2`, shared with its XIO expander at 0x38;
leave that address alone. TWI1 also exists on the board, but its accessibility
and Linux numbering depend on the installed image: use `list()` and its pin
map, rather than assuming `/dev/i2c-1` is free. The CHIP-03 EEPROM and real
SMBus/i2c-stub proof require the corresponding board or an owner-prepared
Linux stub; this module never loads a kernel module.

References: [Linux i2c-dev](https://www.kernel.org/doc/html/latest/i2c/dev-interface.html),
[adapter capabilities](https://www.kernel.org/doc/html/latest/i2c/functionality.html),
[i2cdetect warnings](https://kernel.googlesource.com/pub/scm/utils/i2c-tools/i2c-tools/+/refs/tags/v4.3/tools/i2cdetect.8),
[CHIP pin map](https://docs.getchip.cc/chip).

Close devices explicitly in `finally`: automatic cleanup of unclosed devices
on an in-process VM reload is not currently provided. Unclosed handles can
survive a reload until the process exits.
