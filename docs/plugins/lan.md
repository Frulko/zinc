# lan plugin (`zinc:lan`)

The local network for games and devices: UDP datagrams (broadcast included, so programs find each other without anyone typing an
address) and TCP streams. You poll it once a frame. Nothing blocks and nothing calls you back, so the same calls work on a desktop and in
the console cores, where no event loop calls a program back.

Targets: macOS, Linux, and the PSP, PS Vita and 3DS cores. Engines: the native engine, the interpreter, the console cores.
`zinc:socket` remains the event-driven API on the desktop (promises, WebSocket, TLS, Unix sockets).

```ts
import * as lan from 'zinc:lan';

// each frame until it answers 1: a PSP joins its first network setting, a Vita and a 3DS the Wi-Fi their system knows
if (lan.up() === 1) console.log(`I am ${lan.address()}`);       // -1: no network, lan.error() says why

const sock = lan.udp(47800);                                    // 0: any free port; broadcasts allowed
sock.send(lan.broadcastAddress(), 47800, 'who hosts?');         // a.b.c.255 of a home LAN; '255.255.255.255' works too
for (let d = sock.receive(); d !== null; d = sock.receive())   // what arrived since the last frame, one datagram per call
  console.log(`${d.address}:${d.port} says ${d.text}`);

const srv = lan.listen(7000);                                   // TCP
const peer = srv.accept();                                      // null when nobody is waiting
const c = lan.connect('192.168.1.20', 7000);                    // c.state(): CONNECTING, OPEN, CLOSED
c.write('hello');                                               // bytes taken (0 while connecting)
const text = c.read();                                          // '' when nothing arrived
```

Addresses are dotted IPv4 (`localhost` too; a desktop also resolves host names). Payloads are text, and a datagram must fit in one
packet (1400 bytes is safe). `udp()`, `listen()` and `connect()` throw `zinc:lan: <reason>` when the port or the address cannot be used.

## On the consoles

`plugins/lan/native/lan.abi.cpp` is one file on the native ABI: it is the plugin's library on the computer and it is linked into the
console cores. Each console brings its network up in `targets/<console>/net_<console>.cpp`, behind `targets/console/console_net.h`:

| Console | `up()` | Then |
|---|---|---|
| PSP | loads the net modules, `sceNetInit`, `sceNetInetInit`, `sceNetApctlInit`, joins network setting 1 (Settings > Network Settings); 20 s at most | newlib's sockets over sceNetInet |
| PS Vita | the NET module, `sceNetInit`, `sceNetCtlInit`, waits for the Wi-Fi the system joins | newlib's sockets over SceNet |
| 3DS | `socInit` with a 1 MiB page-aligned buffer, `acInit`, waits for the Wi-Fi; `socExit` when the app ends | libctru's sockets (soc:u) |

In the emulators: PPSSPP (headless included) answers the Wi-Fi join with the Mac's address and maps the sockets to the Mac's, so a PSP
build reaches a server on the Mac at `127.0.0.1`. Azahar and Vita3K do the same with theirs. All three were tested with a UDP echo on the
Mac (ZN-791). A broadcast from an emulator goes out on the Mac's network.

`examples/lan-arena` is a multiplayer game built on it.
