# osc plugin (`zinc:osc/full`)

Open Sound Control is how stage, installation and music software talk to each other over a network: TouchOSC and other
phone surfaces, Chataigne, QLab, Pure Data, Max, SuperCollider, Ableton Live, lighting desks. This plugin is the whole
of OSC 1.0 over UDP.

- **No native code.** It is written in Zinc on [`zinc:socket`](socket.md): `plugins/osc/index.ts`. It runs wherever the
  socket plugin does and adds nothing to a program that does not import it.
- **Two modules, one protocol.** The engine's built-in `zinc:osc` is the short form: `send(host, port, address, numbers,
  strings)` and one `listen(port, cb)`. Import `zinc:osc/full` when you need blobs, time tags, bundles, the type of each
  argument, address patterns, several endpoints, or a port chosen by the system. Both speak to the same software.
- **Test.** `tests/t1/osc_full.sh` (`tests/data/osc/`). **Example.** `examples/osc`.

| target | status |
|---|---|
| macos | supported, verified on x86_64 (interpreter and compiled) |
| linux, rpi1, rmpp | in the manifest (the targets of `zinc:socket`), not run yet |
| QuickJS engine (`--engine quickjs`) | not yet: `zinc:socket` does not load there |

```ts
import { open, Message, Bundle, timeTag } from 'zinc:osc/full';

let level = 0;
async function main(): Promise<void> {
  const osc = await open(9000);                     // receive on UDP 9000 (open() alone: any free port, enough to send)

  osc.on('/fader/1', (m) => { level = m.args[0].num; });
  osc.on('/pad/*', (m) => console.log(m.address, m.args.length, 'from', m.from));

  osc.send('192.168.1.20', 8000, new Message('/cue/go').int(12).string('blackout'));
  osc.sendBundle('192.168.1.20', 8000, new Bundle(timeTag(Date.now() + 500))        // both at once, in half a second
    .add(new Message('/light/1/level').float(1))
    .add(new Message('/light/2/level').float(0)));
}
main();
```

Try it without any other software: `OSC_DEMO=1 zinc run examples/osc` (a square that goes where `/shape/xy x y` sends
it; without `OSC_DEMO` it waits for messages on UDP 9000).

## API

| API | |
|---|---|
| `open(port = 0, host = ''): Promise<Osc>` | An endpoint bound to `port` (0: a free port the system picks) on `host` (`''`: every interface, `'127.0.0.1'`: this machine only). Rejects when the port is taken. |
| `osc.port` | The port it is bound to. |
| `osc.on(address, cb)` | Calls `cb(message)` for each received message that fits `address`. Either side may be a pattern (see below). Several handlers may fit one message. |
| `osc.onAny(cb)` | Every received message. |
| `osc.send(host, port, message): boolean` | One message in one datagram. False when it could not be sent (closed endpoint, unknown host, over the 64 KiB of UDP). |
| `osc.sendBundle(host, port, bundle): boolean` | A bundle in one datagram. |
| `osc.close()` | Closes the socket; a program with no open endpoint (and nothing else to wait for) ends. |
| `new Message(address)` | Then one call per argument, in order: `.int(v)`, `.float(v)`, `.double(v)`, `.string(v)`, `.blob(bytes)`, `.timeTag(t)`, `.bool(v)`, `.nil()`. |
| `message.address`, `message.args` | The address and the arguments (`Arg[]`). |
| `message.time`, `message.from`, `message.port` | On a received message: the time tag of its bundle (`null` outside a bundle) and the sender. |
| `arg.type` | The OSC type tag: `'i'`, `'f'`, `'d'`, `'s'`, `'b'`, `'t'`, `'T'`, `'F'`, `'N'`. |
| `arg.num`, `arg.text`, `arg.bytes`, `arg.time` | The value: `num` for `i`, `f`, `d` (and 1 or 0 for `T` and `F`), `text` for `s`, `bytes` for `b`, `time` for `t`. |
| `new Bundle(time = now)` | `.add(message)`, `.addBundle(bundle)`. |
| `new TimeTag(seconds, fraction)` | NTP time: seconds since 1900 and 1/2^32 of a second. `new TimeTag()` is "now" (`immediate` is true). `.unixMs`: the same instant as `Date.now()` counts. |
| `timeTag(unixMs): TimeTag` | The tag of a `Date.now()` value. |
| `matches(pattern, address): boolean` | The pattern rules alone. |
| `encode(message)`, `encodeBundle(bundle)`, `decode(bytes): Message[]` | The bytes of a datagram, for another transport (a WebSocket, a serial line with SLIP). |

## Notes

- **Types.** Sent and received: `i` (32-bit integer), `f` (32-bit float: `.float(0.1)` holds 0.10000000149011612, what
  the receiver sees), `d` (double), `s`, `b`, `t`, `T`, `F`, `N`. Received only: `h` (64-bit integer, exact up to 2^53),
  `c`, `r` and `m` (their 32 bits in `num`), `S` (given as `s`), `I` (`num` is `Infinity`). A message with any other
  type is dropped: its size is unknown.
- **Patterns** (OSC 1.0): `?` one character, `*` any run of characters, `[abc]`, `[a-z]` and `[!a-z]` one character of a
  set, `{foo,bar}` one of the words. A pattern never crosses a `/`: `/light/*` fits `/light/3`, not `/light/3/level`.
  In OSC the sender writes the pattern (`/light/*/level` reaches every light); many programs also want a handler for a
  family of addresses. `on` accepts both: it runs when the message's address selects the handler's, or the handler's
  selects the message's.
- **Bundles.** A received bundle is delivered message by message, in order, the bundles inside it too (16 levels at
  most); each message carries the tag of its own bundle in `time`. The plugin does not wait for that time: a program
  that schedules compares `message.time.unixMs` with `Date.now()`.
- **What comes from the network is checked.** A truncated datagram, a blob or a bundle element longer than the
  datagram, an address that does not start with `/`: no message, no error.
- **UDP.** No connection and no delivery guarantee: a message to a machine that does not listen is lost in silence, and
  datagrams may arrive out of order. Keep a datagram under about 1400 bytes to cross a network unfragmented.
- **Permissions.** As `zinc:socket`: `net` (see `docs/guide/08-security.md`).
