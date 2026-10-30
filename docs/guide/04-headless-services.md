# 4. Headless services

A headless Zinc program has no window and no `zinc:gfx`. The event loop stays alive as long as there is work to do —
an open server socket, a poller, a pending timer or microtask — so a daemon is just a program that opens a listener
and/or arms a timer and never runs out of work. When there is nothing left, the loop returns and the program exits.

The worked example is [`examples/service/sensor-hub`](../../examples/service/sensor-hub): it reads a sensor every
second, serves the values as JSON over HTTP, publishes to MQTT when configured, and exports metrics to
`zinc:telemetry`. Run it:

```sh
zinc run examples/service/sensor-hub                 # compiled to native on first run, then cached
curl localhost:3000/readings                         # {"seq":…,"tempC":…,"humidity":…}
```

## HTTP server

`zinc:net` gives you `serve(port, handler)` — a minimal HTTP/1.1 server whose handler runs on the event loop (no
threads, one connection at a time drained by the poller). Bind is `0.0.0.0` (`ZINC_BIND=127.0.0.1` restricts it, e.g.
behind a reverse proxy). Requests are limited: 16 KiB of headers, a 1 MiB body (`ZRT_HTTP_MAX_BODY`), 32 open
connections, 10 s to send a request, 2 s for a client to take a reply; see [security](08-security.md) about exposure.

```ts
import { serve, Request, Reply } from 'zinc:net';
serve(3000, (req: Request): Reply => {
  if (req.path === '/healthz') return { status: 200, contentType: 'application/json', body: '{"ok":true}' };
  return { status: 404, contentType: 'application/json', body: '{"error":"not found"}' };
});
```

`serveAsync(port, handler)` takes a handler that returns a `Promise<Reply>`: the reply goes out when it resolves (a rejection is
a 500), so a handler can await a file, a plugin or another server. A reply with `file: path` sends that file's bytes in 256 KiB
blocks instead of `body` (a song, a video, a picture of any size: the next block is read once the last is written, so a slow
client slows the reads), with `Accept-Ranges: bytes`; a request with one `Range` gets a 206 and its `Content-Range`, a range
past the end a 416, a missing file a 404. Players and `<audio>`/`<video>` elements seek with these ranges.

Both return the port they listen on: port 0 lets the system pick a free one (`const port = serveAsync(0, handler)`), for a
server only this program hands its address out, such as a player that sends a speaker the URL of a song.

```ts
serveAsync(3000, async (req: Request): Promise<Reply> => {
  if (req.path === '/song.mp3') return { status: 200, contentType: 'audio/mpeg', body: '', file: '/music/song.mp3' };
  return { status: 404, contentType: 'text/plain', body: 'not found' };
});
```

`fetch(url, init?)` is the client side (libcurl on hosts, `esp_http_client` on ESP32). Only `http:` and `https:` URLs
are fetched, following at most 20 redirects; on hosts, a redirect to another scheme, host or port drops the `Authorization`,
`Proxy-Authorization` and `Cookie` headers. A request times out after `timeoutMs` (default 120000; connecting takes
at most 30 s). A response body larger than `maxBytes` (default: a quarter of the heap, at most 64 MiB) is refused with
`fetch failed: response too large`. The handler receives
`method`, `path`, `body`; there is no routing framework — branch on `req.path` yourself.

## MQTT, OSC, telemetry

```ts
import { MqttClient } from 'zinc:mqtt';           // MQTT 3.1.1, QoS 0
const c = new MqttClient('broker', 1883, 'client-id');
c.connect().then(() => c.publish('sensors/hub', '{"t":21.4}'));
c.subscribe('cmd/#', (topic, payload) => console.log(topic, payload));

import { send, listen } from 'zinc:osc';           // OSC 1.0 over UDP
send('127.0.0.1', 9000, '/level', [0.8]);
listen(9001, (m) => console.log(m.address, m.numbers));
```

`zinc:telemetry` streams JSON lines (perf, logs, metrics, exposed state) to UDP/stdout/file; `zinc monitor` renders
them live. Enable with the `ZINC_TELEMETRY` env var (no code change) or `telemetry.connect(...)`:

```ts
import * as telemetry from 'zinc:telemetry';
telemetry.gauge('sensor.tempC', t);
telemetry.counter('sensor.samples', 1);
telemetry.expose('tempC', () => latest);           // sampled at 10 Hz into state snapshots
```

```sh
ZINC_TELEMETRY=udp://127.0.0.1:9999 zinc run examples/service/sensor-hub &
zinc monitor          # fps/metrics/exposed vars, live
```

## Timers

`setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` work headless — the loop wakes for the next due timer.
A `setInterval` is enough to keep a daemon alive with no listener.

## Logging

`console.log/info/debug/warn/error/trace` map to leveled output; `warn`/`error`/`trace` go to stderr. Set
`ZINC_LOG_FORMAT=json` for one JSON object per line (`{"time","level","message"}`), ready for journald/Loki:

```sh
ZINC_LOG_FORMAT=json ./sensor-hub
# {"time":361126276.226,"level":"INFO","message":"sensor-hub listening on http://0.0.0.0:3000 (mqtt off)"}
```

## Signals and shutdown

On POSIX hosts (macos, linux, rpi1, rmpp), `sys.onSignal` runs a handler on the event loop when a signal arrives. The
handler replaces the default action, which would terminate the program:

```ts
import * as sys from 'zinc:sys';
import { stop } from 'zinc:net';
sys.onSignal('SIGTERM', () => {       // systemctl stop, docker stop
  console.log('draining…');
  stop();                             // no new connections; the loop ends when the last work is done
});
sys.onSignal('SIGINT', () => { sys.exit(130); });   // Ctrl-C
```

- **Delivery.** The OS handler only sets a flag; a poller calls your callbacks between tasks. This means a handler can
  do anything a timer callback can.
- **Liveness.** Handlers do not keep the program alive, the same as `process.on('SIGINT')` in Node.
- **Names.** `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGUSR1`, `SIGUSR2`, `SIGQUIT`, `SIGWINCH`, `SIGALRM`, `SIGCHLD`,
  `SIGPIPE`, `SIGCONT` and `SIGTSTP`. `SIGKILL` cannot be caught.
- **Sending.** `sys.kill(pid, 'SIGTERM')` sends a signal, and `sys.pid()` is this process.
- **Other targets.** ESP32, PS1, PS2 and wasm have no signals: there `onSignal` does nothing.

Fatal faults (SIGSEGV, SIGBUS, SIGFPE…) keep going to the crash policy below. `sys.exit(code)` still ends the process
at once.

## Process, files, sockets

| Need | Module |
|---|---|
| Arguments, environment, working directory, pid, stdout without a newline, stdin | `zinc:sys`: `args`, `env` / `setEnv` / `unsetEnv` / `envKeys`, `cwd` / `chdir`, `pid`, `write` / `writeErr`, `isatty`, `onStdin(cb)` (chunks, `''` at EOF) |
| Where the user ran the program from, the user's language | `zinc:sys`: `launchDir()` (`zinc run <project>` starts the program in the project, so resolve a relative path given as an argument against `launchDir()`, not `cwd()`), `locale()` (a BCP 47 tag such as `fr-FR`: `LC_ALL`, `LC_MESSAGES` or `LANG` when set, else the system's first preferred language, which an app started from the Finder has without any variable) |
| Start the app again as a second process | `zinc:sys`: `execPath()`, the program's own executable (`zinc` itself when interpreted: give it `run` and the project), for `zinc:process` `spawn` |
| Files and directories | `zinc:fs`: text and bytes (`readTextAsync` and `writeTextAsync` on a worker thread, for large files in an app), `stat` / `lstat`, `readDir` (with types), `mkdir(p, true)` (mkdir -p), `remove(p, true)` (rm -rf), `rename`, `copyFile`, `realpath`, `mkdtemp` / `tmpdir`, `symlink` / `readlink`, `chmod`, `watch` (polling, 100 ms) |
| Machine information | `zinc:os`: `hostname`, `homedir`, `tmpdir`, `arch`, `type`, `release`, `uptime`, `loadavg`, `totalmem` / `freemem`, `cpus`, `networkInterfaces`, `userInfo` |
| Child processes | `zinc:process` ([docs](../plugins/process.md)): spawn with stdin / stdout / stderr pipes, kill, exit code |
| TCP / UDP / Unix sockets, DNS, WebSocket | `zinc:socket` ([docs](../plugins/socket.md)) |
| Paths | `zinc:path`: POSIX `join`, `resolve`, `relative`, `dirname`, `basename`, `extname`, `parse`, `format` (Node's results) |
| XML | `zinc:xml`: `parse(text)` into an element tree (`El`: `attr`, `child`, `all`, `find`, `findAll`, `textOf`), `toXml` / `toJson` to write one back, `escapeXml` / `unescapeXml`. A small reader for UPnP, SOAP, RSS and device descriptions, not a general XML engine |
| SQL database | `zinc:sqlite` ([docs](../plugins/sqlite.md)) |
| Web APIs (fetch, URL, crypto, events…) | globals ([chapter 9](09-web-apis.md)) |
| Computing on another thread | `zinc:worker`: `Worker`, `self`, `MessageEvent` ([below](#workers-zincworker)) |

## Workers (`zinc:worker`)

A long computation (a search, a sort of a big library, decoding, a simulation) stops the frames of an app while it runs. A worker runs it on
another thread, as the Web Workers API does: the worker is a second program with its own heap and event loop, and the two talk by messages.

```ts
// types.ts: what crosses, shared by both sides
export interface Job { query: string; limit: i32 }
export interface Found { ids: i32[]; took: number }

// search.ts: the worker
import { self, MessageEvent } from 'zinc:worker';
import { Job, Found } from './types';
self.onmessage = (e: MessageEvent<Job>) => {
  const t0 = performance.now();
  const ids = search(e.data.query, e.data.limit);   // as long as it needs: the app keeps drawing
  self.postMessage({ ids: ids, took: performance.now() - t0 });
};

// main.ts: the app
import { Worker, MessageEvent, ErrorEvent } from 'zinc:worker';
import { Job, Found } from './types';
const w = new Worker<Job, Found>(new URL('./search.ts', import.meta.url));
w.onmessage = (e: MessageEvent<Found>) => { results.set(e.data.ids); };
w.onerror = (e: ErrorEvent) => { console.error(e.message); };
w.postMessage({ query: 'jazz', limit: 50 });
```

- `Worker<In, Out>` names what the app sends (`In`) and what the worker posts back (`Out`). Both must be data: numbers, `i32`, `u32`,
  booleans, strings, `u8[]` buffers, arrays, `T | null` and records of those (Z5012 names the field that is not). Messages are copied;
  nothing is shared.
- `postMessage(value, [buffer])`: a `u8[]` in the second argument is moved, and is empty on the sender's side afterwards.
- The worker's file is a literal path, or `new URL('./file.ts', import.meta.url)` (Z5013): it is compiled with the program, and `zinc run` and
  `zinc build` take it with them.
- `onerror` gets the worker's uncaught exception; its program has ended. Without `onerror` the error is printed.
- `terminate()` stops the worker at its next call into the engine and drops its pending messages; `self.close()` ends it from inside.
  A worker keeps the app's loop running until it ends or is terminated, as in Node and Deno.
- A worker cannot draw (`zinc:gfx`, `zinc:ui`, `zinc:gl`) or use a plugin's native code; files, the network, timers and `fetch` work.
  It cannot start another worker yet.
- Under `ZINC_DETERMINISTIC` the app waits at each loop turn for its workers to be idle, so replies arrive at the same turn on every run.
- Workers run on the Zinc interpreter (`zinc run`), in compiled builds (`zinc build` compiles each worker into the binary) and on QuickJS (`--engine quickjs`: a QuickJS runtime per worker, the same typed messages; a message whose type is generic, such as `Envelope<T>` of `workerPort`, is copied as QuickJS's structured clone).

## Running as a systemd service

`zinc export --target linux` (or `rpi`, `rpi1`, `rpi2`; cross built with the pinned zig, no Docker) produces `dist/<name>-<target>/` with the executable, a `run.sh`, a
`<name>.service` unit (`Restart=on-failure`, `RestartSec=2`) and a `deploy.sh` that installs it root-owned in
`/opt/<name>`, installs the unit and starts it. The unit runs the program unprivileged (`DynamicUser=yes`, no
capabilities, read-only system, private /tmp): its working directory and `zinc:storage` file are in
`/var/lib/<name>` (`StateDirectory`), and devices (framebuffer, input, GPIO, SPI, I2C) are reached through the groups
the device has (`SupplementaryGroups`, filtered by `deploy.sh`). Details and how to relax it:
[chapter 8](08-security.md#deploying-on-linux-and-raspberry-pi).

```sh
zinc export --target linux examples/service/sensor-hub
dist/sensor-hub-linux/deploy.sh me@server        # copies, installs the unit, enable --now
# or, or by hand on the box:
sudo cp sensor-hub.service /etc/systemd/system/ && sudo systemctl enable --now sensor-hub
journalctl -u sensor-hub -f                       # pair with ZINC_LOG_FORMAT=json in the unit's Environment=
```

## Watchdog / restart policy

Two independent layers:

- **systemd** restarts the process if it exits non-zero (`Restart=on-failure`). This is your production watchdog.
- **`zinc.json` `"crash"`** decides what a *crash inside the program* does before the process ends:
  `exit` (default — die, let systemd restart), `redbox` (draw the error and wait; on a headless service `redbox`
  behaves as `restart`), or `restart` (re-run init/teardown in place; three crashes within five seconds gives up with
  exit 101). For a daemon, `"crash": "restart"` recovers from transient panics without a process bounce; `exit` +
  systemd is the simplest robust choice.

## Resource budgets

The heap is a fixed TLSF region sized by the profile (`macos`/`linux` 512 MiB, `rpi1` 64 MiB, `esp32` 160 KiB);
override with `zinc.json` `targets.<id>.heap`. Watch live usage with `sys.liveObjects()` / `sys.allocations()`, or
expose them via telemetry. Build with `--debug` to get ASan + a leak report while developing (see [testing](06-testing.md)).

## On ESP32 as firmware

The same source builds as firmware — `net` (fetch), `mqtt`, `osc`, `telemetry`, `storage` (NVS), `fs` (SPIFFS) and
`gpio` (`driver/gpio`) all have ESP32 backends. Swap the fake `sample()` for a real GPIO/I2C read or a native module.
WiFi credentials go in `zinc.json` `targets.esp32.wifi` (`{ssid, password}`); note that `esp_wifi` station bring-up
is not implemented yet and there is no HTTP *server* on ESP32 (fetch/MQTT/OSC clients only) — see
`zinc plugins` and `docs/targets/capabilities.md` for exactly what each target offers.

```sh
zinc run examples/service/sensor-hub --target esp32       # on the board or `--qemu`
zinc export --target esp32 examples/service/sensor-hub    # core.bin, app.bin and flash.sh
zinc flash --target esp32                                 # the core firmware, once (pinned esptool)
```

## Signals between objects (zinc:signals)

Qt's signals and slots, typed and without a meta-object system: an object exposes `Signal<T>` fields, anyone
connects a function, `emit` calls the slots in connection order.

```ts
import { Signal, Trigger } from 'zinc:signals';

class Thermometer {
  readonly reading = new Signal<number>();   // a signal with a value
  readonly failed = new Trigger();           // a signal without one
}
const t = new Thermometer();
const c = t.reading.connect((celsius: number) => console.log(`${celsius} °C`));
t.reading.emit(21.5);          // direct: the slots run now (Qt::DirectConnection)
t.reading.emitQueued(22);      // queued: on the next microtask (Qt::QueuedConnection)
const next = await t.reading.next();   // a promise of the next value
c.disconnect();                // or `using c = t.reading.connect(...)` to disconnect at the end of the scope
```

A slot disconnected during an emit is not called afterwards; one connected during an emit waits for the next one;
`once()` connects for a single emit. In a UI, `fromSignal(signal, initial)` from `zinc:ui/solid` turns it into a
reactive accessor (disconnected with its owner). `zinc:events`' `Emitter` remains the tool for values coming from
native threads (listeners run as microtasks).

Next: [plugins](05-plugins.md). Web platform APIs: [chapter 9](09-web-apis.md).
