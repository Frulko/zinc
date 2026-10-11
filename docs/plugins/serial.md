# serial plugin (`zinc:serial`)

This plugin talks to a board over a serial port: an Arduino that prints sensor values, an ESP32, a micro:bit, a GPS, a
DMX or MIDI adapter, anything behind a USB serial cable.

- **Native.** POSIX termios, one file: `plugins/serial/native/serial.host.cpp` (macOS and Linux). No library: libserialport is
  LGPL, wjwwood/serial has had no release for years, and what is needed here is a dozen system calls. Windows will be a second file behind the same interface (`native/serial.spec.ts`).
- **Nothing waits.** Reading and writing never block the program: the plugin looks at the open ports every 5 ms and
  calls your handlers; what a port does not take at once is queued and sent as it drains.
- **No board.** A deterministic run, `ZINC_NATIVE=sim`, or a machine that cannot build the native code gets the
  stand-in `native/serial.sim.ts`: one port, `'loopback'`, that gives back what is written to it.
- **Test.** `next/tests/t1/serial.sh` (a pseudo-terminal plays the board; `next/tests/data/serial/`).
  **Example.** `examples/serial` plots the values a board prints.

| target | status |
|---|---|
| macos | supported, verified on x86_64 against a pseudo-terminal; no board was attached for the test |
| linux | in the manifest, not built or run yet |
| windows | not yet |
| anywhere else, and where the native code cannot be built | the stand-in: the `'loopback'` port only |

```ts
import { list, open } from 'zinc:serial';

console.log(list());                                  // ['/dev/cu.Bluetooth-Incoming-Port', '/dev/cu.usbmodem14101']
const board = open('/dev/cu.usbmodem14101', 9600);    // as Serial.begin(9600) on the board

board.onLine((line) => { console.log('the board says', line); });     // what Serial.println sends
board.onClose((unplugged) => { if (unplugged) console.log('the board was unplugged'); });
board.write('led on\n');
```

## API

| API | |
|---|---|
| `list(): string[]` | The ports present now, as paths for `open`. macOS: `/dev/cu.*` (a board is `cu.usbmodem...` or `cu.usbserial...`); Linux: `/dev/ttyACM*`, `/dev/ttyUSB*`, `/dev/ttyAMA*`, `/dev/ttyS*`, `/dev/rfcomm*`. Call it again to see a board that was just plugged in. |
| `open(path, baud = 9600, framing = '8N1'): SerialPort` | Opens the port. `framing`: data bits (5 to 8), parity (`N` none, `E` even, `O` odd), stop bits (1 or 2), as on a datasheet. Throws an `Error` that names the port and the reason. |
| `port.onLine(cb)` | Each complete line of text (UTF-8), without its `\n` or `\r\n`. |
| `port.onData(cb)` | Each chunk of bytes as it arrives. A chunk is what was there at that moment, not a message. |
| `port.onClose(cb)` | Once: `cb(true)` when the device went away, `cb(false)` after `close()`. |
| `port.write(text): boolean` | Sends text. No line end is added: `write('on\n')`. False when the port is closed or gone, or when 1 MiB already waits. |
| `port.writeBytes(bytes): boolean` | Sends bytes. |
| `port.pending` | Bytes written that the port has not taken yet. |
| `port.setSignals(dtr, rts): boolean` | The DTR and RTS lines. False where the port has none. |
| `port.isOpen`, `port.path`, `port.baud` | |
| `port.close()` | Closes the port. A program with no open port (and nothing else to wait for) ends. |

## Notes

- **Baud rates.** 300 to 230400 everywhere, 460800 and 921600 where the system has them. macOS also takes any other
  rate the adapter accepts (250000 for DMX and 3D printers, 31250 for MIDI); Linux does not yet. Both ends must use the
  same rate: wrong characters on a line usually mean a wrong rate.
- **The port is raw.** Every byte goes through unchanged, both ways: no echo, no flow control, no translation of line
  ends.
- **Opening an Arduino restarts it.** Most boards reset when the port opens (DTR), and their bootloader takes one or
  two seconds: wait for the board's first line before writing, or have the sketch print `ready` in `setup()`.
  `setSignals(false, false)` then `setSignals(true, true)` restarts a board from the program.
- **One reader per port.** Close the Arduino IDE's serial monitor first: with two readers each gets a part of the
  bytes. The plugin asks for the port alone, so a second program that opens it afterwards is told it is busy.
- **Permission denied on Linux.** The user must be in the group of the device (`dialout` on Debian and Ubuntu, `uucp`
  on Arch): `sudo usermod -a -G dialout $USER`, then log in again.
- **Lines.** `onLine` keeps what arrived until its line end comes; a line longer than 64 KiB is given in pieces. Use `onData`
  for binary protocols.
- **Unplugging** gives `onClose(true)` at the next look at the port, and the port object is then closed (proven with a
  pseudo-terminal whose other end closes; a USB adapter pulled out was not tried yet).
  Plugging the board back gives a new device: call `list()` and `open` again, as `examples/serial` does every second.
- **Sizes.** 32 ports open at once.
