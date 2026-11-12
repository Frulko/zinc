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
| linux | experimental BlueZ discovery, power requests and NUS central; injected protocol/native ABI proof only, no real-radio run. Generic GATT read/write/notify and an exported UART peripheral are implemented; Linux runtime interoperability remains unproven. |
| windows, anywhere else | `state()` is `'unsupported'`; the simulated radio when asked for |

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
| `link.send(text)` | Sends one message. Throws when the link is not open or its bounded outgoing queue is full. |
| `link.close()` | Ends the link; `onClose` runs at once. |
| `link.id`, `link.name` | The peer. |
| `stop()` | Ends scanning, advertising and every link (their `onClose` run). |

`Device.id` is what macOS calls the device: a UUID that stays the same on this Mac, not the Bluetooth address (macOS
never shows it). `rssi` is in dBm: -30 is next to the Mac, -90 is at the edge of range; 127 when not measured.

## Generic GATT central (Linux)

`connectGatt(id, onOpen, onClose)` returns a `GattConnection` immediately, so `close()` can cancel a pending connection.
Use an id from `scanAll()`; `onOpen(connection)` waits for the discovered device's `Connected` and `ServicesResolved`.
It does not require the UART service. Real macOS generic GATT is explicitly unsupported; its UART API above is unchanged.
The explicit simulator offers one battery-style service/characteristic with binary read/write/notify on all engines.

- `connection.services()` returns the discovered `GattService { id, uuid, characteristics }` snapshot. Each
  `GattCharacteristic` has `id`, `service`, `uuid` and `flags`; duplicate UUIDs are distinct identities. Pass the
  characteristic object to operations, rather than a guessed path or UUID. Ids belong to this connection only.
- `read(characteristic, (bytes, error) => ...)` returns a request id. A successful read returns up to 512 bytes and
  an empty error; a failure returns an empty array and the sanitized error name/reason.
- `write(characteristic, bytes, error => ..., withoutResponse = false)` sends one operation through BlueZ. A request
  accepts at most 512 bytes; BlueZ may use its long procedure when supported, or report an error. A command is limited
  to 20 bytes until negotiated MTU support is exposed. Zinc does not truncate, split or retry a generic write. A command's
  successful callback means the daemon accepted it, not that the peer acknowledged it.
- `notify(characteristic, bytes => ..., error => ...)` starts one subscription. Binary values received while its
  acknowledgement is pending are buffered (at most 64 values/16 KiB), then delivered only after success. Failure or
  cancellation drops them. `stopNotify(characteristic, error => ...)` stops that session; values can arrive until its
  acknowledgement. Values reflect BlueZ's cached `Value` updates, including a successful read.
- `cancel(requestId)` removes the callback and cancels local queued work. An operation already sent is not rolled back:
  in particular a write may still change the peer and a sent `stopNotify` may still stop notifications. A cancelled
  in-flight successful `StartNotify` is followed by cleanup `StopNotify` without delivering its buffered values.
- `close()` ends this connection and calls `onClose(connection, error)` once. An explicit close has an empty error;
  remote failures carry a reason. Pending operation callbacks are discarded on close. `ble.stop()` also closes GATT
  connections. Callbacks may close or stop BLE without receiving further predecessor events.

The backend serializes at most 32 queued operations per connection and keeps at most 16 connections, 256 discovered
objects and a 64 KiB public tree/event budget; new connections also stop at 512 queued records. The simulator also caps its shared pending queue at 32. If a service or
characteristic identity, parent, flags, topology or `ServicesResolved` changes, the connection closes and its attribute
ids expire; reconnect to obtain a fresh snapshot. Notification/output overflow closes affected generic connections,
never grows the queue indefinitely. Explicit `close()`/`stop()` is required. Closing waits for our in-flight
subscription acknowledgement and releases acknowledged subscriptions before its best-effort disconnect. Cleanup has
a 30-second overall budget instead of accumulating one timeout per characteristic; a pending `StartNotify` keeps its
own finite reply lifetime. A failed/timed-out cleanup is reported by `ble.error()` and does not establish that the
daemon released a shared physical connection or every session. Native polling finishes ordinary cleanup after the
public timer stops; static teardown/reload after polling ceases remains unproven.

BlueZ's `Device1` connection is shared with other clients. Zinc refuses a device already observed connected, but cannot
make a raced physical connection private or guarantee cancellation after a daemon timeout. No automatic pairing/trust,
blind retry or foreign-profile cleanup is performed. Native factory/VM reload and concurrent-VM limitations remain as
described below. No real-radio or prepared `btvirt` run is claimed by the injected protocol and simulator proofs.

See the [BlueZ characteristic API](https://github.com/bluez/bluez/blob/master/doc/org.bluez.GattCharacteristic.rst)
for daemon errors and long read/write procedures. The Linux UART peripheral below uses a separate exported GATT application.

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


## Experimental Linux BlueZ backend

Linux loads the OS `libsystemd.so.0` at run time and uses the existing system BlueZ daemon. Declare `"permissions": ["bluetooth"]`; permission denial occurs before any bus call. No daemon, policy rule or adapter power change is installed automatically. `has()` reports an observed adapter, and is also false while asynchronous enumeration is pending; `state()` distinguishes an off adapter from an unavailable backend. `powered(on)` makes an explicit adapter request. Its return means queued, so observe `state()` and `error()` for the result. Hardware power is shared system state. These new power methods return false on macOS and in the simulator.

`scanAll(onAdvertisement, seconds, uuids = [])` discovers LE devices with an optional list of canonical lowercase service UUIDs. Unlike UART `scan()`, it reports updates. Each `Advertisement` contains `id`, lossless decoded `name`, `rssi` (127 when unavailable), `uuids`, `manufacturerData` (`company`, byte `data`), `serviceData` (`uuid`, byte `data`) and `advertisingData` (`type`, byte `data`). The last field contains BlueZ's optional `AdvertisingData` AD structures; it is empty when the daemon does not expose them. These are the bytes BlueZ supplies, not a reconstruction of an HCI packet. Discovery filters are also applied locally because BlueZ merges filters from other clients. `stopScan()` releases this client's discovery session.

Device ids are opaque, scoped to the live backend observation, and expire when BlueZ removes the object or the backend restarts. Never construct an id from a MAC address. An old id cannot address a newly discovered device. Incoming names and data cannot inject native event separators. Enumerations, deferred signals, property caches, event queues, links and byte queues have limits.

The legacy UART central waits for `ServicesResolved`, actual writable RX/notifying TX characteristics and the `StartNotify` reply before `onOpen`. Writes are serialized, use conservative 20-byte ATT chunks and are never retried blindly. Characteristic identity/flags or ServicesResolved invalidation closes the link. Failed Connect requests never issue Disconnect; a cancelled pending request waits for its own reply before disconnecting an acknowledged connection. The existing native Poller bounds ordinary post-stop cleanup while the VM still polls.

BlueZ `Device1` connections are shared system objects: there is no client-bound connection lease. This backend refuses an already observed connected device, but another client can race or share a connection afterward. A daemon operation that completes after a timeout cannot be proven owned or cancelled. Explicit `stop()`/`link.close()` is required; native VM shutdown/reload and concurrent VM ownership remain unproven (D316). No automatic Pair/Trust or authorization bypass is performed.

ZN-558 remains an incomplete software checkpoint: the nmcli connection fallback, static NimBLE/HCI and CHIP backend work are still open. No hwsim/btvirt/CI VM, real Pi peripheral or no-radio-board acceptance criterion has been proven.

## Experimental Linux UART peripheral

`advertise(name, onOpen, onMessage, onClose)` accepts an asynchronous registration request. It exports a fixed Nordic UART GATT application and registers the LE advertisement only after BlueZ acknowledges the application. A powered adapter must expose GATT and LE advertising managers; Zinc does not power it automatically. Names are nonempty, at most 128 UTF-8 bytes; the controller can reject shorter names when its advertising packet is full. A second active request throws. Registration failure or BlueZ owner loss ends advertising, closes its incoming links and stops its public timer when nothing else is active. `error()` retains the sanitized reason. Restart explicitly after failure.

An incoming link opens only after BlueZ acquires its notification socket with `AcquireNotify`. Each device gets its own nonblocking Unix seqpacket socket and monotonic link identity. `link.send()` targets that socket; ordinary shared `Value` notifications and identity-free `StartNotify` are refused. Peers on BlueZ versions without server acquisition support cannot open a link. RX writes require a matching acquired device on the selected adapter, the negotiated MTU and supported ordinary write options; prepared/reliable writes are rejected. New or changed device objects temporarily fence incoming operations until the subscribed cache refreshes. No Device1 connection, pairing, trust or disconnect is used to own incoming UART peers.

There are at most 16 incoming links, 128 queued chunks per link, 64 KiB incoming bytes per link, and 512 admitted event records/32 KiB before new acquisitions stop (terminal records have reserved headroom). Outgoing chunks remain 20 bytes. Socket HUP/error closes only that peer. Explicit `stop()` unregisters advertisement then application with a three-second total cleanup budget; cancellation during registration, failure, Release or deadline closes the dedicated peripheral bus, so BlueZ can release its connection-bound registrations. Central connections use another bus. This relies on BlueZ's disconnect cleanup; it does not prove controller cleanup after a daemon failure.

The exact callback tests use an injected sd-bus API and real owned packet socketpairs. macOS lacks Unix seqpacket: its fixture uses a datagram-only test seam and proves targeting, packet boundaries, bounded backpressure, explicit-close isolation and fd cleanup. Production Linux C++17 is compiled to an object; Linux seqpacket/HUP, actual registration and ATT interoperability have not run. Native factory/concurrent-VM/reload/post-polling limits (D316) still apply; always close or stop explicitly.
