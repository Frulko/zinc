# ble plugin (`zinc:ble`)

This plugin lets two Zinc programs talk over Bluetooth Low Energy: a Mac finds an ESP32 nearby, connects to it, and
both send each other lines of text. It uses the Nordic UART Service (NUS), the de facto "serial port over BLE" that
phone apps such as nRF Connect and Bluefruit Connect also speak.

- **Roles.** The Mac is the *central*: it scans and connects. The ESP32 is the *peripheral*: it advertises and waits
  (its engine implements this same module in its firmware). The API is callbacks only, because the ESP32 engine has no
  promises.
- **Native.** CoreBluetooth on macOS, one file: `plugins/ble/native/ble.macos.mm` (a `CBCentralManager` on a dispatch
  queue of its own). No library: SimpleBLE is under the Business Source License, and what is needed is the system API.
- **Nothing waits.** The plugin looks at the radio every 10 ms while a scan or a link is going on, and calls your
  handlers on the program's thread. A program with no scan and no link left ends.
- **No radio.** `ZINC_NATIVE=sim` (or `ZINC_BLE_SIM=1`, or a deterministic run) replaces the radio with a simulated
  one: one peripheral, `Zinc sim`, that sends back every message it gets, the same on every engine.
- **Test.** `tests/t1/ble.sh` (the simulated radio only). **Example.** `examples/esp32-ble/mac`.

| target | status |
|---|---|
| macos | central: scan, connect, send, receive; built and run on x86_64 against the simulated radio; not yet run against a real ESP32 |
| macos, `advertise()` | not on this target: it throws (a Mac would need `CBPeripheralManager`) |
| esp32 | peripheral, in the firmware of the ESP32 engine (`firmware/esp32-mquickjs`) |
| linux, windows, anywhere else | `state()` is `'unsupported'`; the simulated radio when asked for |

```ts
import * as ble from 'zinc:ble';

if (ble.state() !== '') console.log('no Bluetooth:', ble.state());
ble.scan((d: ble.Device) => {
  if (!d.name.startsWith('Zinc')) return;
  ble.stopScan();
  ble.connect(d.id,
    (link: ble.Link) => link.send('hello'),                                   // the link is ready
    (link: ble.Link, text: string) => console.log(link.name, 'says', text),   // one call per message
    (link: ble.Link) => console.log(link.name, 'is gone'));                   // once, also when connecting failed
}, 10);                                                                       // seconds; 0 = until stopScan()
```

## API

| API | |
|---|---|
| `UART_SERVICE` | `'6e400001-b5a3-f393-e0a9-e50e24dcca9e'`. RX `6e400002-...` is written by the central, TX `6e400003-...` is notified by the peripheral. |
| `state(): string` | `''` when Bluetooth can be used, else why: `'off'`, `'unauthorized'`, `'unsupported'`, `'resetting'` (not ready yet, try again in a moment). |
| `scan(onDevice, seconds)` | Reports the devices that advertise the UART service, each once per scan, as `Device { id, name, rssi }`. `seconds` 0 scans until `stopScan()`. Throws an `Error` that says what to do when Bluetooth is off or not allowed. A new scan replaces the one going on. |
| `stopScan()` | |
| `connect(id, onOpen, onMessage, onClose)` | Connects to a scanned device. `onOpen(link)` when the UART characteristics are ready, `onMessage(link, text)` for each message, `onClose(link)` once: after `close()`, when the device goes away or Bluetooth is turned off, and when the connection fails or takes more than 10 seconds (then without `onOpen`). |
| `advertise(name, onOpen, onMessage, onClose)` | Peripheral: advertise `name` with the UART service; each central that connects is a `Link`. On macOS it throws. |
| `link.send(text)` | Sends one message. Throws when the link is not open, or when 1 MiB already waits to go out. |
| `link.close()` | Ends the link; `onClose` runs at once. |
| `link.id`, `link.name` | The peer. |
| `stop()` | Ends scanning, advertising and every link (their `onClose` run). |

`Device.id` is what macOS calls the device: a UUID that stays the same on this Mac, not the Bluetooth address (macOS
never shows it). `rssi` is in dBm: -30 is next to the Mac, -90 is at the edge of range; 127 when not measured.

## Messages on the wire

Both sides frame text the same way, so any program that follows it can join (a phone app in UART mode, a sketch on
another board):

- A message is UTF-8 text without `'\n'`. The sender writes it followed by `'\n'`, cut into chunks of the link's
  largest write (20 bytes before the MTU exchange, up to 512 after it; the Mac reads it from CoreBluetooth). It writes
  without response when RX allows it, else with response, one chunk at a time.
- The receiver keeps the bytes until `'\n'`, then decodes the message. A chunk can cut a character in two; nothing is
  lost, the message is decoded whole.
- **A text that holds `'\n'` arrives as several messages**, one per line. Send JSON (which escapes `'\n'`) when a value
  can hold one.
- A message longer than 64 KiB without `'\n'` is given in pieces of 64 KiB. Bluetooth Low Energy carries a few
  kilobytes per second: it is made for commands and readings, not files.
- There is no pairing and no encryption: any device in range that speaks the UART service can connect and read what
  is sent. Do not send secrets.

## Permission on macOS

macOS asks the person once whether a program may use Bluetooth, and remembers the answer in System Settings > Privacy &
Security > Bluetooth. It asks for the *responsible* app: the app you opened, or, for `zinc run` in a terminal, the
terminal app.

- **The app must declare why it uses Bluetooth** (`NSBluetoothAlwaysUsageDescription` in its Info.plist). An app
  without it is not asked: macOS ends the program (a crash, SIGABRT). iTerm2 and Ghostty declare it; Terminal.app does
  not (macOS 15). So the plugin only lets macOS ask when the responsible app declares it; otherwise `state()` is
  `'unauthorized'` and the radio is never touched. `ZINC_BLE_ASK=1` lets macOS ask anyway (in Terminal.app, if it
  ends the program, use iTerm2 or Ghostty); `ZINC_BLE_ASK=0` never asks.
- **An exported app** declares it when `zinc.json` has `"permissions": ["bluetooth"]`: `zinc export --target macos`
  writes `NSBluetoothAlwaysUsageDescription` (the text of `"permissionStrings": {"bluetooth": "..."}`, default
  "<App> talks to Bluetooth devices.") and the entitlement `com.apple.security.device.bluetooth`; iOS gets the same key.
  The app asks for itself when it is opened from the Finder.
- While the question is on screen `state()` is `'unauthorized'`; once the person allows it, the next `state()` or
  `scan()` works. Turning Bluetooth off makes it `'off'` (no system alert is shown: the program tells the person).
- **Tests and agents never use the real radio.** A host app without the usage text gets its program killed, and a
  question with nobody to answer it waits forever: tests run with `ZINC_NATIVE=sim` or `ZINC_BLE_SIM=1`.

## Notes

- **Scanning finds Zinc devices only**: devices that advertise the UART service. An ESP32 puts the service in its
  advertisement and its name in the scan response; a nameless device is reported after a few sightings, in case its
  name comes late.
- **One link per device.** Connecting to a device that is already linked fails (`onClose` without `onOpen`).
- **Speed.** A Mac picks a connection interval of 15 to 30 ms: expect a few kilobytes per second and a few tens of
  milliseconds per message. Measured numbers will go in `docs/reports/zinc-next-perf.md` once a real pair has run.
