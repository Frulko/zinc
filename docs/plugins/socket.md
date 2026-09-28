# socket plugin (`zinc:socket`)

This plugin covers TCP, Unix domain and UDP sockets, DNS lookup, and a WebSocket client and server. Everything is
non-blocking and runs on the event loop: a `zrt::Poller` polls the sockets on every iteration, with no thread.

- Targets: macos, linux, rpi1 and rmpp, plus the sim through Node's `net`, `dgram` and `dns`.
- `requires`: `net` and `process`, so it is refused on the ESP32, PS1, PS2 and wasm.
- Sources: `plugins/socket/`.
- Test: `tests/conformance/socket.ts`, loopback only.

```ts
import { listen, connect, serveWebSocket, WebSocket, Socket, MessageEvent } from 'zinc:socket';

async function main(): Promise<void> {
  // TCP echo server on a free port
  const srv = await listen(0, (c: Socket) => { c.onData((s: string) => { c.write(s.toUpperCase()); }); }, '127.0.0.1');
  const s = await connect('localhost', srv.port);
  s.onData((text: string) => { console.log('got', text); s.close(); srv.close(); });
  s.write('hello');

  // WebSocket server and client
  const wss = await serveWebSocket(8080, (ws: WebSocket) => { ws.onmessage = (e: MessageEvent) => { ws.send('echo ' + e.data); }; });
  const ws = new WebSocket('ws://127.0.0.1:8080/chat');
  ws.onopen = () => { ws.send('hi'); };
  ws.onmessage = (e: MessageEvent) => { console.log(e.data); ws.close(); wss.close(); };
}
main();
```

## TCP and Unix sockets

| API | |
|---|---|
| `connect(host, port): Promise<Socket>` | Resolves the host (IPv4 preferred). Rejects with `connect ECONNREFUSED 127.0.0.1:9` or `getaddrinfo ENOTFOUND host`. |
| `connectUnix(path): Promise<Socket>` | A Unix domain stream socket. |
| `listen(port, onConnection, host = ''): Promise<Server>` | Port 0 picks a free port (see `server.port`). Host `''` means all interfaces. Rejects with `listen EADDRINUSE …`. |
| `listenUnix(path, onConnection): Promise<Server>` | The file must not exist. |
| `socket.onData(cb(text))` / `onBytes(cb(u8[]))` | Data as it arrives. `onData` never splits a UTF-8 sequence. |
| `socket.write(text)` / `writeBytes(u8[])` | Queues the data. Returns false once the socket is closed or ended. |
| `socket.end()` / `close()` | `end()` half-closes after the queued data. `close()` closes now. |
| `socket.onClose(cb)` / `onError(cb)` | `onClose` fires when the peer closed or reset the connection. |
| `socket.remoteAddress`, `remotePort`, `localPort` | |
| `server.port`, `server.close()` | |

## UDP and DNS

| API | |
|---|---|
| `udp(port, host = ''): Promise<UdpSocket>` | Port 0 picks a free port. |
| `u.send(host, port, text)` / `sendBytes(host, port, u8[])` | |
| `u.onMessage(cb(d))` | `d.bytes`, `d.text`, `d.address`, `d.port`. |
| `lookup(host): Promise<string[]>` | Every address, from getaddrinfo. |

## WebSocket (RFC 6455)

- **Client.** `new WebSocket('ws://host:port/path')` has a browser-like API:
  - handlers `onopen`, `onmessage`, `onclose` and `onerror`, or `addEventListener`;
  - `send(text)`, `sendBytes(u8[])`, `close(code, reason)` and `readyState`.
- **Server.** `serveWebSocket(port, (ws, req) => …)` answers the HTTP upgrade and gives you the same `WebSocket` object
  (`req.path`, `req.header(name)`). Requests that are not WebSocket upgrades get `426`.
- **Messages.** A `MessageEvent` has `data` (text), `bytes` and `binary`. Fragmented messages are reassembled and
  pings are answered.
- **Close.** The closing handshake reports `CloseEvent.code`, `reason` and `wasClean`. A dropped connection reports
  1006.

## Limits

- **No TLS.** There is no `wss://` and no TLS sockets. HTTPS goes through `fetch`, which uses libcurl.
- **DNS blocks.** `lookup` and `connect` resolve names with getaddrinfo on the loop thread. That is instant for
  literals, `localhost` and cached names, and blocks the loop on a slow DNS server.
- **At most 256 sockets.** Frames are limited to 2 GiB.
