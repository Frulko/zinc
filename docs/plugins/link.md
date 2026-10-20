# link plugin (`zinc:link`)

Two Zinc programs find each other on the local network, pair once with a 6-digit code, then talk over an authenticated, encrypted
channel: JSON messages and bytes, both ways, reconnecting by itself while both stay paired. A phone remote, a game controller on a phone,
the Mac's notifications on a tablet ([the relay](../reports/notification-relay-design.md)), a dev link: the same need each time. The
protocol is [zinc agent](../reports/zinc-next-agent.md)'s, and so is the code: discovery is `src/net/dnssd.cpp` (DNS-SD over mDNS,
mjansson/mdns), the TLS sessions are `src/host/tls.cpp` (mbedTLS), the frames `src/net/frame.h`.

Targets: macOS, Linux, Android. Engines: the native engine (`zinc run`, `zinc build`) and the interpreter (`--interp`). The QuickJS engine
loads it, but its timers run on a virtual clock that does not wait, so a program there gives up before the network answers (`later.md`).

## The advertiser (the tablet)

```ts
import * as link from 'zinc:link';

link.init({ name: 'Nexus 7 · Musique' });                 // optional: the name shown on the other side (default: the app's name)
const port = link.advertise({ service: 'notify' });         // listens on 7744 (another free port when taken) and answers DNS-SD
link.onPaired((p: link.Peer) => assistant.done(p.name));    // a pairing succeeded
link.onPairing((s: string) => { if (s === 'closed') assistant.expired(); });   // 'try 1', 'try 2', 'closed', 'paired'
link.onConnection((ch: link.Channel) => {                   // each session a paired peer opens
  ch.onMessage((m: any) => { if (m.t === 'notif') show(m); });
  ch.onBytes((kind: i32, b: u8[]) => { /* an icon, a file... */ });
  ch.onClose((why: string) => console.log(`${ch.peer.name} left ${why}`));
  ch.send({ t: 'hello', app: 'music', v: 1 });
});

// the pairing assistant: the code and the addresses to type when the network blocks discovery
const code = link.openPairing();                            // 6 digits, five minutes, three tries, one peer
console.log(`code ${code} at ${link.addresses().join(' or ')}:${port}`);
```

## The side that browses (the Mac)

```ts
import * as link from 'zinc:link';

link.browse('notify', (p: link.Peer, present: boolean) => {   // as they appear, change (pairing open, address) and go
  if (present && p.paired) open(p);                            // known: connect with the stored key, no code
  else if (present && p.pairing) list.add(p);                  // shows a code: ask the user for it
  else if (!present) list.remove(p);
});

async function pairWith(p: link.Address, code: string): Promise<void> {   // a Peer of browse(), or { host, port } typed by the user
  try { open(await link.pair(p, code)); }
  catch (e) { say((e as Error).message); }                    // 'zinc:link: wrong code (the other side closes the pairing after three)'
}

function open(p: link.Peer): void {
  const ch = link.connect(p);                                 // reconnects by itself after a drop: 1 s, 2 s, 4 s... up to 30 s
  ch.onOpen(() => ch.send({ t: 'hello', app: 'notify-relay', v: 1, host: 'MacBook' }));   // after each (re)connection
  ch.onMessage((m: any) => { if (m.t === 'need-icon') sendIcon(ch, m.hash as string); });
  ch.onClose((why: string) => status(why === '' ? 'the tablet left' : why));
}

for (const p of link.peers()) open(p);                        // at start: every paired peer at its last address
```

`link.peers()` lists the paired peers from the store, with the address each was last reached at; `connect()` uses the address
discovery saw last when there is one, so a tablet that moved to another address is found again. `link.forget(id)` removes a peer and
closes its channels; a peer that forgot this program refuses its key, and its channel ends with `the peer does not accept this
program's key: pair again` (no more retries).

## API

| | |
|---|---|
| `init({ name?, store? }): string` | loads this program's identity and its peers (called by the first other call when not called); its id, 16 hex digits |
| `advertise({ service, name?, port? }): number` | a server on `port` (default 7744, any free port when taken and no port was asked) announced for `service`; the port. Throws when it cannot listen. `stopAdvertising()` |
| `browse(service, cb(peer, present))` | the programs that advertise `service`; asked every 4 s, gone after 12 s without an answer. `stopBrowsing()` |
| `openPairing(): string` / `closePairing()` | a 6-digit code (advertise first): five minutes, three tries, one peer; its TXT record says `pair=1` meanwhile |
| `onPairing(cb(state))` / `onPaired(cb(peer))` | the advertiser's pairing (`try 1`, `try 2`, `closed`, `paired`); a pairing that succeeded, on either side |
| `pair(to: Address, code): Promise<Peer>` | pairs with the program at `to.host:to.port`; rejects with the reason (wrong code, pairing closed, nothing answers) |
| `connect(peer): Channel` | a channel to a paired peer; throws when it is not paired |
| `onConnection(cb(channel))` | each channel a paired peer opens to this program |
| `peers(): Peer[]`, `forget(id): boolean`, `addresses(): string[]`, `id(): string` | the store; this machine's IPv4 addresses (for the "type this address" step) |
| `Channel` | `peer`, `connected`; `send(value)` (JSON), `sendBytes(kind 0..255, bytes)` (at most 1 MiB), both false while disconnected (nothing is queued); `onOpen`, `onMessage`, `onBytes`, `onClose(reason)`; `close()` |
| `Peer` | `id`, `name`, `host`, `port`, `service`, `pairing` (a code is open there), `paired` (this program holds its key) |

## Protocol and security

| Step | How |
|---|---|
| Discovery | DNS-SD `_zinclink._tcp`, instance `<name>-<id prefix>`, TXT `id`, `svc`, `name` (UTF-8), `pair` (1 while a code is open), `v`. A hint: who a peer is gets proven by its key |
| Connection | TCP; one line in clear, `ZNL1 pair` or `ZNL1 sess`, answered `ZNL1 ok` (or `ZNL1 closed` when no pairing is open, or after three tries); then TLS |
| Pairing | TLS 1.2 EC J-PAKE (`TLS-ECJPAKE-WITH-AES-128-CCM-8`) with the code as the password: a wrong code fails the handshake and leaves nothing to try codes against off line, so each connection is one guess; three tries (counted when they start), five minutes, one peer per code. Inside: the client's id and name (`Q`), the advertiser's id, name and a new 32-byte key (`A`) |
| Sessions | TLS 1.3 with the paired key (PSK, identity: the client's id) and an ephemeral ECDHE exchange: both ends prove the key, forward secrecy |
| Frames | 1 byte of type, 4 bytes of length (big endian, at most 1 MiB), the payload: `J` JSON, `B` bytes (first byte: the kind), `P` a ping every 15 s of silence; 45 s without a byte from the peer ends the session |
| Store | `$ZINC_HOME/link/<app name>.keys` (`~/.zinc` on a desktop, the app's files on Android), mode 0600, in a directory of mode 0700: `self <id>` and one `peer` line per key. `init({ store })` names another file |

No cryptography was written: TLS is the engine's mbedTLS, through `tls.cpp`, which the plugin compiles in under the namespace
`zn::linktls` (plugin.json `defines`): zinc does not export its C++ to a library it loads, and the copy must not collide with the
engine's where both are linked into one program (a `zinc build`, an Android app). Not covered: a machine whose files are read by someone
else (the keys are in clear in the store, as the agent's); an attacker on the network can make a pairing fail (three bad tries close
it) but not succeed.

Everything runs on the program's thread: the sockets are non-blocking and index.ts takes the native side's events on a 10 ms timer while
something is open (a server, a browse, a channel, a pairing), so mbedTLS (built without thread support, and used by `fetch` on the same
thread) is never entered from two threads.

## Android

The native code is the desktop's, compiled into the app (`zinc export --target android`). What Android adds, in plugin.json:

- the permissions `INTERNET` and `CHANGE_WIFI_MULTICAST_STATE`;
- a lifecycle class, `native/android/LinkLife.java`, that holds a `WifiManager.MulticastLock` while the activity is in front and releases
  it when it leaves: without one, the Wi-Fi stack may drop the multicast questions of the other side before they reach the program.

Why the lock and not `NsdManager` (decision, measured on the Nexus 7 2012, Android 7.1.2, 2026-10-17): with the lock, one implementation
answers on every system (the desktop's, tested on the loopback interface), where `NsdManager` would be a second one in Java with JNI
callbacks, and NSD on Android 7 resolves one service at a time (`FAILURE_ALREADY_ACTIVE`) and runs through the system's mdnsd. Measured:
the Mac found the tablet in 63 ms with the lock released (`ZINC_LINK_NO_LOCK=1` in `zinc.env`; `dumpsys wifi`: no lock held, screen on),
and with it held. The Nexus 7 filters multicast only with the screen off, when the app is paused anyway (SDL blocks its loop): the lock
is for the phones whose driver filters in power save with the screen on (Android's documentation says the stack filters by default).
Music's kiosk keeps its activity in front with the screen dimmed, so it stays discoverable.

## Proven

- `tests/t1/link.sh` (about 9 s, two programs on this Mac, `tests/data/link`): a wrong code refused at an address typed by hand and
  counted by the advertiser; the advertiser found over DNS-SD with its pairing open; the right code paired; JSON and bytes both ways;
  both restarted without a code (the stored keys); the advertiser restarted on another port under the open channel, which reconnects by
  itself, found again by discovery, and talks again; the key files mode 0600. The interpreter (advertiser) and the native engine
  (client) together paired and exchanged too.
- The Mac and the Nexus 7 2012 (Android 7.1.2, Wi-Fi, `tests/data/link/app` exported for armeabi-v7a), 2026-10-17: found by discovery
  (63 ms), a wrong code refused (`pairing try 1` on the tablet), paired with the right code (the EC J-PAKE handshake in about 0.4 s on the
  Tegra 3), JSON and bytes both ways; then the app restarted without a code: the Mac opened its session with the stored key, the app was
  restarted again under the open channel and the channel reconnected by itself in 4 s and talked again.

## Across networks (WebRTC): the plan

Not built yet. The data channel of [zinc:webrtc](webrtc.md) carries the same frames when the two programs are not on one network:

1. Rendezvous: both sides join a room of a small signalling relay (a WebSocket server: a `zinc` command or the owner's host), named by a
   hash of the code for a pairing (`SHA-256("zinclink pair" + code)`, first 16 bytes) and by a hash of the paired key afterwards
   (`HMAC(key, "zinclink room")`), so the relay learns neither. They exchange the offer, the answer and the candidates there; STUN, and
   TURN when both are behind symmetric NATs.
2. Authentication: the relay is not trusted and DTLS's self-signed certificates prove nothing, so the same TLS runs inside the data
   channel (`tls.cpp` works on memory buffers: the channel's bytes go where the socket's went): EC J-PAKE with the code for the pairing,
   TLS 1.3 PSK with the paired key for each session. The code still never leaves the two screens.
3. API: `link.advertise({ service, relay: 'wss://...' })` and `link.pair({ relay, code })`; a channel tries the local address first, then
   the relay; `Channel` stays the same object.
